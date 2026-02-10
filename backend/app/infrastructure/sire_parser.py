"""
Parser de propuestas SIRE
==========================

Convierte las respuestas JSON/XML de SUNAT en estructuras de datos manejables.
"""
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, date
from decimal import Decimal

class SireProposalParser:
    """
    Parser para propuestas SIRE (RVIE y RCE)
    """
    
    @staticmethod
    def parse_rvie_proposal(data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parsea una propuesta RVIE desde la respuesta de SUNAT
        
        Args:
            data: Datos JSON de la propuesta desde SUNAT
        
        Returns:
            Dict estructurado con los datos de la propuesta
        """
        try:
            # Estructura esperada de propuesta RVIE
            proposal = {
                "sunat_proposal_id": data.get("id") or data.get("proposal_id") or data.get("numero"),
                "sunat_correlative": data.get("correlativo") or data.get("correlative"),
                "proposal_date": SireProposalParser._parse_date(data.get("fecha") or data.get("date") or data.get("fechaEmision")),
                "sunat_created_at": SireProposalParser._parse_datetime(data.get("fechaCreacion") or data.get("created_at")),
                
                # Datos del comprobante
                "doc_type": data.get("tipoDocumento") or data.get("doc_type") or data.get("tipoComprobante"),
                "series": data.get("serie") or data.get("series"),
                "number": data.get("numero") or data.get("number") or data.get("numeroComprobante"),
                "issue_date": SireProposalParser._parse_date(data.get("fechaEmision") or data.get("issue_date") or data.get("fecha")),
                
                # Cliente
                "customer_tax_id": data.get("cliente", {}).get("ruc") or data.get("customer", {}).get("tax_id") or data.get("rucCliente"),
                "customer_name": data.get("cliente", {}).get("razonSocial") or data.get("customer", {}).get("name") or data.get("nombreCliente"),
                
                # Montos
                "base_amount": SireProposalParser._parse_decimal(data.get("baseImponible") or data.get("base_amount") or data.get("base")),
                "igv_amount": SireProposalParser._parse_decimal(data.get("igv") or data.get("igv_amount") or data.get("impuesto")),
                "total_amount": SireProposalParser._parse_decimal(data.get("total") or data.get("total_amount") or data.get("importeTotal")),
                
                # Moneda
                "currency": data.get("moneda") or data.get("currency") or "PEN",
                
                # Líneas de detalle (si existen)
                "lines": SireProposalParser._parse_lines(data.get("items") or data.get("lines") or data.get("detalle") or []),
                
                # Estado y metadatos
                "status": data.get("estado") or data.get("status") or "PENDING",
                "observations": data.get("observaciones") or data.get("observations") or [],
                
                # Datos completos originales
                "raw_data": data
            }
            
            return proposal
        except Exception as e:
            raise ValueError(f"Error parseando propuesta RVIE: {str(e)}")
    
    @staticmethod
    def parse_rce_proposal(data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parsea una propuesta RCE desde la respuesta de SUNAT
        
        Args:
            data: Datos JSON de la propuesta desde SUNAT
        
        Returns:
            Dict estructurado con los datos de la propuesta
        """
        try:
            # Estructura esperada de propuesta RCE
            proposal = {
                "sunat_proposal_id": data.get("id") or data.get("proposal_id") or data.get("numero"),
                "sunat_correlative": data.get("correlativo") or data.get("correlative"),
                "proposal_date": SireProposalParser._parse_date(data.get("fecha") or data.get("date") or data.get("fechaEmision")),
                "sunat_created_at": SireProposalParser._parse_datetime(data.get("fechaCreacion") or data.get("created_at")),
                
                # Datos del comprobante
                "doc_type": data.get("tipoDocumento") or data.get("doc_type") or data.get("tipoComprobante"),
                "series": data.get("serie") or data.get("series"),
                "number": data.get("numero") or data.get("number") or data.get("numeroComprobante"),
                "issue_date": SireProposalParser._parse_date(data.get("fechaEmision") or data.get("issue_date") or data.get("fecha")),
                
                # Proveedor
                "supplier_tax_id": data.get("proveedor", {}).get("ruc") or data.get("supplier", {}).get("tax_id") or data.get("rucProveedor"),
                "supplier_name": data.get("proveedor", {}).get("razonSocial") or data.get("supplier", {}).get("name") or data.get("nombreProveedor"),
                
                # Montos
                "base_amount": SireProposalParser._parse_decimal(data.get("baseImponible") or data.get("base_amount") or data.get("base")),
                "igv_amount": SireProposalParser._parse_decimal(data.get("igv") or data.get("igv_amount") or data.get("impuesto")),
                "total_amount": SireProposalParser._parse_decimal(data.get("total") or data.get("total_amount") or data.get("importeTotal")),
                
                # Moneda
                "currency": data.get("moneda") or data.get("currency") or "PEN",
                
                # Líneas de detalle (si existen)
                "lines": SireProposalParser._parse_lines(data.get("items") or data.get("lines") or data.get("detalle") or []),
                
                # Estado y metadatos
                "status": data.get("estado") or data.get("status") or "PENDING",
                "observations": data.get("observaciones") or data.get("observations") or [],
                
                # Datos completos originales
                "raw_data": data
            }
            
            return proposal
        except Exception as e:
            raise ValueError(f"Error parseando propuesta RCE: {str(e)}")
    
    @staticmethod
    def _parse_lines(lines_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Parsea líneas de detalle de una propuesta"""
        parsed_lines = []
        for line in lines_data:
            parsed_line = {
                "description": line.get("descripcion") or line.get("description") or line.get("concepto") or "",
                "quantity": SireProposalParser._parse_decimal(line.get("cantidad") or line.get("quantity") or 1),
                "unit_price": SireProposalParser._parse_decimal(line.get("precioUnitario") or line.get("unit_price") or line.get("precio") or 0),
                "base_amount": SireProposalParser._parse_decimal(line.get("baseImponible") or line.get("base_amount") or line.get("base") or 0),
                "igv_amount": SireProposalParser._parse_decimal(line.get("igv") or line.get("igv_amount") or 0),
                "total_amount": SireProposalParser._parse_decimal(line.get("total") or line.get("total_amount") or 0),
            }
            parsed_lines.append(parsed_line)
        return parsed_lines
    
    @staticmethod
    def _parse_date(date_str: Any) -> Optional[date]:
        """Parsea una fecha desde string"""
        if not date_str:
            return None
        
        if isinstance(date_str, date):
            return date_str
        
        if isinstance(date_str, datetime):
            return date_str.date()
        
        # Intentar parsear diferentes formatos
        date_formats = [
            "%Y-%m-%d",
            "%d/%m/%Y",
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%S.%f",
        ]
        
        for fmt in date_formats:
            try:
                dt = datetime.strptime(str(date_str), fmt)
                return dt.date()
            except ValueError:
                continue
        
        return None
    
    @staticmethod
    def _parse_datetime(datetime_str: Any) -> Optional[datetime]:
        """Parsea un datetime desde string"""
        if not datetime_str:
            return None
        
        if isinstance(datetime_str, datetime):
            return datetime_str
        
        # Intentar parsear diferentes formatos
        datetime_formats = [
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M:%S.%f",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d",
        ]
        
        for fmt in datetime_formats:
            try:
                return datetime.strptime(str(datetime_str), fmt)
            except ValueError:
                continue
        
        return None
    
    @staticmethod
    def _parse_decimal(value: Any) -> Decimal:
        """Parsea un valor decimal"""
        if value is None:
            return Decimal('0')
        
        if isinstance(value, Decimal):
            return value
        
        if isinstance(value, (int, float)):
            return Decimal(str(value))
        
        # Limpiar string (remover comas, espacios, etc.)
        if isinstance(value, str):
            cleaned = value.replace(',', '').strip()
            try:
                return Decimal(cleaned)
            except:
                return Decimal('0')
        
        return Decimal('0')
    
    @staticmethod
    def validate_proposal_structure(data: Dict[str, Any], proposal_type: str = "RVIE") -> Tuple[bool, Optional[str]]:
        """
        Valida la estructura de una propuesta
        
        Args:
            data: Datos de la propuesta
            proposal_type: Tipo de propuesta (RVIE o RCE)
        
        Returns:
            Tuple (es_válido, mensaje_error)
        """
        required_fields = ["id", "fecha"] if proposal_type == "RVIE" else ["id", "fecha"]
        
        for field in required_fields:
            if field not in data:
                return False, f"Campo requerido faltante: {field}"
        
        # Validar formato de fecha
        if "fecha" in data:
            parsed_date = SireProposalParser._parse_date(data["fecha"])
            if not parsed_date:
                return False, "Fecha inválida o en formato incorrecto"
        
        return True, None

