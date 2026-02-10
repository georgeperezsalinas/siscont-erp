"""
Endpoints para procesamiento asíncrono de documentos
OCR y extracción de metadatos on-demand
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ...dependencies import get_db
from ...security.auth import get_current_user
from ...domain.models import User
from ...application.services_documents_v2 import DocumentService
from ...infrastructure.storage import get_storage_service

router = APIRouter(prefix="/documents", tags=["documents-processing"])


@router.post("/{document_id}/extract")
def extract_document_data(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Extrae metadatos de un documento de forma asíncrona.
    
    Este endpoint inicia el proceso de extracción en background.
    Retorna inmediatamente con el estado del proceso.
    """
    try:
        storage_service = get_storage_service()
        document_service = DocumentService(db, storage_service)
        
        # Verificar permisos
        document = document_service.get_document(document_id, current_user.id)
        
        # Iniciar extracción en background
        document_service._schedule_async_processing(document_id, enable_extraction=True, enable_ocr=False)
        
        return {
            "message": "Extracción iniciada en background",
            "document_id": document_id,
            "status": "PROCESSING"
        }
    
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{document_id}/ocr")
def run_ocr(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Ejecuta OCR en un documento PDF de forma asíncrona.
    
    ⚠️ OCR es costoso en CPU/RAM. Solo ejecutar cuando sea necesario.
    Este endpoint inicia el proceso en background.
    """
    try:
        storage_service = get_storage_service()
        document_service = DocumentService(db, storage_service)
        
        # Verificar permisos
        document = document_service.get_document(document_id, current_user.id)
        
        if document.mime_type != 'application/pdf':
            raise HTTPException(status_code=400, detail="OCR solo disponible para PDFs")
        
        # Iniciar OCR en background
        document_service._schedule_async_processing(document_id, enable_extraction=False, enable_ocr=True)
        
        return {
            "message": "OCR iniciado en background",
            "document_id": document_id,
            "status": "PROCESSING",
            "warning": "El proceso puede tardar varios minutos dependiendo del tamaño del PDF"
        }
    
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{document_id}/processing-status")
def get_processing_status(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Obtiene el estado del procesamiento (extracción/OCR) de un documento.
    """
    try:
        from ...domain.models_documents_v2 import DocumentExtractedData, DocumentOCRData
        
        storage_service = get_storage_service()
        document_service = DocumentService(db, storage_service)
        
        document = document_service.get_document(document_id, current_user.id)
        
        status = {
            "document_id": document_id,
            "extraction": None,
            "ocr": None
        }
        
        # Estado de extracción
        extracted = db.query(DocumentExtractedData).filter(
            DocumentExtractedData.document_id == document_id
        ).first()
        
        if extracted:
            status["extraction"] = {
                "status": "COMPLETED" if extracted.extraction_success else "FAILED",
                "method": extracted.extraction_method,
                "date": extracted.extraction_date.isoformat() if extracted.extraction_date else None,
                "has_data": extracted.extracted_data is not None
            }
        else:
            status["extraction"] = {"status": "PENDING"}
        
        # Estado de OCR
        ocr_data = db.query(DocumentOCRData).filter(
            DocumentOCRData.document_id == document_id
        ).first()
        
        if ocr_data:
            status["ocr"] = {
                "status": ocr_data.ocr_status,
                "engine": ocr_data.ocr_engine,
                "confidence": float(ocr_data.ocr_confidence) if ocr_data.ocr_confidence else None,
                "date": ocr_data.ocr_date.isoformat() if ocr_data.ocr_date else None,
                "has_text": ocr_data.ocr_text is not None and len(ocr_data.ocr_text) > 0
            }
        else:
            status["ocr"] = {"status": "PENDING"}
        
        return status
    
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

