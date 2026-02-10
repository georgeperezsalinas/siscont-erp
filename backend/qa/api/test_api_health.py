"""
Tests de API - Health y disponibilidad
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


class TestHealthAPI:
    """Tests de endpoints de health"""

    def test_health_ready_returns_200(self):
        """GET /health/ready debe retornar 200"""
        r = client.get("/health/ready")
        assert r.status_code == 200

    def test_health_ready_response_body(self):
        """GET /health/ready debe retornar status ok"""
        r = client.get("/health/ready")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"
