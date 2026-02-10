"""
Cliente API para comunicación con SIRE SUNAT
============================================

Gestiona todas las operaciones de comunicación con el API de SIRE.
"""
import httpx
from typing import List, Dict, Any, Optional
from datetime import datetime, date
from .sire_auth import SireOAuthClient
from ..domain.models_sire import SireProposalType, SireProposalStatus

class SIREClient:
    """
    Cliente para comunicación con API SIRE de SUNAT
    """
    
    def __init__(
        self,
        company_id: int,
        oauth_client_id: str,
        oauth_client_secret: str,
        access_token: Optional[str] = None,
        refresh_token: Optional[str] = None,
        token_expires_at: Optional[datetime] = None,
        use_preliminary_mode: bool = True,
        ruc: Optional[str] = None,
        usuario_generador: Optional[str] = None,
        password_generador: Optional[str] = None
    ):
        """
        Inicializa el cliente SIRE
        
        Args:
            company_id: ID de la empresa
            oauth_client_id: Client ID de OAuth
            oauth_client_secret: Client Secret de OAuth
            access_token: Token de acceso actual (opcional)
            refresh_token: Refresh token (opcional)
            token_expires_at: Fecha de expiración del token (opcional)
            use_preliminary_mode: Si True, trabajará con Preliminares (modo seguro).
                                  Si False, permitirá operaciones definitivas.
                                  NOTA: SIRE no tiene ambiente de pruebas separado.
            ruc: RUC del contribuyente (requerido según manual SUNAT)
            usuario_generador: Usuario del generador (requerido según manual SUNAT)
            password_generador: Password del generador (requerido según manual SUNAT)
        """
        self.company_id = company_id
        self.oauth_client = SireOAuthClient(use_preliminary_mode=use_preliminary_mode)
        self.base_url = self.oauth_client.base_url
        self.use_preliminary_mode = use_preliminary_mode
        
        # Credenciales OAuth
        self.oauth_client_id = oauth_client_id
        self.oauth_client_secret = oauth_client_secret
        
        # Credenciales del generador (requeridas según manual SUNAT)
        self.ruc = ruc
        self.usuario_generador = usuario_generador
        self.password_generador = password_generador
        
        # Log para debugging (verificar que los valores se están pasando)
        if not ruc or not usuario_generador or not password_generador:
            print(f"[SIRE Client] ADVERTENCIA: Credenciales del generador incompletas:")
            print(f"  - RUC: {'Presente' if ruc else 'FALTANTE'}")
            print(f"  - Usuario: {'Presente' if usuario_generador else 'FALTANTE'}")
            print(f"  - Password: {'Presente' if password_generador else 'FALTANTE'}")
        
        # Tokens
        self.access_token = access_token
        self.refresh_token = refresh_token
        self.token_expires_at = token_expires_at
    
    async def _ensure_valid_token(self) -> str:
        """
        Asegura que tenemos un token válido, renovándolo si es necesario
        
        Returns:
            Token de acceso válido
        """
        # Verificar si el token está expirado
        expires_at_dt = None
        if self.token_expires_at:
            if isinstance(self.token_expires_at, str):
                expires_at_dt = datetime.fromisoformat(self.token_expires_at)
            else:
                expires_at_dt = self.token_expires_at
        
        if not self.access_token or self.oauth_client.is_token_expired(expires_at_dt):
            # Renovar token
            if self.refresh_token:
                try:
                    token_data = await self.oauth_client.refresh_access_token(
                        self.refresh_token,
                        self.oauth_client_id,
                        self.oauth_client_secret
                    )
                except Exception:
                    # Si falla refresh, obtener nuevo token con credenciales del generador
                    token_data = await self.oauth_client.get_access_token(
                        self.oauth_client_id,
                        self.oauth_client_secret,
                        ruc=self.ruc,
                        usuario_generador=self.usuario_generador,
                        password_generador=self.password_generador
                    )
            else:
                # Obtener nuevo token con credenciales del generador
                token_data = await self.oauth_client.get_access_token(
                    self.oauth_client_id,
                    self.oauth_client_secret,
                    ruc=self.ruc,
                    usuario_generador=self.usuario_generador,
                    password_generador=self.password_generador
                )
            
            self.access_token = token_data.get("access_token")
            self.refresh_token = token_data.get("refresh_token") or self.refresh_token
            self.token_expires_at = datetime.fromisoformat(token_data.get("expires_at"))
        
        return self.access_token
    
    async def _make_request(
        self,
        method: str,
        endpoint: str,
        data: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Realiza una petición HTTP al API SIRE
        
        Args:
            method: Método HTTP (GET, POST, PUT, DELETE)
            endpoint: Endpoint relativo (ej: "/sire/v1/rvie/proposals")
            data: Datos para el body (POST/PUT)
            params: Parámetros de query string
        
        Returns:
            Respuesta JSON del API
        """
        token = await self._ensure_valid_token()
        
        url = f"{self.base_url}{endpoint}"
        
        # Log para debugging
        print(f"[SIRE Client] {method} {url}")
        if params:
            print(f"[SIRE Client] Params: {params}")
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                if method == "GET":
                    response = await client.get(url, headers=headers, params=params)
                elif method == "POST":
                    response = await client.post(url, headers=headers, json=data, params=params)
                elif method == "PUT":
                    response = await client.put(url, headers=headers, json=data, params=params)
                elif method == "DELETE":
                    response = await client.delete(url, headers=headers, params=params)
                else:
                    raise ValueError(f"Método HTTP no soportado: {method}")
                
                # Para errores 500, intentar parsear la respuesta JSON si es posible
                if response.status_code == 500:
                    try:
                        error_json = response.json()
                        # Si hay un JSON con información del error, usarlo
                        if isinstance(error_json, dict):
                            error_msg = error_json.get("msg", error_json.get("message", "Error 500 del servidor"))
                            error_code = error_json.get("cod", error_json.get("code", 500))
                            raise Exception(f"Error {error_code}: {error_msg}")
                    except:
                        pass  # Si no se puede parsear como JSON, continuar con el manejo normal
                
                response.raise_for_status()
                
                # Intentar parsear como JSON
                try:
                    return response.json()
                except:
                    # Si no es JSON, retornar el texto
                    return {"raw_response": response.text}
                    
            except httpx.HTTPStatusError as e:
                # Para errores 500, intentar obtener más información
                if e.response.status_code == 500:
                    try:
                        error_json = e.response.json()
                        if isinstance(error_json, dict):
                            error_msg = error_json.get("msg", error_json.get("message", "Error 500 del servidor"))
                            error_code = error_json.get("cod", error_json.get("code", 500))
                            raise Exception(f"Error {error_code}: {error_msg}")
                    except:
                        pass  # Si no se puede parsear, continuar con el manejo normal
                
                error_text = e.response.text[:1000] if e.response.text else "Sin detalles"
                error_msg = (
                    f"Error API SIRE {e.response.status_code}:\n"
                    f"URL: {url}\n"
                    f"Respuesta: {error_text}\n"
                    f"Verifica que:\n"
                    f"1. El endpoint sea correcto según el manual de SUNAT\n"
                    f"2. Los parámetros sean válidos\n"
                    f"3. El token tenga los permisos necesarios"
                )
                print(f"[SIRE Client] Error: {error_msg}")
                raise Exception(error_msg)
            except httpx.ConnectError as e:
                # Error de conexión (URL no existe, DNS, etc.)
                raise Exception(f"Error de conexión con SUNAT: No se pudo conectar a {self.base_url}. Verifica que la URL sea correcta y que tengas acceso a internet.")
            except httpx.TimeoutException:
                raise Exception(f"Timeout al conectar con SUNAT: {self.base_url}. El servidor no respondió a tiempo.")
            except Exception as e:
                error_str = str(e)
                # Si el error menciona una URL truncada, intentar mostrar la URL completa
                if "gob.p" in error_str and "gob.pe" not in error_str:
                    raise Exception(f"Error de conexión con SIRE: {str(e)}. URL base configurada: {self.base_url}")
                raise Exception(f"Error de conexión con SIRE: {str(e)}")
    
    # ===== MÉTODOS GENERALES =====
    
    async def get_periods(self, proposal_type: SireProposalType) -> Dict[str, Any]:
        """
        Obtiene la lista de períodos disponibles en SIRE
        
        Args:
            proposal_type: Tipo de propuesta (RVIE para ventas, RCE para compras)
        
        Returns:
            Dict con lista de períodos disponibles
        
        Nota: 
        - RVIE (ventas) usa código de libro: 140000
        - RCE (compras) usa código de libro: 080000
        """
        # Códigos de libro según tipo de propuesta
        libro_codes = {
            SireProposalType.RVIE: "140000",  # Ventas
            SireProposalType.RCE: "080000"    # Compras
        }
        
        libro_code = libro_codes.get(proposal_type)
        if not libro_code:
            raise ValueError(f"Tipo de propuesta no válido: {proposal_type}")
        
        # Endpoint correcto según documentación SUNAT:
        # GET: /v1/contribuyente/migeigv/libros/rvierce/padron/web/omisos/{codigo_libro}/periodos
        # Para RVIE: /libros/rvierce/padron/web/omisos/140000/periodos
        # Para RCE: /libros/rvierce/padron/web/omisos/080000/periodos
        endpoint = f"/libros/rvierce/padron/web/omisos/{libro_code}/periodos"
        
        print(f"[SIRE Client] Obteniendo períodos desde: {endpoint} (tipo: {proposal_type.value})")
        return await self._make_request("GET", endpoint)
    
    # ===== MÉTODOS PARA RVIE (Registro de Ventas) =====
    
    async def get_rvie_proposal_by_period(self, per_tributario: str) -> Dict[str, Any]:
        """
        Obtiene propuesta RVIE para un período tributario específico
        
        Args:
            per_tributario: Período tributario en formato YYYYMM (ej: "202401")
        
        Returns:
            Dict con datos de la propuesta
        """
        # Endpoint correcto según documentación SUNAT:
        # GET /v1/contribuyente/migeigv/libros/rvie/propuesta/web/{perTributario}
        endpoint = f"/libros/rvie/propuesta/web/{per_tributario}"
        
        print(f"[SIRE Client] Obteniendo propuesta RVIE para período: {per_tributario}")
        return await self._make_request("GET", endpoint)
    
    async def get_rvie_proposals(
        self,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Obtiene propuestas RVIE pendientes (DEPRECADO - usar get_rvie_proposal_by_period)
        
        Este método se mantiene por compatibilidad, pero el flujo correcto es:
        1. Obtener períodos con get_periods()
        2. Para cada período, usar get_rvie_proposal_by_period(per_tributario)
        """
        # Este método está deprecado - usar get_rvie_proposal_by_period en su lugar
        raise NotImplementedError(
            "Este método está deprecado. "
            "Usa get_periods() primero y luego get_rvie_proposal_by_period(per_tributario) para cada período."
        )
    
    async def accept_rvie_proposal(self, proposal_id: str) -> Dict[str, Any]:
        """
        Acepta una propuesta RVIE sin modificaciones
        
        Args:
            proposal_id: ID de la propuesta en SUNAT
        
        Returns:
            Respuesta de SUNAT
        """
        return await self._make_request(
            "POST",
            f"/sire/v1/rvie/proposals/{proposal_id}/accept"
        )
    
    async def complement_rvie_proposal(
        self,
        proposal_id: str,
        additional_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Complementa una propuesta RVIE con datos adicionales
        
        Args:
            proposal_id: ID de la propuesta en SUNAT
            additional_data: Datos adicionales a complementar
        
        Returns:
            Respuesta de SUNAT
        """
        return await self._make_request(
            "POST",
            f"/sire/v1/rvie/proposals/{proposal_id}/complement",
            data=additional_data
        )
    
    async def replace_rvie_proposal(
        self,
        proposal_id: str,
        replacement_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Reemplaza completamente una propuesta RVIE
        
        Args:
            proposal_id: ID de la propuesta en SUNAT
            replacement_data: Datos de reemplazo completos
        
        Returns:
            Respuesta de SUNAT
        """
        return await self._make_request(
            "PUT",
            f"/sire/v1/rvie/proposals/{proposal_id}/replace",
            data=replacement_data
        )
    
    # ===== MÉTODOS PARA RCE (Registro de Compras) =====
    
    async def get_rce_proposal_by_period(self, per_tributario: str) -> Dict[str, Any]:
        """
        Obtiene propuesta RCE para un período tributario específico
        
        Args:
            per_tributario: Período tributario en formato YYYYMM (ej: "202401")
        
        Returns:
            Dict con datos de la propuesta
        """
        # Endpoint correcto según documentación SUNAT:
        # GET /v1/contribuyente/migeigv/libros/rce/propuesta/web/{perTributario}
        endpoint = f"/libros/rce/propuesta/web/{per_tributario}"
        
        print(f"[SIRE Client] Obteniendo propuesta RCE para período: {per_tributario}")
        return await self._make_request("GET", endpoint)
    
    async def get_rce_proposals(
        self,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        status: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Obtiene propuestas RCE pendientes (DEPRECADO - usar get_rce_proposal_by_period)
        
        Este método se mantiene por compatibilidad, pero el flujo correcto es:
        1. Obtener períodos con get_periods()
        2. Para cada período, usar get_rce_proposal_by_period(per_tributario)
        """
        # Este método está deprecado - usar get_rce_proposal_by_period en su lugar
        raise NotImplementedError(
            "Este método está deprecado. "
            "Usa get_periods() primero y luego get_rce_proposal_by_period(per_tributario) para cada período."
        )
    
    async def accept_rce_proposal(self, proposal_id: str) -> Dict[str, Any]:
        """
        Acepta una propuesta RCE sin modificaciones
        
        Args:
            proposal_id: ID de la propuesta en SUNAT
        
        Returns:
            Respuesta de SUNAT
        """
        return await self._make_request(
            "POST",
            f"/sire/v1/rce/proposals/{proposal_id}/accept"
        )
    
    async def complement_rce_proposal(
        self,
        proposal_id: str,
        additional_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Complementa una propuesta RCE con datos adicionales
        
        Args:
            proposal_id: ID de la propuesta en SUNAT
            additional_data: Datos adicionales a complementar
        
        Returns:
            Respuesta de SUNAT
        """
        return await self._make_request(
            "POST",
            f"/sire/v1/rce/proposals/{proposal_id}/complement",
            data=additional_data
        )
    
    async def replace_rce_proposal(
        self,
        proposal_id: str,
        replacement_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Reemplaza completamente una propuesta RCE
        
        Args:
            proposal_id: ID de la propuesta en SUNAT
            replacement_data: Datos de reemplazo completos
        
        Returns:
            Respuesta de SUNAT
        """
        return await self._make_request(
            "PUT",
            f"/sire/v1/rce/proposals/{proposal_id}/replace",
            data=replacement_data
        )
    
    # ===== MÉTODOS PARA PRELIMINARES (Modo Seguro de Pruebas) =====
    
    async def download_proposal(
        self,
        proposal_type: SireProposalType,
        period: str,
        proposal_number: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Descarga una propuesta desde SUNAT (operación de solo lectura, segura)
        
        Args:
            proposal_type: Tipo de propuesta (RVIE o RCE)
            period: Periodo tributario (formato: YYYYMM)
            proposal_number: Número de propuesta (opcional)
        
        Returns:
            Datos de la propuesta
        """
        endpoint = f"/sire/v1/{proposal_type.value.lower()}/proposals/download"
        params = {"period": period}
        if proposal_number:
            params["proposal_number"] = proposal_number
        
        return await self._make_request("GET", endpoint, params=params)
    
    async def replace_proposal_with_preliminary(
        self,
        proposal_type: SireProposalType,
        period: str,
        zip_file_path: str
    ) -> Dict[str, Any]:
        """
        Reemplaza una propuesta con datos de prueba (crea Preliminar)
        
        IMPORTANTE: Esto crea un Preliminar que puede ser borrado o reemplazado.
        NO usar "Generar Registro" hasta estar seguro de los datos.
        
        Args:
            proposal_type: Tipo de propuesta (RVIE o RCE)
            period: Periodo tributario (formato: YYYYMM)
            zip_file_path: Ruta al archivo .zip con los datos
        
        Returns:
            Respuesta con número de ticket
        """
        endpoint = f"/sire/v1/{proposal_type.value.lower()}/proposals/replace"
        token = await self._ensure_valid_token()
        url = f"{self.base_url}{endpoint}"
        headers = {
            "Authorization": f"Bearer {token}",
        }
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            with open(zip_file_path, 'rb') as file:
                files = {'file': ('data.zip', file, 'application/zip')}
                data = {'period': period}
                response = await client.post(
                    url,
                    headers=headers,
                    files=files,
                    data=data
                )
                response.raise_for_status()
                return response.json()
    
    async def check_ticket_status(self, ticket_number: str) -> Dict[str, Any]:
        """
        Consulta el estado de un ticket (para monitorear operaciones)
        
        Args:
            ticket_number: Número de ticket retornado por una operación
        
        Returns:
            Estado del ticket y detalles
        """
        endpoint = f"/sire/v1/tickets/{ticket_number}/status"
        return await self._make_request("GET", endpoint)
    
    async def delete_preliminary(
        self,
        proposal_type: SireProposalType,
        period: str,
        proposal_number: str
    ) -> Dict[str, Any]:
        """
        Elimina un preliminar (solo para limpiar pruebas)
        
        Args:
            proposal_type: Tipo de propuesta (RVIE o RCE)
            period: Periodo tributario (formato: YYYYMM)
            proposal_number: Número de propuesta a eliminar
        
        Returns:
            Respuesta de SUNAT
        """
        endpoint = f"/sire/v1/{proposal_type.value.lower()}/proposals/{proposal_number}/delete"
        params = {"period": period}
        return await self._make_request("DELETE", endpoint, params=params)
    
    # ===== MÉTODOS DE SINCRONIZACIÓN =====
    
    async def sync_proposals(
        self,
        proposal_type: SireProposalType,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None
    ) -> Dict[str, Any]:
        """
        Sincroniza propuestas desde SUNAT (descarga propuestas disponibles)
        
        Args:
            proposal_type: Tipo de propuesta (RVIE o RCE)
            date_from: Fecha desde (opcional)
            date_to: Fecha hasta (opcional)
        
        Returns:
            Resultado de sincronización
        """
        # Usar el método de descarga de propuestas
        # Esto es una operación de solo lectura, segura
        endpoint = f"/sire/v1/{proposal_type.value.lower()}/proposals"
        params = {}
        if date_from:
            params["date_from"] = date_from.isoformat()
        if date_to:
            params["date_to"] = date_to.isoformat()
        
        return await self._make_request("GET", endpoint, params=params)

