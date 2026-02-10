"""
Servicio para inicializar métodos de pago predeterminados
"""
from sqlalchemy.orm import Session
from ..domain.models_tesoreria import MetodoPago
from ..application.services_journal_engine_init import inicializar_eventos_y_reglas_predeterminadas


def inicializar_metodos_pago_predeterminados(db: Session, company_id: int):
    """
    Inicializa métodos de pago predeterminados para una empresa.
    
    Crea métodos de pago comunes:
    - EFECTIVO (CAJA)
    - TRANSFERENCIA (BANCO)
    - YAPE (BANCO)
    - PLIN (BANCO)
    - TARJETA (BANCO)
    
    También asegura que los eventos contables de Tesorería estén inicializados.
    """
    # Asegurar que los eventos contables de Tesorería estén inicializados
    try:
        inicializar_eventos_y_reglas_predeterminadas(db, company_id)
    except Exception as e:
        # Si falla, continuar de todas formas (puede que ya estén inicializados)
        print(f"Advertencia: No se pudieron inicializar eventos contables: {e}")
    
    metodos_predeterminados = [
        {
            "codigo": "EFECTIVO",
            "descripcion": "Efectivo",
            "impacta_en": "CAJA"
        },
        {
            "codigo": "TRANSFERENCIA",
            "descripcion": "Transferencia Bancaria",
            "impacta_en": "BANCO"
        },
        {
            "codigo": "YAPE",
            "descripcion": "Yape",
            "impacta_en": "BANCO"
        },
        {
            "codigo": "PLIN",
            "descripcion": "Plin",
            "impacta_en": "BANCO"
        },
        {
            "codigo": "TARJETA",
            "descripcion": "Tarjeta de Crédito/Débito",
            "impacta_en": "BANCO"
        }
    ]
    
    creados = 0
    ya_existian = 0
    errores = []
    
    for metodo_data in metodos_predeterminados:
        try:
            # Verificar si ya existe
            metodo_existente = db.query(MetodoPago).filter(
                MetodoPago.company_id == company_id,
                MetodoPago.codigo == metodo_data["codigo"]
            ).first()
            
            if not metodo_existente:
                metodo = MetodoPago(
                    company_id=company_id,
                    codigo=metodo_data["codigo"],
                    descripcion=metodo_data["descripcion"],
                    impacta_en=metodo_data["impacta_en"],
                    activo=True
                )
                db.add(metodo)
                creados += 1
            else:
                ya_existian += 1
        except Exception as e:
            # Si hay un error (por ejemplo, restricción única), registrar pero continuar
            errores.append(f"{metodo_data['codigo']}: {str(e)}")
            ya_existian += 1
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        # Si falla el commit, intentar hacerlo uno por uno
        for metodo_data in metodos_predeterminados:
            try:
                metodo_existente = db.query(MetodoPago).filter(
                    MetodoPago.company_id == company_id,
                    MetodoPago.codigo == metodo_data["codigo"]
                ).first()
                
                if not metodo_existente:
                    metodo = MetodoPago(
                        company_id=company_id,
                        codigo=metodo_data["codigo"],
                        descripcion=metodo_data["descripcion"],
                        impacta_en=metodo_data["impacta_en"],
                        activo=True
                    )
                    db.add(metodo)
                    db.commit()
                    creados += 1
                else:
                    ya_existian += 1
            except Exception as e:
                db.rollback()
                # Si ya existe, contar como existente
                metodo_existente = db.query(MetodoPago).filter(
                    MetodoPago.company_id == company_id,
                    MetodoPago.codigo == metodo_data["codigo"]
                ).first()
                if metodo_existente:
                    ya_existian += 1
                else:
                    errores.append(f"{metodo_data['codigo']}: {str(e)}")
                    ya_existian += 1
    
    mensaje = f"Metodos de pago inicializados. {creados} creados, {ya_existian} ya existian."
    if errores:
        mensaje += f" Errores: {', '.join(errores)}"
    
    return {
        "creados": creados,
        "ya_existian": ya_existian,
        "total": len(metodos_predeterminados),
        "errores": errores if errores else [],
        "mensaje": mensaje
    }

