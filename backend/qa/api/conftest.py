"""
Fixtures para tests de integración API.
Usa TestClient de FastAPI contra la app real.
Para tests con BD: usar SQLite en memoria o variable DATABASE_URL_TEST.
"""
import os
import pytest
import sys
from pathlib import Path

# Asegurar que el path permita imports de app
root_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(root_dir))

from fastapi.testclient import TestClient

# Import app después de path
from app.main import app


@pytest.fixture(scope="session")
def client():
    """Cliente HTTP para tests de API sin autenticación."""
    return TestClient(app)


@pytest.fixture(scope="session")
def client_auth(client):
    """
    Cliente con token de autenticación.
    Requiere que exista usuario admin en BD (setup inicial o seed).
    Para tests aislados: usar override de dependencies.
    """
    response = client.post("/auth/login", data={
        "username": os.getenv("ADMIN_USER", "admin"),
        "password": os.getenv("ADMIN_PASS", "admin"),
    })
    if response.status_code == 200:
        token = response.json().get("access_token")
        client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest.fixture
def company_id(client_auth):
    """ID de empresa de prueba. Asume que existe al menos una."""
    r = client_auth.get("/companies?page=1&page_size=1")
    if r.status_code == 200 and r.json().get("items"):
        return r.json()["items"][0]["id"]
    return 1  # Fallback
