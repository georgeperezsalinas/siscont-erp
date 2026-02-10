"""
API de Casilla Electrónica Empresarial
=====================================
Notificaciones formales entre SISCONT y empresas.
"""
from datetime import date
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
import os
import uuid

from ...dependencies import get_db
from ...security.auth import get_current_user
from ...domain.models import User, Company
from ...domain.models_mailbox import ElectronicMailbox, MailboxMessage
from sqlalchemy.orm import joinedload
from ...domain.models_mailbox import MailboxResponse, MailboxResponseAttachment
from ...domain.models_mailbox import CompanyToAdminMessage, CompanyToAdminAttachment
from ...application.services_mailbox import (
    get_or_create_mailbox,
    can_user_access_mailbox,
    create_message,
    add_message_attachment,
    list_messages,
    list_all_messages,
    get_message,
    mark_as_read,
    create_response,
    add_response_attachment,
    validate_file_upload,
    compute_file_hash,
    log_attachment_download,
    acknowledge_mailbox_message,
    get_mailbox_stats_erp,
    get_admin_mailbox_stats_erp,
    MESSAGE_TYPES,
    create_company_to_admin_message,
    add_company_to_admin_attachment,
    list_company_to_admin_messages,
    get_company_to_admin_message,
    mark_company_to_admin_as_read,
)

router = APIRouter(prefix="/mailbox", tags=["mailbox"])

# Ruta base para archivos de casilla
MAILBOX_UPLOAD_DIR = os.getenv("MAILBOX_UPLOAD_DIR", "./data/mailbox")


def _ensure_mailbox_dir():
    Path(MAILBOX_UPLOAD_DIR).mkdir(parents=True, exist_ok=True)


def _get_mailbox_storage_path(company_id: int, subpath: str) -> str:
    """Genera ruta de almacenamiento: mailbox/{company_id}/{subpath}"""
    return str(Path(MAILBOX_UPLOAD_DIR) / str(company_id) / subpath)


# --- Schemas ---

class MessageCreate(BaseModel):
    subject: str = Field(..., min_length=1, max_length=500)
    body: str = Field(..., min_length=1)
    message_type: str = Field(..., description="NOTIFICACION, MULTA, REQUERIMIENTO, AUDITORIA, RECORDATORIO, DOCUMENTO, COMUNICADO")
    priority: str = Field(default="NORMAL", description="NORMAL, ALTA, CRITICA")
    requires_response: bool = False
    due_date: Optional[date] = None


class ResponseCreate(BaseModel):
    response_text: str = Field(..., min_length=1)


class CompanyToAdminCreate(BaseModel):
    subject: str = Field(..., min_length=1, max_length=500)
    body: str = Field(..., min_length=1)


def _user_display_name(user: User | None) -> str:
    if not user:
        return ""
    nombre = getattr(user, "nombre", None) or ""
    apellido = getattr(user, "apellido", None) or ""
    full = f"{nombre} {apellido}".strip()
    return full if full else (getattr(user, "username", None) or "")


# --- Empresa: Ver bandeja ---

@router.get("/messages")
def list_mailbox_messages(
    company_id: int = Query(..., description="ID de la empresa"),
    message_type: Optional[str] = Query(None),
    is_read: Optional[bool] = Query(None),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista mensajes de la casilla de la empresa. Solo usuarios asociados a la empresa."""
    if not can_user_access_mailbox(current_user, company_id, as_admin=False):
        raise HTTPException(403, detail="No tiene acceso a esta casilla")
    items, total = list_messages(db, company_id, message_type, is_read, limit, offset)
    return {
        "items": [
            {
                "id": m.id,
                "subject": m.subject,
                "message_type": m.message_type,
                "priority": m.priority,
                "requires_response": m.requires_response,
                "due_date": m.due_date.isoformat() if m.due_date else None,
                "created_at": m.created_at.isoformat(),
                "created_by_name": _user_display_name(m.creator),
                "is_read": m.is_read,
                "read_at": m.read_at.isoformat() if m.read_at else None,
                "has_response": len(m.responses) > 0,
            }
            for m in items
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/messages/{message_id}")
def get_mailbox_message(
    message_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Obtiene el detalle de un mensaje."""
    if not can_user_access_mailbox(current_user, company_id, as_admin=False):
        raise HTTPException(403, detail="No tiene acceso a esta casilla")
    msg = get_message(db, message_id, company_id)
    if not msg:
        raise HTTPException(404, detail="Mensaje no encontrado")
    return {
        "id": msg.id,
        "subject": msg.subject,
        "body": msg.body,
        "message_type": msg.message_type,
        "priority": msg.priority,
        "requires_response": msg.requires_response,
        "due_date": msg.due_date.isoformat() if msg.due_date else None,
        "created_at": msg.created_at.isoformat(),
        "created_by_name": _user_display_name(msg.creator),
        "is_read": msg.is_read,
        "read_at": msg.read_at.isoformat() if msg.read_at else None,
        "is_acknowledged": getattr(msg, "is_acknowledged", False),
        "acknowledged_at": msg.acknowledged_at.isoformat() if getattr(msg, "acknowledged_at", None) else None,
        "acknowledged_by_name": _user_display_name(msg.acknowledged_by) if getattr(msg, "acknowledged_by", None) else None,
        "attachments": [
            {"id": a.id, "file_name": a.file_name, "file_type": a.file_type}
            for a in msg.attachments
        ],
        "responses": [
            {
                "id": r.id,
                "response_text": r.response_text,
                "created_at": r.created_at.isoformat(),
                "created_by_name": _user_display_name(r.creator),
                "attachments": [
                    {"id": ra.id, "file_name": ra.file_name}
                    for ra in r.attachments
                ],
            }
            for r in msg.responses
        ],
    }


@router.post("/messages/{message_id}/read")
def mark_message_read(
    message_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Marca un mensaje como leído."""
    if not can_user_access_mailbox(current_user, company_id, as_admin=False):
        raise HTTPException(403, detail="No tiene acceso a esta casilla")
    if not mark_as_read(db, message_id, company_id, user_id=current_user.id):
        raise HTTPException(404, detail="Mensaje no encontrado")
    return {"ok": True}


@router.post("/messages/{message_id}/acknowledge")
def acknowledge_message(
    message_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Confirma recepción del mensaje (constancia formal). Usuario empresa."""
    if not can_user_access_mailbox(current_user, company_id, as_admin=False):
        raise HTTPException(403, detail="No tiene acceso a esta casilla")
    if not acknowledge_mailbox_message(db, message_id, company_id, current_user.id):
        raise HTTPException(404, detail="Mensaje no encontrado")
    return {"ok": True}


@router.post("/messages/{message_id}/responses")
def create_mailbox_response(
    message_id: int,
    payload: ResponseCreate,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Responde a un mensaje. Solo usuarios de la empresa."""
    if not can_user_access_mailbox(current_user, company_id, as_admin=False):
        raise HTTPException(403, detail="No tiene acceso a esta casilla")
    resp = create_response(db, message_id, company_id, payload.response_text, current_user.id)
    return {
        "id": resp.id,
        "response_text": resp.response_text,
        "created_at": resp.created_at.isoformat(),
    }


@router.post("/responses/{response_id}/attachments")
async def upload_response_attachment(
    response_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sube un adjunto a una respuesta."""
    if not can_user_access_mailbox(current_user, company_id, as_admin=False):
        raise HTTPException(403, detail="No tiene acceso")
    content = await file.read()
    validate_file_upload(file.filename or "", content)
    # Verificar que la respuesta existe y pertenece a la empresa
    from ...domain.models_mailbox import MailboxResponse
    resp = db.query(MailboxResponse).filter(
        MailboxResponse.id == response_id,
        MailboxResponse.company_id == company_id,
    ).first()
    if not resp:
        raise HTTPException(404, detail="Respuesta no encontrada")
    _ensure_mailbox_dir()
    safe_name = f"{uuid.uuid4().hex}_{(file.filename or 'file')[:100]}"
    subpath = f"responses/{response_id}"
    full_dir = Path(MAILBOX_UPLOAD_DIR) / str(company_id) / subpath
    full_dir.mkdir(parents=True, exist_ok=True)
    file_path = str(full_dir / safe_name)
    with open(file_path, "wb") as f:
        f.write(content)
    rel_path = f"{company_id}/responses/{response_id}/{safe_name}"
    add_response_attachment(
        db, response_id, file.filename or "file", rel_path, file.content_type or "application/octet-stream",
        file_hash=compute_file_hash(content), file_size_bytes=len(content),
    )
    return {"ok": True, "file_name": file.filename}


@router.get("/response-attachments/{attachment_id}/download")
def download_response_attachment(
    attachment_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Descarga un adjunto de una respuesta. Auditoría registrada."""
    att = db.query(MailboxResponseAttachment).options(
        joinedload(MailboxResponseAttachment.response),
    ).join(
        MailboxResponse, MailboxResponseAttachment.response_id == MailboxResponse.id
    ).filter(
        MailboxResponseAttachment.id == attachment_id,
        MailboxResponse.company_id == company_id,
    ).first()
    if not att:
        raise HTTPException(404, detail="Adjunto no encontrado")
    if not can_user_access_mailbox(current_user, company_id, as_admin=True):
        raise HTTPException(403, detail="No tiene acceso")
    full_path = Path(MAILBOX_UPLOAD_DIR) / att.file_path
    if not full_path.exists():
        raise HTTPException(404, detail="Archivo no encontrado")
    message_id = att.response.message_id if att.response else None
    log_attachment_download(
        db, "ATTACHMENT_DOWNLOAD",
        attachment_id=att.id,
        message_id=message_id,
        user_id=current_user.id,
        company_id=company_id,
        extra_data={"file_name": att.file_name, "response_id": att.response_id},
    )
    return FileResponse(str(full_path), filename=att.file_name)


# --- Empresa: Enviar mensaje a SISCONT ---

@router.post("/company/outgoing")
def company_send_to_admin(
    payload: CompanyToAdminCreate,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Envía un mensaje de la empresa hacia SISCONT (admin). Usuario empresa con casilla.send."""
    if not can_user_access_mailbox(current_user, company_id, as_admin=False):
        raise HTTPException(403, detail="No tiene acceso a esta empresa")
    msg = create_company_to_admin_message(
        db=db,
        company_id=company_id,
        subject=payload.subject,
        body=payload.body,
        created_by=current_user.id,
    )
    return {
        "id": msg.id,
        "subject": msg.subject,
        "created_at": msg.created_at.isoformat(),
    }


@router.post("/company/outgoing/{message_id}/attachments")
async def company_upload_outgoing_attachment(
    message_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sube adjunto a un mensaje empresa→SISCONT."""
    if not can_user_access_mailbox(current_user, company_id, as_admin=False):
        raise HTTPException(403, detail="No tiene acceso")
    msg = db.query(CompanyToAdminMessage).filter(
        CompanyToAdminMessage.id == message_id,
        CompanyToAdminMessage.company_id == company_id,
    ).first()
    if not msg:
        raise HTTPException(404, detail="Mensaje no encontrado")
    content = await file.read()
    validate_file_upload(file.filename or "", content)
    _ensure_mailbox_dir()
    safe_name = f"{uuid.uuid4().hex}_{(file.filename or 'file')[:100]}"
    subpath = f"company_outgoing/{message_id}"
    full_dir = Path(MAILBOX_UPLOAD_DIR) / str(company_id) / subpath
    full_dir.mkdir(parents=True, exist_ok=True)
    file_path = full_dir / safe_name
    with open(file_path, "wb") as f:
        f.write(content)
    rel_path = f"{company_id}/company_outgoing/{message_id}/{safe_name}"
    add_company_to_admin_attachment(
        db, message_id, file.filename or "file", rel_path, file.content_type or "application/octet-stream",
        file_hash=compute_file_hash(content), file_size_bytes=len(content),
    )
    return {"ok": True, "file_name": file.filename}


@router.get("/company/outgoing")
def company_list_outgoing(
    company_id: int = Query(..., description="ID de la empresa"),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista mensajes enviados por la empresa a SISCONT."""
    if not can_user_access_mailbox(current_user, company_id, as_admin=False):
        raise HTTPException(403, detail="No tiene acceso")
    items, total = list_company_to_admin_messages(db, company_id=company_id, limit=limit, offset=offset)
    return {
        "items": [
            {
                "id": m.id,
                "subject": m.subject,
                "created_at": m.created_at.isoformat(),
                "created_by_name": _user_display_name(m.creator),
            }
            for m in items
        ],
        "total": total,
    }


@router.get("/company/outgoing/{message_id}")
def company_get_outgoing(
    message_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Obtiene el detalle de un mensaje enviado por la empresa a SISCONT."""
    if not can_user_access_mailbox(current_user, company_id, as_admin=False):
        raise HTTPException(403, detail="No tiene acceso")
    msg = get_company_to_admin_message(db, message_id)
    if not msg:
        raise HTTPException(404, detail="Mensaje no encontrado")
    # Verificar que el mensaje pertenece a la empresa del usuario
    if msg.company_id != company_id:
        raise HTTPException(403, detail="No tiene acceso a este mensaje")
    return {
        "id": msg.id,
        "subject": msg.subject,
        "body": msg.body,
        "company_id": msg.company_id,
        "company_name": msg.company.name if msg.company else "",
        "created_at": msg.created_at.isoformat(),
        "created_by_name": _user_display_name(msg.creator),
        "is_read": msg.is_read,
        "read_at": msg.read_at.isoformat() if msg.read_at else None,
        "attachments": [
            {"id": a.id, "file_name": a.file_name, "file_type": a.file_type}
            for a in msg.attachments
        ],
    }


@router.get("/company/outgoing/{message_id}/attachments/{attachment_id}/download")
def company_download_outgoing_attachment(
    message_id: int,
    attachment_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Descarga un adjunto de un mensaje empresa→SISCONT. Auditoría registrada."""
    if not can_user_access_mailbox(current_user, company_id, as_admin=False):
        raise HTTPException(403, detail="No tiene acceso")
    msg = get_company_to_admin_message(db, message_id)
    if not msg or msg.company_id != company_id:
        raise HTTPException(404, detail="Mensaje no encontrado")
    att = next((a for a in msg.attachments if a.id == attachment_id), None)
    if not att:
        raise HTTPException(404, detail="Adjunto no encontrado")
    full_path = Path(MAILBOX_UPLOAD_DIR) / att.file_path
    if not full_path.exists():
        raise HTTPException(404, detail="Archivo no encontrado en almacenamiento")
    log_attachment_download(
        db, "ATTACHMENT_DOWNLOAD",
        attachment_id=att.id,
        message_id=msg.id,
        user_id=current_user.id,
        company_id=company_id,
        extra_data={"file_name": att.file_name},
    )
    return FileResponse(str(full_path), filename=att.file_name)


@router.get("/attachments/{attachment_id}/download")
def download_message_attachment(
    attachment_id: int,
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Descarga un adjunto de un mensaje. Auditoría registrada."""
    from ...domain.models_mailbox import MailboxAttachment
    att = db.query(MailboxAttachment).join(MailboxMessage).join(ElectronicMailbox).filter(
        MailboxAttachment.id == attachment_id,
        ElectronicMailbox.company_id == company_id,
    ).first()
    if not att:
        raise HTTPException(404, detail="Adjunto no encontrado")
    if not can_user_access_mailbox(current_user, company_id, as_admin=True):
        raise HTTPException(403, detail="No tiene acceso")
    full_path = Path(MAILBOX_UPLOAD_DIR) / att.file_path
    if not full_path.exists():
        raise HTTPException(404, detail="Archivo no encontrado en almacenamiento")
    log_attachment_download(
        db, "ATTACHMENT_DOWNLOAD",
        attachment_id=att.id,
        message_id=att.message_id,
        user_id=current_user.id,
        company_id=company_id,
        extra_data={"file_name": att.file_name},
    )
    return FileResponse(str(full_path), filename=att.file_name)


# --- SISCONT Admin: Enviar mensajes ---

def _require_admin(current_user: User):
    if not (current_user.is_admin or getattr(current_user, "role", None) == "ADMINISTRADOR"):
        raise HTTPException(403, detail="Solo administradores de SISCONT pueden enviar notificaciones")


@router.get("/admin/companies")
def list_companies_for_mailbox(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista empresas para seleccionar destinatario. Solo admin."""
    _require_admin(current_user)
    companies = db.query(Company).filter(Company.active == True).order_by(Company.name).all()
    return [
        {"id": c.id, "name": c.name, "ruc": c.ruc}
        for c in companies
    ]


@router.get("/admin/incoming")
def admin_list_incoming(
    company_id: Optional[int] = Query(None, description="Filtrar por empresa"),
    is_read: Optional[bool] = Query(None),
    limit: int = Query(100, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista mensajes enviados por empresas a SISCONT. Solo admin."""
    _require_admin(current_user)
    items, total = list_company_to_admin_messages(db, company_id=company_id, is_read=is_read, limit=limit, offset=offset)
    return {
        "items": [
            {
                "id": m.id,
                "subject": m.subject,
                "company_id": m.company_id,
                "company_name": m.company.name if m.company else "",
                "created_at": m.created_at.isoformat(),
                "created_by_name": _user_display_name(m.creator),
                "is_read": m.is_read,
            }
            for m in items
        ],
        "total": total,
    }


@router.get("/admin/incoming/stats")
def admin_incoming_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Devuelve estadísticas ERP: no leídos, críticos, vencidos, pendientes de respuesta. Solo admin."""
    _require_admin(current_user)
    return get_admin_mailbox_stats_erp(db)


@router.get("/admin/incoming/{message_id}")
def admin_get_incoming(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Obtiene detalle de un mensaje empresa→SISCONT. Solo admin."""
    _require_admin(current_user)
    msg = get_company_to_admin_message(db, message_id)
    if not msg:
        raise HTTPException(404, detail="Mensaje no encontrado")
    return {
        "id": msg.id,
        "subject": msg.subject,
        "body": msg.body,
        "company_id": msg.company_id,
        "company_name": msg.company.name if msg.company else "",
        "created_at": msg.created_at.isoformat(),
        "created_by_name": _user_display_name(msg.creator),
        "is_read": msg.is_read,
        "read_at": msg.read_at.isoformat() if msg.read_at else None,
        "attachments": [
            {"id": a.id, "file_name": a.file_name, "file_type": a.file_type}
            for a in msg.attachments
        ],
    }


@router.post("/admin/incoming/{message_id}/read")
def admin_mark_incoming_read(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Marca mensaje empresa→SISCONT como leído. Solo admin."""
    _require_admin(current_user)
    if not mark_company_to_admin_as_read(db, message_id, user_id=current_user.id):
        raise HTTPException(404, detail="Mensaje no encontrado")
    return {"ok": True}


@router.get("/admin/incoming/attachments/{attachment_id}/download")
def admin_download_incoming_attachment(
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Descarga adjunto de mensaje empresa→SISCONT. Solo admin. Auditoría registrada."""
    from sqlalchemy.orm import joinedload
    _require_admin(current_user)
    att = db.query(CompanyToAdminAttachment).options(
        joinedload(CompanyToAdminAttachment.message),
    ).filter(CompanyToAdminAttachment.id == attachment_id).first()
    if not att:
        raise HTTPException(404, detail="Adjunto no encontrado")
    full_path = Path(MAILBOX_UPLOAD_DIR) / att.file_path
    if not full_path.exists():
        raise HTTPException(404, detail="Archivo no encontrado")
    company_id = att.message.company_id if att.message else None
    log_attachment_download(
        db, "ATTACHMENT_DOWNLOAD",
        attachment_id=att.id,
        message_id=att.message_id,
        user_id=current_user.id,
        company_id=company_id,
        extra_data={"file_name": att.file_name},
    )
    return FileResponse(str(full_path), filename=att.file_name)


@router.post("/admin/companies/{company_id}/messages")
def admin_create_message(
    company_id: int,
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crea un mensaje en la casilla de una empresa. Solo admin SISCONT."""
    _require_admin(current_user)
    msg = create_message(
        db=db,
        company_id=company_id,
        subject=payload.subject,
        body=payload.body,
        message_type=payload.message_type,
        created_by=current_user.id,
        priority=payload.priority,
        requires_response=payload.requires_response,
        due_date=payload.due_date,
    )
    return {
        "id": msg.id,
        "subject": msg.subject,
        "message_type": msg.message_type,
        "created_at": msg.created_at.isoformat(),
    }


@router.post("/admin/messages/{message_id}/attachments")
async def admin_upload_message_attachment(
    message_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Sube un adjunto a un mensaje. Solo admin."""
    _require_admin(current_user)
    msg = db.query(MailboxMessage).filter(MailboxMessage.id == message_id).first()
    if not msg:
        raise HTTPException(404, detail="Mensaje no encontrado")
    mailbox = db.query(ElectronicMailbox).filter(ElectronicMailbox.id == msg.mailbox_id).first()
    if not mailbox:
        raise HTTPException(404, detail="Casilla no encontrada")
    company_id = mailbox.company_id
    content = await file.read()
    validate_file_upload(file.filename or "", content)
    _ensure_mailbox_dir()
    safe_name = f"{uuid.uuid4().hex}_{(file.filename or 'file')[:100]}"
    subpath = f"messages/{message_id}"
    full_dir = Path(MAILBOX_UPLOAD_DIR) / str(company_id) / subpath
    full_dir.mkdir(parents=True, exist_ok=True)
    file_path = full_dir / safe_name
    with open(file_path, "wb") as f:
        f.write(content)
    rel_path = f"{company_id}/messages/{message_id}/{safe_name}"
    add_message_attachment(
        db, message_id, file.filename or "file", rel_path, file.content_type or "application/octet-stream",
        file_hash=compute_file_hash(content), file_size_bytes=len(content),
    )
    return {"ok": True, "file_name": file.filename}


@router.get("/admin/messages")
def admin_list_all_messages(
    company_id: Optional[int] = Query(None, description="Filtrar por empresa"),
    message_type: Optional[str] = Query(None),
    is_read: Optional[bool] = Query(None),
    limit: int = Query(100, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista todos los mensajes enviados por SISCONT a empresas. Solo admin."""
    _require_admin(current_user)
    items, total = list_all_messages(db, company_id, message_type, is_read, limit, offset)
    return {
        "items": [
            {
                "id": m.id,
                "subject": m.subject,
                "message_type": m.message_type,
                "priority": m.priority,
                "requires_response": m.requires_response,
                "created_at": m.created_at.isoformat(),
                "created_by_name": _user_display_name(m.creator),
                "is_read": m.is_read,
                "read_at": m.read_at.isoformat() if m.read_at else None,
                "has_response": len(m.responses) > 0,
                "company_id": m.mailbox.company_id if m.mailbox else None,
                "company_name": m.mailbox.company.name if m.mailbox and m.mailbox.company else None,
            }
            for m in items
        ],
        "total": total,
    }


@router.get("/admin/companies/{company_id}/messages")
def admin_list_company_messages(
    company_id: int,
    limit: int = Query(100, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista mensajes de una empresa (para admin)."""
    _require_admin(current_user)
    items, total = list_messages(db, company_id, None, None, limit, offset)
    return {
        "items": [
            {
                "id": m.id,
                "subject": m.subject,
                "message_type": m.message_type,
                "priority": m.priority,
                "requires_response": m.requires_response,
                "created_at": m.created_at.isoformat(),
                "created_by_name": _user_display_name(m.creator),
                "is_read": m.is_read,
                "read_at": m.read_at.isoformat() if m.read_at else None,
                "has_response": len(m.responses) > 0,
            }
            for m in items
        ],
        "total": total,
    }


@router.get("/admin/companies/{company_id}/messages/{message_id}")
def admin_get_mailbox_message(
    company_id: int,
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Obtiene el detalle de un mensaje de una empresa. Solo admin."""
    _require_admin(current_user)
    msg = get_message(db, message_id, company_id)
    if not msg:
        raise HTTPException(404, detail="Mensaje no encontrado")
    return {
        "id": msg.id,
        "subject": msg.subject,
        "body": msg.body,
        "message_type": msg.message_type,
        "priority": msg.priority,
        "requires_response": msg.requires_response,
        "due_date": msg.due_date.isoformat() if msg.due_date else None,
        "created_at": msg.created_at.isoformat(),
        "created_by_name": _user_display_name(msg.creator),
        "is_read": msg.is_read,
        "read_at": msg.read_at.isoformat() if msg.read_at else None,
        "attachments": [
            {"id": a.id, "file_name": a.file_name, "file_type": a.file_type}
            for a in msg.attachments
        ],
        "responses": [
            {
                "id": r.id,
                "response_text": r.response_text,
                "created_at": r.created_at.isoformat(),
                "created_by_name": _user_display_name(r.creator),
                "attachments": [
                    {"id": ra.id, "file_name": ra.file_name}
                    for ra in r.attachments
                ],
            }
            for r in msg.responses
        ],
    }


@router.get("/stats")
def get_mailbox_stats(
    company_id: int = Query(..., description="ID de la empresa"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Obtiene estadísticas ERP de la casilla: no leídos, críticos, vencidos, pendientes de respuesta."""
    if not can_user_access_mailbox(current_user, company_id, as_admin=False):
        raise HTTPException(403, detail="No tiene acceso a esta casilla")
    return get_mailbox_stats_erp(db, company_id)
