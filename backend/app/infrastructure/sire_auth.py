"""
Autenticación OAuth 2.0 para SIRE SUNAT
========================================

Gestiona la autenticación y renovación de tokens OAuth para comunicación con SIRE.
"""
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import httpx
from cryptography.fernet import Fernet
import base64
import hashlib

# Configuración de endpoints SUNAT
# NOTA: No existe ambiente de pruebas separado para SIRE.
# SIRE opera directamente sobre la base de datos real del contribuyente.
# Para pruebas seguras, usar Preliminares y evitar "Generar Registro".

# URL base para servicios SIRE
# Según manual oficial: https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv/
SIRE_BASE_URL = "https://api-sire.sunat.gob.pe/v1/contribuyente/migeigv"

# URL base para autenticación OAuth
# NOTA: El client_id va en el body de la petición, no en el path de la URL
SIRE_TOKEN_BASE_URL = "https://api-seguridad.sunat.gob.pe"

class SireOAuthClient:
    """
    Cliente OAuth 2.0 para autenticación con SIRE SUNAT
    """
    
    def __init__(self, use_preliminary_mode: bool = True):
        """
        Inicializa el cliente OAuth
        
        Args:
            use_preliminary_mode: Si True, trabajará con Preliminares (modo seguro para pruebas).
                                  Si False, permitirá operaciones definitivas.
                                  NOTA: SIRE no tiene ambiente de pruebas separado.
        """
        self.use_preliminary_mode = use_preliminary_mode
        # SIRE siempre usa la misma URL (no hay ambiente de pruebas)
        self.base_url = SIRE_BASE_URL
        # La URL de token se construye dinámicamente con el client_id
        self.token_base_url = SIRE_TOKEN_BASE_URL
        
        # Clave de encriptación para secrets
        # Usar SIRE_ENCRYPTION_KEY si está configurada, sino usar SECRET_KEY de la app
        encryption_key = os.getenv("SIRE_ENCRYPTION_KEY")
        if not encryption_key:
            # Usar SECRET_KEY de la aplicación como fallback para consistencia
            from ..config import settings
            encryption_key = settings.secret_key
        
        # Generar clave Fernet desde string (hash)
        # Esto asegura que siempre se use la misma clave para encriptar/desencriptar
        if isinstance(encryption_key, str):
            key_hash = hashlib.sha256(encryption_key.encode()).digest()
            key_b64 = base64.urlsafe_b64encode(key_hash)
            self.cipher = Fernet(key_b64)
        else:
            # Si ya es bytes, usar directamente
            self.cipher = Fernet(encryption_key)
    
    def get_token_url(self, client_id: str) -> str:
        """
        Construye la URL de token OAuth con el client_id
        
        Args:
            client_id: Client ID de OAuth
        
        Returns:
            URL completa del endpoint de token
        
        Formato según pruebas exitosas:
        https://api-seguridad.sunat.gob.pe/v1/clientessol/{client_id}/oauth2/token/
        """
        # Formato correcto según pruebas: /v1/clientessol/{client_id}/oauth2/token/
        clean_client_id = client_id.strip()
        return f"{self.token_base_url}/v1/clientessol/{clean_client_id}/oauth2/token/"
    
    def encrypt_secret(self, secret: str) -> str:
        """Encripta un secreto para almacenamiento seguro"""
        if not secret:
            return ""
        return self.cipher.encrypt(secret.encode()).decode()
    
    def decrypt_secret(self, encrypted_secret: str) -> str:
        """
        Desencripta un secreto almacenado
        
        Returns:
            Secret desencriptado, o cadena vacía si falla
        """
        if not encrypted_secret:
            return ""
        
        # Si no parece estar encriptado (no tiene el formato de Fernet), retornar directamente
        # Esto permite compatibilidad con valores en texto plano
        if not encrypted_secret.startswith('gAAAAAB'):
            # Puede ser texto plano, retornar directamente
            return encrypted_secret
        
        try:
            return self.cipher.decrypt(encrypted_secret.encode()).decode()
        except Exception as e:
            # Si falla la desencriptación, puede ser que:
            # 1. La clave de encriptación cambió
            # 2. El valor está corrupto
            # 3. El valor no está encriptado pero tiene el prefijo
            print(f"[SIRE Auth] Error al desencriptar: {type(e).__name__}: {str(e)}")
            return ""
    
    async def get_access_token(
        self,
        client_id: str,
        client_secret: str,
        ruc: Optional[str] = None,
        usuario_generador: Optional[str] = None,
        password_generador: Optional[str] = None,
        grant_type: str = "client_credentials"
    ) -> Dict[str, Any]:
        """
        Obtiene token de acceso OAuth 2.0
        
        Args:
            client_id: Client ID de OAuth
            client_secret: Client Secret de OAuth
            ruc: RUC del contribuyente (requerido según manual SUNAT)
            usuario_generador: Usuario del generador (requerido según manual SUNAT)
            password_generador: Password del generador (requerido según manual SUNAT)
            grant_type: Tipo de grant (default: client_credentials)
        
        Returns:
            Dict con access_token, refresh_token, expires_in, etc.
        """
        # Construir URL de token con el client_id en el path
        token_url = self.get_token_url(client_id)
        
        # Log para debugging (remover en producción o usar logger)
        print(f"[SIRE OAuth] Intentando obtener token desde: {token_url}")
        print(f"[SIRE OAuth] Client ID: {client_id[:10] if client_id else 'N/A'}...")  # Solo primeros caracteres por seguridad
        print(f"[SIRE OAuth] RUC: {ruc if ruc else 'N/A'}")
        print(f"[SIRE OAuth] Usuario: {usuario_generador if usuario_generador else 'N/A'}")
        print(f"[SIRE OAuth] Password presente: {'Sí' if password_generador else 'No'}")
        
        # Validar que los parámetros requeridos estén presentes
        if not ruc or not usuario_generador or not password_generador:
            missing = []
            if not ruc: missing.append("RUC")
            if not usuario_generador: missing.append("Usuario")
            if not password_generador: missing.append("Password")
            raise ValueError(f"Faltan parámetros requeridos para autenticación SIRE: {', '.join(missing)}")
        
        # Preparar datos según formato correcto de SUNAT
        # grant_type debe ser "password" (no "client_credentials")
        # username es la concatenación de RUC + usuario_generador
        # password es el password_generador
        # scope es la URL base de la API SIRE
        data = {
            "grant_type": "password",  # Siempre "password" según pruebas
            "scope": "https://api-sire.sunat.gob.pe",  # Scope requerido
            "client_id": client_id,
            "client_secret": client_secret,
        }
        
        # Construir username: RUC + usuario_generador (concatenados sin espacios)
        # Según el ejemplo del usuario: RUC=20607410195, Usuario=42806085 -> username=2060741019542806085
        if ruc and usuario_generador:
            # Limpiar espacios y concatenar
            ruc_clean = ruc.strip()
            usuario_clean = usuario_generador.strip()
            username = f"{ruc_clean}{usuario_clean}"
            data["username"] = username
            print(f"[SIRE OAuth] Username construido: {username} (RUC: {ruc_clean} + Usuario: {usuario_clean})")
        elif usuario_generador:
            # Si no hay RUC, usar solo usuario_generador (no debería pasar según validación)
            data["username"] = usuario_generador.strip()
            print(f"[SIRE OAuth] ADVERTENCIA: Usando solo usuario sin RUC: {usuario_generador}")
        else:
            raise ValueError("RUC y Usuario del generador son requeridos para construir el username")
        
        # Password del generador
        if password_generador:
            data["password"] = password_generador.strip()
            print(f"[SIRE OAuth] Password presente: Sí (longitud: {len(password_generador.strip())} caracteres)")
        else:
            raise ValueError("Password del generador es requerido")
        
        # Log de los datos que se enviarán (sin mostrar password completo)
        print(f"[SIRE OAuth] Datos a enviar:")
        print(f"  - grant_type: {data.get('grant_type')}")
        print(f"  - scope: {data.get('scope')}")
        print(f"  - client_id: {data.get('client_id', '')[:20]}...")
        print(f"  - client_secret: {'Presente' if data.get('client_secret') else 'Faltante'}")
        print(f"  - username: {data.get('username', 'N/A')}")
        print(f"  - password: {'Presente' if data.get('password') else 'Faltante'} (longitud: {len(data.get('password', ''))} caracteres)")
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    token_url,
                    data=data,  # Usar el diccionario data completo que ya tiene todos los campos
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    timeout=30.0
                )
                response.raise_for_status()
                token_data = response.json()
                
                # Log del token obtenido (para debugging)
                access_token = token_data.get("access_token", "")
                token_type = token_data.get("token_type", "")
                expires_in = token_data.get("expires_in", 3600)
                
                print(f"[SIRE OAuth] ✅ Token obtenido exitosamente:")
                print(f"  - Token Type: {token_type}")
                print(f"  - Access Token: {access_token[:50]}...{access_token[-20:] if len(access_token) > 70 else ''}")
                print(f"  - Expires In: {expires_in} segundos")
                
                # Calcular fecha de expiración
                expires_at = datetime.now() + timedelta(seconds=expires_in)
                token_data["expires_at"] = expires_at.isoformat()
                
                print(f"[SIRE OAuth] Token expira en: {expires_at.isoformat()}")
                
                return token_data
            except httpx.HTTPStatusError as e:
                error_text = e.response.text[:1000] if e.response.text else "Sin detalles"
                
                # Log detallado del error
                print(f"[SIRE OAuth] ❌ Error HTTP {e.response.status_code}:")
                print(f"  - URL: {token_url}")
                print(f"  - Respuesta: {error_text}")
                print(f"  - Datos enviados:")
                print(f"    * grant_type: {data.get('grant_type')}")
                print(f"    * scope: {data.get('scope')}")
                print(f"    * client_id: {data.get('client_id', '')[:30]}...")
                print(f"    * username: {data.get('username', 'N/A')}")
                print(f"    * password: {'Presente' if data.get('password') else 'Faltante'}")
                
                if e.response.status_code == 401:
                    raise Exception(
                        f"Error de autenticación OAuth (401): Las credenciales OAuth no son válidas.\n"
                        f"Verifica que:\n"
                        f"1. Las credenciales OAuth (client_id, client_secret) sean correctas\n"
                        f"2. Las credenciales hayan sido obtenidas desde SUNAT Operaciones en Línea\n"
                        f"3. Las credenciales OAuth sean diferentes a usuario/clave SOL\n"
                        f"4. El servicio API SIRE esté habilitado para tu RUC\n"
                        f"5. El username sea correcto (RUC + Usuario): {data.get('username', 'N/A')}\n"
                        f"6. El password del generador sea correcto\n"
                        f"Respuesta del servidor: {error_text}"
                    )
                elif e.response.status_code == 400:
                    # Error 400 puede ser "access_denied" o "invalid_client"
                    raise Exception(
                        f"Error de autenticación OAuth (400): {error_text}\n"
                        f"Verifica que:\n"
                        f"1. El username sea correcto (RUC + Usuario): {data.get('username', 'N/A')}\n"
                        f"2. El password del generador sea correcto\n"
                        f"3. Las credenciales OAuth (client_id, client_secret) sean correctas\n"
                        f"4. El RUC sea: {ruc if ruc else 'N/A'}\n"
                        f"5. El Usuario del generador sea: {usuario_generador if usuario_generador else 'N/A'}\n"
                        f"Respuesta del servidor: {error_text}"
                    )
                elif e.response.status_code == 404:
                    raise Exception(
                        f"Error: URL de token no encontrada (404).\n"
                        f"URL intentada: {token_url}\n"
                        f"Verifica que:\n"
                        f"1. La URL base sea correcta: {self.token_base_url}\n"
                        f"2. El formato de la URL sea: https://api-seguridad.sunat.gob.pe/v1/clientessol/{{client_id}}/oauth2/token/\n"
                        f"3. El Client ID sea correcto: {client_id[:20]}...\n"
                        f"4. Todos los parámetros requeridos (RUC, usuario, password) estén presentes\n"
                        f"Respuesta del servidor: {error_text}"
                    )
                raise Exception(f"Error obteniendo token OAuth: {e.response.status_code} - {error_text}")
            except httpx.ConnectError as e:
                raise Exception(f"Error de conexión con SUNAT: No se pudo conectar a {token_url}. Verifica que la URL sea correcta y que tengas acceso a internet.")
            except httpx.TimeoutException:
                raise Exception(f"Timeout al conectar con SUNAT: {token_url}. El servidor no respondió a tiempo.")
            except Exception as e:
                error_str = str(e)
                if "gob.p" in error_str and "gob.pe" not in error_str:
                    raise Exception(f"Error de conexión OAuth: {str(e)}. URL configurada: {token_url}")
                raise Exception(f"Error de conexión OAuth: {str(e)}")
    
    async def refresh_access_token(
        self,
        refresh_token: str,
        client_id: str,
        client_secret: str
    ) -> Dict[str, Any]:
        """
        Renueva token de acceso usando refresh token
        
        Args:
            refresh_token: Refresh token válido
            client_id: Client ID de OAuth
            client_secret: Client Secret de OAuth
        
        Returns:
            Dict con nuevos tokens
        
        NOTA: Con grant_type="password", SUNAT puede no proporcionar refresh_token.
        En ese caso, se debe obtener un nuevo token usando get_access_token.
        """
        # Construir URL de token con el client_id en el path
        token_url = self.get_token_url(client_id)
        
        async with httpx.AsyncClient() as client:
            try:
                response = await client.post(
                    token_url,
                    data={
                        "grant_type": "refresh_token",
                        "refresh_token": refresh_token,
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "scope": "https://api-sire.sunat.gob.pe",
                    },
                    headers={
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                    timeout=30.0
                )
                response.raise_for_status()
                token_data = response.json()
                
                # Calcular fecha de expiración
                expires_in = token_data.get("expires_in", 3600)
                expires_at = datetime.now() + timedelta(seconds=expires_in)
                token_data["expires_at"] = expires_at.isoformat()
                
                return token_data
            except httpx.HTTPStatusError as e:
                raise Exception(f"Error renovando token OAuth: {e.response.status_code} - {e.response.text}")
            except Exception as e:
                raise Exception(f"Error de conexión al renovar token: {str(e)}")
    
    def is_token_expired(self, expires_at: Optional[datetime]) -> bool:
        """
        Verifica si un token está expirado o próximo a expirar
        
        Args:
            expires_at: Fecha de expiración del token
        
        Returns:
            True si está expirado o próximo a expirar (menos de 5 minutos)
        """
        if not expires_at:
            return True
        
        # Considerar expirado si falta menos de 5 minutos
        buffer = timedelta(minutes=5)
        return datetime.now() + buffer >= expires_at

