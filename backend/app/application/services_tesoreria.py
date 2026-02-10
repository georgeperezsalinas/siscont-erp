"""
Servicio de Tesorería

Principios:
- Tesorería NO genera ingresos ni gastos
- Tesorería solo liquida CxC y CxP
- Tesorería es el único módulo que mueve CAJA y BANCO
- Todos los asientos se generan vía Motor de Asientos
"""
from decimal import Decimal
from datetime import date
from typing import Optional, Tuple
from sqlalchemy.orm import Session
import logging

from ..domain.models import JournalEntry, Period
from ..domain.models_ext import Purchase, Sale
from ..domain.models_tesoreria import MovimientoTesoreria, MetodoPago, TipoMovimientoTesoreria, EstadoMovimiento
from ..domain.models_journal_engine import TipoCuentaMapeo
from ..infrastructure.unit_of_work import UnitOfWork
from .services_journal_engine import MotorAsientos, MotorAsientosError, CuentaNoMapeadaError
from .services import post_journal_entry
from .dtos import JournalEntryIn, EntryLineIn
from .validations_journal_engine import PeriodoCerradoError, CuentaInactivaError, MapeoInvalidoError
from .services_audit import log_audit, MODULE_TESORERIA, ACTION_CREATE

logger = logging.getLogger(__name__)


def _get_cuenta_mapeo(db: Session, company_id: int, tipo_cuenta: str, default_code: str) -> str:
    """Obtiene el código de cuenta del mapeo, o default si no existe."""
    mapeo = db.query(TipoCuentaMapeo).filter(
        TipoCuentaMapeo.company_id == company_id,
        TipoCuentaMapeo.tipo_cuenta == tipo_cuenta,
        TipoCuentaMapeo.activo == True
    ).first()
    if mapeo and mapeo.account:
        return mapeo.account.code or default_code
    return default_code


class TesoreriaError(Exception):
    """Excepción base para errores de tesorería"""
    pass


class SaldoInsuficienteError(TesoreriaError):
    """Error cuando el monto excede el saldo pendiente"""
    pass


class DocumentoNoEncontradoError(TesoreriaError):
    """Error cuando el documento de referencia no existe"""
    pass


class MetodoPagoInactivoError(TesoreriaError):
    """Error cuando el método de pago está inactivo"""
    pass


class TesoreriaService:
    """
    Servicio de Tesorería
    
    Maneja cobros, pagos y transferencias.
    Delega la generación de asientos al Motor de Asientos.
    """
    
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
    
    def registrar_cobro(
        self,
        company_id: int,
        venta_id: int,
        monto: Decimal,
        fecha: date,
        metodo_pago_id: int,
        glosa: Optional[str] = None,
        usuario_id: Optional[int] = None,
        usar_motor: bool = True
    ) -> Tuple[MovimientoTesoreria, JournalEntry]:
        """
        Registra un cobro de cliente.
        
        Args:
            company_id: ID de la empresa
            venta_id: ID de la venta a cobrar
            monto: Monto a cobrar
            fecha: Fecha del cobro
            metodo_pago_id: ID del método de pago
            glosa: Descripción del movimiento
            usuario_id: ID del usuario que registra
            usar_motor: Si True, usa Motor de Asientos. Si False, usa legacy.
        
        Returns:
            Tuple[MovimientoTesoreria, JournalEntry]: Movimiento y asiento creados
        
        Raises:
            DocumentoNoEncontradoError: Si la venta no existe
            SaldoInsuficienteError: Si el monto excede el saldo pendiente
            MetodoPagoInactivoError: Si el método de pago está inactivo
            PeriodoCerradoError: Si el período está cerrado
            MotorAsientosError: Si falla la generación del asiento
        """
        # 1. Validar venta existe
        venta = self.uow.db.query(Sale).filter(
            Sale.id == venta_id,
            Sale.company_id == company_id
        ).first()
        
        if not venta:
            raise DocumentoNoEncontradoError(f"Venta {venta_id} no encontrada para empresa {company_id}")
        
        # 2. Validar saldo pendiente
        saldo_pendiente = self._calcular_saldo_pendiente_venta(venta_id, company_id)
        if monto > saldo_pendiente:
            raise SaldoInsuficienteError(
                f"Monto {monto} excede saldo pendiente {saldo_pendiente} de venta {venta_id}"
            )
        
        # 3. Validar método de pago
        metodo_pago = self.uow.db.query(MetodoPago).filter(
            MetodoPago.id == metodo_pago_id,
            MetodoPago.company_id == company_id
        ).first()
        
        if not metodo_pago:
            raise MetodoPagoInactivoError(f"Método de pago {metodo_pago_id} no encontrado")
        
        if not metodo_pago.activo:
            raise MetodoPagoInactivoError(f"Método de pago {metodo_pago.codigo} está inactivo")
        
        # 4. Determinar evento contable según método de pago
        if metodo_pago.impacta_en == "CAJA":
            evento_tipo = "COBRO_CAJA"
        elif metodo_pago.impacta_en == "BANCO":
            evento_tipo = "COBRO_BANCO"
        else:
            raise TesoreriaError(f"Método de pago {metodo_pago.codigo} tiene impacta_en inválido: {metodo_pago.impacta_en}")
        
        # 5. Generar glosa si no se proporciona
        glosa_final = glosa or f"Cobro {venta.doc_type} {venta.series}-{venta.number} - {metodo_pago.descripcion}"
        
        # 6. Validar que la fecha del cobro corresponde a un período válido
        periodo_cobro = self.uow.periods.get_or_open(company_id, fecha.year, fecha.month)
        logger.info(
            f"Cobro venta {venta_id}: fecha={fecha}, periodo={fecha.year}-{fecha.month:02d}, "
            f"period_id={periodo_cobro.id}"
        )
        
        # 7. Generar asiento contable vía Motor de Asientos
        entry = None
        if usar_motor:
            try:
                # Asegurar que los eventos contables estén inicializados
                from ..application.services_journal_engine_init import inicializar_eventos_y_reglas_predeterminadas
                try:
                    inicializar_eventos_y_reglas_predeterminadas(self.uow.db, company_id)
                except Exception as init_err:
                    # Si falla, continuar (puede que ya estén inicializados)
                    import logging
                    logging.warning(f"Advertencia al inicializar eventos contables: {init_err}")
                
                motor = MotorAsientos(self.uow)
                entry = motor.generar_asiento(
                    evento_tipo=evento_tipo,
                    datos_operacion={
                        "total": float(monto),
                        "venta_id": venta_id,
                        "metodo_pago": metodo_pago.codigo
                    },
                    company_id=company_id,
                    fecha=fecha,
                    glosa=glosa_final,
                    origin="TESORERIA"  # Origen real del asiento
                )
                
                # Validar que el período del asiento generado coincide con la fecha del cobro
                if entry.period_id != periodo_cobro.id:
                    logger.warning(
                        f"ADVERTENCIA: El asiento generado tiene period_id={entry.period_id} "
                        f"pero la fecha del cobro ({fecha}) corresponde a period_id={periodo_cobro.id}. "
                        f"Corrigiendo período del asiento."
                    )
                    entry.period_id = periodo_cobro.id
                    self.uow.db.flush()
                # Establecer currency después de crear el entry
                entry.currency = venta.currency or "PEN"
                
                # Validar y corregir el período del asiento si es necesario
                periodo_esperado = self.uow.periods.get_or_open(company_id, fecha.year, fecha.month)
                if entry.period_id != periodo_esperado.id:
                    logger.warning(
                        f"Cobro venta {venta_id}: Corrigiendo período del asiento. "
                        f"Fecha cobro: {fecha} ({fecha.year}-{fecha.month:02d}), "
                        f"Periodo asiento actual: {entry.period_id}, "
                        f"Periodo esperado: {periodo_esperado.id} ({periodo_esperado.year}-{periodo_esperado.month:02d})"
                    )
                    entry.period_id = periodo_esperado.id
                
                from sqlalchemy.orm.attributes import flag_modified
                if entry.motor_metadata:
                    flag_modified(entry, "motor_metadata")
                self.uow.db.flush()
            except (MotorAsientosError, CuentaNoMapeadaError, CuentaInactivaError, MapeoInvalidoError, PeriodoCerradoError) as e:
                logger.warning(
                    f"FALLBACK A LEGACY - Cobro venta {venta_id}: "
                    f"company_id={company_id}, motivo={str(e)}. "
                    f"Usando método legacy."
                )
                # Fallback legacy: generar asiento manual con cuentas del mapeo
                caja_code = _get_cuenta_mapeo(self.uow.db, company_id, "CAJA", "10.10")
                banco_code = _get_cuenta_mapeo(self.uow.db, company_id, "BANCO", "10.20")
                clientes_code = _get_cuenta_mapeo(self.uow.db, company_id, "CLIENTES", "12.10")
                cuenta_efectivo = caja_code if metodo_pago.impacta_en == "CAJA" else banco_code
                entry_lines = [
                    EntryLineIn(account_code=cuenta_efectivo, debit=float(monto), credit=0.0, memo=glosa_final),
                    EntryLineIn(account_code=clientes_code, debit=0.0, credit=float(monto),
                                memo=f"Reducción CxC - {venta.doc_type} {venta.series}-{venta.number}")
                ]
                entry_data = JournalEntryIn(
                    company_id=company_id,
                    date=fecha,
                    glosa=glosa_final,
                    currency=venta.currency or "PEN",
                    origin="TESORERIA",
                    lines=entry_lines
                )
                entry = post_journal_entry(self.uow, entry_data)
                self.uow.db.flush()
            except Exception as e:
                # Catch cualquier otra excepción inesperada y hacer fallback a legacy
                logger.error(
                    f"ERROR INESPERADO EN MOTOR - Cobro venta {venta_id}: "
                    f"company_id={company_id}, error={type(e).__name__}: {str(e)}. "
                    f"Usando método legacy."
                )
                # Fallback legacy: generar asiento manual con cuentas del mapeo
                caja_code = _get_cuenta_mapeo(self.uow.db, company_id, "CAJA", "10.10")
                banco_code = _get_cuenta_mapeo(self.uow.db, company_id, "BANCO", "10.20")
                clientes_code = _get_cuenta_mapeo(self.uow.db, company_id, "CLIENTES", "12.10")
                cuenta_efectivo = caja_code if metodo_pago.impacta_en == "CAJA" else banco_code
                entry_lines = [
                    EntryLineIn(account_code=cuenta_efectivo, debit=float(monto), credit=0.0, memo=glosa_final),
                    EntryLineIn(account_code=clientes_code, debit=0.0, credit=float(monto),
                                memo=f"Reducción CxC - {venta.doc_type} {venta.series}-{venta.number}")
                ]
                entry_data = JournalEntryIn(
                    company_id=company_id,
                    date=fecha,
                    glosa=glosa_final,
                    currency=venta.currency or "PEN",
                    origin="TESORERIA",
                    lines=entry_lines
                )
                entry = post_journal_entry(self.uow, entry_data)
                self.uow.db.flush()
        
        # Si no se generó asiento (usar_motor=False o fallo completo), generar con método legacy
        if entry is None:
            logger.info(
                f"Generando asiento legacy - Cobro venta {venta_id}: "
                f"company_id={company_id}, usar_motor={usar_motor}"
            )
            caja_code = _get_cuenta_mapeo(self.uow.db, company_id, "CAJA", "10.10")
            banco_code = _get_cuenta_mapeo(self.uow.db, company_id, "BANCO", "10.20")
            clientes_code = _get_cuenta_mapeo(self.uow.db, company_id, "CLIENTES", "12.10")
            cuenta_efectivo = caja_code if metodo_pago.impacta_en == "CAJA" else banco_code
            entry_lines = [
                EntryLineIn(account_code=cuenta_efectivo, debit=float(monto), credit=0.0, memo=glosa_final),
                EntryLineIn(account_code=clientes_code, debit=0.0, credit=float(monto),
                            memo=f"Reducción CxC - {venta.doc_type} {venta.series}-{venta.number}")
            ]
            # Asegurar que el período del asiento coincida con la fecha del cobro
            periodo_cobro_final = self.uow.periods.get_or_open(company_id, fecha.year, fecha.month)
            entry_data = JournalEntryIn(
                company_id=company_id,
                date=fecha,  # La fecha determina el período automáticamente en post_journal_entry
                glosa=glosa_final,
                currency=venta.currency or "PEN",
                origin="TESORERIA",
                lines=entry_lines
            )
            entry = post_journal_entry(self.uow, entry_data)
            # Validar que el período se asignó correctamente basándose en la fecha
            if entry.period_id != periodo_cobro_final.id:
                logger.warning(
                    f"Corrigiendo período del asiento legacy: period_id={entry.period_id} -> {periodo_cobro_final.id} "
                    f"(fecha={fecha}, periodo_esperado={fecha.year}-{fecha.month:02d})"
                )
                entry.period_id = periodo_cobro_final.id
                self.uow.db.flush()
            self.uow.db.flush()
        
        # 8. Crear movimiento de tesorería
        movimiento = MovimientoTesoreria(
            company_id=company_id,
            tipo=TipoMovimientoTesoreria.COBRO.value,
            referencia_tipo="VENTA",
            referencia_id=venta_id,
            monto=monto,
            fecha=fecha,
            metodo_pago_id=metodo_pago_id,
            estado=EstadoMovimiento.REGISTRADO.value,
            journal_entry_id=entry.id if entry else None,
            glosa=glosa_final,
            created_by_id=usuario_id
        )
        
        self.uow.db.add(movimiento)
        self.uow.db.flush()
        
        logger.info(
            f"Cobro registrado: movimiento_id={movimiento.id}, venta_id={venta_id}, "
            f"monto={monto}, metodo_pago={metodo_pago.codigo}, entry_id={entry.id if entry else None}"
        )

        log_audit(
            self.uow.db,
            module=MODULE_TESORERIA,
            action=ACTION_CREATE,
            entity_type="MovimientoTesoreria",
            entity_id=movimiento.id,
            summary=f"Cobro venta {venta.doc_type} {venta.series}-{venta.number}: {monto}",
            metadata_={"venta_id": venta_id, "monto": str(monto), "metodo_pago": metodo_pago.codigo},
            user_id=usuario_id,
            company_id=company_id,
        )

        return movimiento, entry

    def registrar_pago(
        self,
        company_id: int,
        compra_id: int,
        monto: Decimal,
        fecha: date,
        metodo_pago_id: int,
        glosa: Optional[str] = None,
        usuario_id: Optional[int] = None,
        usar_motor: bool = True
    ) -> Tuple[MovimientoTesoreria, JournalEntry]:
        """
        Registra un pago a proveedor.
        
        Args:
            company_id: ID de la empresa
            compra_id: ID de la compra a pagar
            monto: Monto a pagar
            fecha: Fecha del pago
            metodo_pago_id: ID del método de pago
            glosa: Descripción del movimiento
            usuario_id: ID del usuario que registra
            usar_motor: Si True, usa Motor de Asientos. Si False, usa legacy.
        
        Returns:
            Tuple[MovimientoTesoreria, JournalEntry]: Movimiento y asiento creados
        
        Raises:
            DocumentoNoEncontradoError: Si la compra no existe
            SaldoInsuficienteError: Si el monto excede el saldo pendiente
            MetodoPagoInactivoError: Si el método de pago está inactivo
            PeriodoCerradoError: Si el período está cerrado
            MotorAsientosError: Si falla la generación del asiento
        """
        # 1. Validar compra existe
        compra = self.uow.db.query(Purchase).filter(
            Purchase.id == compra_id,
            Purchase.company_id == company_id
        ).first()
        
        if not compra:
            raise DocumentoNoEncontradoError(f"Compra {compra_id} no encontrada para empresa {company_id}")
        
        # 2. Validar saldo pendiente
        saldo_pendiente = self._calcular_saldo_pendiente_compra(compra_id, company_id)
        if monto > saldo_pendiente:
            raise SaldoInsuficienteError(
                f"Monto {monto} excede saldo pendiente {saldo_pendiente} de compra {compra_id}"
            )
        
        # 3. Validar método de pago
        metodo_pago = self.uow.db.query(MetodoPago).filter(
            MetodoPago.id == metodo_pago_id,
            MetodoPago.company_id == company_id
        ).first()
        
        if not metodo_pago:
            raise MetodoPagoInactivoError(f"Método de pago {metodo_pago_id} no encontrado")
        
        if not metodo_pago.activo:
            raise MetodoPagoInactivoError(f"Método de pago {metodo_pago.codigo} está inactivo")
        
        # 4. Determinar evento contable según método de pago
        if metodo_pago.impacta_en == "CAJA":
            evento_tipo = "PAGO_CAJA"
        elif metodo_pago.impacta_en == "BANCO":
            evento_tipo = "PAGO_BANCO"
        else:
            raise TesoreriaError(f"Método de pago {metodo_pago.codigo} tiene impacta_en inválido: {metodo_pago.impacta_en}")
        
        # 5. Generar glosa si no se proporciona
        glosa_final = glosa or f"Pago {compra.doc_type} {compra.series}-{compra.number} - {metodo_pago.descripcion}"
        
        # 6. Validar que la fecha del pago corresponde a un período válido
        periodo_pago = self.uow.periods.get_or_open(company_id, fecha.year, fecha.month)
        logger.info(
            f"Pago compra {compra_id}: fecha={fecha}, periodo={fecha.year}-{fecha.month:02d}, "
            f"period_id={periodo_pago.id}"
        )
        
        # 7. Generar asiento contable vía Motor de Asientos
        entry = None
        if usar_motor:
            try:
                # Asegurar que los eventos contables estén inicializados
                from ..application.services_journal_engine_init import inicializar_eventos_y_reglas_predeterminadas
                try:
                    inicializar_eventos_y_reglas_predeterminadas(self.uow.db, company_id)
                except Exception as init_err:
                    # Si falla, continuar (puede que ya estén inicializados)
                    import logging
                    logging.warning(f"Advertencia al inicializar eventos contables: {init_err}")
                
                motor = MotorAsientos(self.uow)
                entry = motor.generar_asiento(
                    evento_tipo=evento_tipo,
                    datos_operacion={
                        "total": float(monto),
                        "compra_id": compra_id,
                        "metodo_pago": metodo_pago.codigo
                    },
                    company_id=company_id,
                    fecha=fecha,
                    glosa=glosa_final,
                    origin="TESORERIA"  # Origen real del asiento
                )
                # Establecer currency después de crear el entry
                entry.currency = compra.currency or "PEN"
                
                # Validar y corregir el período del asiento si es necesario
                periodo_esperado_pago = self.uow.periods.get_or_open(company_id, fecha.year, fecha.month)
                if entry.period_id != periodo_esperado_pago.id:
                    logger.warning(
                        f"Pago compra {compra_id}: Corrigiendo período del asiento. "
                        f"Fecha pago: {fecha} ({fecha.year}-{fecha.month:02d}), "
                        f"Periodo asiento actual: {entry.period_id}, "
                        f"Periodo esperado: {periodo_esperado_pago.id} ({periodo_esperado_pago.year}-{periodo_esperado_pago.month:02d})"
                    )
                    entry.period_id = periodo_esperado_pago.id
                
                from sqlalchemy.orm.attributes import flag_modified
                if entry.motor_metadata:
                    flag_modified(entry, "motor_metadata")
                self.uow.db.flush()
            except (MotorAsientosError, CuentaNoMapeadaError, CuentaInactivaError, MapeoInvalidoError, PeriodoCerradoError) as e:
                logger.warning(
                    f"FALLBACK A LEGACY - Pago compra {compra_id}: "
                    f"company_id={company_id}, motivo={str(e)}. "
                    f"Usando método legacy."
                )
                # Fallback legacy: generar asiento manual con cuentas del mapeo
                caja_code = _get_cuenta_mapeo(self.uow.db, company_id, "CAJA", "10.10")
                banco_code = _get_cuenta_mapeo(self.uow.db, company_id, "BANCO", "10.20")
                proveedores_code = _get_cuenta_mapeo(self.uow.db, company_id, "PROVEEDORES", "42.10")
                cuenta_efectivo = caja_code if metodo_pago.impacta_en == "CAJA" else banco_code
                entry_lines = [
                    EntryLineIn(account_code=proveedores_code, debit=float(monto), credit=0.0,
                                memo=f"Reducción CxP - {compra.doc_type} {compra.series}-{compra.number}"),
                    EntryLineIn(account_code=cuenta_efectivo, debit=0.0, credit=float(monto), memo=glosa_final)
                ]
                entry_data = JournalEntryIn(
                    company_id=company_id,
                    date=fecha,
                    glosa=glosa_final,
                    currency=compra.currency or "PEN",
                    origin="TESORERIA",
                    lines=entry_lines
                )
                entry = post_journal_entry(self.uow, entry_data)
                self.uow.db.flush()
            except Exception as e:
                # Catch cualquier otra excepción inesperada y hacer fallback a legacy
                logger.error(
                    f"ERROR INESPERADO EN MOTOR - Pago compra {compra_id}: "
                    f"company_id={company_id}, error={type(e).__name__}: {str(e)}. "
                    f"Usando método legacy."
                )
                # Fallback legacy: generar asiento manual con cuentas del mapeo
                caja_code = _get_cuenta_mapeo(self.uow.db, company_id, "CAJA", "10.10")
                banco_code = _get_cuenta_mapeo(self.uow.db, company_id, "BANCO", "10.20")
                proveedores_code = _get_cuenta_mapeo(self.uow.db, company_id, "PROVEEDORES", "42.10")
                cuenta_efectivo = caja_code if metodo_pago.impacta_en == "CAJA" else banco_code
                entry_lines = [
                    EntryLineIn(account_code=proveedores_code, debit=float(monto), credit=0.0,
                                memo=f"Reducción CxP - {compra.doc_type} {compra.series}-{compra.number}"),
                    EntryLineIn(account_code=cuenta_efectivo, debit=0.0, credit=float(monto), memo=glosa_final)
                ]
                entry_data = JournalEntryIn(
                    company_id=company_id,
                    date=fecha,
                    glosa=glosa_final,
                    currency=compra.currency or "PEN",
                    origin="TESORERIA",
                    lines=entry_lines
                )
                entry = post_journal_entry(self.uow, entry_data)
                self.uow.db.flush()
        
        # Si no se generó asiento (usar_motor=False o fallo completo), generar con método legacy
        if entry is None:
            logger.info(
                f"Generando asiento legacy - Pago compra {compra_id}: "
                f"company_id={company_id}, usar_motor={usar_motor}"
            )
            caja_code = _get_cuenta_mapeo(self.uow.db, company_id, "CAJA", "10.10")
            banco_code = _get_cuenta_mapeo(self.uow.db, company_id, "BANCO", "10.20")
            proveedores_code = _get_cuenta_mapeo(self.uow.db, company_id, "PROVEEDORES", "42.10")
            cuenta_efectivo = caja_code if metodo_pago.impacta_en == "CAJA" else banco_code
            entry_lines = [
                EntryLineIn(account_code=proveedores_code, debit=float(monto), credit=0.0,
                            memo=f"Reducción CxP - {compra.doc_type} {compra.series}-{compra.number}"),
                EntryLineIn(account_code=cuenta_efectivo, debit=0.0, credit=float(monto), memo=glosa_final)
            ]
            entry_data = JournalEntryIn(
                company_id=company_id,
                date=fecha,
                glosa=glosa_final,
                currency=compra.currency or "PEN",
                origin="TESORERIA",
                lines=entry_lines
            )
            entry = post_journal_entry(self.uow, entry_data)
            self.uow.db.flush()
        
        # 7. Crear movimiento de tesorería
        movimiento = MovimientoTesoreria(
            company_id=company_id,
            tipo=TipoMovimientoTesoreria.PAGO.value,
            referencia_tipo="COMPRA",
            referencia_id=compra_id,
            monto=monto,
            fecha=fecha,
            metodo_pago_id=metodo_pago_id,
            estado=EstadoMovimiento.REGISTRADO.value,
            journal_entry_id=entry.id if entry else None,
            glosa=glosa_final,
            created_by_id=usuario_id
        )
        
        self.uow.db.add(movimiento)
        self.uow.db.flush()
        
        logger.info(
            f"Pago registrado: movimiento_id={movimiento.id}, compra_id={compra_id}, "
            f"monto={monto}, metodo_pago={metodo_pago.codigo}, entry_id={entry.id if entry else None}"
        )

        log_audit(
            self.uow.db,
            module=MODULE_TESORERIA,
            action=ACTION_CREATE,
            entity_type="MovimientoTesoreria",
            entity_id=movimiento.id,
            summary=f"Pago compra {compra.doc_type} {compra.series}-{compra.number}: {monto}",
            metadata_={"compra_id": compra_id, "monto": str(monto), "metodo_pago": metodo_pago.codigo},
            user_id=usuario_id,
            company_id=company_id,
        )

        return movimiento, entry

    def _calcular_saldo_pendiente_venta(self, venta_id: int, company_id: int) -> Decimal:
        """
        Calcula el saldo pendiente de una venta.
        
        Considera:
        - Aplicaciones de cobros a esta venta (nuevo sistema)
        - Cobros que referencian directamente la venta sin aplicaciones (sistema legacy)
        - Notas de crédito/débito
        
        Saldo pendiente = total_amount - sum(aplicaciones) - sum(cobros_sin_aplicacion) - sum(notas_credito) + sum(notas_debito)
        """
        from ..domain.models_notas import NotaDocumento, EstadoNota
        from ..domain.models_aplicaciones import AplicacionDocumento, TipoDocumentoAplicacion
        
        venta = self.uow.db.query(Sale).filter(
            Sale.id == venta_id,
            Sale.company_id == company_id
        ).first()
        
        if not venta:
            return Decimal("0.00")
        
        total_documento = Decimal(str(venta.total_amount))
        
        # Sumar aplicaciones de cobros a esta venta
        aplicaciones = self.uow.db.query(AplicacionDocumento).filter(
            AplicacionDocumento.company_id == company_id,
            AplicacionDocumento.tipo_documento == TipoDocumentoAplicacion.FACTURA.value,
            AplicacionDocumento.documento_id == venta_id
        ).all()
        
        total_aplicado = sum(Decimal(str(a.monto_aplicado)) for a in aplicaciones)
        
        # Obtener IDs de movimientos que tienen aplicaciones
        movimientos_con_aplicacion = set(
            a.movimiento_tesoreria_id for a in aplicaciones
        )
        
        # Sumar cobros que NO tienen aplicaciones y referencian directamente la venta (sistema legacy)
        cobros = self.uow.db.query(MovimientoTesoreria).filter(
            MovimientoTesoreria.company_id == company_id,
            MovimientoTesoreria.referencia_tipo == "VENTA",
            MovimientoTesoreria.referencia_id == venta_id,
            MovimientoTesoreria.estado == EstadoMovimiento.REGISTRADO.value
        ).all()
        
        # Filtrar cobros que NO tienen aplicaciones
        cobros_sin_aplicacion = [
            c for c in cobros 
            if c.id not in movimientos_con_aplicacion
        ]
        
        total_cobrado_directo = sum(Decimal(str(c.monto)) for c in cobros_sin_aplicacion)
        
        # Sumar notas de crédito (reducen saldo)
        notas_credito = self.uow.db.query(NotaDocumento).filter(
            NotaDocumento.company_id == company_id,
            NotaDocumento.documento_ref_tipo == "VENTA",
            NotaDocumento.documento_ref_id == venta_id,
            NotaDocumento.tipo == "CREDITO",
            NotaDocumento.estado == EstadoNota.REGISTRADA.value
        ).all()
        
        total_notas_credito = sum(Decimal(str(n.total)) for n in notas_credito)
        
        # Sumar notas de débito (aumentan saldo)
        notas_debito = self.uow.db.query(NotaDocumento).filter(
            NotaDocumento.company_id == company_id,
            NotaDocumento.documento_ref_tipo == "VENTA",
            NotaDocumento.documento_ref_id == venta_id,
            NotaDocumento.tipo == "DEBITO",
            NotaDocumento.estado == EstadoNota.REGISTRADA.value
        ).all()
        
        total_notas_debito = sum(Decimal(str(n.total)) for n in notas_debito)
        
        # Calcular saldo pendiente
        # Usamos aplicaciones si existen, si no, usamos cobros directos (no duplicamos)
        saldo_pendiente = total_documento - total_aplicado - total_cobrado_directo - total_notas_credito + total_notas_debito
        
        return max(saldo_pendiente, Decimal("0.00"))
    
    def _calcular_saldo_pendiente_compra(self, compra_id: int, company_id: int) -> Decimal:
        """
        Calcula el saldo pendiente de una compra.
        
        Considera:
        - Aplicaciones de pagos a esta compra (nuevo sistema)
        - Pagos que referencian directamente la compra sin aplicaciones (sistema legacy)
        - Notas de crédito/débito
        
        Saldo pendiente = total_amount - sum(aplicaciones) - sum(pagos_sin_aplicacion) - sum(notas_credito) + sum(notas_debito)
        """
        from ..domain.models_notas import NotaDocumento, EstadoNota
        from ..domain.models_aplicaciones import AplicacionDocumento, TipoDocumentoAplicacion
        
        compra = self.uow.db.query(Purchase).filter(
            Purchase.id == compra_id,
            Purchase.company_id == company_id
        ).first()
        
        if not compra:
            return Decimal("0.00")
        
        total_documento = Decimal(str(compra.total_amount))
        
        # Sumar aplicaciones de pagos a esta compra
        aplicaciones = self.uow.db.query(AplicacionDocumento).filter(
            AplicacionDocumento.company_id == company_id,
            AplicacionDocumento.tipo_documento == TipoDocumentoAplicacion.FACTURA.value,
            AplicacionDocumento.documento_id == compra_id
        ).all()
        
        total_aplicado = sum(Decimal(str(a.monto_aplicado)) for a in aplicaciones)
        
        # Obtener IDs de movimientos que tienen aplicaciones
        movimientos_con_aplicacion = set(
            a.movimiento_tesoreria_id for a in aplicaciones
        )
        
        # Sumar pagos que NO tienen aplicaciones y referencian directamente la compra (sistema legacy)
        pagos = self.uow.db.query(MovimientoTesoreria).filter(
            MovimientoTesoreria.company_id == company_id,
            MovimientoTesoreria.referencia_tipo == "COMPRA",
            MovimientoTesoreria.referencia_id == compra_id,
            MovimientoTesoreria.estado == EstadoMovimiento.REGISTRADO.value
        ).all()
        
        # Filtrar pagos que NO tienen aplicaciones
        pagos_sin_aplicacion = [
            p for p in pagos 
            if p.id not in movimientos_con_aplicacion
        ]
        
        total_pagado_directo = sum(Decimal(str(p.monto)) for p in pagos_sin_aplicacion)
        
        # Sumar notas de crédito (reducen saldo)
        notas_credito = self.uow.db.query(NotaDocumento).filter(
            NotaDocumento.company_id == company_id,
            NotaDocumento.documento_ref_tipo == "COMPRA",
            NotaDocumento.documento_ref_id == compra_id,
            NotaDocumento.tipo == "CREDITO",
            NotaDocumento.estado == EstadoNota.REGISTRADA.value
        ).all()
        
        total_notas_credito = sum(Decimal(str(n.total)) for n in notas_credito)
        
        # Sumar notas de débito (aumentan saldo)
        notas_debito = self.uow.db.query(NotaDocumento).filter(
            NotaDocumento.company_id == company_id,
            NotaDocumento.documento_ref_tipo == "COMPRA",
            NotaDocumento.documento_ref_id == compra_id,
            NotaDocumento.tipo == "DEBITO",
            NotaDocumento.estado == EstadoNota.REGISTRADA.value
        ).all()
        
        total_notas_debito = sum(Decimal(str(n.total)) for n in notas_debito)
        
        # Calcular saldo pendiente
        # Usamos aplicaciones si existen, si no, usamos pagos directos (no duplicamos)
        saldo_pendiente = total_documento - total_aplicado - total_pagado_directo - total_notas_credito + total_notas_debito
        
        return max(saldo_pendiente, Decimal("0.00"))
    
    def eliminar_movimiento(
        self,
        movimiento_id: int,
        company_id: int,
        usuario_id: Optional[int] = None
    ) -> None:
        """
        Elimina un movimiento de tesorería y anula su asiento contable.
        
        Similar a como se hace en compras/ventas al eliminar pagos.
        """
        from ..domain.models import JournalEntry, EntryLine
        
        # 1. Obtener movimiento
        movimiento = self.uow.db.query(MovimientoTesoreria).filter(
            MovimientoTesoreria.id == movimiento_id,
            MovimientoTesoreria.company_id == company_id
        ).first()
        
        if not movimiento:
            raise TesoreriaError(f"Movimiento {movimiento_id} no encontrado")
        
        # 2. Validar que el movimiento esté en estado REGISTRADO (no anulado)
        if movimiento.estado != EstadoMovimiento.REGISTRADO.value:
            raise TesoreriaError(f"El movimiento {movimiento_id} ya está anulado o no puede ser eliminado")
        
        # 3. Eliminar aplicaciones asociadas (si existen)
        from ..domain.models_aplicaciones import AplicacionDocumento
        
        aplicaciones = self.uow.db.query(AplicacionDocumento).filter(
            AplicacionDocumento.movimiento_tesoreria_id == movimiento_id,
            AplicacionDocumento.company_id == company_id
        ).all()
        
        for aplicacion in aplicaciones:
            self.uow.db.delete(aplicacion)
            logger.info(f"Aplicación {aplicacion.id} eliminada al eliminar movimiento {movimiento_id}")
        
        # 4. Eliminar asiento contable asociado si existe
        if movimiento.journal_entry_id:
            entry = self.uow.db.query(JournalEntry).filter(
                JournalEntry.id == movimiento.journal_entry_id,
                JournalEntry.company_id == company_id
            ).first()
            
            if entry:
                # Eliminar líneas del asiento
                self.uow.db.query(EntryLine).filter(
                    EntryLine.entry_id == entry.id
                ).delete()
                
                # Eliminar asiento
                self.uow.db.delete(entry)
                logger.info(f"Asiento {entry.id} anulado al eliminar movimiento {movimiento_id}")
        
        # 5. Eliminar movimiento
        self.uow.db.delete(movimiento)
        self.uow.db.flush()
        
        logger.info(
            f"Movimiento {movimiento_id} eliminado: tipo={movimiento.tipo}, "
            f"referencia={movimiento.referencia_tipo}-{movimiento.referencia_id}, "
            f"monto={movimiento.monto}"
        )

