"""
Servicio de Gestión de Documentos
Lógica de negocio para upload, búsqueda, eliminación de documentos
"""
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from datetime import datetime
import hashlib
import uuid
from pathlib import Path

from ..domain.models import User, Company
from ..domain.models_documents import Document, DocumentTag, DocumentAccessLog
from ..infrastructure.storage import FileStorageService, get_storage_service
from ..infrastructure.extractors import DocumentExtractor
from ..config import settings


class DocumentService:
    """Servicio principal para gestión de documentos"""
    
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
        metadata: Optional[Dict[str, Any]] = None
    ) -> Document:
        """
        Sube un documento al sistema.
        
        Proceso:
        1. Validar archivo (tipo, tamaño)
        2. Calcular hash para deduplicación
        3. Generar nombre único
        4. Guardar en storage
        5. Extraer metadatos
        6. Crear registro en BD
        """
        # 1. Validación
        self._validate_file(file_content, filename, mime_type)
        
        # 2. Calcular hash
        file_hash = hashlib.sha256(file_content).hexdigest()
        
        # 3. Verificar duplicados (opcional - comentado para permitir múltiples uploads)
        # existing = self.db.query(Document).filter(
        #     Document.file_hash == file_hash,
        #     Document.company_id == company_id,
        #     Document.status == 'ACTIVE'
        # ).first()
        # if existing:
        #     raise ValueError("Documento duplicado detectado")
        
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
        
        # 6. Guardar archivo
        self.storage.save(file_path, file_content)
        
        # 7. Procesar documento (extracción de metadatos)
        extracted_data = None
        
        if mime_type == 'application/pdf':
            extracted_data = self.extractor.extract_from_pdf(file_content)
        elif mime_type in [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ]:
            extracted_data = self.extractor.extract_from_excel(file_content)
        elif mime_type in ['text/xml', 'application/xml']:
            extracted_data = self.extractor.extract_from_xml(file_content)
        elif mime_type == 'text/plain':
            extracted_data = self.extractor.extract_from_text(file_content)
        
        # 8. Crear registro en BD
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
            metadata=metadata or {},
            extracted_data=extracted_data,
            uploaded_by=user_id,
            status='ACTIVE'
        )
        
        self.db.add(document)
        self.db.flush()
        
        # 9. Log de acceso
        self._log_access(document.id, user_id, 'UPLOAD')
        
        return document
    
    def get_document(self, document_id: int, user_id: int) -> Document:
        """Obtiene un documento con verificación de permisos"""
        document = self.db.query(Document).filter(
            Document.id == document_id,
            Document.status == 'ACTIVE'
        ).first()
        
        if not document:
            raise ValueError("Documento no encontrado")
        
        # Verificar permisos (usuario debe tener acceso a la empresa)
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError("Usuario no encontrado")
        
        # Verificar que el usuario tenga acceso a la empresa
        if document.company_id not in [c.id for c in user.companies]:
            if not user.is_admin and user.role != "ADMINISTRADOR":
                raise ValueError("No tiene permisos para acceder a este documento")
        
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
        limit: int = 50,
        offset: int = 0
    ) -> tuple[List[Document], int]:
        """
        Búsqueda avanzada de documentos.
        
        Retorna: (lista de documentos, total de resultados)
        """
        from sqlalchemy import or_, and_
        
        q = self.db.query(Document).filter(
            Document.company_id == company_id,
            Document.status == 'ACTIVE'
        )
        
        if query:
            # Búsqueda full-text en título, descripción
            search_filter = or_(
                Document.title.ilike(f'%{query}%'),
                Document.description.ilike(f'%{query}%'),
                Document.original_filename.ilike(f'%{query}%')
            )
            q = q.filter(search_filter)
        
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
            # Búsqueda por tags usando JOIN
            q = q.join(DocumentTag).filter(DocumentTag.tag.in_(tags))
        
        # Contar total antes de limitar
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
            # Hard delete: eliminar archivo y registro
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
        
        # Verificar si ya existe
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
        # Validar tamaño (ej: máximo 50MB)
        max_size = 50 * 1024 * 1024  # 50MB
        if len(content) > max_size:
            raise ValueError(f"Archivo demasiado grande. Máximo: {max_size / 1024 / 1024}MB")
        
        # Validar tipo MIME
        allowed_types = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  # XLSX
            'application/vnd.ms-excel',  # XLS
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  # DOCX
            'application/msword',  # DOC
            'text/plain',
            'text/xml',
            'application/xml'
        ]
        
        if mime_type not in allowed_types:
            raise ValueError(f"Tipo de archivo no permitido: {mime_type}")
        
        # Validar extensión
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

