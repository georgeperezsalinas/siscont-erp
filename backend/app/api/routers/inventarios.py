"""
API de Inventarios - Metodología Contable Peruana
==================================================

Módulo independiente que gestiona productos e inventarios.
Se acopla con Asientos Contables siguiendo la metodología de "ensamblaje de carro".
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from datetime import date
from decimal import Decimal
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from ...dependencies import get_db
from ...infrastructure.unit_of_work import UnitOfWork
from ...application.services_inventario import (
    registrar_entrada_inventario,
    registrar_salida_inventario,
    calcular_stock_actual
)
from ...application.services_inventario_v2 import InventarioService, InventarioError, ProductoNoEncontradoError, AlmacenNoEncontradoError, StockInsuficienteError, ProductoNoManejaStockError
from ...application.services import ensure_accounts_for_demo
from ...domain.models_ext import Product, MovimientoInventario, InventoryMovement
from ...domain.models_inventario import Almacen, Stock
from ...domain.models import JournalEntry
from ...security.auth import get_current_user
from ...domain.models import User

router = APIRouter(prefix="/inventarios", tags=["inventarios"])

# ===== PRODUCTOS =====

class ProductIn(BaseModel):
    company_id: int
    code: str
    name: str
    description: str | None = None
    unit_of_measure: str = "UN"  # UN, KG, M2, L, etc.
    account_code: str = "20.10"  # Cuenta PCGE de inventario

class ProductUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    unit_of_measure: str | None = None
    account_code: str | None = None
    active: bool | None = None

class ProductOut(BaseModel):
    id: int
    company_id: int
    code: str
    name: str
    description: str | None
    unit_of_measure: str
    account_code: str
    active: bool
    stock_actual: Decimal | None = None
    costo_promedio: Decimal | None = None
    
    class Config:
        from_attributes = True

@router.post("/productos", response_model=ProductOut)
def create_product(payload: ProductIn, db: Session = Depends(get_db)):
    """
    Crea un nuevo producto/artículo de inventario.
    """
    # Asegurar que las cuentas básicas existan
    uow = UnitOfWork()
    try:
        ensure_accounts_for_demo(uow, payload.company_id)
        uow.commit()
    finally:
        uow.close()
    
    # Verificar que la cuenta contable existe
    from ...infrastructure.repositories import AccountRepository
    account_repo = AccountRepository(db)
    account = account_repo.by_code(payload.company_id, payload.account_code)
    if not account:
        raise HTTPException(
            status_code=400,
            detail=f"La cuenta contable {payload.account_code} no existe. Por favor créela primero en el Plan de Cuentas o use una cuenta existente (por defecto: 20.10)"
        )
    
    # Verificar que no exista otro producto con el mismo código en la empresa
    existing = db.query(Product).filter(
        Product.company_id == payload.company_id,
        Product.code == payload.code
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Ya existe un producto con código {payload.code} en esta empresa")
    
    product = Product(
        company_id=payload.company_id,
        code=payload.code,
        name=payload.name,
        description=payload.description,
        unit_of_measure=payload.unit_of_measure,
        account_code=payload.account_code
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    
    # Calcular stock inicial (será 0)
    stock, costo = calcular_stock_actual(db, product.company_id, product.id)
    
    result = ProductOut(
        id=product.id,
        company_id=product.company_id,
        code=product.code,
        name=product.name,
        description=product.description,
        unit_of_measure=product.unit_of_measure,
        account_code=product.account_code,
        active=product.active,
        stock_actual=stock,
        costo_promedio=costo
    )
    return result

@router.get("/productos", response_model=List[ProductOut])
def list_products(
    company_id: int = Query(..., description="ID de la empresa"),
    active: bool | None = Query(None, description="Filtrar por estado activo/inactivo"),
    db: Session = Depends(get_db)
):
    """
    Lista productos de una empresa con su stock actual.
    """
    query = db.query(Product).filter(Product.company_id == company_id)
    
    if active is not None:
        query = query.filter(Product.active == active)
    
    products = query.order_by(Product.code).all()
    
    result = []
    for product in products:
        stock, costo = calcular_stock_actual(db, company_id, product.id)
        result.append(ProductOut(
            id=product.id,
            company_id=product.company_id,
            code=product.code,
            name=product.name,
            description=product.description,
            unit_of_measure=product.unit_of_measure,
            account_code=product.account_code,
            active=product.active,
            stock_actual=stock,
            costo_promedio=costo
        ))
    
    return result

@router.get("/productos/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    """Obtiene un producto específico con su stock"""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    stock, costo = calcular_stock_actual(db, product.company_id, product.id)
    
    return ProductOut(
        id=product.id,
        company_id=product.company_id,
        code=product.code,
        name=product.name,
        description=product.description,
        unit_of_measure=product.unit_of_measure,
        account_code=product.account_code,
        active=product.active,
        stock_actual=stock,
        costo_promedio=costo
    )

@router.patch("/productos/{product_id}", response_model=ProductOut)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)):
    """Actualiza un producto"""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    update_data = payload.model_dump(exclude_unset=True)
    
    # Verificar código único si se actualiza
    if 'code' in update_data:
        existing = db.query(Product).filter(
            Product.company_id == product.company_id,
            Product.code == update_data['code'],
            Product.id != product_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Ya existe otro producto con código {update_data['code']}")
    
    for key, value in update_data.items():
        setattr(product, key, value)
    
    db.commit()
    db.refresh(product)
    
    stock, costo = calcular_stock_actual(db, product.company_id, product.id)
    
    return ProductOut(
        id=product.id,
        company_id=product.company_id,
        code=product.code,
        name=product.name,
        description=product.description,
        unit_of_measure=product.unit_of_measure,
        account_code=product.account_code,
        active=product.active,
        stock_actual=stock,
        costo_promedio=costo
    )

@router.delete("/productos/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db)):
    """Elimina un producto (solo si no tiene movimientos)"""
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    # Verificar si tiene movimientos
    movements = db.query(InventoryMovement).filter(InventoryMovement.producto_id == product_id).count()
    if movements > 0:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede eliminar el producto porque tiene {movements} movimiento(s) de inventario"
        )
    
    db.delete(product)
    db.commit()
    return {"message": "Producto eliminado exitosamente"}

# ===== MOVIMIENTOS DE INVENTARIO =====

class MovimientoIn(BaseModel):
    company_id: int
    product_id: int
    movement_type: str  # "ENTRADA" | "SALIDA"
    quantity: Decimal
    unit_cost: Decimal | None = None  # Para ENTRADA es obligatorio, para SALIDA se calcula automáticamente (costo promedio)
    movement_date: date
    reference: str | None = None
    reference_type: str | None = None  # "COMPRA", "VENTA", "AJUSTE", "MERMA", etc.
    reference_id: int | None = None
    glosa: str | None = None
    credit_account_code: str | None = None  # Solo para ENTRADAS: cuenta de crédito (60.11 para compras, etc.)

class MovimientoOut(BaseModel):
    movimiento_id: int
    product_id: int
    product_code: str | None = None
    product_name: str | None = None
    movement_type: str
    quantity: Decimal
    unit_cost: Decimal
    total_cost: Decimal
    movement_date: date
    reference: str | None
    reference_type: str | None
    reference_id: int | None
    glosa: str | None
    journal_entry_id: int | None
    has_journal_entry: bool = False
    journal_entry_status: str | None = None
    
    class Config:
        from_attributes = True

@router.post("/movimientos", response_model=MovimientoOut)
def create_movimiento(payload: MovimientoIn, db: Session = Depends(get_db)):
    """
    Registra un movimiento de inventario (ENTRADA o SALIDA) con su asiento contable automático.
    
    ✅ INTEGRACIÓN ACOPLADA: Al crear un movimiento, automáticamente se crea
       el asiento contable siguiendo la metodología de ensamblaje.
    """
    if payload.movement_type not in ["ENTRADA", "SALIDA"]:
        raise HTTPException(status_code=400, detail="movement_type debe ser 'ENTRADA' o 'SALIDA'")
    
    # Validar unit_cost para ENTRADAS
    if payload.movement_type == "ENTRADA" and payload.unit_cost is None:
        raise HTTPException(status_code=400, detail="unit_cost es obligatorio para movimientos de ENTRADA")
    
    uow = UnitOfWork()
    try:
        if payload.movement_type == "ENTRADA":
            if payload.unit_cost is None:
                raise HTTPException(status_code=400, detail="unit_cost es obligatorio para ENTRADA")
            movimiento, entry = registrar_entrada_inventario(
                uow,
                company_id=payload.company_id,
                product_id=payload.product_id,
                quantity=payload.quantity,
                unit_cost=payload.unit_cost,
                movement_date=payload.movement_date,
                reference=payload.reference,
                reference_type=payload.reference_type,
                reference_id=payload.reference_id,
                glosa=payload.glosa,
                credit_account_code=payload.credit_account_code
            )
        else:  # SALIDA
            movimiento, entry = registrar_salida_inventario(
                uow,
                company_id=payload.company_id,
                product_id=payload.product_id,
                quantity=payload.quantity,
                movement_date=payload.movement_date,
                reference=payload.reference,
                reference_type=payload.reference_type,
                reference_id=payload.reference_id,
                glosa=payload.glosa
            )
        
        uow.commit()
        
        # Obtener datos del producto para la respuesta
        product = db.query(Product).filter(Product.id == payload.product_id).first()
        
        return MovimientoOut(
            movimiento_id=movimiento.id,
            product_id=movimiento.producto_id,
            product_code=product.code if product else None,
            product_name=product.name if product else None,
            movement_type=movimiento.movement_type,
            quantity=movimiento.quantity,
            unit_cost=movimiento.unit_cost,
            total_cost=movimiento.total_cost,
            movement_date=movimiento.movement_date,
            reference=movimiento.reference,
            reference_type=movimiento.reference_type,
            reference_id=movimiento.reference_id,
            glosa=movimiento.glosa,
            journal_entry_id=entry.id,
            has_journal_entry=True,
            journal_entry_status=entry.status
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        uow.close()

@router.get("/movimientos", response_model=List[MovimientoOut])
def list_movimientos(
    company_id: int = Query(..., description="ID de la empresa"),
    product_id: int | None = Query(None, description="Filtrar por producto"),
    movement_type: str | None = Query(None, description="Filtrar por tipo (ENTRADA/SALIDA)"),
    date_from: date | None = Query(None, description="Fecha desde"),
    date_to: date | None = Query(None, description="Fecha hasta"),
    db: Session = Depends(get_db)
):
    """
    Lista movimientos de inventario con su estado de asiento contable.
    """
    query = db.query(InventoryMovement).filter(InventoryMovement.company_id == company_id)
    
    if product_id:
        query = query.filter(InventoryMovement.producto_id == product_id)  # Usar producto_id (mapeado a product_id en BD)
    
    if movement_type:
        query = query.filter(InventoryMovement.tipo == movement_type)
    
    if date_from:
        query = query.filter(InventoryMovement.fecha >= date_from)
    
    if date_to:
        query = query.filter(InventoryMovement.fecha <= date_to)
    
    movimientos = query.options(joinedload(InventoryMovement.product)).order_by(
        InventoryMovement.fecha.desc(),
        InventoryMovement.id.desc()
    ).all()
    
    result = []
    for mov in movimientos:
        entry = None
        if mov.journal_entry_id:
            entry = db.query(JournalEntry).filter(JournalEntry.id == mov.journal_entry_id).first()
        
        result.append(MovimientoOut(
            movimiento_id=mov.id,
            product_id=mov.producto_id,
            product_code=mov.product.code if mov.product else None,
            product_name=mov.product.name if mov.product else None,
            movement_type=mov.movement_type,
            quantity=mov.quantity,
            unit_cost=mov.unit_cost,
            total_cost=mov.total_cost,
            movement_date=mov.movement_date,
            reference=mov.reference,
            reference_type=mov.reference_type,
            reference_id=mov.reference_id,
            glosa=mov.glosa,
            journal_entry_id=mov.journal_entry_id,
            has_journal_entry=mov.journal_entry_id is not None,
            journal_entry_status=entry.status if entry else None
        ))
    
    return result

# ===== NUEVOS ENDPOINTS SEGÚN REQUISITOS =====

class EntradaInventarioIn(BaseModel):
    company_id: int
    producto_id: int
    almacen_id: int | None = None
    cantidad: Decimal
    costo_unitario: Decimal
    fecha: date
    referencia_tipo: str | None = None  # "COMPRA", "AJUSTE", "MANUAL"
    referencia_id: int | None = None
    glosa: str | None = None
    usar_motor: bool = True

class SalidaInventarioIn(BaseModel):
    company_id: int
    producto_id: int
    almacen_id: int | None = None
    cantidad: Decimal
    fecha: date
    referencia_tipo: str | None = None  # "VENTA", "AJUSTE", "MANUAL"
    referencia_id: int | None = None
    glosa: str | None = None
    usar_motor: bool = True

class AjusteInventarioIn(BaseModel):
    company_id: int
    producto_id: int
    almacen_id: int | None = None
    cantidad: Decimal  # Positivo para sobrante, negativo para faltante
    motivo: str
    fecha: date
    usar_motor: bool = True

class MovimientoInventarioOut(BaseModel):
    movimiento_id: int
    tipo: str
    producto_id: int
    producto_code: str | None = None
    producto_name: str | None = None
    almacen_id: int | None = None
    almacen_codigo: str | None = None
    almacen_nombre: str | None = None
    cantidad: Decimal
    costo_unitario: Decimal
    costo_total: Decimal
    fecha: date
    referencia_tipo: str | None = None
    referencia_id: int | None = None
    glosa: str | None = None
    journal_entry_id: int | None = None
    created_at: str | None = None
    
    class Config:
        from_attributes = True

@router.post("/entrada", response_model=MovimientoInventarioOut)
def registrar_entrada(
    payload: EntradaInventarioIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Registra una ENTRADA de inventario con su asiento contable automático.
    
    ✅ Usa el Motor de Asientos
    ✅ Actualiza stock y costo promedio
    ✅ Valida periodo contable abierto
    """
    uow = UnitOfWork(db)
    try:
        service = InventarioService(uow)
        movimiento, entry = service.registrar_entrada(
            company_id=payload.company_id,
            producto_id=payload.producto_id,
            almacen_id=payload.almacen_id,
            cantidad=payload.cantidad,
            costo_unitario=payload.costo_unitario,
            fecha=payload.fecha,
            referencia_tipo=payload.referencia_tipo,
            referencia_id=payload.referencia_id,
            glosa=payload.glosa,
            usar_motor=payload.usar_motor
        )
        uow.commit()
        
        # Obtener datos relacionados para la respuesta
        product = db.query(Product).filter(Product.id == movimiento.producto_id).first()
        almacen = None
        if movimiento.almacen_id:
            almacen = db.query(Almacen).filter(Almacen.id == movimiento.almacen_id).first()
        
        return MovimientoInventarioOut(
            movimiento_id=movimiento.id,
            tipo=movimiento.tipo,
            producto_id=movimiento.producto_id,
            producto_code=product.code if product else None,
            producto_name=product.name if product else None,
            almacen_id=movimiento.almacen_id,
            almacen_codigo=almacen.codigo if almacen else None,
            almacen_nombre=almacen.nombre if almacen else None,
            cantidad=movimiento.cantidad,
            costo_unitario=movimiento.costo_unitario,
            costo_total=movimiento.costo_total,
            fecha=movimiento.fecha,
            referencia_tipo=movimiento.referencia_tipo,
            referencia_id=movimiento.referencia_id,
            glosa=movimiento.glosa,
            journal_entry_id=movimiento.journal_entry_id,
            created_at=movimiento.created_at.isoformat() if movimiento.created_at else None
        )
    except (ProductoNoEncontradoError, ProductoNoManejaStockError, AlmacenNoEncontradoError, StockInsuficienteError, InventarioError) as e:
        uow.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        import logging
        logging.error(f"Error al registrar entrada de inventario: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")
    finally:
        uow.close()

@router.post("/salida", response_model=MovimientoInventarioOut)
def registrar_salida(
    payload: SalidaInventarioIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Registra una SALIDA de inventario con su asiento contable automático.
    
    ✅ Usa el Motor de Asientos
    ✅ Actualiza stock (usa costo promedio)
    ✅ Valida stock suficiente
    ✅ Valida periodo contable abierto
    """
    uow = UnitOfWork(db)
    try:
        service = InventarioService(uow)
        movimiento, entry = service.registrar_salida(
            company_id=payload.company_id,
            producto_id=payload.producto_id,
            almacen_id=payload.almacen_id,
            cantidad=payload.cantidad,
            fecha=payload.fecha,
            referencia_tipo=payload.referencia_tipo,
            referencia_id=payload.referencia_id,
            glosa=payload.glosa,
            usar_motor=payload.usar_motor
        )
        uow.commit()
        
        # Obtener datos relacionados para la respuesta
        product = db.query(Product).filter(Product.id == movimiento.producto_id).first()
        almacen = None
        if movimiento.almacen_id:
            almacen = db.query(Almacen).filter(Almacen.id == movimiento.almacen_id).first()
        
        return MovimientoInventarioOut(
            movimiento_id=movimiento.id,
            tipo=movimiento.tipo,
            producto_id=movimiento.producto_id,
            producto_code=product.code if product else None,
            producto_name=product.name if product else None,
            almacen_id=movimiento.almacen_id,
            almacen_codigo=almacen.codigo if almacen else None,
            almacen_nombre=almacen.nombre if almacen else None,
            cantidad=movimiento.cantidad,
            costo_unitario=movimiento.costo_unitario,
            costo_total=movimiento.costo_total,
            fecha=movimiento.fecha,
            referencia_tipo=movimiento.referencia_tipo,
            referencia_id=movimiento.referencia_id,
            glosa=movimiento.glosa,
            journal_entry_id=movimiento.journal_entry_id,
            created_at=movimiento.created_at.isoformat() if movimiento.created_at else None
        )
    except (ProductoNoEncontradoError, ProductoNoManejaStockError, AlmacenNoEncontradoError, StockInsuficienteError, InventarioError) as e:
        uow.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        import logging
        logging.error(f"Error al registrar salida de inventario: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")
    finally:
        uow.close()

@router.post("/ajuste", response_model=MovimientoInventarioOut)
def ajustar_stock(
    payload: AjusteInventarioIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Ajusta el stock de un producto (sobrante o faltante).
    
    ✅ Usa el Motor de Asientos
    ✅ Actualiza stock
    ✅ Valida periodo contable abierto
    ✅ Cantidad positiva = sobrante, negativa = faltante
    """
    uow = UnitOfWork(db)
    try:
        service = InventarioService(uow)
        movimiento, entry = service.ajustar_stock(
            company_id=payload.company_id,
            producto_id=payload.producto_id,
            almacen_id=payload.almacen_id,
            cantidad=payload.cantidad,
            motivo=payload.motivo,
            fecha=payload.fecha,
            usar_motor=payload.usar_motor
        )
        uow.commit()
        
        # Obtener datos relacionados para la respuesta
        product = db.query(Product).filter(Product.id == movimiento.producto_id).first()
        almacen = None
        if movimiento.almacen_id:
            almacen = db.query(Almacen).filter(Almacen.id == movimiento.almacen_id).first()
        
        return MovimientoInventarioOut(
            movimiento_id=movimiento.id,
            tipo=movimiento.tipo,
            producto_id=movimiento.producto_id,
            producto_code=product.code if product else None,
            producto_name=product.name if product else None,
            almacen_id=movimiento.almacen_id,
            almacen_codigo=almacen.codigo if almacen else None,
            almacen_nombre=almacen.nombre if almacen else None,
            cantidad=movimiento.cantidad,
            costo_unitario=movimiento.costo_unitario,
            costo_total=movimiento.costo_total,
            fecha=movimiento.fecha,
            referencia_tipo=movimiento.referencia_tipo,
            referencia_id=movimiento.referencia_id,
            glosa=movimiento.glosa,
            journal_entry_id=movimiento.journal_entry_id,
            created_at=movimiento.created_at.isoformat() if movimiento.created_at else None
        )
    except (ProductoNoEncontradoError, ProductoNoManejaStockError, AlmacenNoEncontradoError, InventarioError) as e:
        uow.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        import logging
        logging.error(f"Error al ajustar stock: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")
    finally:
        uow.close()

@router.delete("/movimientos/{movimiento_id}")
def eliminar_movimiento(
    movimiento_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Elimina un movimiento de inventario y anula su asiento contable asociado.
    
    ✅ Anula el asiento contable si existe
    ✅ Recalcula el stock y costo promedio después de la eliminación
    """
    uow = UnitOfWork(db)
    try:
        service = InventarioService(uow)
        service.eliminar_movimiento(
            movimiento_id=movimiento_id,
            company_id=company_id
        )
        uow.commit()
        return {"message": f"Movimiento {movimiento_id} eliminado exitosamente"}
    except InventarioError as e:
        uow.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        uow.rollback()
        import logging
        logging.error(f"Error al eliminar movimiento: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")
    finally:
        uow.close()

@router.get("/kardex")
def obtener_kardex(
    company_id: int = Query(..., description="ID de la empresa"),
    producto_id: int | None = Query(None, description="Filtrar por producto"),
    almacen_id: int | None = Query(None, description="Filtrar por almacén"),
    fecha_desde: date | None = Query(None, description="Fecha desde"),
    fecha_hasta: date | None = Query(None, description="Fecha hasta"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obtiene el Kardex (histórico de movimientos) de inventario.
    
    ✅ Filtros por producto, almacén y fechas
    ✅ Incluye información completa de movimientos
    """
    uow = UnitOfWork(db)
    try:
        service = InventarioService(uow)
        kardex = service.obtener_kardex(
            company_id=company_id,
            producto_id=producto_id,
            almacen_id=almacen_id,
            fecha_desde=fecha_desde,
            fecha_hasta=fecha_hasta
        )
        return kardex
    except Exception as e:
        import logging
        logging.error(f"Error al obtener kardex: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")
    finally:
        uow.close()

@router.get("/stock")
def obtener_stock(
    company_id: int = Query(..., description="ID de la empresa"),
    producto_id: int | None = Query(None, description="Filtrar por producto"),
    almacen_id: int | None = Query(None, description="Filtrar por almacén"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obtiene el stock actual de productos.
    
    ✅ Stock por almacén si se especifica almacen_id
    ✅ Stock total si no se especifica almacén
    ✅ Incluye cantidad, costo promedio y valor total
    """
    uow = UnitOfWork(db)
    try:
        service = InventarioService(uow)
        stock = service.obtener_stock(
            company_id=company_id,
            producto_id=producto_id,
            almacen_id=almacen_id
        )
        return stock
    except Exception as e:
        import logging
        logging.error(f"Error al obtener stock: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error inesperado: {str(e)}")
    finally:
        uow.close()

@router.get("/stock/{product_id}")
def get_stock(product_id: int, db: Session = Depends(get_db)):
    """
    Obtiene el stock actual y costo promedio de un producto específico (endpoint legacy).
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    
    cantidad, costo = calcular_stock_actual(db, product.company_id, product_id)
    
    return {
        "product_id": product_id,
        "product_code": product.code,
        "product_name": product.name,
        "unit_of_measure": product.unit_of_measure,
        "stock_actual": cantidad,
        "costo_promedio": costo,
        "valor_total": (cantidad * costo).quantize(Decimal('0.01'))
    }

# ===== ALMACENES =====

class AlmacenIn(BaseModel):
    company_id: int
    codigo: str
    nombre: str
    activo: bool = True

class AlmacenOut(BaseModel):
    id: int
    company_id: int
    codigo: str
    nombre: str
    activo: bool
    
    class Config:
        from_attributes = True

@router.post("/almacenes", response_model=AlmacenOut)
def create_almacen(
    payload: AlmacenIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Crea un nuevo almacén"""
    # Verificar que no exista otro almacén con el mismo código en la empresa
    existing = db.query(Almacen).filter(
        Almacen.company_id == payload.company_id,
        Almacen.codigo == payload.codigo
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Ya existe un almacén con código {payload.codigo} en esta empresa")
    
    almacen = Almacen(
        company_id=payload.company_id,
        codigo=payload.codigo,
        nombre=payload.nombre,
        activo=payload.activo
    )
    db.add(almacen)
    db.commit()
    db.refresh(almacen)
    
    return AlmacenOut(
        id=almacen.id,
        company_id=almacen.company_id,
        codigo=almacen.codigo,
        nombre=almacen.nombre,
        activo=almacen.activo
    )

@router.get("/almacenes", response_model=List[AlmacenOut])
def list_almacenes(
    company_id: int = Query(..., description="ID de la empresa"),
    activo: bool | None = Query(None, description="Filtrar por estado activo/inactivo"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lista almacenes de una empresa"""
    query = db.query(Almacen).filter(Almacen.company_id == company_id)
    
    if activo is not None:
        query = query.filter(Almacen.activo == activo)
    
    almacenes = query.order_by(Almacen.codigo).all()
    
    return [AlmacenOut(
        id=a.id,
        company_id=a.company_id,
        codigo=a.codigo,
        nombre=a.nombre,
        activo=a.activo
    ) for a in almacenes]

