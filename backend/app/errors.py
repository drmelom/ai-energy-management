from __future__ import annotations

import logging
from contextvars import ContextVar

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger(__name__)
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class AppError(Exception):
    def __init__(self, code: str, status_code: int, message: str, details: dict | None = None):
        super().__init__(message)
        self.code, self.status_code, self.message, self.details = code, status_code, message, details or {}


def _payload(code: str, message: str, details: dict | None = None) -> dict:
    return {"error": {"code": code, "message": message, "details": details or {}, "request_id": request_id_var.get()}}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError):
        return JSONResponse(status_code=exc.status_code, content=_payload(exc.code, exc.message, exc.details))

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError):
        return JSONResponse(status_code=422, content=_payload("VALIDATION_ERROR", "Parámetros inválidos.", {"errors": exc.errors()}))

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception):
        log.exception("unhandled request_id=%s", request_id_var.get())
        return JSONResponse(status_code=500, content=_payload("INTERNAL_ERROR", "Error interno."))
