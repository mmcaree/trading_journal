# backend/app/utils/exceptions.py
from fastapi import HTTPException
from typing import Any, Optional
from pydantic import BaseModel


class ErrorResponse(BaseModel):
    error: str
    detail: str
    status_code: int
    extra: Optional[dict] = None


class AppException(HTTPException):
    """Base class for all application exceptions"""
    def __init__(self, status_code: int, error: str, detail: str, extra: Optional[dict] = None):
        super().__init__(status_code=status_code, detail=ErrorResponse(
            error=error,
            detail=detail,
            status_code=status_code,
            extra=extra
        ).dict())


# === Authentication & Authorization ===
class UnauthorizedException(AppException):
    def __init__(self, detail: str = "Authentication required"):
        super().__init__(401, "unauthorized", detail)


class ForbiddenException(AppException):
    def __init__(self, detail: str = "Not authorized to perform this action"):
        super().__init__(403, "forbidden", detail)


class InvalidCredentialsException(AppException):
    def __init__(self, detail: str = "Invalid username or password"):
        super().__init__(401, "invalid_credentials", detail)


# === Validation & Business Logic ===
class ValidationException(AppException):
    def __init__(self, detail: str = "Validation failed"):
        super().__init__(400, "validation_error", detail)


class NotFoundException(AppException):
    def __init__(self, entity: str = "Resource"):
        super().__init__(404, "not_found", f"{entity} not found")


class ConflictException(AppException):
    def __init__(self, detail: str = "Resource conflict"):
        super().__init__(409, "conflict", detail)


class BadRequestException(AppException):
    def __init__(self, detail: str = "Bad request"):
        super().__init__(400, "bad_request", detail)


# === Server Errors ===
class InternalServerException(AppException):
    def __init__(self, detail: str = "An unexpected error occurred"):
        super().__init__(500, "internal_error", detail)