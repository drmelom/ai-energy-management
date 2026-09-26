from __future__ import annotations

from fastapi import APIRouter, Request

from app.errors import AppError
from app.schemas import LoginIn, LoginOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginOut, summary="Login demo", description="Credenciales por defecto `admin` / `admin` (configurables por entorno). 401 `INVALID_CREDENTIALS`.")
def login(body: LoginIn, request: Request):
    s = request.app.state.settings
    if body.username != s.demo_user or body.password != s.demo_password:
        raise AppError("INVALID_CREDENTIALS", 401, "Usuario o contraseña incorrectos.")
    return LoginOut(token="demo-token", user={"name": "Operador demo", "role": "operator"})
