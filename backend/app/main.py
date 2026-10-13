from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import auth, catalog, learning
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.db.seed import seed_catalog
from app.db.session import session_factory

log = logging.getLogger("app")
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


def create_app() -> FastAPI:
    settings = get_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        # Schema comes from Alembic (`alembic upgrade head`); only reference data is seeded here.
        with session_factory()() as db:
            seed_catalog(db, settings.fixtures_dir)
        if settings.llm_provider == "mock":
            log.warning("LLM_PROVIDER=mock: the tutor returns canned development replies, not real AI")
        yield

    app = FastAPI(title="LogicPath API", version="0.1.0", lifespan=lifespan,
                  docs_url=None if settings.is_production else "/api/docs",
                  redoc_url=None, openapi_url=None if settings.is_production else "/api/openapi.json")
    install_error_handlers(app)

    app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=True,
                       allow_methods=["GET", "POST", "PUT", "DELETE"], allow_headers=["Content-Type", "X-CSRF-Token"], max_age=600)

    @app.middleware("http")
    async def origin_check(request: Request, call_next):
        """Browsers always send Origin on cross-site unsafe requests; reject any that isn't our frontend.
        This also covers login/register, which have no CSRF token yet (login CSRF)."""
        if request.method in UNSAFE:
            origin = request.headers.get("origin")
            if origin is not None and origin.rstrip("/") not in settings.allowed_origins:
                return JSONResponse({"error": {"code": "origin_not_allowed", "message": "Cross-origin request rejected"}}, status_code=403)
        return await call_next(request)

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        resp = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Cache-Control", "no-store")  # API responses carry per-user data
        return resp

    api = APIRouter(prefix="/api")
    api.include_router(auth.router)
    api.include_router(catalog.router)
    api.include_router(learning.router)

    @api.get("/health", tags=["meta"])
    def health():
        return {"status": "ok"}

    app.include_router(api)
    return app


app = create_app()
