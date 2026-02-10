"""
Servicio de Reportes
Módulo desacoplado - Solo consultas, NO modifica datos
"""
from decimal import Decimal
from datetime import date
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
import logging

from ..infrastructure.unit_of_work import UnitOfWork
from .queries_reports import ReportQuery

logger = logging.getLogger(__name__)


class ReportService:
    """
    Servicio principal de reportes.
    Todos los métodos son de solo lectura.
    """
    
    def __init__(self, uow: UnitOfWork):
        self.uow = uow
        self.queries = ReportQuery(uow)
    
    def generar_libro_diario(
        self,
        company_id: int,
        period_id: Optional[int] = None,
        account_id: Optional[int] = None,
        origin: Optional[str] = None,
        currency: Optional[str] = None,
        fecha_desde: Optional[date] = None,
        fecha_hasta: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Genera el Libro Diario.
        
        Retorna:
        - datos: Lista de líneas
        - totales: Totales de debe y haber
        - validacion: Si cuadra o no
        """
        datos = self.queries.get_libro_diario(
            company_id=company_id,
            period_id=period_id,
            account_id=account_id,
            origin=origin,
            currency=currency,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        
        total_debe = sum(d['debe'] for d in datos)
        total_haber = sum(d['haber'] for d in datos)
        diferencia = abs(total_debe - total_haber)
        cuadra = diferencia < 0.01
        
        return {
            'datos': datos,
            'totales': {
                'total_debe': total_debe,
                'total_haber': total_haber,
                'diferencia': diferencia
            },
            'validacion': {
                'cuadra': cuadra,
                'mensaje': 'Cuadra correctamente' if cuadra else f'DESCUADRE: Diferencia de {diferencia:.2f}'
            },
            'filtros_aplicados': {
                'period_id': period_id,
                'account_id': account_id,
                'origin': origin,
                'currency': currency,
                'fecha_desde': fecha_desde.isoformat() if fecha_desde else None,
                'fecha_hasta': fecha_hasta.isoformat() if fecha_hasta else None
            }
        }
    
    def generar_libro_mayor(
        self,
        company_id: int,
        account_id: Optional[int] = None,
        period_id: Optional[int] = None,
        fecha_desde: Optional[date] = None,
        fecha_hasta: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Genera el Libro Mayor.
        
        Retorna:
        - datos: Lista de cuentas con saldos
        - validacion: Validación de saldos
        """
        datos = self.queries.get_libro_mayor(
            company_id=company_id,
            account_id=account_id,
            period_id=period_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        
        # Validar que todos los saldos finales sean consistentes
        errores = []
        for cuenta in datos:
            saldo_calculado = cuenta['saldo_inicial'] + cuenta['debe_total'] - cuenta['haber_total']
            diferencia = abs(saldo_calculado - cuenta['saldo_final'])
            if diferencia >= 0.01:
                errores.append({
                    'cuenta': cuenta['cuenta_codigo'],
                    'saldo_esperado': saldo_calculado,
                    'saldo_obtenido': cuenta['saldo_final'],
                    'diferencia': diferencia
                })
        
        return {
            'datos': datos,
            'validacion': {
                'valido': len(errores) == 0,
                'errores': errores,
                'mensaje': 'Todos los saldos son consistentes' if len(errores) == 0 else f'Se encontraron {len(errores)} inconsistencias'
            },
            'filtros_aplicados': {
                'account_id': account_id,
                'period_id': period_id,
                'fecha_desde': fecha_desde.isoformat() if fecha_desde else None,
                'fecha_hasta': fecha_hasta.isoformat() if fecha_hasta else None
            }
        }
    
    def generar_balance_comprobacion(
        self,
        company_id: int,
        period_id: Optional[int] = None,
        fecha_desde: Optional[date] = None,
        fecha_hasta: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Genera el Balance de Comprobación.
        
        Retorna:
        - datos: Lista de cuentas
        - validacion: Validación de cuadratura
        """
        datos, validacion = self.queries.get_balance_comprobacion(
            company_id=company_id,
            period_id=period_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        
        return {
            'datos': datos,
            'validacion': validacion,
            'filtros_aplicados': {
                'period_id': period_id,
                'fecha_desde': fecha_desde.isoformat() if fecha_desde else None,
                'fecha_hasta': fecha_hasta.isoformat() if fecha_hasta else None
            }
        }
    
    def generar_reporte_asientos_descuadrados(
        self,
        company_id: int,
        period_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Genera reporte de asientos que no cuadran.
        """
        datos = self.queries.get_asientos_descuadrados(
            company_id=company_id,
            period_id=period_id
        )
        
        return {
            'datos': datos,
            'total': len(datos),
            'mensaje': f'Se encontraron {len(datos)} asientos descuadrados' if len(datos) > 0 else 'Todos los asientos cuadran correctamente',
            'filtros_aplicados': {
                'period_id': period_id
            }
        }
    
    def generar_reporte_movimientos_sin_asiento(
        self,
        company_id: int
    ) -> Dict[str, Any]:
        """
        Genera reporte de movimientos sin asiento contable.
        """
        datos = self.queries.get_movimientos_sin_asiento(company_id=company_id)
        
        total = (
            len(datos['compras']) +
            len(datos['ventas']) +
            len(datos['inventario']) +
            len(datos['tesoreria']) +
            len(datos['notas'])
        )
        
        return {
            'datos': datos,
            'totales': {
                'compras': len(datos['compras']),
                'ventas': len(datos['ventas']),
                'inventario': len(datos['inventario']),
                'tesoreria': len(datos['tesoreria']),
                'notas': len(datos['notas']),
                'total': total
            },
            'mensaje': f'Se encontraron {total} movimientos sin asiento' if total > 0 else 'Todos los movimientos tienen asiento contable'
        }
    
    def generar_estado_resultados(
        self,
        company_id: int,
        period_id: Optional[int] = None,
        fecha_desde: Optional[date] = None,
        fecha_hasta: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Genera el Estado de Resultados.
        """
        datos = self.queries.get_estado_resultados(
            company_id=company_id,
            period_id=period_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        
        return {
            'datos': datos,
            'filtros_aplicados': {
                'period_id': period_id,
                'fecha_desde': fecha_desde.isoformat() if fecha_desde else None,
                'fecha_hasta': fecha_hasta.isoformat() if fecha_hasta else None
            }
        }
    
    def generar_balance_general(
        self,
        company_id: int,
        period_id: Optional[int] = None,
        fecha_desde: Optional[date] = None,
        fecha_hasta: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Genera el Balance General.
        """
        datos = self.queries.get_balance_general(
            company_id=company_id,
            period_id=period_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        
        return {
            'datos': datos,
            'filtros_aplicados': {
                'period_id': period_id,
                'fecha_desde': fecha_desde.isoformat() if fecha_desde else None,
                'fecha_hasta': fecha_hasta.isoformat() if fecha_hasta else None
            }
        }
    
    def generar_reporte_cuentas_sin_mapeo(
        self,
        company_id: int
    ) -> Dict[str, Any]:
        """
        Genera reporte de cuentas sin mapeo.
        """
        datos = self.queries.get_cuentas_sin_mapeo(company_id=company_id)
        
        return {
            'datos': datos,
            'mensaje': datos['mensaje']
        }
    
    def generar_reporte_periodos_inconsistentes(
        self,
        company_id: int
    ) -> Dict[str, Any]:
        """
        Genera reporte de períodos inconsistentes.
        """
        datos = self.queries.get_periodos_inconsistentes(company_id=company_id)
        
        total_problemas = (
            datos['totales']['asientos_periodo_cerrado'] +
            datos['totales']['asientos_fuera_rango']
        )
        
        return {
            'datos': datos,
            'total_problemas': total_problemas,
            'mensaje': f'Se encontraron {total_problemas} inconsistencias' if total_problemas > 0 else 'No se encontraron inconsistencias en períodos'
        }
    
    def generar_kardex_valorizado(
        self,
        company_id: int,
        product_id: Optional[int] = None,
        almacen_id: Optional[int] = None,
        fecha_desde: Optional[date] = None,
        fecha_hasta: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Genera el Kardex Valorizado.
        """
        datos = self.queries.get_kardex_valorizado(
            company_id=company_id,
            product_id=product_id,
            almacen_id=almacen_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        
        # Validar cuadratura
        errores_validacion = [v for v in datos['validaciones'] if not v['cuadra']]
        
        return {
            'datos': datos,
            'validacion': {
                'valido': len(errores_validacion) == 0,
                'errores': errores_validacion,
                'mensaje': 'Todos los stocks cuadran correctamente' if len(errores_validacion) == 0 else f'Se encontraron {len(errores_validacion)} discrepancias entre stock físico y contable'
            },
            'filtros_aplicados': {
                'product_id': product_id,
                'almacen_id': almacen_id,
                'fecha_desde': fecha_desde.isoformat() if fecha_desde else None,
                'fecha_hasta': fecha_hasta.isoformat() if fecha_hasta else None
            }
        }
    
    def generar_saldos_por_cliente(
        self,
        company_id: int,
        customer_id: Optional[int] = None,
        fecha_corte: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Genera reporte de Saldos por Cliente (CxC).
        """
        datos = self.queries.get_saldos_por_cliente(
            company_id=company_id,
            customer_id=customer_id,
            fecha_corte=fecha_corte
        )
        
        total_saldo = sum(d['saldo_pendiente'] for d in datos)
        
        return {
            'datos': datos,
            'totales': {
                'total_clientes': len(set(d['customer_id'] for d in datos)),
                'total_documentos': len(datos),
                'total_saldo': total_saldo
            },
            'filtros_aplicados': {
                'customer_id': customer_id,
                'fecha_corte': fecha_corte.isoformat() if fecha_corte else None
            }
        }
    
    def generar_saldos_por_proveedor(
        self,
        company_id: int,
        supplier_id: Optional[int] = None,
        fecha_corte: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Genera reporte de Saldos por Proveedor (CxP).
        """
        datos = self.queries.get_saldos_por_proveedor(
            company_id=company_id,
            supplier_id=supplier_id,
            fecha_corte=fecha_corte
        )
        
        total_saldo = sum(d['saldo_pendiente'] for d in datos)
        
        return {
            'datos': datos,
            'totales': {
                'total_proveedores': len(set(d['supplier_id'] for d in datos)),
                'total_documentos': len(datos),
                'total_saldo': total_saldo
            },
            'filtros_aplicados': {
                'supplier_id': supplier_id,
                'fecha_corte': fecha_corte.isoformat() if fecha_corte else None
            }
        }
    
    def generar_trazabilidad_total(
        self,
        company_id: int,
        asiento_id: int
    ) -> Dict[str, Any]:
        """
        Genera reporte de Trazabilidad Total de un asiento.
        """
        datos = self.queries.get_trazabilidad_total(
            company_id=company_id,
            asiento_id=asiento_id
        )
        
        return {
            'datos': datos,
            'asiento_id': asiento_id
        }
    
    def generar_cambios_y_reversiones(
        self,
        company_id: int,
        fecha_desde: Optional[date] = None,
        fecha_hasta: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Genera reporte de Cambios y Reversiones.
        """
        datos = self.queries.get_cambios_y_reversiones(
            company_id=company_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        
        total_cambios = (
            datos['totales']['asientos_revertidos'] +
            datos['totales']['notas'] +
            datos['totales']['ajustes_manuales']
        )
        
        return {
            'datos': datos,
            'total_cambios': total_cambios,
            'mensaje': f'Se encontraron {total_cambios} cambios/reversiones' if total_cambios > 0 else 'No se encontraron cambios ni reversiones',
            'filtros_aplicados': {
                'fecha_desde': fecha_desde.isoformat() if fecha_desde else None,
                'fecha_hasta': fecha_hasta.isoformat() if fecha_hasta else None
            }
        }
    
    def generar_dashboard_summary(
        self,
        company_id: int,
        period_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Genera el resumen del Dashboard.
        """
        return self.queries.get_dashboard_summary(
            company_id=company_id,
            period_id=period_id
        )
    
    def generar_igv_por_pagar(
        self,
        company_id: int,
        period_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Calcula el IGV por pagar.
        """
        return self.queries.get_igv_por_pagar(
            company_id=company_id,
            period_id=period_id
        )
    
    def generar_detractions_summary(
        self,
        company_id: int,
        period_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Genera el resumen de detracciones.
        """
        return self.queries.get_detractions_summary(
            company_id=company_id,
            period_id=period_id
        )

