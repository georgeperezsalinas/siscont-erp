"""
API de Gestión de Documentos
Endpoints para upload, download, búsqueda y gestión de documentos
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Response
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional, List
from datetime import datetime
import io
from pathlib import Path

from ...dependencies import get_db
from ...security.auth import get_current_user
from ...domain.models import User
from ...application.services_documents_v2 import DocumentService
from ...infrastructure.storage import get_storage_service
from ...config import settings

router = APIRouter(prefix="/documents", tags=["documents"])


def get_documents_storage_service():
    """
    Helper para obtener el storage service con la ruta correcta de documentos.
    Compatible con Windows, Linux y Docker.
    """
    uploads_dir = getattr(settings, 'uploads_dir', './data/uploads')
    base = Path(uploads_dir)
    documents_base_path = str(base.parent / 'documents') if base.name == 'uploads' else str(base / 'documents')
    
    return get_storage_service(
        storage_type="local",
        base_path=documents_base_path
    )


# IMPORTANTE: Las rutas específicas deben ir ANTES de las rutas con parámetros dinámicos
# para evitar que FastAPI intente interpretar "search" como document_id

@router.get("/search")
def search_documents(
    company_id: int = Query(..., description="ID de la empresa"),
    query: Optional[str] = Query(None, description="Búsqueda por texto"),
    document_type: Optional[str] = Query(None, description="Tipo de documento"),
    related_entity_type: Optional[str] = Query(None, description="Tipo de entidad relacionada"),
    related_entity_id: Optional[int] = Query(None, description="ID de entidad relacionada"),
    date_from: Optional[str] = Query(None, description="Fecha desde (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Fecha hasta (YYYY-MM-DD)"),
    tags: Optional[str] = Query(None, description="Tags separados por coma"),
    limit: int = Query(50, le=100, description="Límite de resultados"),
    offset: int = Query(0, ge=0, description="Offset para paginación"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Búsqueda avanzada de documentos"""
    try:
        storage_service = get_documents_storage_service()
        document_service = DocumentService(db, storage_service)
        
        # Parsear tags
        tag_list = [t.strip() for t in tags.split(',')] if tags else None
        
        # Parsear fechas desde string
        date_from_parsed = None
        date_to_parsed = None
        if date_from:
            try:
                date_from_parsed = datetime.fromisoformat(date_from.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                try:
                    date_from_parsed = datetime.strptime(date_from, '%Y-%m-%d')
                except ValueError:
                    pass
        
        if date_to:
            try:
                date_to_parsed = datetime.fromisoformat(date_to.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                try:
                    date_to_parsed = datetime.strptime(date_to, '%Y-%m-%d')
                except ValueError:
                    pass
        
        documents, total = document_service.search_documents(
            company_id=company_id,
            query=query,
            document_type=document_type,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            date_from=date_from_parsed,
            date_to=date_to_parsed,
            tags=tag_list,
            limit=limit,
            offset=offset
        )
        
        return {
            "items": [{
                "id": doc.id,
                "original_filename": doc.original_filename,
                "document_type": doc.document_type,
                "document_category": doc.document_category,
                "title": doc.title,
                "description": doc.description,
                "file_size": doc.file_size,
                "mime_type": doc.mime_type,
                "uploaded_at": doc.uploaded_at.isoformat(),
                "uploaded_by": doc.uploaded_by,
                "related_entity_type": doc.related_entity_type,
                "related_entity_id": doc.related_entity_id,
                "is_duplicate": doc.is_duplicate,
                "duplicate_of": doc.duplicate_of
            } for doc in documents],
            "total": total,
            "limit": limit,
            "offset": offset
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload")
async def upload_document(
    company_id: int = Query(..., description="ID de la empresa"),
    document_type: str = Query(..., description="COMPROBANTE_COMPRA, COMPROBANTE_VENTA, OTRO"),
    related_entity_type: Optional[str] = Query(None, description="PURCHASE, SALE, JOURNAL_ENTRY"),
    related_entity_id: Optional[int] = Query(None, description="ID de la entidad relacionada"),
    title: Optional[str] = Query(None, description="Título del documento"),
    description: Optional[str] = Query(None, description="Descripción del documento"),
    enable_extraction: bool = Query(False, description="Extraer metadatos automáticamente (async)"),
    enable_ocr: bool = Query(False, description="Ejecutar OCR automáticamente (async, solo PDFs)"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Sube un documento al sistema - VERSIÓN RÁPIDA.
    
    Formatos soportados: PDF, Excel (XLSX, XLS), Word (DOCX, DOC), TXT, XML
    Tamaño máximo: 50MB
    
    ⚡ Upload rápido: El archivo se guarda inmediatamente.
    📊 Extracción/OCR: Se ejecutan en background si se habilitan.
    """
    try:
        content = await file.read()
        
        storage_service = get_documents_storage_service()
        
        document_service = DocumentService(db, storage_service)
        
        document, duplicate_warning = document_service.upload_document(
            company_id=company_id,
            user_id=current_user.id,
            file_content=content,
            filename=file.filename or "sin_nombre",
            mime_type=file.content_type or "application/octet-stream",
            document_type=document_type,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            title=title,
            description=description,
            enable_extraction=enable_extraction,
            enable_ocr=enable_ocr
        )
        
        db.commit()
        
        response = {
            "id": document.id,
            "filename": document.original_filename,
            "file_size": document.file_size,
            "document_type": document.document_type,
            "uploaded_at": document.uploaded_at.isoformat(),
            "is_duplicate": document.is_duplicate
        }
        
        # Incluir advertencia de duplicado si existe
        if duplicate_warning:
            response["warning"] = duplicate_warning
        
        # Cargar datos extraídos si existen (lazy)
        if document.extracted_data_rel:
            response["extracted_data"] = document.extracted_data_rel.extracted_data
        
        return response
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al subir documento: {str(e)}")


@router.get("/{document_id}")
def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene metadatos de un documento"""
    try:
        storage_service = get_documents_storage_service()
        document_service = DocumentService(db, storage_service)
        
        document = document_service.get_document(document_id, current_user.id)
        
        # Obtener tags
        tags = [tag.tag for tag in document.tags]
        
        # Cargar datos extraídos y OCR solo si se solicita (lazy loading)
        extracted_data = None
        ocr_text = None
        ocr_confidence = None
        
        if document.extracted_data_rel:
            extracted_data = document.extracted_data_rel.extracted_data
        
        if document.ocr_data_rel:
            ocr_text = document.ocr_data_rel.ocr_text
            ocr_confidence = float(document.ocr_data_rel.ocr_confidence) if document.ocr_data_rel.ocr_confidence else None
        
        return {
            "id": document.id,
            "original_filename": document.original_filename,
            "document_type": document.document_type,
            "document_category": document.document_category,
            "title": document.title,
            "description": document.description,
            "file_size": document.file_size,
            "mime_type": document.mime_type,
            "related_entity_type": document.related_entity_type,
            "related_entity_id": document.related_entity_id,
            "uploaded_at": document.uploaded_at.isoformat(),
            "uploaded_by": document.uploaded_by,
            "is_duplicate": document.is_duplicate,
            "duplicate_of": document.duplicate_of,
            "extracted_data": extracted_data,  # Desde tabla separada
            "ocr_text": ocr_text,  # Desde tabla separada
            "ocr_confidence": ocr_confidence,  # Desde tabla separada
            "tags": tags
        }
    
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{document_id}/download")
def download_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Descarga un documento - STREAMING OPTIMIZADO.
    
    Usa FileResponse para streaming real desde disco (no carga en RAM).
    """
    try:
        storage_service = get_documents_storage_service()
        document_service = DocumentService(db, storage_service)
        
        document = document_service.get_document(document_id, current_user.id)
        
        # Obtener ruta completa del archivo
        file_path = storage_service.get_full_path(document.file_path)
        
        # Verificar que el archivo existe
        if not file_path.exists():
            raise HTTPException(
                status_code=404, 
                detail=f"Archivo no encontrado: {document.file_path}. Ruta buscada: {file_path}"
            )
        
        # Usar FileResponse para streaming real (no carga en RAM)
        return FileResponse(
            path=str(file_path),
            media_type=document.mime_type,
            filename=document.original_filename,
            headers={
                "Content-Disposition": f'attachment; filename="{document.original_filename}"'
            }
        )
    
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail="Archivo no encontrado en storage")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{document_id}/preview")
def preview_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Vista previa de un documento (para PDFs) - STREAMING OPTIMIZADO.
    
    Usa FileResponse para streaming real desde disco.
    """
    try:
        storage_service = get_documents_storage_service()
        document_service = DocumentService(db, storage_service)
        
        document = document_service.get_document(document_id, current_user.id)
        
        if document.mime_type != 'application/pdf':
            raise HTTPException(status_code=400, detail="Solo se pueden previsualizar PDFs")
        
        # Obtener ruta completa del archivo
        file_path = storage_service.get_full_path(document.file_path)
        
        # Verificar que el archivo existe
        if not file_path.exists():
            raise HTTPException(
                status_code=404, 
                detail=f"Archivo no encontrado: {document.file_path}. Ruta buscada: {file_path}"
            )
        
        # Usar FileResponse para streaming real
        return FileResponse(
            path=str(file_path),
            media_type='application/pdf',
            filename=document.original_filename,
            headers={
                "Content-Disposition": f'inline; filename="{document.original_filename}"'
            }
        )
    
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{document_id}")
def delete_document(
    document_id: int,
    soft_delete: bool = Query(True, description="Soft delete (por defecto)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Elimina un documento"""
    try:
        storage_service = get_documents_storage_service()
        document_service = DocumentService(db, storage_service)
        
        document_service.delete_document(document_id, current_user.id, soft_delete=soft_delete)
        
        return {"message": "Documento eliminado correctamente"}
    
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{document_id}/tags")
def add_tag_to_document(
    document_id: int,
    tag: str = Query(..., description="Tag a agregar"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Agrega un tag a un documento"""
    try:
        storage_service = get_documents_storage_service()
        document_service = DocumentService(db, storage_service)
        
        document_tag = document_service.add_tag(document_id, tag, current_user.id)
        db.commit()
        
        return {"message": "Tag agregado", "tag": document_tag.tag}
    
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{document_id}/tags/{tag}")
def remove_tag_from_document(
    document_id: int,
    tag: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Elimina un tag de un documento"""
    try:
        storage_service = get_documents_storage_service()
        document_service = DocumentService(db, storage_service)
        
        document_service.remove_tag(document_id, tag, current_user.id)
        db.commit()
        
        return {"message": "Tag eliminado"}
    
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Endpoints para integración con compras y ventas

@router.get("/compras/{purchase_id}")
def get_purchase_documents(
    purchase_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene documentos asociados a una compra"""
    try:
        storage_service = get_documents_storage_service()
        document_service = DocumentService(db, storage_service)
        
        # Obtener compra para verificar empresa
        from ...domain.models_ext import Purchase
        purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
        if not purchase:
            raise HTTPException(status_code=404, detail="Compra no encontrada")
        
        documents, total = document_service.search_documents(
            company_id=purchase.company_id,
            related_entity_type="PURCHASE",
            related_entity_id=purchase_id
        )
        
        return {
            "items": [{
                "id": doc.id,
                "original_filename": doc.original_filename,
                "document_type": doc.document_type,
                "uploaded_at": doc.uploaded_at.isoformat()
            } for doc in documents],
            "total": total
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ventas/{sale_id}")
def get_sale_documents(
    sale_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Obtiene documentos asociados a una venta"""
    try:
        storage_service = get_documents_storage_service()
        document_service = DocumentService(db, storage_service)
        
        # Obtener venta para verificar empresa
        from ...domain.models_ext import Sale
        sale = db.query(Sale).filter(Sale.id == sale_id).first()
        if not sale:
            raise HTTPException(status_code=404, detail="Venta no encontrada")
        
        documents, total = document_service.search_documents(
            company_id=sale.company_id,
            related_entity_type="SALE",
            related_entity_id=sale_id
        )
        
        return {
            "items": [{
                "id": doc.id,
                "original_filename": doc.original_filename,
                "document_type": doc.document_type,
                "uploaded_at": doc.uploaded_at.isoformat()
            } for doc in documents],
            "total": total
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

