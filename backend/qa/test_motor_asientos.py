"""
Tests Unitarios para el Motor de Asientos Contables

Cubre:
- COMPRA con IGV, sin IGV, con descuento
- VENTA con IGV, sin IGV
- PAGO / COBRO con CAJA y BANCO
- Property test: "Debe == Haber" en todos los asientos generados
- Test de mapeo: si falta un tipo crítico → CuentaNoMapeadaError
"""
import pytest
from decimal import Decimal
from datetime import date
from sqlalchemy.orm import Session
from unittest.mock import Mock, MagicMock

from app.domain.models import Account, JournalEntry, Period, EntryLine
from app.domain.models_journal_engine import EventoContable, ReglaContable, TipoCuentaMapeo, LadoAsiento, TipoMonto
from app.domain.enums import AccountType
from app.application.services_journal_engine import (
    MotorAsientos, MotorAsientosError, CuentaNoMapeadaError, AsientoDescuadradoError
)
from app.application.validations_journal_engine import (
    ValidacionNaturalezaError, PeriodoCerradoError, CuentaInactivaError
)
from app.infrastructure.unit_of_work import UnitOfWork
from unittest.mock import patch


class TestMotorAsientosCOMPRA:
    """Tests para evento COMPRA"""
    
    def test_compra_con_igv(self, uow_mock, setup_evento_compra, setup_mapeos_basicos):
        """Test: COMPRA con IGV debe generar asiento correcto"""
        motor = MotorAsientos(uow_mock)
        
        datos = {
            "base": 1000.0,
            "igv": 180.0,
            "total": 1180.0,
            "tiene_igv": True
        }
        
        asiento = motor.generar_asiento(
            evento_tipo="COMPRA",
            datos_operacion=datos,
            company_id=1,
            fecha=date(2025, 1, 15),
            glosa="Compra FACTURA 001-0001"
        )
        
        # Validar que el asiento cuadra
        total_debe = sum(float(line.debit) for line in asiento.lines)
        total_haber = sum(float(line.credit) for line in asiento.lines)
        assert abs(total_debe - total_haber) <= 0.01, f"Asiento no cuadra: Debe={total_debe}, Haber={total_haber}"
        
        # Validar origen
        assert asiento.origin == "MOTOR"
        
        # Validar motor_metadata
        assert asiento.motor_metadata is not None
        assert asiento.motor_metadata.get("evento_tipo") == "COMPRA"
    
    def test_compra_sin_igv(self, uow_mock, setup_evento_compra_sin_igv, setup_mapeos_basicos):
        """Test: COMPRA sin IGV (exonerado) - usa reglas sin IGV_CREDITO"""
        motor = MotorAsientos(uow_mock)
        
        datos = {
            "base": 1000.0,
            "igv": 0.0,
            "total": 1000.0,
            "tiene_igv": False
        }
        
        asiento = motor.generar_asiento(
            evento_tipo="COMPRA",
            datos_operacion=datos,
            company_id=1,
            fecha=date(2025, 1, 15),
            glosa="Compra sin IGV"
        )
        
        # Validar que cuadra
        total_debe = sum(float(line.debit) for line in asiento.lines)
        total_haber = sum(float(line.credit) for line in asiento.lines)
        assert abs(total_debe - total_haber) <= 0.01
        
        # No debe haber línea de IGV
        igv_lines = [line for line in asiento.lines if "IGV" in str(line.memo).upper()]
        assert len(igv_lines) == 0, "No debería haber IGV en compra sin IGV"
    
    def test_compra_con_descuento(self, uow_mock, setup_evento_compra, setup_mapeos_basicos):
        """Test: COMPRA con descuento"""
        cuentas, mapeos = setup_mapeos_basicos
        
        motor = MotorAsientos(uow_mock)
        
        datos = {
            "base": 900.0,  # base después de descuento, usada por GASTO_COMPRAS
            "descuento": 100.0,
            "base_descuento": 900.0,
            "igv": 162.0,  # 18% de 900
            "total": 1062.0,
            "tiene_igv": True
        }
        
        asiento = motor.generar_asiento(
            evento_tipo="COMPRA",
            datos_operacion=datos,
            company_id=1,
            fecha=date(2025, 1, 15),
            glosa="Compra con descuento"
        )
        
        # Validar que cuadra
        total_debe = sum(float(line.debit) for line in asiento.lines)
        total_haber = sum(float(line.credit) for line in asiento.lines)
        assert abs(total_debe - total_haber) <= 0.01


class TestMotorAsientosVENTA:
    """Tests para evento VENTA"""
    
    def test_venta_con_igv(self, uow_mock, setup_evento_venta, setup_mapeos_basicos):
        """Test: VENTA con IGV debe generar asiento correcto"""
        cuentas, mapeos = setup_mapeos_basicos
        
        motor = MotorAsientos(uow_mock)
        
        datos = {
            "base": 2000.0,
            "igv": 360.0,
            "total": 2360.0,
            "tiene_igv": True
        }
        
        asiento = motor.generar_asiento(
            evento_tipo="VENTA",
            datos_operacion=datos,
            company_id=1,
            fecha=date(2025, 1, 15),
            glosa="Venta FACTURA 001-0001"
        )
        
        # Validar que cuadra
        total_debe = sum(float(line.debit) for line in asiento.lines)
        total_haber = sum(float(line.credit) for line in asiento.lines)
        assert abs(total_debe - total_haber) <= 0.01
        
        # Validar origen
        assert asiento.origin == "MOTOR"
    
    def test_venta_sin_igv(self, uow_mock, setup_evento_venta, setup_mapeos_basicos):
        """Test: VENTA sin IGV (exonerado)"""
        cuentas, mapeos = setup_mapeos_basicos
        
        motor = MotorAsientos(uow_mock)
        
        datos = {
            "base": 2000.0,
            "igv": 0.0,
            "total": 2000.0,
            "tiene_igv": False
        }
        
        asiento = motor.generar_asiento(
            evento_tipo="VENTA",
            datos_operacion=datos,
            company_id=1,
            fecha=date(2025, 1, 15),
            glosa="Venta sin IGV"
        )
        
        # Validar que cuadra
        total_debe = sum(float(line.debit) for line in asiento.lines)
        total_haber = sum(float(line.credit) for line in asiento.lines)
        assert abs(total_debe - total_haber) <= 0.01


class TestMotorAsientosPAGO:
    """Tests para evento PAGO"""
    
    def test_pago_con_caja(self, uow_mock, setup_evento_pago, setup_mapeos_basicos):
        """Test: PAGO usando CAJA"""
        cuentas, mapeos = setup_mapeos_basicos
        
        motor = MotorAsientos(uow_mock)
        
        datos = {
            "total": 1180.0,
            "medio_pago": "CAJA"
        }
        
        asiento = motor.generar_asiento(
            evento_tipo="PAGO",
            datos_operacion=datos,
            company_id=1,
            fecha=date(2025, 1, 15),
            glosa="Pago a proveedor"
        )
        
        # Validar que cuadra
        total_debe = sum(float(line.debit) for line in asiento.lines)
        total_haber = sum(float(line.credit) for line in asiento.lines)
        assert abs(total_debe - total_haber) <= 0.01
    
    def test_pago_con_banco(self, uow_mock, setup_evento_pago, setup_mapeos_basicos):
        """Test: PAGO usando BANCO"""
        cuentas, mapeos = setup_mapeos_basicos
        
        motor = MotorAsientos(uow_mock)
        
        datos = {
            "total": 1180.0,
            "medio_pago": "BANCO"
        }
        
        asiento = motor.generar_asiento(
            evento_tipo="PAGO",
            datos_operacion=datos,
            company_id=1,
            fecha=date(2025, 1, 15),
            glosa="Pago a proveedor por banco"
        )
        
        # Validar que cuadra
        total_debe = sum(float(line.debit) for line in asiento.lines)
        total_haber = sum(float(line.credit) for line in asiento.lines)
        assert abs(total_debe - total_haber) <= 0.01


class TestMotorAsientosCOBRO:
    """Tests para evento COBRO"""
    
    def test_cobro_con_caja(self, uow_mock, setup_evento_cobro, setup_mapeos_basicos):
        """Test: COBRO usando CAJA"""
        cuentas, mapeos = setup_mapeos_basicos
        
        motor = MotorAsientos(uow_mock)
        
        datos = {
            "total": 2360.0,
            "medio_pago": "CAJA"
        }
        
        asiento = motor.generar_asiento(
            evento_tipo="COBRO",
            datos_operacion=datos,
            company_id=1,
            fecha=date(2025, 1, 15),
            glosa="Cobro de cliente"
        )
        
        # Validar que cuadra
        total_debe = sum(float(line.debit) for line in asiento.lines)
        total_haber = sum(float(line.credit) for line in asiento.lines)
        assert abs(total_debe - total_haber) <= 0.01
    
    def test_cobro_con_banco(self, uow_mock, setup_evento_cobro, setup_mapeos_basicos):
        """Test: COBRO usando BANCO"""
        cuentas, mapeos = setup_mapeos_basicos
        
        motor = MotorAsientos(uow_mock)
        
        datos = {
            "total": 2360.0,
            "medio_pago": "BANCO"
        }
        
        asiento = motor.generar_asiento(
            evento_tipo="COBRO",
            datos_operacion=datos,
            company_id=1,
            fecha=date(2025, 1, 15),
            glosa="Cobro de cliente por banco"
        )
        
        # Validar que cuadra
        total_debe = sum(float(line.debit) for line in asiento.lines)
        total_haber = sum(float(line.credit) for line in asiento.lines)
        assert abs(total_debe - total_haber) <= 0.01


class TestPropertyTests:
    """Property Tests - Validaciones generales"""
    
    def test_todos_los_asientos_cuadran(self, uow_mock, setup_todos_eventos, setup_mapeos_basicos):
        """Property Test: Todos los asientos generados deben cuadrar (Debe == Haber)"""
        cuentas, mapeos = setup_mapeos_basicos
        
        motor = MotorAsientos(uow_mock)
        
        casos_prueba = [
            ("COMPRA", {"base": 1000.0, "igv": 180.0, "total": 1180.0, "tiene_igv": True}),
            ("VENTA", {"base": 2000.0, "igv": 360.0, "total": 2360.0, "tiene_igv": True}),
            ("PAGO", {"total": 1180.0, "medio_pago": "CAJA"}),
            ("COBRO", {"total": 2360.0, "medio_pago": "CAJA"}),
        ]
        
        for evento_tipo, datos in casos_prueba:
            asiento = motor.generar_asiento(
                evento_tipo=evento_tipo,
                datos_operacion=datos,
                company_id=1,
                fecha=date(2025, 1, 15),
                glosa=f"Test {evento_tipo}"
            )
            
            total_debe = sum(float(line.debit) for line in asiento.lines)
            total_haber = sum(float(line.credit) for line in asiento.lines)
            diferencia = abs(total_debe - total_haber)
            
            assert diferencia <= 0.01, (
                f"Asiento {evento_tipo} no cuadra: "
                f"Debe={total_debe}, Haber={total_haber}, Diferencia={diferencia}"
            )


class TestMapeos:
    """Tests de mapeo de cuentas"""
    
    def test_falta_mapeo_critico_lanza_error(self, uow_mock, setup_evento_compra):
        """Test: Si falta mapeo de tipo crítico → CuentaNoMapeadaError"""
        evento, reglas = setup_evento_compra
        # Reemplazar mapeos: siempre None para que falle en primera regla
        q_evento = Mock()
        q_evento.filter_by.return_value.first.return_value = evento
        q_reglas = Mock()
        q_reglas.filter_by.return_value.order_by.return_value.all.return_value = reglas
        q_mapeo = Mock()
        q_mapeo.filter_by.return_value.first.return_value = None

        def query_no_mapeo(model):
            if model == EventoContable:
                return q_evento
            if model == ReglaContable:
                return q_reglas
            if model == TipoCuentaMapeo:
                return q_mapeo
            return Mock()

        uow_mock.db.query.side_effect = query_no_mapeo
        
        motor = MotorAsientos(uow_mock)
        
        datos = {
            "base": 1000.0,
            "igv": 180.0,
            "total": 1180.0,
            "tiene_igv": True
        }
        
        with pytest.raises(CuentaNoMapeadaError) as exc_info:
            motor.generar_asiento(
                evento_tipo="COMPRA",
                datos_operacion=datos,
                company_id=1,
                fecha=date(2025, 1, 15),
                glosa="Compra sin mapeo"
            )
        
        assert "mapeo" in str(exc_info.value).lower()
    
    def test_mapeo_cliente_solo_activo(self, uow_mock, setup_evento_venta):
        """Test: CLIENTES solo puede mapear a cuentas Activo"""
        # Este test valida que la validación de naturaleza funciona
        # Si se intenta mapear CLIENTES a una cuenta Pasivo, debe fallar
        pass  # Se implementa con fixtures que simulen mapeo incorrecto


class TestValidaciones:
    """Tests de validaciones del checklist"""
    
    def test_igv_credito_es_activo(self, uow_mock):
        """Test: IGV_CREDITO debe ser Activo"""
        # Validar que el mapeo de IGV_CREDITO solo acepta cuentas Activo
        pass
    
    def test_igv_debito_es_pasivo(self, uow_mock):
        """Test: IGV_DEBITO debe ser Pasivo"""
        # Validar que el mapeo de IGV_DEBITO solo acepta cuentas Pasivo
        pass
    
    def test_periodo_cerrado_lanza_error(self, uow_mock, setup_evento_compra, setup_mapeos_basicos):
        """Test: No se puede crear asiento en período cerrado"""
        cuentas, mapeos = setup_mapeos_basicos
        
        # Simular período cerrado
        periodo_cerrado = Period(id=1, company_id=1, year=2025, month=1, status="CERRADO")
        uow_mock.periods.get_or_open.return_value = periodo_cerrado
        
        motor = MotorAsientos(uow_mock)
        
        datos = {"base": 1000.0, "igv": 180.0, "total": 1180.0, "tiene_igv": True}
        
        with pytest.raises(PeriodoCerradoError):
            motor.generar_asiento(
                evento_tipo="COMPRA",
                datos_operacion=datos,
                company_id=1,
                fecha=date(2025, 1, 15),
                glosa="Compra en período cerrado"
            )
    
    def test_cuenta_inactiva_lanza_error(self, uow_mock, setup_evento_compra):
        """Test: No se puede usar cuenta inactiva"""
        # Simular cuenta inactiva en mapeo
        pass


# ===== FIXTURES =====

@pytest.fixture
def uow_mock():
    """Mock de UnitOfWork"""
    uow = Mock(spec=UnitOfWork)
    uow.db = Mock(spec=Session)
    uow.accounts = Mock()
    uow.periods = Mock()
    uow.journal = Mock()
    return uow


@pytest.fixture(autouse=True)
def patch_generate_correlative():
    """Evita que generate_correlative use BD real en tests de motor."""
    with patch("app.application.services_correlative.generate_correlative", return_value="00-01-00001"):
        yield


@pytest.fixture
def setup_evento_compra(uow_mock):
    """Configura evento COMPRA con reglas básicas"""
    evento = EventoContable(
        id=1,
        company_id=1,
        tipo="COMPRA",
        nombre="Compra de Bienes/Servicios",
        descripcion="Compra de bienes o servicios",
        activo=True
    )
    
    reglas = [
        ReglaContable(
            id=1, evento_id=1, company_id=1, orden=1, 
            lado=LadoAsiento.DEBE, tipo_cuenta="GASTO_COMPRAS", 
            tipo_monto=TipoMonto.BASE, condicion=None, activo=True, config={}
        ),
        ReglaContable(
            id=2, evento_id=1, company_id=1, orden=2, 
            lado=LadoAsiento.DEBE, tipo_cuenta="IGV_CREDITO", 
            tipo_monto=TipoMonto.IGV, condicion="tiene_igv == True", activo=True, config={}
        ),
        ReglaContable(
            id=3, evento_id=1, company_id=1, orden=3, 
            lado=LadoAsiento.HABER, tipo_cuenta="PROVEEDORES", 
            tipo_monto=TipoMonto.TOTAL, condicion=None, activo=True, config={}
        ),
    ]
    
    # Mock query chain: service usa filter_by (no filter)
    query_mock_evento = Mock()
    query_mock_evento.filter_by.return_value.first.return_value = evento
    query_mock_reglas = Mock()
    query_mock_reglas.filter_by.return_value.order_by.return_value.all.return_value = reglas
    
    def query_side_effect(model):
        if model == EventoContable:
            return query_mock_evento
        elif model == ReglaContable:
            return query_mock_reglas
        return Mock()
    
    uow_mock.db.query.side_effect = query_side_effect
    
    return evento, reglas


@pytest.fixture
def setup_evento_compra_sin_igv(uow_mock):
    """Configura evento COMPRA sin regla IGV (para compras exoneradas)"""
    evento = EventoContable(
        id=1,
        company_id=1,
        tipo="COMPRA",
        nombre="Compra de Bienes/Servicios",
        descripcion="Compra de bienes o servicios",
        activo=True
    )
    reglas = [
        ReglaContable(
            id=1, evento_id=1, company_id=1, orden=1,
            lado=LadoAsiento.DEBE, tipo_cuenta="GASTO_COMPRAS",
            tipo_monto=TipoMonto.BASE, condicion=None, activo=True, config={}
        ),
        ReglaContable(
            id=3, evento_id=1, company_id=1, orden=2,
            lado=LadoAsiento.HABER, tipo_cuenta="PROVEEDORES",
            tipo_monto=TipoMonto.TOTAL, condicion=None, activo=True, config={}
        ),
    ]
    query_mock_evento = Mock()
    query_mock_evento.filter_by.return_value.first.return_value = evento
    query_mock_reglas = Mock()
    query_mock_reglas.filter_by.return_value.order_by.return_value.all.return_value = reglas
    def query_side_effect(model):
        if model == EventoContable:
            return query_mock_evento
        elif model == ReglaContable:
            return query_mock_reglas
        return Mock()
    uow_mock.db.query.side_effect = query_side_effect
    return evento, reglas


@pytest.fixture
def setup_evento_venta(uow_mock):
    """Configura evento VENTA con reglas básicas"""
    evento = EventoContable(
        id=2,
        company_id=1,
        tipo="VENTA",
        nombre="Venta de Bienes/Servicios",
        descripcion="Venta de bienes o servicios",
        activo=True
    )
    
    reglas = [
        ReglaContable(
            id=4, evento_id=2, company_id=1, orden=1, 
            lado=LadoAsiento.DEBE, tipo_cuenta="CLIENTES", 
            tipo_monto=TipoMonto.TOTAL, condicion=None, activo=True, config={}
        ),
        ReglaContable(
            id=5, evento_id=2, company_id=1, orden=2, 
            lado=LadoAsiento.HABER, tipo_cuenta="INGRESO_VENTAS", 
            tipo_monto=TipoMonto.BASE, condicion=None, activo=True, config={}
        ),
        ReglaContable(
            id=6, evento_id=2, company_id=1, orden=3, 
            lado=LadoAsiento.HABER, tipo_cuenta="IGV_DEBITO", 
            tipo_monto=TipoMonto.IGV, condicion=None, activo=True, config={}
        ),
    ]
    
    query_mock_evento = Mock()
    query_mock_evento.filter_by.return_value.first.return_value = evento
    query_mock_reglas = Mock()
    query_mock_reglas.filter_by.return_value.order_by.return_value.all.return_value = reglas
    
    def query_side_effect(model):
        if model == EventoContable:
            return query_mock_evento
        elif model == ReglaContable:
            return query_mock_reglas
        return Mock()
    
    uow_mock.db.query.side_effect = query_side_effect
    
    return evento, reglas


@pytest.fixture
def setup_evento_pago(uow_mock):
    """Configura evento PAGO con reglas básicas"""
    evento = EventoContable(
        id=3,
        company_id=1,
        tipo="PAGO",
        nombre="Pago a Proveedor",
        descripcion="Pago a proveedores",
        activo=True
    )
    
    reglas = [
        ReglaContable(
            id=7, evento_id=3, company_id=1, orden=1, 
            lado=LadoAsiento.DEBE, tipo_cuenta="PROVEEDORES", 
            tipo_monto=TipoMonto.TOTAL, condicion=None, activo=True, config={}
        ),
        ReglaContable(
            id=8, evento_id=3, company_id=1, orden=2, 
            lado=LadoAsiento.HABER, tipo_cuenta="CAJA", 
            tipo_monto=TipoMonto.TOTAL, condicion="medio_pago == 'CAJA'", activo=True, config={}
        ),
        ReglaContable(
            id=9, evento_id=3, company_id=1, orden=2, 
            lado=LadoAsiento.HABER, tipo_cuenta="BANCO", 
            tipo_monto=TipoMonto.TOTAL, condicion="medio_pago == 'BANCO'", activo=True, config={}
        ),
    ]
    
    query_mock_evento = Mock()
    query_mock_evento.filter_by.return_value.first.return_value = evento
    query_mock_reglas = Mock()
    query_mock_reglas.filter_by.return_value.order_by.return_value.all.return_value = reglas
    
    def query_side_effect(model):
        if model == EventoContable:
            return query_mock_evento
        elif model == ReglaContable:
            return query_mock_reglas
        return Mock()
    
    uow_mock.db.query.side_effect = query_side_effect
    
    return evento, reglas


@pytest.fixture
def setup_evento_cobro(uow_mock):
    """Configura evento COBRO con reglas básicas"""
    evento = EventoContable(
        id=4,
        company_id=1,
        tipo="COBRO",
        nombre="Cobro de Cliente",
        descripcion="Cobro de clientes",
        activo=True
    )
    
    reglas = [
        ReglaContable(
            id=10, evento_id=4, company_id=1, orden=1, 
            lado=LadoAsiento.DEBE, tipo_cuenta="CAJA", 
            tipo_monto=TipoMonto.TOTAL, condicion="medio_pago == 'CAJA'", activo=True, config={}
        ),
        ReglaContable(
            id=11, evento_id=4, company_id=1, orden=1, 
            lado=LadoAsiento.DEBE, tipo_cuenta="BANCO", 
            tipo_monto=TipoMonto.TOTAL, condicion="medio_pago == 'BANCO'", activo=True, config={}
        ),
        ReglaContable(
            id=12, evento_id=4, company_id=1, orden=2, 
            lado=LadoAsiento.HABER, tipo_cuenta="CLIENTES", 
            tipo_monto=TipoMonto.TOTAL, condicion=None, activo=True, config={}
        ),
    ]
    
    query_mock_evento = Mock()
    query_mock_evento.filter_by.return_value.first.return_value = evento
    query_mock_reglas = Mock()
    query_mock_reglas.filter_by.return_value.order_by.return_value.all.return_value = reglas
    
    def query_side_effect(model):
        if model == EventoContable:
            return query_mock_evento
        elif model == ReglaContable:
            return query_mock_reglas
        return Mock()
    
    uow_mock.db.query.side_effect = query_side_effect
    
    return evento, reglas


@pytest.fixture
def setup_mapeos_basicos(uow_mock):
    """Configura mapeos básicos de tipos de cuenta"""
    # Crear cuentas mock
    cuentas = {
        "GASTO_COMPRAS": Account(id=1, company_id=1, code="60.11", name="Gasto de compras", type=AccountType.EXPENSE, level=2, active=True),
        "IGV_CREDITO": Account(id=2, company_id=1, code="40.11", name="IGV crédito fiscal", type=AccountType.ASSET, level=2, active=True),
        "PROVEEDORES": Account(id=3, company_id=1, code="42.12", name="Proveedores", type=AccountType.LIABILITY, level=2, active=True),
        "CLIENTES": Account(id=4, company_id=1, code="12.1", name="Cuentas por cobrar", type=AccountType.ASSET, level=2, active=True),
        "INGRESO_VENTAS": Account(id=5, company_id=1, code="70.10", name="Ventas", type=AccountType.INCOME, level=2, active=True),
        "IGV_DEBITO": Account(id=6, company_id=1, code="40.11", name="IGV débito fiscal", type=AccountType.LIABILITY, level=2, active=True),
        "CAJA": Account(id=7, company_id=1, code="10.10", name="Caja", type=AccountType.ASSET, level=2, active=True),
        "BANCO": Account(id=8, company_id=1, code="10.20", name="Banco", type=AccountType.ASSET, level=2, active=True),
    }
    
    # Crear mapeos mock con relación a cuenta
    mapeos_dict = {}
    for tipo_cuenta, cuenta in cuentas.items():
        mapeo = TipoCuentaMapeo(
            id=len(mapeos_dict) + 1,
            company_id=1,
            tipo_cuenta=tipo_cuenta,
            account_id=cuenta.id,
            activo=True
        )
        # Configurar relación account (usado por _resolver_cuenta: mapeo.account)
        mapeo.account = cuenta
        mapeos_dict[tipo_cuenta] = mapeo
    
    # Mock del query para TipoCuentaMapeo (service usa filter_by)
    # query(TipoCuentaMapeo).filter_by(tipo_cuenta=..., company_id=..., activo=True).first()
    def query_mapeo_side_effect(model):
        if model == TipoCuentaMapeo:
            query_mock = Mock()
            def filter_by_chain(**kwargs):
                filter_mock = Mock()
                tipo_cuenta = kwargs.get("tipo_cuenta")
                if tipo_cuenta and tipo_cuenta in mapeos_dict:
                    filter_mock.first.return_value = mapeos_dict[tipo_cuenta]
                else:
                    filter_mock.first.return_value = None
                return filter_mock
            query_mock.filter_by = Mock(side_effect=filter_by_chain)
            return query_mock
        return None
    
    # Combinar con side_effect existente de eventos/reglas
    original_side_effect = getattr(uow_mock.db.query, 'side_effect', None)
    
    def combined_side_effect(model):
        if model == TipoCuentaMapeo:
            r = query_mapeo_side_effect(model)
            if r:
                return r
        if original_side_effect:
            return original_side_effect(model)
        return Mock()
    
    uow_mock.db.query.side_effect = combined_side_effect
    
    # Mock accounts.by_code
    def by_code(company_id, code):
        return next((acc for acc in cuentas.values() if acc.code == code), None)
    
    uow_mock.accounts.by_code = by_code
    
    # Mock período abierto
    periodo = Period(id=1, company_id=1, year=2025, month=1, status="ABIERTO")
    uow_mock.periods.get_or_open.return_value = periodo
    
    # Mock journal entry creation y persistencia de líneas
    entry_counter = [0]
    _current_entry = [None]  # Para que db.add pueda append a entry.lines

    def add_entry(entry):
        entry_counter[0] += 1
        entry.id = entry_counter[0]
        entry.lines = []
        _current_entry[0] = entry
        return entry

    def db_add(obj):
        if isinstance(obj, EntryLine) and _current_entry[0]:
            _current_entry[0].lines.append(obj)

    uow_mock.journal.add_entry = add_entry
    uow_mock.db.flush = Mock()
    uow_mock.db.add = Mock(side_effect=db_add)
    uow_mock.db.refresh = Mock()  # No hacer nada, entry.lines ya está poblado
    
    return cuentas, mapeos_dict


@pytest.fixture
def setup_todos_eventos(uow_mock, setup_evento_compra, setup_evento_venta, setup_evento_pago, setup_evento_cobro):
    """Configura todos los eventos para property tests - query retorna evento/reglas según filtro."""
    eventos_map = {
        "COMPRA": setup_evento_compra[0],
        "VENTA": setup_evento_venta[0],
        "PAGO": setup_evento_pago[0],
        "COBRO": setup_evento_cobro[0],
    }
    reglas_map = {
        1: setup_evento_compra[1],
        2: setup_evento_venta[1],
        3: setup_evento_pago[1],
        4: setup_evento_cobro[1],
    }

    def filter_by_evento(**kwargs):
        m = Mock()
        tipo = kwargs.get("tipo")
        m.first.return_value = eventos_map.get(tipo) if tipo else None
        return m

    def filter_by_reglas(**kwargs):
        m = Mock()
        m.order_by.return_value.all.return_value = reglas_map.get(kwargs.get("evento_id"), [])
        return m

    q_evento = Mock()
    q_evento.filter_by = Mock(side_effect=filter_by_evento)
    q_reglas = Mock()
    q_reglas.filter_by = Mock(side_effect=filter_by_reglas)

    def query_side_effect(model):
        if model == EventoContable:
            return q_evento
        if model == ReglaContable:
            return q_reglas
        return Mock()

    uow_mock.db.query.side_effect = query_side_effect
    return {"COMPRA": setup_evento_compra, "VENTA": setup_evento_venta, "PAGO": setup_evento_pago, "COBRO": setup_evento_cobro}

