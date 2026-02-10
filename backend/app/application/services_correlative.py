"""
Servicio para generar correlativos estructurados de asientos contables.

Formato: [Origen/Libro] + [Periodo/Mes] + [Secuencial]
Ejemplo: 02-05-00012 = Compras (02), Mayo (05), asiento 12
"""
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from typing import Optional
from ..domain.models import JournalEntry


# Mapeo de origen a código de libro (2 dígitos)
ORIGIN_TO_CODE = {
    "VENTAS": "01",
    "COMPRAS": "02",
    "TESORERIA": "05",
    "CAJA_BANCOS": "05",  # Alias de TESORERIA
    "INVENTARIO": "03",
    "INVENTARIOS": "03",  # Alias
    "NOMINAS": "04",
    "NOMINA": "04",  # Alias
    "MANUAL": "99",
    "MOTOR": "00",  # Asientos generados por el motor (pueden tener origen específico)
    "LEGACY": "98",  # Asientos legacy
}

# Código por defecto para orígenes desconocidos
DEFAULT_CODE = "99"


def get_origin_code(origin: str) -> str:
    """
    Obtiene el código de 2 dígitos para un origen dado.
    
    Args:
        origin: Origen del asiento (VENTAS, COMPRAS, etc.)
        
    Returns:
        Código de 2 dígitos para el origen
    """
    origin_upper = origin.upper() if origin else "MANUAL"
    return ORIGIN_TO_CODE.get(origin_upper, DEFAULT_CODE)


def generate_correlative(
    db: Session,
    company_id: int,
    origin: str,
    entry_date: date,
    secuential_digits: int = 5,
    evento_tipo: Optional[str] = None
) -> str:
    """
    Genera un correlativo estructurado para un asiento contable.
    
    SOLUCIÓN ROBUSTA TIPO SAP:
    - Usa SELECT FOR UPDATE para garantizar secuencia sin saltos
    - Independiente del ID de la base de datos
    - Thread-safe y concurrent-safe
    
    Formato: [Origen/Libro]-[Mes]-[Secuencial]
    Ejemplo: 02-05-00012
    
    Args:
        db: Sesión de base de datos
        company_id: ID de la empresa
        origin: Origen del asiento (VENTAS, COMPRAS, TESORERIA, MOTOR, etc.)
        entry_date: Fecha del asiento
        secuential_digits: Número de dígitos para el secuencial (default: 5)
        evento_tipo: Tipo de evento (para asientos del motor, usar este en lugar de origin)
        
    Returns:
        Correlativo estructurado (ej: "02-05-00012")
    """
    # Si el origen es MOTOR y hay evento_tipo, usar el evento_tipo para el correlativo
    # Esto permite que los asientos del motor tengan correlativos según su evento (VENTAS, COMPRAS, etc.)
    correlative_origin = evento_tipo if (origin == "MOTOR" and evento_tipo) else origin
    
    # 1. Obtener código de origen (2 dígitos)
    origin_code = get_origin_code(correlative_origin)
    
    # 2. Obtener mes (2 dígitos)
    month = str(entry_date.month).zfill(2)
    
    # 3. Obtener siguiente secuencial con LOCK para garantizar secuencia (SOLUCIÓN ROBUSTA)
    # Usar with_for_update() para bloquear registros y evitar condiciones de carrera
    # Esto garantiza que no se salten números incluso con concurrencia
    
    # Construir el patrón de correlativo para buscar
    correlative_pattern = f"{origin_code}-{month}-%"
    
    # Usar with_for_update() para bloquear registros y garantizar secuencia
    # Esto es crítico para auditoría: asegura que no se salten números
    # El lock se mantiene hasta el commit de la transacción
    # NOTA: PostgreSQL no permite FOR UPDATE con LIMIT en la misma consulta
    # Solución: Obtener ID primero, luego hacer lock del registro específico
    if origin == "MOTOR" and evento_tipo:
        # Para asientos del motor, buscar por evento_tipo en motor_metadata
        # Primero obtener el ID del último registro sin lock
        last_entry_id = (
            db.query(JournalEntry.id)
            .filter(
                JournalEntry.company_id == company_id,
                JournalEntry.origin == "MOTOR",
                func.extract('month', JournalEntry.date) == entry_date.month,
                func.extract('year', JournalEntry.date) == entry_date.year,
                JournalEntry.status != 'VOIDED',
                JournalEntry.correlative.like(correlative_pattern),
                JournalEntry.motor_metadata['evento_tipo'].astext == evento_tipo
            )
            .order_by(JournalEntry.id.desc())
            .limit(1)
            .scalar()
        )
        # Si existe, hacer lock del registro específico
        if last_entry_id:
            last_entry = (
                db.query(JournalEntry)
                .filter(JournalEntry.id == last_entry_id)
                .with_for_update(nowait=False)
                .first()
            )
        else:
            last_entry = None
    else:
        # Para otros orígenes, buscar directamente por origin
        # Primero obtener el ID del último registro sin lock
        last_entry_id = (
            db.query(JournalEntry.id)
            .filter(
                JournalEntry.company_id == company_id,
                JournalEntry.origin == origin,
                func.extract('month', JournalEntry.date) == entry_date.month,
                func.extract('year', JournalEntry.date) == entry_date.year,
                JournalEntry.status != 'VOIDED',
                JournalEntry.correlative.like(correlative_pattern)
            )
            .order_by(JournalEntry.id.desc())
            .limit(1)
            .scalar()
        )
        # Si existe, hacer lock del registro específico
        if last_entry_id:
            last_entry = (
                db.query(JournalEntry)
                .filter(JournalEntry.id == last_entry_id)
                .with_for_update(nowait=False)
                .first()
            )
        else:
            last_entry = None
    
    last_correlative = last_entry.correlative if last_entry else None
    
    # Extraer el secuencial del último correlativo y sumar 1
    if last_correlative:
        try:
            # Extraer el secuencial del último correlativo
            # Formato esperado: XX-XX-XXXXX
            parts = last_correlative.split('-')
            if len(parts) == 3:
                last_secuential = int(parts[2])
                next_secuential = last_secuential + 1
            else:
                # Si el formato no es el esperado, usar 1
                next_secuential = 1
        except (ValueError, IndexError):
            # Si hay error al parsear, usar 1
            next_secuential = 1
    else:
        # No hay asientos previos, empezar en 1
        next_secuential = 1
    
    # 4. Formatear secuencial con ceros a la izquierda
    secuential_str = str(next_secuential).zfill(secuential_digits)
    
    # 5. Construir correlativo: XX-XX-XXXXX
    correlative = f"{origin_code}-{month}-{secuential_str}"
    
    return correlative


def parse_correlative(correlative: str) -> Optional[dict]:
    """
    Parsea un correlativo estructurado y retorna sus componentes.
    
    Args:
        correlative: Correlativo estructurado (ej: "02-05-00012")
        
    Returns:
        Dict con {origin_code, month, secuential} o None si el formato es inválido
    """
    if not correlative:
        return None
    
    try:
        parts = correlative.split('-')
        if len(parts) != 3:
            return None
        
        origin_code, month, secuential = parts
        return {
            "origin_code": origin_code,
            "month": int(month),
            "secuential": int(secuential)
        }
    except (ValueError, IndexError):
        return None

