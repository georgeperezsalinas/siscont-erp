"""
Motor de Asientos Contables
Sistema basado en eventos y reglas configurables
"""
from decimal import Decimal
from datetime import date
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
import json
import hashlib
import logging

from ..domain.models import Account, JournalEntry, EntryLine, Period
from ..domain.models_journal_engine import (
    EventoContable, ReglaContable, TipoCuentaMapeo,
    EventoContableType, TipoCuentaContable, LadoAsiento, TipoMonto
)
from ..infrastructure.unit_of_work import UnitOfWork
from ..application.dtos import JournalEntryIn, EntryLineIn
from .validations_journal_engine import (
    validar_naturaleza_cuenta,
    validar_mapeo_sensible,
    validar_periodo_abierto,
    validar_cuenta_activa,
    validar_asiento_cuadra,
    ValidacionNaturalezaError,
    PeriodoCerradoError,
    CuentaInactivaError,
    MapeoInvalidoError
)

logger = logging.getLogger(__name__)


class MotorAsientosError(Exception):
    """Excepción base para errores del motor de asientos"""
    pass


class CuentaNoMapeadaError(MotorAsientosError):
    """Error cuando un tipo de cuenta no tiene mapeo a cuenta real"""
    pass


class AsientoDescuadradoError(MotorAsientosError):
    """Error cuando el asiento generado no cuadra (Debe != Haber)"""
    pass


class MotorAsientos:
    """
    Motor de Asientos Contables
    
    Convierte eventos contables en asientos contables automáticamente
    usando reglas configurables y tipos de cuenta (no códigos hardcodeados).
    """
    
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
    
    def generar_asiento(
        self,
        evento_tipo: str,
        datos_operacion: Dict[str, Any],
        company_id: int,
        fecha: date,
        glosa: str,
        currency: str = "PEN",
        exchange_rate: Decimal = Decimal("1.0"),
        origin: str = "MOTOR"  # Origen del asiento: TESORERIA, COMPRAS, VENTAS, etc.
    ) -> JournalEntry:
        """
        Genera un asiento contable automáticamente basado en un evento y reglas.
        
        Args:
            evento_tipo: Tipo de evento (COMPRA, VENTA, PAGO, etc.)
            datos_operacion: Datos de la operación (base, igv, total, etc.)
            company_id: ID de la empresa
            fecha: Fecha del asiento
            glosa: Descripción del asiento
            currency: Moneda (default: PEN)
            exchange_rate: Tipo de cambio (default: 1.0)
        
        Returns:
            JournalEntry: Asiento generado y persistido
        
        Raises:
            MotorAsientosError: Si hay error en la generación
            CuentaNoMapeadaError: Si falta mapeo de tipo de cuenta
            AsientoDescuadradoError: Si el asiento no cuadra
        """
        # 1. Obtener evento contable
        evento = self._obtener_evento(evento_tipo, company_id)
        if not evento:
            raise MotorAsientosError(f"Evento contable '{evento_tipo}' no encontrado para empresa {company_id}")
        
        # 2. Obtener reglas activas del evento
        reglas = self._obtener_reglas(evento.id, company_id)
        if not reglas:
            raise MotorAsientosError(f"No hay reglas configuradas para evento '{evento_tipo}'")
        
        # 3. Evaluar reglas y construir líneas del asiento
        lineas = []
        reglas_aplicadas = []
        reglas_descartadas = []
        
        for regla in sorted(reglas, key=lambda r: r.orden):
            motivo_descarte = None
            
            # Evaluar condición si existe
            if regla.condicion and not self._evaluar_condicion(regla.condicion, datos_operacion):
                motivo_descarte = f"Condición no cumplida: {regla.condicion}"
                reglas_descartadas.append({
                    "regla_id": regla.id,
                    "orden": regla.orden,
                    "tipo_cuenta": regla.tipo_cuenta,
                    "lado": regla.lado,
                    "motivo": motivo_descarte
                })
                continue
            
            # Resolver cuenta real desde tipo de cuenta
            # Para INVENTARIO, verificar si hay una cuenta específica en los datos de operación
            cuenta = None
            if regla.tipo_cuenta == TipoCuentaContable.INVENTARIO.value:
                # Si hay una cuenta específica de inventario en los datos, usarla
                inventory_account_code = datos_operacion.get("inventory_account_code") or datos_operacion.get("product_account_code")
                if inventory_account_code:
                    cuenta = self.uow.accounts.by_code(company_id, inventory_account_code)
                    if cuenta:
                        logger.info(f"✅ Usando cuenta específica de inventario: {inventory_account_code} ({cuenta.name})")
            
            # Si no se encontró cuenta específica, usar el mapeo normal
            if not cuenta:
                cuenta = self._resolver_cuenta(regla.tipo_cuenta, company_id)
            
            if not cuenta:
                motivo_descarte = f"Tipo de cuenta '{regla.tipo_cuenta}' no tiene mapeo y no se pudo crear automáticamente"
                reglas_descartadas.append({
                    "regla_id": regla.id,
                    "orden": regla.orden,
                    "tipo_cuenta": regla.tipo_cuenta,
                    "lado": regla.lado,
                    "motivo": motivo_descarte
                })
                raise CuentaNoMapeadaError(
                    f"Tipo de cuenta '{regla.tipo_cuenta}' no tiene mapeo a cuenta real para empresa {company_id}. "
                    f"Por favor, configure el mapeo desde el módulo de Motor de Asientos o ejecute el auto-mapeo."
                )
            
            # VALIDACIÓN A.3: Cuenta activa (permite_movimiento)
            es_valida, error_cuenta = validar_cuenta_activa(cuenta)
            if not es_valida:
                raise CuentaInactivaError(error_cuenta)
            
            # VALIDACIÓN B.1: Mapeo sensible (CLIENTES solo Activo, IGV_CREDITO solo Activo, etc.)
            # Esta validación es CRÍTICA y debe ejecutarse ANTES de usar la cuenta
            es_valido_mapeo, error_mapeo = validar_mapeo_sensible(regla.tipo_cuenta, cuenta)
            if not es_valido_mapeo:
                # Si el mapeo es inválido, intentar corregirlo automáticamente
                logger.warning(f"⚠️ Mapeo inválido detectado: {error_mapeo}")
                logger.warning(f"   Tipo: {regla.tipo_cuenta}, Cuenta actual: {cuenta.code} ({cuenta.name}), Tipo cuenta: {cuenta.type.value}")
                
                # Intentar encontrar una cuenta correcta
                try:
                    from .services_journal_engine_auto_map import buscar_cuenta_por_tipo
                    cuenta_correcta = buscar_cuenta_por_tipo(self.uow.db, company_id, regla.tipo_cuenta)
                    
                    if cuenta_correcta and cuenta_correcta.id != cuenta.id:
                        # Actualizar el mapeo existente
                        mapeo_existente = self.uow.db.query(TipoCuentaMapeo).filter(
                            TipoCuentaMapeo.tipo_cuenta == regla.tipo_cuenta,
                            TipoCuentaMapeo.company_id == company_id,
                            TipoCuentaMapeo.activo == True
                        ).first()
                        
                        if mapeo_existente:
                            mapeo_existente.account_id = cuenta_correcta.id
                            self.uow.db.flush()
                            logger.info(f"✅ Mapeo corregido automáticamente: {regla.tipo_cuenta} → {cuenta_correcta.code} ({cuenta_correcta.name})")
                            cuenta = cuenta_correcta
                        else:
                            raise MapeoInvalidoError(error_mapeo)
                    else:
                        raise MapeoInvalidoError(error_mapeo)
                except Exception as e:
                    logger.error(f"Error al intentar corregir mapeo: {e}")
                    raise MapeoInvalidoError(error_mapeo)
            
            # VALIDACIÓN A.2: Naturaleza de cuenta según tipo
            es_valida_naturaleza, error_naturaleza = validar_naturaleza_cuenta(
                regla.tipo_cuenta,
                regla.lado,
                cuenta
            )
            if not es_valida_naturaleza:
                raise ValidacionNaturalezaError(error_naturaleza)
            
            # Calcular monto según tipo
            monto = self._calcular_monto(regla.tipo_monto, datos_operacion, regla.config)
            
            # Si monto es 0, descartar regla
            if monto == 0:
                motivo_descarte = "Monto calculado es 0"
                reglas_descartadas.append({
                    "regla_id": regla.id,
                    "orden": regla.orden,
                    "tipo_cuenta": regla.tipo_cuenta,
                    "lado": regla.lado,
                    "motivo": motivo_descarte
                })
                continue
            
            # Crear línea del asiento
            if regla.lado == LadoAsiento.DEBE.value:
                lineas.append({
                    "account_code": cuenta.code,
                    "debit": float(monto),
                    "credit": 0.0,
                    "memo": self._generar_memo(regla, datos_operacion, glosa)
                })
            else:  # HABER
                lineas.append({
                    "account_code": cuenta.code,
                    "debit": 0.0,
                    "credit": float(monto),
                    "memo": self._generar_memo(regla, datos_operacion, glosa)
                })
            
            # Registrar regla aplicada
            reglas_aplicadas.append({
                "regla_id": regla.id,
                "orden": regla.orden,
                "tipo_cuenta": regla.tipo_cuenta,
                "lado": regla.lado,
                "tipo_monto": regla.tipo_monto.value if hasattr(regla.tipo_monto, 'value') else str(regla.tipo_monto),
                "account_code": cuenta.code,
                "monto": float(monto)
            })
        
        # 4. VALIDACIÓN CRÍTICA: Verificar que haya al menos una línea
        if not lineas or len(lineas) == 0:
            error_msg = (
                f"No se generaron líneas para el asiento. "
                f"Evento: {evento_tipo}, Reglas aplicadas: {len(reglas_aplicadas)}, "
                f"Reglas descartadas: {len(reglas_descartadas)}"
            )
            if reglas_descartadas:
                motivos = [r.get("motivo", "Desconocido") for r in reglas_descartadas]
                error_msg += f"\nMotivos de descarte: {', '.join(set(motivos))}"
            logger.error(error_msg)
            raise MotorAsientosError(error_msg)
        
        # 5. VALIDACIÓN A.4: Validar que el asiento cuadre
        total_debe = sum(Decimal(str(l["debit"])) for l in lineas)
        total_haber = sum(Decimal(str(l["credit"])) for l in lineas)
        
        es_cuadrado, error_cuadrado = validar_asiento_cuadra(total_debe, total_haber)
        if not es_cuadrado:
            raise AsientoDescuadradoError(error_cuadrado)
        
        # 6. Obtener o crear período
        y, m = fecha.year, fecha.month
        periodo = self.uow.periods.get_or_open(company_id, y, m)
        if not periodo:
            raise MotorAsientosError(f"Período {y}-{m:02d} no encontrado")
        
        # VALIDACIÓN A.4: Período abierto
        es_periodo_abierto, error_periodo = validar_periodo_abierto(periodo)
        if not es_periodo_abierto:
            raise PeriodoCerradoError(error_periodo)
        
        # 7. Generar hash de contexto para trazabilidad (C.1)
        contexto_hash = self._generar_hash_contexto(
            evento_tipo=evento_tipo,
            datos_operacion=datos_operacion,
            fecha=fecha,
            company_id=company_id
        )
        
        # 8. Crear asiento con trazabilidad completa (C.1)
        entry = JournalEntry(
            company_id=company_id,
            date=fecha,
            period_id=periodo.id,
            glosa=glosa,
            currency=currency,
            exchange_rate=exchange_rate,
            origin=origin,  # Origen real del asiento: TESORERIA, COMPRAS, VENTAS, etc.
            status="POSTED"
        )
        
        # Guardar trazabilidad en campo motor_metadata (C.1)
        entry.motor_metadata = {
            "evento_tipo": evento_tipo,
            "evento_id": evento.id,
            "reglas_aplicadas": reglas_aplicadas,
            "reglas_descartadas": reglas_descartadas,
            "hash_contexto": contexto_hash,
            "total_debe": float(total_debe),
            "total_haber": float(total_haber)
        }
        
        # Logging mejorado (D.1)
        logger.info(
            f"Generando asiento MOTOR: company_id={company_id}, evento={evento_tipo}, "
            f"fecha={fecha}, reglas_aplicadas={len(reglas_aplicadas)}, "
            f"reglas_descartadas={len(reglas_descartadas)}, hash={contexto_hash}"
        )
        
        # 9. Crear líneas del asiento
        built_lines = []
        for ln in lineas:
            account = self.uow.accounts.by_code(company_id, ln["account_code"])
            if not account:
                raise MotorAsientosError(f"Cuenta {ln['account_code']} no encontrada")
            
            built_lines.append(EntryLine(
                account_id=account.id,
                debit=Decimal(str(ln["debit"])).quantize(Decimal('0.01')),
                credit=Decimal(str(ln["credit"])).quantize(Decimal('0.01')),
                memo=ln.get("memo")
            ))
        
        # Validar que haya líneas antes de crear el asiento
        if not built_lines or len(built_lines) == 0:
            error_msg = f"No se pudieron crear líneas para el asiento. Evento: {evento_tipo}, Líneas generadas: {len(lineas)}"
            logger.error(error_msg)
            raise MotorAsientosError(error_msg)
        
        entry.lines = built_lines
        self.uow.journal.add_entry(entry)
        self.uow.db.flush()
        
        # Validar que las líneas se guardaron correctamente
        entry_refreshed = self.uow.db.query(JournalEntry).filter(JournalEntry.id == entry.id).first()
        if not entry_refreshed or not entry_refreshed.lines or len(entry_refreshed.lines) == 0:
            error_msg = f"El asiento se creó pero no tiene líneas. entry_id={entry.id}, evento={evento_tipo}"
            logger.error(error_msg)
            raise MotorAsientosError(error_msg)
        
        # Logging final (D.1)
        logger.info(
            f"Asiento MOTOR creado exitosamente: entry_id={entry.id}, "
            f"company_id={company_id}, evento={evento_tipo}, total_debe={total_debe}, total_haber={total_haber}, "
            f"lineas={len(built_lines)}"
        )
        
        return entry
    
    def simular_asiento(
        self,
        evento_tipo: str,
        datos_operacion: dict,
        company_id: int,
        fecha: date,
        glosa: str,
        currency: str = "PEN",
        exchange_rate: Decimal = Decimal("1.0")
    ) -> dict:
        """
        Simula la generación de un asiento sin persistirlo.
        
        Útil para pruebas y validación antes de crear asientos reales.
        
        Returns:
            dict: Diccionario con la estructura del asiento simulado:
            {
                "lineas": [...],
                "total_debit": float,
                "total_credit": float,
                "cuadra": bool,
                "glosa": str,
                "fecha": str,
                "evento": str
            }
        """
        # 1. Obtener evento contable
        evento = self._obtener_evento(evento_tipo, company_id)
        if not evento:
            raise MotorAsientosError(f"Evento contable '{evento_tipo}' no encontrado para empresa {company_id}")
        
        # 2. Obtener reglas activas del evento
        reglas = self._obtener_reglas(evento.id, company_id)
        if not reglas:
            raise MotorAsientosError(f"No hay reglas configuradas para evento '{evento_tipo}'")
        
        # 3. Evaluar reglas y construir líneas del asiento
        lineas = []
        for regla in sorted(reglas, key=lambda r: r.orden):
            # Evaluar condición si existe
            if regla.condicion and not self._evaluar_condicion(regla.condicion, datos_operacion):
                continue
            
            # Resolver cuenta real desde tipo de cuenta
            cuenta = self._resolver_cuenta(regla.tipo_cuenta, company_id)
            if not cuenta:
                raise CuentaNoMapeadaError(
                    f"Tipo de cuenta '{regla.tipo_cuenta}' no tiene mapeo a cuenta real para empresa {company_id}"
                )
            
            # Calcular monto según tipo
            monto = self._calcular_monto(regla.tipo_monto, datos_operacion, regla.config)
            
            # Crear línea del asiento
            if regla.lado == LadoAsiento.DEBE.value:
                lineas.append({
                    "account_code": cuenta.code,
                    "account_name": cuenta.name,
                    "debit": float(monto),
                    "credit": 0.0,
                    "memo": self._generar_memo(regla, datos_operacion, glosa)
                })
            else:  # HABER
                lineas.append({
                    "account_code": cuenta.code,
                    "account_name": cuenta.name,
                    "debit": 0.0,
                    "credit": float(monto),
                    "memo": self._generar_memo(regla, datos_operacion, glosa)
                })
        
        # 4. Calcular totales
        total_debit = sum(Decimal(str(l["debit"])) for l in lineas)
        total_credit = sum(Decimal(str(l["credit"])) for l in lineas)
        cuadra = abs(total_debit - total_credit) <= Decimal("0.01")
        
        return {
            "lineas": lineas,
            "total_debit": float(total_debit),
            "total_credit": float(total_credit),
            "cuadra": cuadra,
            "glosa": glosa,
            "fecha": fecha.isoformat(),
            "evento": evento_tipo,
            "evento_nombre": evento.nombre
        }
    
    def _obtener_evento(self, evento_tipo: str, company_id: int) -> Optional[EventoContable]:
        """Obtiene el evento contable por tipo y empresa"""
        return self.uow.db.query(EventoContable).filter(
            EventoContable.tipo == evento_tipo,
            EventoContable.company_id == company_id,
            EventoContable.activo == True
        ).first()
    
    def _obtener_reglas(self, evento_id: int, company_id: int) -> List[ReglaContable]:
        """Obtiene las reglas activas de un evento"""
        return self.uow.db.query(ReglaContable).filter(
            ReglaContable.evento_id == evento_id,
            ReglaContable.company_id == company_id,
            ReglaContable.activo == True
        ).order_by(ReglaContable.orden).all()
    
    def _evaluar_condicion(self, condicion: str, datos: Dict[str, Any]) -> bool:
        """
        Evalúa una condición Python contra los datos de operación.
        
        Ejemplo: "afecta_stock == True", "tipo_documento == 'FACTURA'"
        
        ⚠️ SEGURIDAD: En producción, usar un evaluador seguro (ast.literal_eval)
        """
        try:
            # Crear contexto seguro con solo los datos de operación
            contexto = {k: v for k, v in datos.items()}
            # Evaluar condición de forma segura
            return eval(condicion, {"__builtins__": {}}, contexto)
        except Exception as e:
            # Si falla la evaluación, considerar como False
            return False
    
    def _resolver_cuenta(self, tipo_cuenta: str, company_id: int) -> Optional[Account]:
        """
        Resuelve un tipo de cuenta contable a una cuenta real.
        
        Si no existe mapeo, intenta crearlo automáticamente.
        
        Args:
            tipo_cuenta: Tipo de cuenta (TipoCuentaContable)
            company_id: ID de la empresa
        
        Returns:
            Account: Cuenta contable real o None si no hay mapeo y no se pudo crear
        """
        mapeo = self.uow.db.query(TipoCuentaMapeo).filter(
            TipoCuentaMapeo.tipo_cuenta == tipo_cuenta,
            TipoCuentaMapeo.company_id == company_id,
            TipoCuentaMapeo.activo == True
        ).first()
        
        if mapeo:
            return mapeo.account
        
        # Si no hay mapeo, intentar crearlo automáticamente
        logger.info(f"⚠️ No hay mapeo para '{tipo_cuenta}', intentando crear automáticamente...")
        try:
            from .services_journal_engine_auto_map import buscar_cuenta_por_tipo
            cuenta = buscar_cuenta_por_tipo(self.uow.db, company_id, tipo_cuenta)
            
            if cuenta:
                # Crear mapeo automáticamente
                nuevo_mapeo = TipoCuentaMapeo(
                    company_id=company_id,
                    tipo_cuenta=tipo_cuenta,
                    account_id=cuenta.id,
                    activo=True
                )
                self.uow.db.add(nuevo_mapeo)
                self.uow.db.flush()
                logger.info(f"✅ Mapeo automático creado: {tipo_cuenta} → {cuenta.code} ({cuenta.name})")
                return cuenta
            else:
                logger.warning(f"❌ No se pudo encontrar cuenta automáticamente para '{tipo_cuenta}'")
                return None
        except Exception as e:
            logger.error(f"Error al intentar crear mapeo automático para '{tipo_cuenta}': {e}")
            return None
    
    def _calcular_monto(
        self,
        tipo_monto: str,
        datos: Dict[str, Any],
        config: Optional[Dict[str, Any]] = None
    ) -> Decimal:
        """
        Calcula el monto según el tipo especificado.
        
        Args:
            tipo_monto: Tipo de monto (BASE, IGV, TOTAL, etc.)
            datos: Datos de la operación
            config: Configuración adicional de la regla
        
        Returns:
            Decimal: Monto calculado
        """
        config = config or {}
        
        if tipo_monto == TipoMonto.BASE.value:
            base = Decimal(str(datos.get("base", 0)))
            return base.quantize(Decimal('0.01'))
        
        elif tipo_monto == TipoMonto.IGV.value:
            base = Decimal(str(datos.get("base", 0)))
            igv_rate = Decimal(str(config.get("igv_rate", 0.18)))  # 18% por defecto
            igv = (base * igv_rate).quantize(Decimal('0.01'))
            return igv
        
        elif tipo_monto == TipoMonto.TOTAL.value:
            # Si hay "total" directamente en los datos, usarlo (caso de tesorería)
            if "total" in datos:
                total = Decimal(str(datos.get("total", 0)))
                return total.quantize(Decimal('0.01'))
            # Si no hay "total", calcular desde "base" (caso de compras/ventas)
            base = Decimal(str(datos.get("base", 0)))
            if base > 0:
                igv_rate = Decimal(str(config.get("igv_rate", 0.18)))
                total = (base * (Decimal("1.0") + igv_rate)).quantize(Decimal('0.01'))
                return total
            # Si no hay base ni total, retornar 0
            return Decimal('0.00')
        
        elif tipo_monto == TipoMonto.DESCUENTO.value:
            descuento = Decimal(str(datos.get("descuento", 0)))
            return descuento.quantize(Decimal('0.01'))
        
        elif tipo_monto == TipoMonto.COSTO.value:
            costo = Decimal(str(datos.get("costo", 0)))
            return costo.quantize(Decimal('0.01'))
        
        elif tipo_monto == TipoMonto.CANTIDAD.value:
            cantidad = Decimal(str(datos.get("cantidad", 0)))
            return cantidad.quantize(Decimal('0.0001'))
        
        else:
            # Valor directo desde datos
            valor = Decimal(str(datos.get(tipo_monto.lower(), 0)))
            return valor.quantize(Decimal('0.01'))
    
    def _generar_memo(
        self,
        regla: ReglaContable,
        datos: Dict[str, Any],
        glosa_base: str
    ) -> str:
        """Genera el memo para una línea del asiento"""
        if regla.config and regla.config.get("memo_template"):
            # Usar plantilla personalizada
            memo = regla.config["memo_template"]
            # Reemplazar variables
            for key, value in datos.items():
                memo = memo.replace(f"{{{key}}}", str(value))
            return memo
        
        # Memo por defecto
        tipo_monto = regla.tipo_monto
        if tipo_monto == TipoMonto.BASE.value:
            return f"{glosa_base} - Base"
        elif tipo_monto == TipoMonto.IGV.value:
            return f"{glosa_base} - IGV"
        elif tipo_monto == TipoMonto.TOTAL.value:
            return f"{glosa_base} - Total"
        else:
            return glosa_base
    
    def _generar_hash_contexto(
        self,
        evento_tipo: str,
        datos_operacion: Dict[str, Any],
        fecha: date,
        company_id: int
    ) -> str:
        """
        Genera un hash del contexto para trazabilidad y reproducibilidad (C.1).
        
        Este hash permite identificar asientos generados con los mismos parámetros.
        """
        contexto_str = json.dumps({
            "evento_tipo": evento_tipo,
            "fecha": fecha.isoformat(),
            "company_id": company_id,
            "datos": {k: str(v) for k, v in sorted(datos_operacion.items())}
        }, sort_keys=True)
        
        return hashlib.sha256(contexto_str.encode()).hexdigest()[:16]

