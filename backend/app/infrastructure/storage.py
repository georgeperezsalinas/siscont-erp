"""
Servicios de Almacenamiento de Archivos
Abstracción para almacenamiento local y S3
"""
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional
import os

class FileStorageService(ABC):
    """Interfaz para servicios de almacenamiento"""
    
    @abstractmethod
    def save(self, file_path: str, content: bytes) -> str:
        """Guarda un archivo y retorna la ruta"""
        pass
    
    @abstractmethod
    def get(self, file_path: str) -> bytes:
        """Obtiene el contenido de un archivo"""
        pass
    
    @abstractmethod
    def delete(self, file_path: str) -> bool:
        """Elimina un archivo"""
        pass
    
    @abstractmethod
    def exists(self, file_path: str) -> bool:
        """Verifica si un archivo existe"""
        pass
    
    @abstractmethod
    def generate_path(self, company_id: int, year: int, month: int, filename: str) -> str:
        """Genera ruta de almacenamiento"""
        pass

class LocalFileStorage(FileStorageService):
    """
    Almacenamiento en sistema de archivos local.
    En Docker, esto se monta desde un volumen persistente (siscont_data).
    Los datos persisten fuera del contenedor.
    """
    
    def __init__(self, base_path: str = "/app/data/documents"):
        """
        base_path: Ruta dentro del contenedor
        En Docker, esto se monta desde un volumen persistente (siscont_data)
        Los datos persisten fuera del contenedor
        """
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)
    
    def save(self, file_path: str, content: bytes) -> str:
        """Guarda un archivo en el sistema de archivos"""
        full_path = self.base_path / file_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(full_path, 'wb') as f:
            f.write(content)
        
        # Retornar ruta relativa al base_path
        return str(full_path.relative_to(self.base_path))
    
    def get(self, file_path: str) -> bytes:
        """Obtiene el contenido de un archivo"""
        full_path = self.base_path / file_path
        if not full_path.exists():
            raise FileNotFoundError(f"Archivo no encontrado: {file_path}")
        
        with open(full_path, 'rb') as f:
            return f.read()
    
    def delete(self, file_path: str) -> bool:
        """Elimina un archivo"""
        full_path = self.base_path / file_path
        if full_path.exists():
            full_path.unlink()
            # Intentar eliminar directorio padre si está vacío
            try:
                full_path.parent.rmdir()
            except OSError:
                pass  # Directorio no está vacío o no se puede eliminar
            return True
        return False
    
    def exists(self, file_path: str) -> bool:
        """Verifica si un archivo existe"""
        return (self.base_path / file_path).exists()
    
    def generate_path(self, company_id: int, year: int, month: int, filename: str) -> str:
        """
        Genera ruta de almacenamiento: {company_id}/{year}/{month:02d}/{filename}
        """
        return f"{company_id}/{year}/{month:02d}/{filename}"
    
    def get_full_path(self, file_path: str) -> Path:
        """Obtiene la ruta completa del archivo para FileResponse"""
        return self.base_path / file_path

# Factory para crear instancia de storage según configuración
def get_storage_service(storage_type: str = "local", base_path: Optional[str] = None) -> FileStorageService:
    """
    Factory para crear servicio de almacenamiento.
    
    Args:
        storage_type: "local" o "s3" (futuro)
        base_path: Ruta base para almacenamiento local
    
    Returns:
        Instancia de FileStorageService
    """
    if storage_type == "local":
        if base_path is None:
            # Obtener de variable de entorno o usar default
            base_path = os.getenv("DOCUMENTS_DIR", "/app/data/documents")
        return LocalFileStorage(base_path=base_path)
    elif storage_type == "s3":
        # Futuro: implementar S3Storage
        raise NotImplementedError("S3 storage no implementado aún")
    else:
        raise ValueError(f"Tipo de almacenamiento no soportado: {storage_type}")

