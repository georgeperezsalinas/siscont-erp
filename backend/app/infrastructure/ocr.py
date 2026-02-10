"""
Servicio de OCR (Optical Character Recognition)
Opcional - Solo se usa cuando se solicita explícitamente
"""
from typing import Dict, Any, Optional
import io

try:
    import pytesseract
    from PIL import Image
    import pdf2image
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False


class OCRService:
    """
    Servicio de OCR usando Tesseract.
    
    ⚠️ OCR es costoso en CPU/RAM. Solo usar cuando sea necesario.
    """
    
    def __init__(self):
        if not TESSERACT_AVAILABLE:
            raise ImportError(
                "Tesseract no está disponible. "
                "Instalar: apt-get install tesseract-ocr (Linux) o brew install tesseract (Mac)"
            )
    
    def extract_text(
        self, 
        content: bytes, 
        mime_type: str,
        language: str = 'spa'  # Español
    ) -> Optional[Dict[str, Any]]:
        """
        Extrae texto de un documento usando OCR.
        
        Args:
            content: Contenido del archivo en bytes
            mime_type: Tipo MIME del archivo
            language: Idioma para OCR (default: español)
        
        Returns:
            Dict con:
            - text: Texto extraído
            - confidence: Confianza del OCR (0-100)
        """
        if not TESSERACT_AVAILABLE:
            return None
        
        if mime_type != 'application/pdf':
            # Para otros formatos, convertir a imagen primero
            return None
        
        try:
            # Convertir PDF a imágenes
            images = pdf2image.convert_from_bytes(content)
            
            if not images:
                return None
            
            # Extraer texto de todas las páginas
            all_text = []
            total_confidence = 0
            page_count = 0
            
            for image in images:
                # Ejecutar OCR
                ocr_data = pytesseract.image_to_data(image, lang=language, output_type=pytesseract.Output.DICT)
                
                # Extraer texto y confianza
                text_parts = []
                confidences = []
                
                for i, word in enumerate(ocr_data['text']):
                    if word.strip():
                        text_parts.append(word)
                        conf = ocr_data.get('conf', [0])[i]
                        if conf > 0:  # Ignorar confianza 0 (probablemente espacios)
                            confidences.append(float(conf))
                
                if text_parts:
                    all_text.append(' '.join(text_parts))
                    if confidences:
                        total_confidence += sum(confidences) / len(confidences)
                    page_count += 1
            
            if not all_text:
                return None
            
            # Calcular confianza promedio
            avg_confidence = total_confidence / page_count if page_count > 0 else 0
            
            return {
                'text': '\n\n'.join(all_text),
                'confidence': round(avg_confidence, 2),
                'pages_processed': page_count
            }
        
        except Exception as e:
            print(f"Error en OCR: {e}")
            return None
    
    def is_available(self) -> bool:
        """Verifica si OCR está disponible"""
        return TESSERACT_AVAILABLE

