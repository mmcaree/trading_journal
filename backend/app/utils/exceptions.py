# backend/app/utils/exceptions.py
from fastapi import HTTPException
from typing import Any, Optional, Dict
from pydantic import BaseModel


class ErrorResponse(BaseModel):
    error: str
    detail: str
    status_code: int
    extra: Optional[dict] = None


class AppException(HTTPException):
    status_code: int = 500
    error_code: str = "app_error"
    detail: str = "An error occurred"

    def __init__(
        self,
        detail: Optional[str] = None,
        extra: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
    ):
        self.detail = detail or self.detail
        self.error_code = self.__class__.__name__.replace("Exception", "").lower()
        self.extra = extra
        self.headers = headers or {}
        super().__init__(status_code=self.status_code, detail=self.detail, headers=self.headers)

    def to_response(self) -> Dict[str, Any]:
        return {
            "error": self.error_code,
            "detail": self.detail,
            "status_code": self.status_code,
            "extra": self.extra,
        }


# === Authentication & Authorization ===
class UnauthorizedException(AppException):
    status_code = 401
    detail = "Authentication required"


class ForbiddenException(AppException):
    status_code = 403
    detail = "Not authorized to perform this action"


class InvalidCredentialsException(AppException):
    status_code = 401
    detail = "Invalid username or password"


# === Validation & Business Logic ===
class ValidationException(AppException):
    status_code = 400
    detail = "Validation failed"


class NotFoundException(AppException):
    status_code = 404
    detail = "Resource not found"


class ConflictException(AppException):
    status_code = 409
    detail = "Resource conflict"


class BadRequestException(AppException):
    status_code = 400
    detail = "Bad request"

# === Server Errors ===
class InternalServerException(AppException):
    status_code = 500
    detail = "An unexpected error occurred"