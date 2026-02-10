"""
Configuración global de pytest para tests del Motor de Asientos
"""
import pytest
import sys
from pathlib import Path

# Agregar el directorio raíz al path para imports
root_dir = Path(__file__).parent.parent
sys.path.insert(0, str(root_dir))

