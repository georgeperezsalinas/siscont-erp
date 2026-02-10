"""
Funciones de integridad tipo SAP para asientos contables.

Implementa hash de integridad y validación de integridad para auditoría.
"""
import hashlib
import json
from decimal import Decimal
from typing import List, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from ..domain.models import JournalEntry, EntryLine


def calculate_integrity_hash(entry: JournalEntry) -> str:
    """
    Calcula hash SHA-256 de integridad para un asiento.
    
    El hash incluye:
    - ID del asiento
    - Fecha
    - Glosa
    - Todas las líneas (cuenta, debe, haber)
    - Estado
    - Origen
    
    Esto permite detectar modificaciones no autorizadas.
    """
    # Ordenar líneas por account_id para consistencia
    sorted_lines = sorted(entry.lines, key=lambda l: (l.account_id, float(l.debit), float(l.credit)))
    
    # Construir string de datos
    data_parts = [
        f"entry_id:{entry.id}",
        f"date:{entry.date.isoformat()}",
        f"glosa:{entry.glosa or ''}",
        f"status:{entry.status}",
        f"origin:{entry.origin}",
        f"currency:{entry.currency}",
        f"exchange_rate:{float(entry.exchange_rate)}",
    ]
    
    # Agregar líneas
    for line in sorted_lines:
        data_parts.append(
            f"line:{line.account_id}:{float(line.debit)}:{float(line.credit)}"
        )
    
    # Calcular hash
    data_string = "|".join(data_parts)
    hash_obj = hashlib.sha256(data_string.encode('utf-8'))
    return hash_obj.hexdigest()


def verify_integrity_hash(entry: JournalEntry) -> bool:
    """
    Verifica que el hash de integridad del asiento sea correcto.
    
    Returns:
        True si el hash es correcto, False si ha sido modificado
    """
    if not entry.integrity_hash:
        return False  # No hay hash, no se puede verificar
    
    calculated_hash = calculate_integrity_hash(entry)
    return calculated_hash == entry.integrity_hash


def update_integrity_hash(entry: JournalEntry):
    """Actualiza el hash de integridad del asiento"""
    entry.integrity_hash = calculate_integrity_hash(entry)


def create_audit_trail(entry: JournalEntry, action: str, user_id: int, details: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Crea un registro de auditoría para un asiento.
    
    Args:
        entry: Asiento contable
        action: Acción realizada (CREATE, UPDATE, POST, REVERSE, VOID)
        user_id: ID del usuario que realizó la acción
        details: Detalles adicionales
        
    Returns:
        Dict con información de auditoría
    """
    return {
        "entry_id": entry.id,
        "action": action,
        "user_id": user_id,
        "timestamp": datetime.now().isoformat(),
        "entry_status": entry.status,
        "entry_origin": entry.origin,
        "details": details or {}
    }

