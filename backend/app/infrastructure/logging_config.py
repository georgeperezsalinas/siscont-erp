"""
Configuración de logging para la aplicación
Crea archivos de log por día en la carpeta logs/
"""
import logging
import os
from logging.handlers import RotatingFileHandler
from datetime import datetime
from pathlib import Path

def setup_logging():
    """Configura el sistema de logging con archivos diarios"""
    
    # Crear carpeta logs si no existe
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    
    # Nombre del archivo de log con fecha actual (YYYY-MM-DD)
    today = datetime.now().strftime("%Y-%m-%d")
    log_file = log_dir / f"siscont_{today}.log"
    
    # Formato de los mensajes de log
    log_format = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    date_format = "%Y-%m-%d %H:%M:%S"
    
    # Configurar el logger root
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    
    # Eliminar handlers existentes para evitar duplicados
    root_logger.handlers.clear()
    
    # Handler para archivo con rotación
    # RotatingFileHandler para evitar archivos muy grandes
    # maxBytes=10MB, backupCount=5 (mantiene 5 archivos de backup)
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
        encoding='utf-8'
    )
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(logging.Formatter(log_format, date_format))
    
    # Handler para consola (stdout)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(logging.Formatter(log_format, date_format))
    
    # Agregar handlers al logger root
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    
    # Loggers específicos pueden tener niveles diferentes
    # Logger para la aplicación
    app_logger = logging.getLogger("app")
    app_logger.setLevel(logging.INFO)
    
    # Logger para API
    api_logger = logging.getLogger("app.api")
    api_logger.setLevel(logging.INFO)
    
    # Logger específico para el motor de asientos - asegurar que se escriba
    journal_engine_logger = logging.getLogger("app.application.services_journal_engine")
    journal_engine_logger.setLevel(logging.DEBUG)  # Nivel DEBUG para capturar todo
    journal_engine_logger.propagate = True  # Asegurar que propague al root logger
    journal_engine_logger.addHandler(file_handler)  # Agregar handler directamente
    journal_engine_logger.addHandler(console_handler)  # Agregar handler directamente
    
    # Logger específico para servicios PE - asegurar que se escriba
    services_pe_logger = logging.getLogger("app.application.services_pe")
    services_pe_logger.setLevel(logging.DEBUG)  # Nivel DEBUG para capturar todo
    services_pe_logger.propagate = True  # Asegurar que propague al root logger
    services_pe_logger.addHandler(file_handler)  # Agregar handler directamente
    services_pe_logger.addHandler(console_handler)  # Agregar handler directamente
    
    # Logger para base de datos (SQLAlchemy)
    db_logger = logging.getLogger("sqlalchemy")
    db_logger.setLevel(logging.WARNING)  # Solo warnings y errores de SQL
    
    # Logger para uvicorn (solo errores)
    uvicorn_logger = logging.getLogger("uvicorn")
    uvicorn_logger.setLevel(logging.INFO)
    
    logging.info(f"Sistema de logging configurado. Archivo: {log_file}")
    
    return root_logger

def get_logger(name: str = None):
    """Obtiene un logger con el nombre especificado"""
    if name:
        return logging.getLogger(f"app.{name}")
    return logging.getLogger("app")

