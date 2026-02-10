"""
API de Programa de Libros Electrónicos (PLE) - SUNAT Perú
==========================================================

Genera archivos PLE según especificaciones SUNAT.
Módulo independiente que se acopla con datos contables.

Sigue la metodología de "ensamblaje de carro".
"""
from fastapi import APIRouter, Depends, Response, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
import csv
import io
from ...dependencies import get_db
from ...application.ple import ple_compras, ple_ventas
from ...application.ple_completo import (
    ple_libro_diario,
    ple_libro_mayor,
    ple_plan_cuentas,
    ple_registro_compras,
    ple_registro_ventas,
    ple_caja_bancos,
    ple_inventarios_balances
)

router = APIRouter(prefix="/ple", tags=["ple"])

# ===== LIBRO DIARIO (5.1) =====

@router.get("/libro-diario")
def get_ple_libro_diario(
    company_id: int = Query(..., description="ID de la empresa"),
    period: str = Query(..., description="Periodo YYYY-MM"),
    db: Session = Depends(get_db)
):
    """
    Obtiene Libro Diario Electrónico (PLE 5.1) en formato JSON.
    """
    data = ple_libro_diario(db, company_id, period)
    return {
        "libro": "5.1",
        "nombre": "Libro Diario",
        "periodo": period,
        "company_id": company_id,
        "registros": len(data),
        "rows": data
    }

@router.get("/libro-diario.txt")
def get_ple_libro_diario_txt(
    company_id: int = Query(..., description="ID de la empresa"),
    period: str = Query(..., description="Periodo YYYY-MM"),
    db: Session = Depends(get_db)
):
    """
    Descarga Libro Diario Electrónico (PLE 5.1) en formato TXT según SUNAT.
    """
    data = ple_libro_diario(db, company_id, period)
    if not data:
        raise HTTPException(status_code=404, detail="No hay datos para el período especificado")
    
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter='|', lineterminator='\n')
    for row in data:
        writer.writerow(row)
    
    filename = f"LE{company_id}{period.replace('-', '')}0501000000000{len(data):08d}.txt"
    
    return Response(
        content=buf.getvalue().encode('utf-8'),
        media_type='text/plain; charset=utf-8',
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

# ===== LIBRO MAYOR (5.2) =====

@router.get("/libro-mayor")
def get_ple_libro_mayor(
    company_id: int = Query(..., description="ID de la empresa"),
    period: str = Query(..., description="Periodo YYYY-MM"),
    db: Session = Depends(get_db)
):
    """
    Obtiene Libro Mayor Electrónico (PLE 5.2) en formato JSON.
    """
    data = ple_libro_mayor(db, company_id, period)
    return {
        "libro": "5.2",
        "nombre": "Libro Mayor",
        "periodo": period,
        "company_id": company_id,
        "registros": len(data),
        "rows": data
    }

@router.get("/libro-mayor.txt")
def get_ple_libro_mayor_txt(
    company_id: int = Query(..., description="ID de la empresa"),
    period: str = Query(..., description="Periodo YYYY-MM"),
    db: Session = Depends(get_db)
):
    """
    Descarga Libro Mayor Electrónico (PLE 5.2) en formato TXT según SUNAT.
    """
    data = ple_libro_mayor(db, company_id, period)
    if not data:
        raise HTTPException(status_code=404, detail="No hay datos para el período especificado")
    
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter='|', lineterminator='\n')
    for row in data:
        writer.writerow(row)
    
    filename = f"LE{company_id}{period.replace('-', '')}0502000000000{len(data):08d}.txt"
    
    return Response(
        content=buf.getvalue().encode('utf-8'),
        media_type='text/plain; charset=utf-8',
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

# ===== PLAN DE CUENTAS (5.3) =====

@router.get("/plan-cuentas")
def get_ple_plan_cuentas(
    company_id: int = Query(..., description="ID de la empresa"),
    period: str = Query(..., description="Periodo YYYY-MM"),
    db: Session = Depends(get_db)
):
    """
    Obtiene Plan de Cuentas Electrónico (PLE 5.3) en formato JSON.
    """
    data = ple_plan_cuentas(db, company_id, period)
    return {
        "libro": "5.3",
        "nombre": "Plan de Cuentas",
        "periodo": period,
        "company_id": company_id,
        "registros": len(data),
        "rows": data
    }

@router.get("/plan-cuentas.txt")
def get_ple_plan_cuentas_txt(
    company_id: int = Query(..., description="ID de la empresa"),
    period: str = Query(..., description="Periodo YYYY-MM"),
    db: Session = Depends(get_db)
):
    """
    Descarga Plan de Cuentas Electrónico (PLE 5.3) en formato TXT según SUNAT.
    """
    data = ple_plan_cuentas(db, company_id, period)
    if not data:
        raise HTTPException(status_code=404, detail="No hay datos para el período especificado")
    
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter='|', lineterminator='\n')
    for row in data:
        writer.writerow(row)
    
    filename = f"LE{company_id}{period.replace('-', '')}0503000000000{len(data):08d}.txt"
    
    return Response(
        content=buf.getvalue().encode('utf-8'),
        media_type='text/plain; charset=utf-8',
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

# ===== REGISTRO DE COMPRAS (8.1) =====

@router.get("/compras")
def get_ple_compras(
    company_id: int = Query(..., description="ID de la empresa"),
    period: str = Query(..., description="Periodo YYYY-MM"),
    db: Session = Depends(get_db)
):
    """
    Obtiene Registro de Compras Electrónico (PLE 8.1) en formato JSON.
    """
    data = ple_registro_compras(db, company_id, period)
    return {
        "libro": "8.1",
        "nombre": "Registro de Compras",
        "periodo": period,
        "company_id": company_id,
        "registros": len(data),
        "rows": data
    }

@router.get("/compras.txt")
def get_ple_compras_txt(
    company_id: int = Query(..., description="ID de la empresa"),
    period: str = Query(..., description="Periodo YYYY-MM"),
    db: Session = Depends(get_db)
):
    """
    Descarga Registro de Compras Electrónico (PLE 8.1) en formato TXT según SUNAT.
    """
    data = ple_registro_compras(db, company_id, period)
    if not data:
        raise HTTPException(status_code=404, detail="No hay datos para el período especificado")
    
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter='|', lineterminator='\n')
    for row in data:
        writer.writerow(row)
    
    filename = f"LE{company_id}{period.replace('-', '')}0801000000000{len(data):08d}.txt"
    
    return Response(
        content=buf.getvalue().encode('utf-8'),
        media_type='text/plain; charset=utf-8',
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

# ===== REGISTRO DE VENTAS (14.1) =====

@router.get("/ventas")
def get_ple_ventas(
    company_id: int = Query(..., description="ID de la empresa"),
    period: str = Query(..., description="Periodo YYYY-MM"),
    db: Session = Depends(get_db)
):
    """
    Obtiene Registro de Ventas e Ingresos Electrónico (PLE 14.1) en formato JSON.
    """
    data = ple_registro_ventas(db, company_id, period)
    return {
        "libro": "14.1",
        "nombre": "Registro de Ventas e Ingresos",
        "periodo": period,
        "company_id": company_id,
        "registros": len(data),
        "rows": data
    }

@router.get("/ventas.txt")
def get_ple_ventas_txt(
    company_id: int = Query(..., description="ID de la empresa"),
    period: str = Query(..., description="Periodo YYYY-MM"),
    db: Session = Depends(get_db)
):
    """
    Descarga Registro de Ventas e Ingresos Electrónico (PLE 14.1) en formato TXT según SUNAT.
    """
    data = ple_registro_ventas(db, company_id, period)
    if not data:
        raise HTTPException(status_code=404, detail="No hay datos para el período especificado")
    
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter='|', lineterminator='\n')
    for row in data:
        writer.writerow(row)
    
    filename = f"LE{company_id}{period.replace('-', '')}1401000000000{len(data):08d}.txt"
    
    return Response(
        content=buf.getvalue().encode('utf-8'),
        media_type='text/plain; charset=utf-8',
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

# ===== LIBRO CAJA Y BANCOS (1.1) =====

@router.get("/caja-bancos")
def get_ple_caja_bancos(
    company_id: int = Query(..., description="ID de la empresa"),
    period: str = Query(..., description="Periodo YYYY-MM"),
    db: Session = Depends(get_db)
):
    """
    Obtiene Libro Caja y Bancos Electrónico (PLE 1.1) en formato JSON.
    """
    data = ple_caja_bancos(db, company_id, period)
    return {
        "libro": "1.1",
        "nombre": "Libro Caja y Bancos",
        "periodo": period,
        "company_id": company_id,
        "registros": len(data),
        "rows": data
    }

@router.get("/caja-bancos.txt")
def get_ple_caja_bancos_txt(
    company_id: int = Query(..., description="ID de la empresa"),
    period: str = Query(..., description="Periodo YYYY-MM"),
    db: Session = Depends(get_db)
):
    """
    Descarga Libro Caja y Bancos Electrónico (PLE 1.1) en formato TXT según SUNAT.
    """
    data = ple_caja_bancos(db, company_id, period)
    if not data:
        raise HTTPException(status_code=404, detail="No hay datos para el período especificado")
    
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter='|', lineterminator='\n')
    for row in data:
        writer.writerow(row)
    
    filename = f"LE{company_id}{period.replace('-', '')}0101000000000{len(data):08d}.txt"
    
    return Response(
        content=buf.getvalue().encode('utf-8'),
        media_type='text/plain; charset=utf-8',
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

# ===== LIBRO DE INVENTARIOS Y BALANCES (3.1) =====

@router.get("/inventarios-balances")
def get_ple_inventarios_balances(
    company_id: int = Query(..., description="ID de la empresa"),
    period: str = Query(..., description="Periodo YYYY-MM"),
    db: Session = Depends(get_db)
):
    """
    Obtiene Libro de Inventarios y Balances Electrónico (PLE 3.1) en formato JSON.
    """
    data = ple_inventarios_balances(db, company_id, period)
    return {
        "libro": "3.1",
        "nombre": "Libro de Inventarios y Balances",
        "periodo": period,
        "company_id": company_id,
        "registros": len(data),
        "rows": data
    }

@router.get("/inventarios-balances.txt")
def get_ple_inventarios_balances_txt(
    company_id: int = Query(..., description="ID de la empresa"),
    period: str = Query(..., description="Periodo YYYY-MM"),
    db: Session = Depends(get_db)
):
    """
    Descarga Libro de Inventarios y Balances Electrónico (PLE 3.1) en formato TXT según SUNAT.
    """
    data = ple_inventarios_balances(db, company_id, period)
    if not data:
        raise HTTPException(status_code=404, detail="No hay datos para el período especificado")
    
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter='|', lineterminator='\n')
    for row in data:
        writer.writerow(row)
    
    filename = f"LE{company_id}{period.replace('-', '')}0301000000000{len(data):08d}.txt"
    
    return Response(
        content=buf.getvalue().encode('utf-8'),
        media_type='text/plain; charset=utf-8',
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
