"""
Tests de API - Autenticación
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


class TestAuthAPI:
    """Tests de endpoints de autenticación"""

    def test_health_ready(self):
        """GET /health/ready debe retornar 200"""
        r = client.get("/health/ready")
        assert r.status_code == 200
        data = r.json()
        assert "status" in data or "ready" in str(data).lower() or r.status_code == 200

    def test_login_sin_credenciales(self):
        """POST /auth/login sin cuerpo debe retornar 422"""
        r = client.post("/auth/login")
        assert r.status_code == 422

    def test_login_credenciales_vacias(self):
        """POST /auth/login con username vacío debe fallar"""
        r = client.post("/auth/login", data={"username": "", "password": "x"})
        # Puede ser 422 (validación) o 401 (credenciales inválidas)
        assert r.status_code in (401, 422)

    def test_login_credenciales_invalidas(self):
        """POST /auth/login con credenciales incorrectas debe retornar 401"""
        r = client.post("/auth/login", data={
            "username": "usuario_inexistente_xyz",
            "password": "clave_incorrecta"
        })
        assert r.status_code == 401

    def test_me_sin_token(self):
        """GET /auth/me sin token debe retornar 401"""
        r = client.get("/auth/me")
        assert r.status_code == 401

    def test_me_con_token_invalido(self):
        """GET /auth/me con token inválido debe retornar 401"""
        r = client.get("/auth/me", headers={"Authorization": "Bearer token_invalido"})
        assert r.status_code == 401
