from __future__ import annotations

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from app.api.deps import CurrentUser, clear_session_cookie, current_user, set_session_cookie
from app.core.rate_limit import rate_limit
from app.core.security import csrf_token_for
from app.db.session import get_db
from app.schemas.auth import AuthOut, LoginRequest, RegisterRequest, UserOut
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])
_limit = Depends(rate_limit("auth", "auth_rate_limit"))


def _auth_out(user, token: str) -> AuthOut:
    return AuthOut(user=UserOut.model_validate(user), csrf_token=csrf_token_for(token))


@router.post("/register", response_model=AuthOut, status_code=status.HTTP_201_CREATED, dependencies=[_limit])
def register(body: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    user = auth_service.register_user(db, name=body.name, email=body.email, password=body.password)
    token = auth_service.create_session(db, user)
    set_session_cookie(response, token)
    return _auth_out(user, token)


@router.post("/login", response_model=AuthOut, dependencies=[_limit])
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = auth_service.authenticate(db, email=body.email, password=body.password)
    token = auth_service.create_session(db, user)
    set_session_cookie(response, token)
    return _auth_out(user, token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, cu: CurrentUser = Depends(current_user), db: Session = Depends(get_db)):
    auth_service.revoke_session(db, cu.auth_session)
    clear_session_cookie(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=AuthOut)
def me(cu: CurrentUser = Depends(current_user)):
    return _auth_out(cu.user, cu.token)
