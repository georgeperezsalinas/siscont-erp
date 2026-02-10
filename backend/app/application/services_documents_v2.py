"""
Servicio de Gestión de Documentos - Versión Optimizada
- Upload rápido (sin OCR/extracción síncrona)
- Procesamiento asíncrono
- Deduplicación como advertencia
"""
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime
import hashlib
import uuid
from pathlib import Path

from ..domain.models import User, Company
from ..domain.models_documents_v2 import (
    Document, DocumentTag, DocumentAccessLog, 
    DocumentExtractedData, DocumentOCRData
)
from ..infrastructure.storage import FileStorageService, get_storage_service
from ..infrastructure.extractors import DocumentExtractor
from ..config import settings


class DocumentService:
    """Servicio principal para gestión de documentos - Optimizado"""
    
    def __init__(self, db: Session, storage: Optional[FileStorageService] = None):
        self.db = db
        self.storage = storage or get_storage_service(
            storage_type="local",
            base_path=settings.uploads_dir.replace("/uploads", "/documents") if hasattr(settings, 'uploads_dir') else None
        )
        self.extractor = DocumentExtractor()
    
    def upload_document(
        self,
        company_id: int,
        user_id: int,
        file_content: bytes,
        filename: str,
        mime_type: str,
        document_type: str,
        related_entity_type: Optional[str] = None,
        related_entity_id: Optional[int] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        enable_extraction: bool = False,  # Por defecto NO extraer en upload
        enable_ocr: bool = False  # Por defecto NO hacer OCR en upload
    ) -> Document:
        """
        Sube un documento al sistema - VERSIÓN RÁPIDA.
        
        Proceso optimizado:
        1. Validar archivo
        2. Calcular hash
        3. Verificar duplicados (advertencia, no bloqueo)
        4. Guardar archivo
        5. Crear registro en BD
        6. (Opcional) Iniciar extracción/OCR en background
        
        ⚠️ OCR y extracción NO se ejecutan aquí (síncrono).
        Se pueden iniciar después con process_document_async().
        """
        # 1. Validación
        self._validate_file(file_content, filename, mime_type)
        
        # 2. Calcular hash
        file_hash = hashlib.sha256(file_content).hexdigest()
        
        # 3. Verificar duplicados (ADVERTENCIA, no bloqueo)
        duplicate_warning = None
        duplicate_of = None
        existing = self.db.query(Document).filter(
            Document.file_hash == file_hash,
            Document.company_id == company_id,
            Document.status == 'ACTIVE'
        ).first()
        
        if existing:
            # No bloquear, solo marcar como posible duplicado
            duplicate_of = existing.id
            duplicate_warning = f"Posible duplicado del documento #{existing.id} ({existing.original_filename})"
        
        # 4. Generar nombre único
        file_ext = Path(filename).suffix.lower() or ".bin"
        stored_filename = f"{uuid.uuid4().hex}{file_ext}"
        
        # 5. Determinar ruta de almacenamiento
        now = datetime.now()
        file_path = self.storage.generate_path(
            company_id=company_id,
            year=now.year,
            month=now.month,
            filename=stored_filename
        )
        
        # 6. Guardar archivo (rápido)
        self.storage.save(file_path, file_content)
        
        # 7. Crear registro en BD (sin OCR ni extracción)
        document = Document(
            company_id=company_id,
            original_filename=filename,
            stored_filename=stored_filename,
            file_path=file_path,
            file_size=len(file_content),
            mime_type=mime_type,
            file_hash=file_hash,
            document_type=document_type,
            title=title or filename,
            description=description,
            related_entity_type=related_entity_type,
            related_entity_id=related_entity_id,
            uploaded_by=user_id,
            status='ACTIVE',
            is_duplicate=(duplicate_of is not None),
            duplicate_of=duplicate_of
        )
        
        self.db.add(document)
        self.db.flush()  # Para obtener el ID
        
        # 8. Extracción ligera SOLO si se solicita explícitamente (y es rápido)
        if enable_extraction and mime_type in ['text/xml', 'application/xml']:
            # XML es rápido de parsear, se puede hacer síncrono
            try:
                extracted_data = self.extractor.extract_from_xml(file_content)
                if extracted_data:
                    extracted_data_obj = DocumentExtractedData(
                        document_id=document.id,
                        extracted_data=extracted_data,
                        extraction_method="XML",
                        extraction_success=True
                    )
                    self.db.add(extracted_data_obj)
            except Exception as e:
                # No fallar el upload por error de extracción
                print(f"Error en extracción XML (no crítico): {e}")
        
        # 9. Log de acceso
        self._log_access(document.id, user_id, 'UPLOAD')
        
        self.db.flush()
        
        # 10. Iniciar procesamiento asíncrono (si se solicita)
        if enable_extraction or enable_ocr:
            # En producción, esto sería un job de Celery/Background Tasks
            # Por ahora, lo hacemos en background thread simple
            self._schedule_async_processing(document.id, enable_extraction, enable_ocr)
        
        # Retornar documento y advertencia (si existe)
        return document, duplicate_warning
    
    def process_document_async(
        self,
        document_id: int,
        enable_extraction: bool = True,
        enable_ocr: bool = False
    ) -> Dict[str, Any]:
        """
        Procesa un documento de forma asíncrona (OCR y extracción).
        
        Este método debe ser llamado desde un background task/job.
        """
        document = self.db.query(Document).filter(Document.id == document_id).first()
        if not document:
            raise ValueError("Documento no encontrado")
        
        results = {
            "extraction": None,
            "ocr": None
        }
        
        # Obtener archivo
        file_content = self.storage.get(document.file_path)
        
        # Extracción de datos
        if enable_extraction:
            try:
                extracted_data = None
                extraction_method = None
                
                if document.mime_type == 'application/pdf':
                    extracted_data = self.extractor.extract_from_pdf(file_content)
                    extraction_method = "PDF"
                elif document.mime_type in [
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'application/vnd.ms-excel'
                ]:
                    extracted_data = self.extractor.extract_from_excel(file_content)
                    extraction_method = "EXCEL"
                elif document.mime_type == 'text/plain':
                    extracted_data = self.extractor.extract_from_text(file_content)
                    extraction_method = "TEXT"
                
                if extracted_data:
                    # Crear o actualizar registro de datos extraídos
                    existing = self.db.query(DocumentExtractedData).filter(
                        DocumentExtractedData.document_id == document_id
                    ).first()
                    
                    if existing:
                        existing.extracted_data = extracted_data
                        existing.extraction_method = extraction_method
                        existing.extraction_date = datetime.now()
                        existing.extraction_success = True
                    else:
                        extracted_data_obj = DocumentExtractedData(
                            document_id=document_id,
                            extracted_data=extracted_data,
                            extraction_method=extraction_method,
                            extraction_success=True
                        )
                        self.db.add(extracted_data_obj)
                    
                    results["extraction"] = {"success": True, "data": extracted_data}
            except Exception as e:
                results["extraction"] = {"success": False, "error": str(e)}
        
        # OCR (solo si se solicita explícitamente)
        if enable_ocr and document.mime_type == 'application/pdf':
            try:
                # OCR opcional - solo si está disponible
                try:
                    from ..infrastructure.ocr import OCRService
                    ocr_service = OCRService()
                    ocr_result = ocr_service.extract_text(file_content, document.mime_type)
                except (ImportError, Exception) as e:
                    # OCR no disponible o falló
                    print(f"OCR no disponible o falló: {e}")
                    ocr_result = None
                
                if ocr_result and ocr_result.get('text'):
                    # Crear o actualizar registro de OCR
                    existing_ocr = self.db.query(DocumentOCRData).filter(
                        DocumentOCRData.document_id == document_id
                    ).first()
                    
                    if existing_ocr:
                        existing_ocr.ocr_text = ocr_result['text']
                        existing_ocr.ocr_confidence = ocr_result.get('confidence')
                        existing_ocr.ocr_status = "COMPLETED"
                        existing_ocr.ocr_date = datetime.now()
                    else:
                        ocr_data_obj = DocumentOCRData(
                            document_id=document_id,
                            ocr_text=ocr_result['text'],
                            ocr_confidence=ocr_result.get('confidence'),
                            ocr_engine="TESSERACT",
                            ocr_status="COMPLETED",
                            ocr_date=datetime.now()
                        )
                        self.db.add(ocr_data_obj)
                    
                    results["ocr"] = {"success": True, "confidence": ocr_result.get('confidence')}
                else:
                    # OCR falló o no retornó texto
                    existing_ocr = self.db.query(DocumentOCRData).filter(
                        DocumentOCRData.document_id == document_id
                    ).first()
                    if existing_ocr:
                        existing_ocr.ocr_status = "FAILED"
                    else:
                        ocr_data_obj = DocumentOCRData(
                            document_id=document_id,
                            ocr_status="FAILED"
                        )
                        self.db.add(ocr_data_obj)
                    results["ocr"] = {"success": False, "error": "No se pudo extraer texto"}
            except Exception as e:
                # Marcar OCR como fallido
                existing_ocr = self.db.query(DocumentOCRData).filter(
                    DocumentOCRData.document_id == document_id
                ).first()
                if existing_ocr:
                    existing_ocr.ocr_status = "FAILED"
                else:
                    ocr_data_obj = DocumentOCRData(
                        document_id=document_id,
                        ocr_status="FAILED"
                    )
                    self.db.add(ocr_data_obj)
                
                results["ocr"] = {"success": False, "error": str(e)}
        
        self.db.commit()
        return results
    
    def _schedule_async_processing(self, document_id: int, enable_extraction: bool, enable_ocr: bool):
        """
        Programa procesamiento asíncrono.
        
        En producción: usar Celery o Background Tasks de FastAPI
        Por ahora: thread simple (mejorable)
        """
        import threading
        
        def process():
            try:
                self.process_document_async(document_id, enable_extraction, enable_ocr)
            except Exception as e:
                print(f"Error en procesamiento asíncrono: {e}")
        
        thread = threading.Thread(target=process, daemon=True)
        thread.start()
    
    def get_document(self, document_id: int, user_id: int, include_extracted: bool = False) -> Document:
        """Obtiene un documento con verificación de permisos"""
        document = self.db.query(Document).filter(
            Document.id == document_id,
            Document.status == 'ACTIVE'
        ).first()
        
        if not document:
            raise ValueError("Documento no encontrado")
        
        # Verificar permisos
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("Usuario no encontrado")
        
        if document.company_id not in [c.id for c in user.companies]:
            if not user.is_admin and user.role != "ADMINISTRADOR":
                raise ValueError("No tiene permisos para acceder a este documento")
        
        # Cargar datos extraídos solo si se solicita (lazy loading)
        if include_extracted:
            _ = document.extracted_data_rel  # Trigger lazy load
            _ = document.ocr_data_rel  # Trigger lazy load
        
        self._log_access(document_id, user_id, 'VIEW')
        return document
    
    def search_documents(
        self,
        company_id: int,
        query: Optional[str] = None,
        document_type: Optional[str] = None,
        related_entity_type: Optional[str] = None,
        related_entity_id: Optional[int] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        tags: Optional[List[str]] = None,
        exclude_duplicates: bool = False,  # Filtrar duplicados
        limit: int = 50,
        offset: int = 0
    ) -> tuple[List[Document], int]:
        """
        Búsqueda avanzada usando PostgreSQL Full-Text Search.
        """
        from sqlalchemy import or_, and_, func
        
        q = self.db.query(Document).filter(
            Document.company_id == company_id,
            Document.status == 'ACTIVE'
        )
        
        # Filtrar duplicados si se solicita
        if exclude_duplicates:
            q = q.filter(Document.is_duplicate == False)
        
        if query:
            # Búsqueda full-text en título y descripción (PostgreSQL tsvector)
            # Para SQLite, usar LIKE
            try:
                # Intentar usar PostgreSQL full-text search
                q = q.filter(
                    or_(
                        func.to_tsvector('spanish', Document.title).match(query),
                        Document.title.ilike(f'%{query}%'),
                        Document.description.ilike(f'%{query}%'),
                        Document.original_filename.ilike(f'%{query}%')
                    )
                )
            except:
                # Fallback a LIKE para SQLite
                q = q.filter(
                    or_(
                        Document.title.ilike(f'%{query}%'),
                        Document.description.ilike(f'%{query}%'),
                        Document.original_filename.ilike(f'%{query}%')
                    )
                )
        
        if document_type:
            q = q.filter(Document.document_type == document_type)
        
        if related_entity_type and related_entity_id:
            q = q.filter(
                Document.related_entity_type == related_entity_type,
                Document.related_entity_id == related_entity_id
            )
        
        if date_from:
            q = q.filter(Document.uploaded_at >= date_from)
        
        if date_to:
            q = q.filter(Document.uploaded_at <= date_to)
        
        if tags:
            q = q.join(DocumentTag).filter(DocumentTag.tag.in_(tags))
        
        # Contar total
        total = q.count()
        
        # Aplicar paginación
        documents = q.order_by(Document.uploaded_at.desc()).limit(limit).offset(offset).all()
        
        return documents, total
    
    def delete_document(self, document_id: int, user_id: int, soft_delete: bool = True):
        """Elimina un documento (soft delete por defecto)"""
        document = self.get_document(document_id, user_id)
        
        if soft_delete:
            document.status = 'DELETED'
            document.deleted_at = datetime.now()
        else:
            # Hard delete: eliminar archivo y registros relacionados
            try:
                self.storage.delete(document.file_path)
            except Exception as e:
                print(f"Error eliminando archivo: {e}")
            self.db.delete(document)
        
        self._log_access(document_id, user_id, 'DELETE')
        self.db.commit()
    
    def add_tag(self, document_id: int, tag: str, user_id: int) -> DocumentTag:
        """Agrega un tag a un documento"""
        document = self.get_document(document_id, user_id)
        
        existing = self.db.query(DocumentTag).filter(
            DocumentTag.document_id == document_id,
            DocumentTag.tag == tag.lower()
        ).first()
        
        if existing:
            return existing
        
        document_tag = DocumentTag(
            document_id=document_id,
            tag=tag.lower()
        )
        self.db.add(document_tag)
        self.db.flush()
        
        return document_tag
    
    def remove_tag(self, document_id: int, tag: str, user_id: int):
        """Elimina un tag de un documento"""
        document = self.get_document(document_id, user_id)
        
        document_tag = self.db.query(DocumentTag).filter(
            DocumentTag.document_id == document_id,
            DocumentTag.tag == tag.lower()
        ).first()
        
        if document_tag:
            self.db.delete(document_tag)
            self.db.flush()
    
    def _validate_file(self, content: bytes, filename: str, mime_type: str):
        """Valida archivo antes de subir"""
        max_size = 50 * 1024 * 1024  # 50MB
        if len(content) > max_size:
            raise ValueError(f"Archivo demasiado grande. Máximo: {max_size / 1024 / 1024}MB")
        
        allowed_types = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword',
            'text/plain',
            'text/xml',
            'application/xml'
        ]
        
        if mime_type not in allowed_types:
            raise ValueError(f"Tipo de archivo no permitido: {mime_type}")
        
        ext = Path(filename).suffix.lower()
        allowed_extensions = ['.pdf', '.xlsx', '.xls', '.docx', '.doc', '.txt', '.xml']
        if ext not in allowed_extensions:
            raise ValueError(f"Extensión no permitida: {ext}")
    
    def _log_access(self, document_id: int, user_id: int, action: str):
        """Registra acceso a documento"""
        log = DocumentAccessLog(
            document_id=document_id,
            user_id=user_id,
            action=action
        )
        self.db.add(log)
        self.db.flush()

