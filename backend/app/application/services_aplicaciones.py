"""
Servicio de Aplicación de Cobros y Pagos a Documentos

Principios:
- La aplicación NO genera asientos
- La aplicación NO modifica asientos existentes
- Solo se aplica a FACTURAS (ventas/compras), NO a notas
- Permite pagos parciales y múltiples aplicaciones
"""
from decimal import Decimal
from datetime import date
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
import logging

from ..domain.models_aplicaciones import AplicacionDocumento, TipoDocumentoAplicacion
from ..domain.models_tesoreria import MovimientoTesoreria, EstadoMovimiento
from ..domain.models_ext import Sale, Purchase
from ..domain.models import Period
from ..infrastructure.unit_of_work import UnitOfWork
from ..application.validations_journal_engine import validar_periodo_abierto, PeriodoCerradoError

logger = logging.getLogger(__name__)


class AplicacionPagosError(Exception):
    """Error en la aplicación de pagos"""
    pass


class AplicacionPagosService:
    """
    Servicio para gestionar la aplicación de cobros/pagos a documentos.
    
    Permite:
    - Aplicar un cobro/pago a múltiples documentos
    - Aplicar múltiples cobros/pagos a un documento
    - Controlar pagos parciales
    - Rastrear qué documentos están pendientes, parcialmente pagados o cancelados
    """
    
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.db = uow.db
    
    def aplicar_pago(
        self,
        movimiento_tesoreria_id: int,
        aplicaciones: List[Dict[str, Any]],
        company_id: int,
        usuario_id: Optional[int] = None
    ) -> List[AplicacionDocumento]:
        """
        Aplica un cobro/pago a uno o múltiples documentos.
        
        Args:
            movimiento_tesoreria_id: ID del movimiento de tesorería (cobro o pago)
            aplicaciones: Lista de aplicaciones, cada una con:
                - tipo_documento: "FACTURA" (solo facturas según reglas)
                - documento_id: ID de la venta o compra
                - monto_aplicado: Monto a aplicar a este documento
            company_id: ID de la empresa
            usuario_id: ID del usuario que realiza la aplicación
        
        Returns:
            Lista de AplicacionDocumento creadas
        
        Validaciones:
            - La suma aplicada ≤ monto del cobro/pago
            - El documento tenga saldo pendiente
            - No permitir aplicar más de lo pendiente
            - No permitir aplicar en periodo cerrado
        """
        # 1. Validar movimiento de tesorería
        movimiento = self.db.query(MovimientoTesoreria).filter(
            MovimientoTesoreria.id == movimiento_tesoreria_id,
            MovimientoTesoreria.company_id == company_id,
            MovimientoTesoreria.estado == EstadoMovimiento.REGISTRADO.value
        ).first()
        
        if not movimiento:
            raise AplicacionPagosError(f"Movimiento de tesorería {movimiento_tesoreria_id} no encontrado o no está registrado")
        
        # 2. Validar que no sea TRANSFERENCIA (solo COBRO y PAGO se aplican)
        if movimiento.tipo == "TRANSFERENCIA":
            raise AplicacionPagosError("Los movimientos de transferencia no se aplican a documentos")
        
        # 3. Validar período abierto
        periodo = self.uow.periods.get_or_open(company_id, movimiento.fecha)
        if periodo:
            es_periodo_abierto, error_periodo = validar_periodo_abierto(periodo)
            if not es_periodo_abierto:
                raise AplicacionPagosError(f"Período cerrado: {error_periodo}")
        
        # 4. Calcular total aplicado
        total_aplicado = sum(Decimal(str(a.get("monto_aplicado", 0))) for a in aplicaciones)
        monto_movimiento = Decimal(str(movimiento.monto))
        
        if total_aplicado > monto_movimiento:
            raise AplicacionPagosError(
                f"La suma aplicada ({total_aplicado}) excede el monto del movimiento ({monto_movimiento})"
            )
        
        # 5. Validar cada aplicación
        aplicaciones_creadas = []
        
        for aplicacion in aplicaciones:
            tipo_documento = aplicacion.get("tipo_documento")
            documento_id = aplicacion.get("documento_id")
            monto_aplicado = Decimal(str(aplicacion.get("monto_aplicado", 0)))
            
            if monto_aplicado <= 0:
                raise AplicacionPagosError(f"El monto aplicado debe ser mayor a cero")
            
            # Validar tipo de documento (solo FACTURA según reglas)
            if tipo_documento != TipoDocumentoAplicacion.FACTURA.value:
                raise AplicacionPagosError(
                    f"Tipo de documento '{tipo_documento}' no permitido. Solo se pueden aplicar FACTURAS"
                )
            
            # Obtener documento y validar saldo pendiente
            saldo_pendiente = self._obtener_saldo_pendiente_documento(
                tipo_documento=tipo_documento,
                documento_id=documento_id,
                company_id=company_id,
                movimiento_tipo=movimiento.tipo
            )
            
            if saldo_pendiente <= Decimal("0.00"):
                raise AplicacionPagosError(
                    f"El documento {tipo_documento} {documento_id} no tiene saldo pendiente"
                )
            
            if monto_aplicado > saldo_pendiente:
                raise AplicacionPagosError(
                    f"El monto aplicado ({monto_aplicado}) excede el saldo pendiente ({saldo_pendiente}) "
                    f"del documento {tipo_documento} {documento_id}"
                )
            
            # 6. Verificar que no se haya aplicado ya más de lo permitido
            aplicaciones_existentes = self.db.query(AplicacionDocumento).filter(
                AplicacionDocumento.movimiento_tesoreria_id == movimiento_tesoreria_id,
                AplicacionDocumento.tipo_documento == tipo_documento,
                AplicacionDocumento.documento_id == documento_id,
                AplicacionDocumento.company_id == company_id
            ).all()
            
            total_ya_aplicado = sum(Decimal(str(a.monto_aplicado)) for a in aplicaciones_existentes)
            nuevo_total = total_ya_aplicado + monto_aplicado
            
            # Recalcular saldo pendiente considerando aplicaciones existentes
            saldo_pendiente_real = saldo_pendiente - total_ya_aplicado
            
            if monto_aplicado > saldo_pendiente_real:
                raise AplicacionPagosError(
                    f"El monto aplicado ({monto_aplicado}) excede el saldo pendiente disponible "
                    f"({saldo_pendiente_real}) del documento {tipo_documento} {documento_id}. "
                    f"Ya se han aplicado {total_ya_aplicado} anteriormente."
                )
            
            # 7. Crear aplicación
            aplicacion_doc = AplicacionDocumento(
                company_id=company_id,
                movimiento_tesoreria_id=movimiento_tesoreria_id,
                tipo_documento=tipo_documento,
                documento_id=documento_id,
                monto_aplicado=monto_aplicado,
                fecha=movimiento.fecha,
                created_by_id=usuario_id
            )
            
            self.db.add(aplicacion_doc)
            aplicaciones_creadas.append(aplicacion_doc)
            
            logger.info(
                f"Aplicación creada: Movimiento {movimiento_tesoreria_id} -> "
                f"{tipo_documento} {documento_id}, monto: {monto_aplicado}"
            )
        
        self.db.flush()
        
        return aplicaciones_creadas
    
    def desaplicar_pago(
        self,
        aplicacion_id: int,
        company_id: int,
        usuario_id: Optional[int] = None
    ) -> None:
        """
        Desaplica un cobro/pago de un documento.
        
        Args:
            aplicacion_id: ID de la aplicación a eliminar
            company_id: ID de la empresa
            usuario_id: ID del usuario que realiza la desaplicación
        
        Validaciones:
            - La aplicación existe y pertenece a la empresa
            - No permitir desaplicar en periodo cerrado
        """
        # 1. Obtener aplicación
        aplicacion = self.db.query(AplicacionDocumento).filter(
            AplicacionDocumento.id == aplicacion_id,
            AplicacionDocumento.company_id == company_id
        ).first()
        
        if not aplicacion:
            raise AplicacionPagosError(f"Aplicación {aplicacion_id} no encontrada")
        
        # 2. Obtener movimiento de tesorería
        movimiento = self.db.query(MovimientoTesoreria).filter(
            MovimientoTesoreria.id == aplicacion.movimiento_tesoreria_id,
            MovimientoTesoreria.company_id == company_id
        ).first()
        
        if not movimiento:
            raise AplicacionPagosError(f"Movimiento de tesorería {aplicacion.movimiento_tesoreria_id} no encontrado")
        
        # 3. Validar período abierto
        periodo = self.uow.periods.get_or_open(company_id, movimiento.fecha)
        if periodo:
            es_periodo_abierto, error_periodo = validar_periodo_abierto(periodo)
            if not es_periodo_abierto:
                raise AplicacionPagosError(f"Período cerrado: {error_periodo}")
        
        # 4. Eliminar aplicación
        self.db.delete(aplicacion)
        self.db.flush()
        
        logger.info(
            f"Aplicación {aplicacion_id} desaplicada: Movimiento {aplicacion.movimiento_tesoreria_id} -> "
            f"{aplicacion.tipo_documento} {aplicacion.documento_id}"
        )
    
    def _obtener_saldo_pendiente_documento(
        self,
        tipo_documento: str,
        documento_id: int,
        company_id: int,
        movimiento_tipo: str
    ) -> Decimal:
        """
        Obtiene el saldo pendiente de un documento, considerando aplicaciones existentes.
        
        El cálculo considera:
        - Total del documento
        - Cobros/pagos que referencian directamente el documento (sistema legacy)
        - Aplicaciones de cobros/pagos al documento (nuevo sistema)
        - Notas de crédito/débito
        
        Args:
            tipo_documento: Tipo de documento (FACTURA)
            documento_id: ID del documento
            company_id: ID de la empresa
            movimiento_tipo: Tipo de movimiento (COBRO o PAGO)
        
        Returns:
            Saldo pendiente del documento
        """
        from ..application.services_tesoreria import TesoreriaService
        from ..domain.models_notas import NotaDocumento, EstadoNota
        
        if tipo_documento != TipoDocumentoAplicacion.FACTURA.value:
            return Decimal("0.00")
        
        # Determinar si es venta o compra según el tipo de movimiento
        if movimiento_tipo == "COBRO":
            # Es una venta
            venta = self.db.query(Sale).filter(
                Sale.id == documento_id,
                Sale.company_id == company_id
            ).first()
            
            if not venta:
                return Decimal("0.00")
            
            total_documento = Decimal(str(venta.total_amount))
            
            # Sumar cobros que referencian directamente la venta (sistema legacy)
            cobros_directos = self.db.query(MovimientoTesoreria).filter(
                MovimientoTesoreria.company_id == company_id,
                MovimientoTesoreria.referencia_tipo == "VENTA",
                MovimientoTesoreria.referencia_id == documento_id,
                MovimientoTesoreria.estado == EstadoMovimiento.REGISTRADO.value
            ).all()
            
            total_cobrado_directo = sum(Decimal(str(c.monto)) for c in cobros_directos)
            
            # Sumar aplicaciones de cobros a esta venta
            aplicaciones = self.db.query(AplicacionDocumento).filter(
                AplicacionDocumento.company_id == company_id,
                AplicacionDocumento.tipo_documento == tipo_documento,
                AplicacionDocumento.documento_id == documento_id
            ).all()
            
            total_aplicado = sum(Decimal(str(a.monto_aplicado)) for a in aplicaciones)
            
            # Sumar notas de crédito (reducen saldo)
            notas_credito = self.db.query(NotaDocumento).filter(
                NotaDocumento.company_id == company_id,
                NotaDocumento.documento_ref_tipo == "VENTA",
                NotaDocumento.documento_ref_id == documento_id,
                NotaDocumento.tipo == "CREDITO",
                NotaDocumento.estado == EstadoNota.REGISTRADA.value
            ).all()
            
            total_notas_credito = sum(Decimal(str(n.total)) for n in notas_credito)
            
            # Sumar notas de débito (aumentan saldo)
            notas_debito = self.db.query(NotaDocumento).filter(
                NotaDocumento.company_id == company_id,
                NotaDocumento.documento_ref_tipo == "VENTA",
                NotaDocumento.documento_ref_id == documento_id,
                NotaDocumento.tipo == "DEBITO",
                NotaDocumento.estado == EstadoNota.REGISTRADA.value
            ).all()
            
            total_notas_debito = sum(Decimal(str(n.total)) for n in notas_debito)
            
            # Calcular saldo pendiente
            # Consideramos tanto cobros directos como aplicaciones (no duplicamos)
            # Si hay aplicaciones, usamos aplicaciones; si no, usamos cobros directos
            if total_aplicado > 0:
                # Hay aplicaciones, usar aplicaciones
                saldo_pendiente = total_documento - total_aplicado - total_notas_credito + total_notas_debito
            else:
                # No hay aplicaciones, usar sistema legacy
                saldo_pendiente = total_documento - total_cobrado_directo - total_notas_credito + total_notas_debito
            
            return max(saldo_pendiente, Decimal("0.00"))
        
        elif movimiento_tipo == "PAGO":
            # Es una compra
            compra = self.db.query(Purchase).filter(
                Purchase.id == documento_id,
                Purchase.company_id == company_id
            ).first()
            
            if not compra:
                return Decimal("0.00")
            
            total_documento = Decimal(str(compra.total_amount))
            
            # Sumar pagos que referencian directamente la compra (sistema legacy)
            pagos_directos = self.db.query(MovimientoTesoreria).filter(
                MovimientoTesoreria.company_id == company_id,
                MovimientoTesoreria.referencia_tipo == "COMPRA",
                MovimientoTesoreria.referencia_id == documento_id,
                MovimientoTesoreria.estado == EstadoMovimiento.REGISTRADO.value
            ).all()
            
            total_pagado_directo = sum(Decimal(str(p.monto)) for p in pagos_directos)
            
            # Sumar aplicaciones de pagos a esta compra
            aplicaciones = self.db.query(AplicacionDocumento).filter(
                AplicacionDocumento.company_id == company_id,
                AplicacionDocumento.tipo_documento == tipo_documento,
                AplicacionDocumento.documento_id == documento_id
            ).all()
            
            total_aplicado = sum(Decimal(str(a.monto_aplicado)) for a in aplicaciones)
            
            # Sumar notas de crédito (reducen saldo)
            notas_credito = self.db.query(NotaDocumento).filter(
                NotaDocumento.company_id == company_id,
                NotaDocumento.documento_ref_tipo == "COMPRA",
                NotaDocumento.documento_ref_id == documento_id,
                NotaDocumento.tipo == "CREDITO",
                NotaDocumento.estado == EstadoNota.REGISTRADA.value
            ).all()
            
            total_notas_credito = sum(Decimal(str(n.total)) for n in notas_credito)
            
            # Sumar notas de débito (aumentan saldo)
            notas_debito = self.db.query(NotaDocumento).filter(
                NotaDocumento.company_id == company_id,
                NotaDocumento.documento_ref_tipo == "COMPRA",
                NotaDocumento.documento_ref_id == documento_id,
                NotaDocumento.tipo == "DEBITO",
                NotaDocumento.estado == EstadoNota.REGISTRADA.value
            ).all()
            
            total_notas_debito = sum(Decimal(str(n.total)) for n in notas_debito)
            
            # Calcular saldo pendiente
            # Consideramos tanto pagos directos como aplicaciones (no duplicamos)
            # Si hay aplicaciones, usamos aplicaciones; si no, usamos pagos directos
            if total_aplicado > 0:
                # Hay aplicaciones, usar aplicaciones
                saldo_pendiente = total_documento - total_aplicado - total_notas_credito + total_notas_debito
            else:
                # No hay aplicaciones, usar sistema legacy
                saldo_pendiente = total_documento - total_pagado_directo - total_notas_credito + total_notas_debito
            
            return max(saldo_pendiente, Decimal("0.00"))
        
        return Decimal("0.00")
    
    def listar_aplicaciones_por_movimiento(
        self,
        movimiento_tesoreria_id: int,
        company_id: int
    ) -> List[AplicacionDocumento]:
        """
        Lista todas las aplicaciones de un movimiento de tesorería.
        """
        return self.db.query(AplicacionDocumento).filter(
            AplicacionDocumento.movimiento_tesoreria_id == movimiento_tesoreria_id,
            AplicacionDocumento.company_id == company_id
        ).all()
    
    def listar_aplicaciones_por_documento(
        self,
        tipo_documento: str,
        documento_id: int,
        company_id: int
    ) -> List[AplicacionDocumento]:
        """
        Lista todas las aplicaciones de un documento.
        """
        return self.db.query(AplicacionDocumento).filter(
            AplicacionDocumento.tipo_documento == tipo_documento,
            AplicacionDocumento.documento_id == documento_id,
            AplicacionDocumento.company_id == company_id
        ).all()

