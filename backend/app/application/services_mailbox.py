"""
Servicios de Casilla Electrónica Empresarial
============================================
Lógica de negocio para notificaciones formales entre SISCONT y empresas.
Nivel ERP: inmutable, trazable, auditable.
"""
import hashlib
from datetime import datetime, date
from typing import Optional, List
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc

from ..domain.models import Company, User
from ..domain.models_mailbox import (
    ElectronicMailbox,
    MailboxMessage,
    MailboxAttachment,
    MailboxResponse,
    MailboxResponseAttachment,
    CompanyToAdminMessage,
    CompanyToAdminAttachment,
    MailboxAuditLog,
)

# Tipos de mensaje permitidos (nivel ERP)
MESSAGE_TYPES = ["NOTIFICACION", "MULTA", "REQUERIMIENTO", "AUDITORIA", "RECORDATORIO", "DOCUMENTO", "COMUNICADO"]
PRIORITIES = ["NORMAL", "ALTA", "CRITICA"]

# Tipos de archivo permitidos (extensiones) - PDF, Excel, Word, ZIP
ALLOWED_EXTENSIONS = {".pdf", ".xls", ".xlsx", ".zip", ".doc", ".docx"}
MAX_FILE_SIZE_MB = 10


def log_mailbox_audit(
    db: Session,
    event_type: str,
    user_id: Optional[int] = None,
    company_id: Optional[int] = None,
    message_id: Optional[int] = None,
    attachment_id: Optional[int] = None,
    extra_data: Optional[dict] = None,
) -> None:
    """Registra un evento de auditoría en la casilla. Inmutable."""
    try:
        log = MailboxAuditLog(
            event_type=event_type,
            user_id=user_id,
            company_id=company_id,
            message_id=message_id,
            attachment_id=attachment_id,
            extra_data=extra_data,
        )
        db.add(log)
        db.commit()
    except Exception:
        db.rollback()
        # No fallar la operación principal si falla el audit log


def get_or_create_mailbox(db: Session, company_id: int) -> ElectronicMailbox:
    """Obtiene o crea la casilla electrónica de una empresa."""
    mailbox = db.query(ElectronicMailbox).filter(ElectronicMailbox.company_id == company_id).first()
    if not mailbox:
        mailbox = ElectronicMailbox(company_id=company_id, status="ACTIVE")
        db.add(mailbox)
        db.commit()
        db.refresh(mailbox)
    return mailbox


def can_user_access_mailbox(user: User, company_id: int, as_admin: bool = False) -> bool:
    """
    Verifica si el usuario puede acceder a la casilla de la empresa.
    - Admin: puede acceder a CUALQUIER casilla (ver bandeja, enviar, descargar adjuntos)
    - Usuario empresa: solo si está asociado a esa empresa
    """
    if user.is_admin or getattr(user, "role", None) == "ADMINISTRADOR":
        return True
    if not user.companies:
        return False
    return any(c.id == company_id for c in user.companies)


def create_message(
    db: Session,
    company_id: int,
    subject: str,
    body: str,
    message_type: str,
    created_by: int,
    priority: str = "NORMAL",
    requires_response: bool = False,
    due_date: Optional[date] = None,
) -> MailboxMessage:
    """Crea un mensaje en la casilla de la empresa. Solo SISCONT (admin)."""
    if message_type not in MESSAGE_TYPES:
        raise ValueError(f"message_type debe ser uno de: {MESSAGE_TYPES}")
    if priority not in PRIORITIES:
        raise ValueError(f"priority debe ser uno de: {PRIORITIES}")

    mailbox = get_or_create_mailbox(db, company_id)
    msg = MailboxMessage(
        mailbox_id=mailbox.id,
        subject=subject,
        body=body,
        message_type=message_type,
        priority=priority,
        requires_response=requires_response,
        due_date=due_date,
        created_by=created_by,
        message_status="ENVIADO",
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    log_mailbox_audit(
        db, "MESSAGE_SENT",
        user_id=created_by,
        company_id=company_id,
        message_id=msg.id,
        extra_data={"subject": subject[:100] if subject else None},
    )
    return msg


def add_message_attachment(
    db: Session,
    message_id: int,
    file_name: str,
    file_path: str,
    file_type: str,
    file_hash: Optional[str] = None,
    file_size_bytes: Optional[int] = None,
) -> MailboxAttachment:
    """Añade un adjunto a un mensaje. Hash SHA256 para integridad."""
    att = MailboxAttachment(
        message_id=message_id,
        file_name=file_name,
        file_path=file_path,
        file_type=file_type,
        file_hash=file_hash,
        file_size_bytes=file_size_bytes,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return att


def list_messages(
    db: Session,
    company_id: int,
    message_type: Optional[str] = None,
    is_read: Optional[bool] = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[List[MailboxMessage], int]:
    """Lista mensajes de una casilla con filtros."""
    mailbox = db.query(ElectronicMailbox).filter(ElectronicMailbox.company_id == company_id).first()
    if not mailbox:
        return [], 0

    q = db.query(MailboxMessage).options(
        joinedload(MailboxMessage.responses),
        joinedload(MailboxMessage.creator),
    ).filter(MailboxMessage.mailbox_id == mailbox.id)
    if message_type:
        q = q.filter(MailboxMessage.message_type == message_type)
    if is_read is not None:
        q = q.filter(MailboxMessage.is_read == is_read)

    total = q.count()
    items = q.order_by(desc(MailboxMessage.created_at)).offset(offset).limit(limit).all()
    return items, total


def list_all_messages(
    db: Session,
    company_id: Optional[int] = None,
    message_type: Optional[str] = None,
    is_read: Optional[bool] = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[List[MailboxMessage], int]:
    """Lista todos los mensajes enviados por SISCONT, opcionalmente filtrados por empresa."""
    q = db.query(MailboxMessage).options(
        joinedload(MailboxMessage.responses),
        joinedload(MailboxMessage.creator),
        joinedload(MailboxMessage.mailbox).joinedload(ElectronicMailbox.company),
    )
    
    if company_id is not None:
        mailbox = db.query(ElectronicMailbox).filter(ElectronicMailbox.company_id == company_id).first()
        if mailbox:
            q = q.filter(MailboxMessage.mailbox_id == mailbox.id)
        else:
            return [], 0
    
    if message_type:
        q = q.filter(MailboxMessage.message_type == message_type)
    if is_read is not None:
        q = q.filter(MailboxMessage.is_read == is_read)

    total = q.count()
    items = q.order_by(desc(MailboxMessage.created_at)).offset(offset).limit(limit).all()
    return items, total


def get_message(db: Session, message_id: int, company_id: int) -> Optional[MailboxMessage]:
    """Obtiene un mensaje si pertenece a la casilla de la empresa."""
    msg = (
        db.query(MailboxMessage)
        .options(
            joinedload(MailboxMessage.attachments),
            joinedload(MailboxMessage.responses).joinedload(MailboxResponse.attachments),
            joinedload(MailboxMessage.creator),
            joinedload(MailboxMessage.acknowledged_by),
        )
        .filter(MailboxMessage.id == message_id)
        .join(ElectronicMailbox)
        .filter(ElectronicMailbox.company_id == company_id)
        .first()
    )
    return msg


def mark_as_read(db: Session, message_id: int, company_id: int, user_id: Optional[int] = None) -> bool:
    """Marca un mensaje como leído. Actualiza read_by_user_id y message_status."""
    msg = get_message(db, message_id, company_id)
    if not msg:
        return False
    msg.is_read = True
    msg.read_at = datetime.now()
    msg.read_by_user_id = user_id
    # Actualizar status: si tiene respuesta -> RESPONDIDO, si no -> LEIDO
    if msg.responses:
        msg.message_status = "RESPONDIDO"
    else:
        msg.message_status = "LEIDO"
    db.commit()
    log_mailbox_audit(
        db, "MESSAGE_READ",
        user_id=user_id,
        company_id=company_id,
        message_id=message_id,
        extra_data={"subject": msg.subject[:100] if msg.subject else None},
    )
    return True


def create_response(
    db: Session,
    message_id: int,
    company_id: int,
    response_text: str,
    created_by: int,
) -> MailboxResponse:
    """Crea una respuesta de la empresa a un mensaje."""
    msg = get_message(db, message_id, company_id)
    if not msg:
        raise ValueError("Mensaje no encontrado")
    resp = MailboxResponse(
        message_id=message_id,
        company_id=company_id,
        response_text=response_text,
        created_by=created_by,
    )
    db.add(resp)
    db.commit()
    db.refresh(resp)
    # Actualizar status del mensaje a RESPONDIDO
    msg.message_status = "RESPONDIDO"
    db.commit()
    log_mailbox_audit(
        db, "RESPONSE_SENT",
        user_id=created_by,
        company_id=company_id,
        message_id=message_id,
        extra_data={"response_id": resp.id, "subject": msg.subject[:100] if msg.subject else None},
    )
    return resp


def add_response_attachment(
    db: Session,
    response_id: int,
    file_name: str,
    file_path: str,
    file_type: str,
    file_hash: Optional[str] = None,
    file_size_bytes: Optional[int] = None,
) -> MailboxResponseAttachment:
    """Añade un adjunto a una respuesta."""
    att = MailboxResponseAttachment(
        response_id=response_id,
        file_name=file_name,
        file_path=file_path,
        file_type=file_type,
        file_hash=file_hash,
        file_size_bytes=file_size_bytes,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return att


def validate_file_upload(filename: str, content: bytes) -> None:
    """Valida que el archivo sea permitido y no exceda el tamaño."""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Tipo de archivo no permitido. Permitidos: PDF, Excel, Word, ZIP"
        )
    size_mb = len(content) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise ValueError(f"El archivo excede el tamaño máximo de {MAX_FILE_SIZE_MB} MB")


def compute_file_hash(content: bytes) -> str:
    """Calcula SHA256 del contenido para integridad."""
    return hashlib.sha256(content).hexdigest()


# --- Mensajes Empresa → SISCONT (admin) ---

def create_company_to_admin_message(
    db: Session,
    company_id: int,
    subject: str,
    body: str,
    created_by: int,
) -> CompanyToAdminMessage:
    """Crea un mensaje de la empresa hacia SISCONT (admin)."""
    msg = CompanyToAdminMessage(
        company_id=company_id,
        subject=subject,
        body=body,
        created_by=created_by,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    log_mailbox_audit(
        db, "COMPANY_MESSAGE_SENT",
        user_id=created_by,
        company_id=company_id,
        message_id=msg.id,
        extra_data={"subject": subject[:100] if subject else None},
    )
    return msg


def add_company_to_admin_attachment(
    db: Session,
    message_id: int,
    file_name: str,
    file_path: str,
    file_type: str,
    file_hash: Optional[str] = None,
    file_size_bytes: Optional[int] = None,
) -> CompanyToAdminAttachment:
    """Añade un adjunto a un mensaje empresa→admin."""
    att = CompanyToAdminAttachment(
        message_id=message_id,
        file_name=file_name,
        file_path=file_path,
        file_type=file_type,
        file_hash=file_hash,
        file_size_bytes=file_size_bytes,
    )
    db.add(att)
    db.commit()
    db.refresh(att)
    return att


def list_company_to_admin_messages(
    db: Session,
    company_id: Optional[int] = None,
    is_read: Optional[bool] = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[List[CompanyToAdminMessage], int]:
    """Lista mensajes empresa→admin. Si company_id es None, lista todos (admin)."""
    q = db.query(CompanyToAdminMessage).options(
        joinedload(CompanyToAdminMessage.creator),
        joinedload(CompanyToAdminMessage.company),
    )
    if company_id is not None:
        q = q.filter(CompanyToAdminMessage.company_id == company_id)
    if is_read is not None:
        q = q.filter(CompanyToAdminMessage.is_read == is_read)
    total = q.count()
    items = q.order_by(desc(CompanyToAdminMessage.created_at)).offset(offset).limit(limit).all()
    return items, total


def get_company_to_admin_message(db: Session, message_id: int) -> Optional[CompanyToAdminMessage]:
    """Obtiene un mensaje empresa→admin por ID."""
    return (
        db.query(CompanyToAdminMessage)
        .options(
            joinedload(CompanyToAdminMessage.attachments),
            joinedload(CompanyToAdminMessage.creator),
            joinedload(CompanyToAdminMessage.company),
        )
        .filter(CompanyToAdminMessage.id == message_id)
        .first()
    )


def mark_company_to_admin_as_read(db: Session, message_id: int, user_id: Optional[int] = None) -> bool:
    """Marca un mensaje empresa→admin como leído."""
    msg = get_company_to_admin_message(db, message_id)
    if not msg:
        return False
    msg.is_read = True
    msg.read_at = datetime.now()
    msg.read_by_user_id = user_id
    db.commit()
    log_mailbox_audit(
        db, "COMPANY_MESSAGE_READ",
        user_id=user_id,
        company_id=msg.company_id,
        message_id=message_id,
        extra_data={"subject": msg.subject[:100] if msg.subject else None},
    )
    return True


def acknowledge_mailbox_message(db: Session, message_id: int, company_id: int, user_id: int) -> bool:
    """Confirma recepción de un mensaje (empresa). Constancia formal."""
    msg = get_message(db, message_id, company_id)
    if not msg:
        return False
    if msg.is_acknowledged:
        return True  # Ya confirmado
    msg.is_acknowledged = True
    msg.acknowledged_at = datetime.now()
    msg.acknowledged_by_user_id = user_id
    db.commit()
    log_mailbox_audit(
        db, "ACKNOWLEDGED",
        user_id=user_id,
        company_id=company_id,
        message_id=message_id,
        extra_data={"subject": msg.subject[:100] if msg.subject else None},
    )
    return True


def log_attachment_download(
    db: Session,
    event_type: str,
    attachment_id: int,
    message_id: int,
    user_id: Optional[int] = None,
    company_id: Optional[int] = None,
    extra_data: Optional[dict] = None,
) -> None:
    """Registra descarga de adjunto en auditoría."""
    log_mailbox_audit(
        db, event_type,
        user_id=user_id,
        company_id=company_id,
        message_id=message_id,
        attachment_id=attachment_id,
        extra_data=extra_data,
    )


def get_mailbox_stats_erp(db: Session, company_id: int) -> dict:
    """Estadísticas ERP: no leídos, críticos, vencidos, pendientes de respuesta."""
    mailbox = db.query(ElectronicMailbox).filter(ElectronicMailbox.company_id == company_id).first()
    if not mailbox:
        return {"unread_count": 0, "critical_count": 0, "overdue_count": 0, "pending_response_count": 0}

    today = date.today()
    unread = db.query(MailboxMessage).filter(
        MailboxMessage.mailbox_id == mailbox.id,
        MailboxMessage.is_read == False,
    ).count()

    critical = db.query(MailboxMessage).filter(
        MailboxMessage.mailbox_id == mailbox.id,
        MailboxMessage.priority == "CRITICA",
        MailboxMessage.is_read == False,
    ).count()

    overdue = db.query(MailboxMessage).options(
        joinedload(MailboxMessage.responses),
    ).filter(
        MailboxMessage.mailbox_id == mailbox.id,
        MailboxMessage.due_date != None,
        MailboxMessage.due_date < today,
    ).all()
    overdue_count = 0
    for m in overdue:
        if len(m.responses) == 0:
            overdue_count += 1
            if getattr(m, "message_status", None) != "VENCIDO":
                m.message_status = "VENCIDO"
    if overdue_count > 0:
        db.commit()

    msgs_requiring = db.query(MailboxMessage).options(
        joinedload(MailboxMessage.responses),
    ).filter(
        MailboxMessage.mailbox_id == mailbox.id,
        MailboxMessage.requires_response == True,
    ).all()
    pending = sum(1 for m in msgs_requiring if len(m.responses) == 0)

    return {
        "unread_count": unread,
        "critical_count": critical,
        "overdue_count": overdue_count,
        "pending_response_count": pending,
    }


def get_admin_mailbox_stats_erp(db: Session) -> dict:
    """Estadísticas ERP para admin: mensajes no leídos de empresas, críticos, vencidos globales."""
    today = date.today()

    # Mensajes empresa→admin no leídos
    unread_incoming = db.query(CompanyToAdminMessage).filter(
        CompanyToAdminMessage.is_read == False,
    ).count()

    # Mensajes SISCONT→empresa: críticos no leídos, vencidos sin respuesta
    critical = db.query(MailboxMessage).filter(
        MailboxMessage.priority == "CRITICA",
        MailboxMessage.is_read == False,
    ).count()

    overdue = db.query(MailboxMessage).options(
        joinedload(MailboxMessage.responses),
    ).filter(
        MailboxMessage.due_date != None,
        MailboxMessage.due_date < today,
    ).all()
    overdue_count = sum(1 for m in overdue if len(m.responses) == 0)
    for m in overdue:
        if len(m.responses) == 0 and getattr(m, "message_status", None) != "VENCIDO":
            m.message_status = "VENCIDO"
    if overdue_count > 0:
        db.commit()

    pending_response = db.query(MailboxMessage).options(
        joinedload(MailboxMessage.responses),
    ).filter(MailboxMessage.requires_response == True).all()
    pending_count = sum(1 for m in pending_response if len(m.responses) == 0)

    return {
        "unread_count": unread_incoming,
        "critical_count": critical,
        "overdue_count": overdue_count,
        "pending_response_count": pending_count,
    }
