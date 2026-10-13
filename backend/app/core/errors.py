"""One error envelope for the whole API:

    {"error": {"code": "...", "message": "...", "details": [...]}}
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("app.errors")


class AppError(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: Any = None, headers: dict[str, str] | None = None):
        super().__init__(message)
        self.status_code, self.code, self.message, self.details, self.headers = status_code, code, message, details, headers


def bad_request(code: str, message: str, details: Any = None) -> AppError:
    return AppError(400, code, message, details)


def unauthorized(message: str = "Authentication required", code: str = "unauthorized") -> AppError:
    return AppError(401, code, message)


def forbidden(message: str = "Forbidden", code: str = "forbidden") -> AppError:
    return AppError(403, code, message)


def not_found(message: str = "Not found", code: str = "not_found") -> AppError:
    return AppError(404, code, message)


def conflict(code: str, message: str) -> AppError:
    return AppError(409, code, message)


def _body(code: str, message: str, details: Any = None) -> dict[str, Any]:
    err: dict[str, Any] = {"code": code, "message": message}
    if details is not None:
        err["details"] = details
    return {"error": err}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(_body(exc.code, exc.message, exc.details), status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "not_found", 405: "method_not_allowed"}.get(exc.status_code, "http_error")
        return JSONResponse(_body(code, str(exc.detail)), status_code=exc.status_code, headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Never echo `input`/`ctx`: they can contain passwords or other submitted values.
        details = [{"field": ".".join(str(p) for p in e["loc"] if p != "body"), "message": e["msg"]} for e in exc.errors()]
        return JSONResponse(_body("validation_error", "Request validation failed", details), status_code=422)

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(_body("internal_error", "Something went wrong on our side"), status_code=500)
