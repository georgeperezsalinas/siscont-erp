from fastapi import APIRouter

router = APIRouter(prefix="/health", tags=["health"])

@router.get("/ready")
def ready():
    return {"status": "ok"}
