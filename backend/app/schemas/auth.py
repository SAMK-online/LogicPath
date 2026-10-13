from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

MIN_PASSWORD = 10


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=MIN_PASSWORD, max_length=128)
    confirm_password: str = Field(max_length=128)

    model_config = ConfigDict(extra="forbid")  # passwords are never stripped or altered

    @field_validator("name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return v.lower()

    @model_validator(mode="after")
    def _match(self) -> RegisterRequest:
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        return v.lower()


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    email: str
    created_at: datetime


class AuthOut(BaseModel):
    user: UserOut
    csrf_token: str
