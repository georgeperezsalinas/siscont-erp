from enum import Enum

class AccountType(str, Enum):
    ASSET = "A"
    LIABILITY = "P"
    EQUITY = "PN"
    INCOME = "I"
    EXPENSE = "G"
    CONTROL = "C"  # Cuentas de orden (control)

class UserRole(str, Enum):
    ADMINISTRADOR = "ADMINISTRADOR"
    CONTADOR = "CONTADOR"
    OPERADOR = "OPERADOR"
    AUDITOR = "AUDITOR"
    USUARIO_EMPRESA = "USUARIO_EMPRESA"  # Solo Casilla Electrónica - no usa SISCONT contable
