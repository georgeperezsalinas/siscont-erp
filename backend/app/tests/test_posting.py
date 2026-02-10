from fastapi.testclient import TestClient
from ..main import app

def test_health_ready():
    c = TestClient(app)
    r = c.get('/health/ready')
    assert r.status_code == 200
