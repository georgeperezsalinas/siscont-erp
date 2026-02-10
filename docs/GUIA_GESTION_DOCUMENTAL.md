# Guía de Gestión Documental

**Estado:** ✅ Implementado (Backend completo, Frontend en Compras/Ventas)

## Funcionalidades

- ✅ Digitalización y carga (PDF, Excel, Word, TXT, XML)
- ✅ Asociación a compras, ventas, asientos
- ✅ Búsqueda PostgreSQL Full-Text
- ✅ OCR y extracción opcionales (asíncrono, on-demand)

## Arquitectura

- **documents**: Núcleo ligero
- **document_extracted_data**: Datos extraídos (lazy)
- **document_ocr_data**: OCR (lazy)
- Upload rápido (<1s), procesamiento on-demand

## Ajustes Aplicados

- Tabla optimizada en 3 tablas relacionadas
- Upload sin bloqueo (enable_extraction=False, enable_ocr=False por defecto)
- Endpoints: POST /documents/{id}/extract, POST /documents/{id}/ocr
- Deduplicación como advertencia (no bloquea)

## Ubicación

- Backend: `routers/documents.py`, `documents_processing.py`, `services_documents_v2.py`
- Frontend: Componentes DocumentUpload, DocumentList en Compras y Ventas
