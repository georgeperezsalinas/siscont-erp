"""
API Endpoints para el Módulo de Reportes
"""
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import logging

from ...dependencies import get_db
from ...infrastructure.unit_of_work import UnitOfWork
from ...application.services_reports import ReportService
from ...domain.models import Period

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/reportes", tags=["Reportes"])


# DTOs para filtros
class FiltrosReporteBase(BaseModel):
    period_id: Optional[int] = None
    account_id: Optional[int] = None
    origin: Optional[str] = None
    currency: Optional[str] = None
    fecha_desde: Optional[date] = None
    fecha_hasta: Optional[date] = None


@router.get("/libro-diario")
async def get_libro_diario(
    company_id: int = Query(..., description="ID de la empresa"),
    period_id: Optional[int] = Query(None, description="ID del período"),
    account_id: Optional[int] = Query(None, description="ID de la cuenta"),
    origin: Optional[str] = Query(None, description="Origen del asiento (VENTAS, COMPRAS, etc.)"),
    currency: Optional[str] = Query(None, description="Moneda (PEN, USD, etc.)"),
    fecha_desde: Optional[date] = Query(None, description="Fecha desde"),
    fecha_hasta: Optional[date] = Query(None, description="Fecha hasta"),
    db: Session = Depends(get_db)
):
    """
    Genera el Libro Diario.
    
    Muestra todas las líneas de asientos contables con:
    - Fecha
    - N° Asiento
    - Cuenta
    - Glosa
    - Debe
    - Haber
    - Periodo
    - Origen
    """
    uow = UnitOfWork(db)
    try:
        service = ReportService(uow)
        resultado = service.generar_libro_diario(
            company_id=company_id,
            period_id=period_id,
            account_id=account_id,
            origin=origin,
            currency=currency,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        
        return {
            "success": True,
            "reporte": "libro_diario",
            **resultado
        }
    except Exception as e:
        import traceback
        logger.error(f"Error en libro_diario: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error al generar reporte: {str(e)}")
    finally:
        uow.close()


@router.get("/libro-mayor")
async def get_libro_mayor(
    company_id: int = Query(..., description="ID de la empresa"),
    account_id: Optional[int] = Query(None, description="ID de la cuenta"),
    period_id: Optional[int] = Query(None, description="ID del período"),
    fecha_desde: Optional[date] = Query(None, description="Fecha desde"),
    fecha_hasta: Optional[date] = Query(None, description="Fecha hasta"),
    db: Session = Depends(get_db)
):
    """
    Genera el Libro Mayor.
    
    Muestra saldos por cuenta:
    - Saldo inicial
    - Movimientos Debe/Haber
    - Saldo final
    """
    uow = UnitOfWork(db)
    try:
        service = ReportService(uow)
        resultado = service.generar_libro_mayor(
            company_id=company_id,
            account_id=account_id,
            period_id=period_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        
        return {
            "success": True,
            "reporte": "libro_mayor",
            **resultado
        }
    finally:
        uow.close()


@router.get("/balance-comprobacion")
async def get_balance_comprobacion(
    company_id: int = Query(..., description="ID de la empresa"),
    period_id: Optional[int] = Query(None, description="ID del período"),
    fecha_desde: Optional[date] = Query(None, description="Fecha desde"),
    fecha_hasta: Optional[date] = Query(None, description="Fecha hasta"),
    db: Session = Depends(get_db)
):
    """
    Genera el Balance de Comprobación.
    
    Reporte clave de cuadratura que muestra:
    - Cuenta
    - Debe total
    - Haber total
    - Saldo
    
    Incluye validación automática de cuadratura.
    """
    uow = UnitOfWork(db)
    try:
        service = ReportService(uow)
        resultado = service.generar_balance_comprobacion(
            company_id=company_id,
            period_id=period_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        
        return {
            "success": True,
            "reporte": "balance_comprobacion",
            **resultado
        }
    finally:
        uow.close()


@router.get("/asientos-descuadrados")
async def get_asientos_descuadrados(
    company_id: int = Query(..., description="ID de la empresa"),
    period_id: Optional[int] = Query(None, description="ID del período"),
    db: Session = Depends(get_db)
):
    """
    Reporte de Asientos Descuadrados.
    
    Detecta asientos donde Debe ≠ Haber.
    """
    uow = UnitOfWork(db)
    try:
        service = ReportService(uow)
        resultado = service.generar_reporte_asientos_descuadrados(
            company_id=company_id,
            period_id=period_id
        )
        
        return {
            "success": True,
            "reporte": "asientos_descuadrados",
            **resultado
        }
    finally:
        uow.close()


@router.get("/movimientos-sin-asiento")
async def get_movimientos_sin_asiento(
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db)
):
    """
    Reporte de Movimientos sin Asiento.
    
    Detecta:
    - Compras sin asiento
    - Ventas sin asiento
    - Movimientos de inventario sin asiento
    - Cobros/pagos sin asiento
    - Notas sin asiento
    """
    uow = UnitOfWork(db)
    try:
        service = ReportService(uow)
        resultado = service.generar_reporte_movimientos_sin_asiento(
            company_id=company_id
        )
        
        return {
            "success": True,
            "reporte": "movimientos_sin_asiento",
            **resultado
        }
    finally:
        uow.close()


@router.get("/estado-resultados")
async def get_estado_resultados(
    company_id: int = Query(..., description="ID de la empresa"),
    period_id: Optional[int] = Query(None, description="ID del período"),
    fecha_desde: Optional[date] = Query(None, description="Fecha desde"),
    fecha_hasta: Optional[date] = Query(None, description="Fecha hasta"),
    db: Session = Depends(get_db)
):
    """
    Genera el Estado de Resultados.
    
    Muestra Ingresos, Costos, Gastos y Resultado del período.
    """
    uow = UnitOfWork(db)
    try:
        service = ReportService(uow)
        resultado = service.generar_estado_resultados(
            company_id=company_id,
            period_id=period_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        
        return {
            "success": True,
            "reporte": "estado_resultados",
            **resultado
        }
    finally:
        uow.close()


@router.get("/balance-general")
async def get_balance_general(
    company_id: int = Query(..., description="ID de la empresa"),
    period_id: Optional[int] = Query(None, description="ID del período"),
    fecha_desde: Optional[date] = Query(None, description="Fecha desde"),
    fecha_hasta: Optional[date] = Query(None, description="Fecha hasta"),
    db: Session = Depends(get_db)
):
    """
    Genera el Balance General.
    
    Muestra Activos, Pasivos y Patrimonio.
    Incluye validación automática de cuadratura.
    """
    uow = UnitOfWork(db)
    try:
        service = ReportService(uow)
        resultado = service.generar_balance_general(
            company_id=company_id,
            period_id=period_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        
        return {
            "success": True,
            "reporte": "balance_general",
            **resultado
        }
    finally:
        uow.close()


@router.get("/cuentas-sin-mapeo")
async def get_cuentas_sin_mapeo(
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db)
):
    """
    Reporte de Cuentas sin Mapeo.
    
    Detecta tipos de cuenta contable que no tienen mapeo.
    """
    uow = UnitOfWork(db)
    try:
        service = ReportService(uow)
        resultado = service.generar_reporte_cuentas_sin_mapeo(
            company_id=company_id
        )
        
        return {
            "success": True,
            "reporte": "cuentas_sin_mapeo",
            **resultado
        }
    finally:
        uow.close()


@router.get("/periodos-inconsistentes")
async def get_periodos_inconsistentes(
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db)
):
    """
    Reporte de Períodos Inconsistentes.
    
    Detecta:
    - Movimientos en períodos cerrados
    - Asientos fuera de rango del período
    """
    uow = UnitOfWork(db)
    try:
        service = ReportService(uow)
        resultado = service.generar_reporte_periodos_inconsistentes(
            company_id=company_id
        )
        
        return {
            "success": True,
            "reporte": "periodos_inconsistentes",
            **resultado
        }
    finally:
        uow.close()


@router.get("/kardex")
async def get_kardex(
    company_id: int = Query(..., description="ID de la empresa"),
    product_id: Optional[int] = Query(None, description="ID del producto"),
    almacen_id: Optional[int] = Query(None, description="ID del almacén"),
    fecha_desde: Optional[date] = Query(None, description="Fecha desde"),
    fecha_hasta: Optional[date] = Query(None, description="Fecha hasta"),
    db: Session = Depends(get_db)
):
    """
    Genera el Kardex Valorizado.
    
    Muestra movimientos de inventario con saldos acumulados.
    Valida que saldo físico = saldo contable.
    """
    uow = UnitOfWork(db)
    try:
        service = ReportService(uow)
        resultado = service.generar_kardex_valorizado(
            company_id=company_id,
            product_id=product_id,
            almacen_id=almacen_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        
        return {
            "success": True,
            "reporte": "kardex_valorizado",
            **resultado
        }
    finally:
        uow.close()


@router.get("/cxc")
async def get_cxc(
    company_id: int = Query(..., description="ID de la empresa"),
    customer_id: Optional[int] = Query(None, description="ID del cliente"),
    fecha_corte: Optional[date] = Query(None, description="Fecha de corte para antigüedad"),
    db: Session = Depends(get_db)
):
    """
    Genera reporte de Saldos por Cliente (Cuentas por Cobrar - CxC).
    
    Muestra documentos pendientes con antigüedad.
    """
    uow = UnitOfWork(db)
    try:
        service = ReportService(uow)
        resultado = service.generar_saldos_por_cliente(
            company_id=company_id,
            customer_id=customer_id,
            fecha_corte=fecha_corte
        )
        
        return {
            "success": True,
            "reporte": "saldos_por_cliente",
            **resultado
        }
    finally:
        uow.close()


@router.get("/cxp")
async def get_cxp(
    company_id: int = Query(..., description="ID de la empresa"),
    supplier_id: Optional[int] = Query(None, description="ID del proveedor"),
    fecha_corte: Optional[date] = Query(None, description="Fecha de corte para antigüedad"),
    db: Session = Depends(get_db)
):
    """
    Genera reporte de Saldos por Proveedor (Cuentas por Pagar - CxP).
    
    Muestra documentos pendientes con antigüedad.
    """
    uow = UnitOfWork(db)
    try:
        service = ReportService(uow)
        resultado = service.generar_saldos_por_proveedor(
            company_id=company_id,
            supplier_id=supplier_id,
            fecha_corte=fecha_corte
        )
        
        return {
            "success": True,
            "reporte": "saldos_por_proveedor",
            **resultado
        }
    finally:
        uow.close()


@router.get("/trazabilidad/{asiento_id}")
async def get_trazabilidad(
    asiento_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db)
):
    """
    Genera reporte de Trazabilidad Total de un asiento.
    
    Muestra:
    - Módulo origen
    - Documento relacionado
    - Evento contable
    - Reglas aplicadas
    - Metadata del motor
    """
    uow = UnitOfWork(db)
    try:
        service = ReportService(uow)
        resultado = service.generar_trazabilidad_total(
            company_id=company_id,
            asiento_id=asiento_id
        )
        
        return {
            "success": True,
            "reporte": "trazabilidad_total",
            **resultado
        }
    finally:
        uow.close()


@router.get("/cambios-reversiones")
async def get_cambios_reversiones(
    company_id: int = Query(..., description="ID de la empresa"),
    fecha_desde: Optional[date] = Query(None, description="Fecha desde"),
    fecha_hasta: Optional[date] = Query(None, description="Fecha hasta"),
    db: Session = Depends(get_db)
):
    """
    Genera reporte de Cambios y Reversiones.
    
    Detecta:
    - Asientos revertidos (VOIDED)
    - Ajustes manuales
    - Notas de crédito/débito
    """
    uow = UnitOfWork(db)
    try:
        service = ReportService(uow)
        resultado = service.generar_cambios_y_reversiones(
            company_id=company_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        
        return {
            "success": True,
            "reporte": "cambios_reversiones",
            **resultado
        }
    finally:
        uow.close()


@router.get("/dashboard")
async def get_dashboard(
    company_id: int = Query(..., description="ID de la empresa"),
    period: Optional[str] = Query(None, description="Período en formato YYYY-MM (ej: 2026-02)"),
    period_id: Optional[int] = Query(None, description="ID del período"),
    db: Session = Depends(get_db)
):
    """
    Genera el resumen del Dashboard.
    
    Retorna métricas contables:
    - cash_and_banks: Saldo de Caja + Bancos
    - igv_por_pagar: IGV por pagar a SUNAT
    - accounts_receivable: Cuentas por Cobrar
    - accounts_payable: Cuentas por Pagar
    - total_purchases: Total de compras del período
    - total_sales: Total de ventas del período
    """
    uow = UnitOfWork(db)
    try:
        # Convertir period string a period_id si es necesario
        if period and not period_id:
            try:
                year, month = map(int, period.split('-'))
                period_obj = (
                    db.query(Period)
                    .filter(
                        Period.company_id == company_id,
                        Period.year == year,
                        Period.month == month
                    )
                    .first()
                )
                if period_obj:
                    period_id = period_obj.id
            except (ValueError, AttributeError):
                pass
        
        service = ReportService(uow)
        resultado = service.generar_dashboard_summary(
            company_id=company_id,
            period_id=period_id
        )
        
        return resultado
    finally:
        uow.close()


@router.get("/igv-por-pagar")
async def get_igv_por_pagar(
    company_id: int = Query(..., description="ID de la empresa"),
    period: Optional[str] = Query(None, description="Período en formato YYYY-MM (ej: 2026-02)"),
    period_id: Optional[int] = Query(None, description="ID del período"),
    db: Session = Depends(get_db)
):
    """
    Calcula el IGV por pagar.
    
    IGV por Pagar = IGV Débito Fiscal - IGV Crédito Fiscal
    """
    uow = UnitOfWork(db)
    try:
        # Convertir period string a period_id si es necesario
        if period and not period_id:
            try:
                year, month = map(int, period.split('-'))
                period_obj = (
                    db.query(Period)
                    .filter(
                        Period.company_id == company_id,
                        Period.year == year,
                        Period.month == month
                    )
                    .first()
                )
                if period_obj:
                    period_id = period_obj.id
            except (ValueError, AttributeError):
                pass
        
        service = ReportService(uow)
        resultado = service.generar_igv_por_pagar(
            company_id=company_id,
            period_id=period_id
        )
        
        return resultado
    finally:
        uow.close()


@router.get("/detractions/summary")
async def get_detractions_summary(
    company_id: int = Query(..., description="ID de la empresa"),
    period: Optional[str] = Query(None, description="Período en formato YYYY-MM (ej: 2026-02)"),
    period_id: Optional[int] = Query(None, description="ID del período"),
    db: Session = Depends(get_db)
):
    """
    Genera el resumen de detracciones.
    
    Retorna:
    - detracciones_acumuladas: Total de detracciones en ventas
    - detracciones_usadas: Total de detracciones usadas para pagar IGV
    - detracciones_disponibles: detracciones_acumuladas - detracciones_usadas
    - detracciones_por_periodo: Lista de detracciones por período
    """
    uow = UnitOfWork(db)
    try:
        # Convertir period string a period_id si es necesario
        if period and not period_id:
            try:
                year, month = map(int, period.split('-'))
                period_obj = (
                    db.query(Period)
                    .filter(
                        Period.company_id == company_id,
                        Period.year == year,
                        Period.month == month
                    )
                    .first()
                )
                if period_obj:
                    period_id = period_obj.id
            except (ValueError, AttributeError):
                pass
        
        service = ReportService(uow)
        resultado = service.generar_detractions_summary(
            company_id=company_id,
            period_id=period_id
        )
        
        return resultado
    finally:
        uow.close()
