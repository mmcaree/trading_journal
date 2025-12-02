import pytest
from app.utils.exceptions import (
    AppException,
    UnauthorizedException,
    ForbiddenException,
    InvalidCredentialsException,
    ValidationException,
    NotFoundException,
    ConflictException,
    BadRequestException,
    InternalServerException,
    ErrorResponse
)


class TestErrorResponse:
    
    def test_error_response_creation(self):
        response = ErrorResponse(
            error="not_found",
            detail="Resource not found",
            status_code=404
        )
        assert response.error == "not_found"
        assert response.detail == "Resource not found"
        assert response.status_code == 404
        assert response.extra is None
    
    def test_error_response_with_extra(self):
        response = ErrorResponse(
            error="validation_error",
            detail="Invalid input",
            status_code=400,
            extra={"field": "email", "reason": "Invalid format"}
        )
        assert response.extra == {"field": "email", "reason": "Invalid format"}


class TestAppException:
    
    def test_app_exception_creation(self):
        exc = BadRequestException(detail="Test error message")
        assert exc.status_code == 400
        assert exc.error == "bad_request"
        assert exc.detail == "Test error message"
        assert exc.extra is None
    
    def test_app_exception_with_extra(self):
        exc = BadRequestException(
            detail="Test message",
            extra={"key": "value"}
        )
        assert exc.extra == {"key": "value"}
    
    def test_app_exception_with_headers(self):
        exc = UnauthorizedException(
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"}
        )
        assert exc.headers == {"WWW-Authenticate": "Bearer"}


class TestAuthExceptions:
    
    def test_unauthorized_exception(self):
        exc = UnauthorizedException()
        assert exc.status_code == 401
        assert exc.error == "unauthorized"
        assert exc.detail == "Authentication required"
    
    def test_unauthorized_with_custom_message(self):
        exc = UnauthorizedException("Token expired")
        assert exc.detail == "Token expired"
    
    def test_unauthorized_with_headers(self):
        exc = UnauthorizedException(
            "Invalid token",
            headers={"WWW-Authenticate": "Bearer realm=\"api\""}
        )
        assert exc.headers == {"WWW-Authenticate": "Bearer realm=\"api\""}
    
    def test_forbidden_exception(self):
        exc = ForbiddenException()
        assert exc.status_code == 403
        assert exc.error == "forbidden"
        assert exc.detail == "Not authorized to perform this action"
    
    def test_forbidden_with_custom_message(self):
        exc = ForbiddenException("Instructor access required")
        assert exc.detail == "Instructor access required"
    
    def test_invalid_credentials_exception(self):
        exc = InvalidCredentialsException()
        assert exc.status_code == 401
        assert exc.error == "invalid_credentials"
        assert exc.detail == "Invalid username or password"
    
    def test_invalid_credentials_custom_message(self):
        exc = InvalidCredentialsException("Account locked")
        assert exc.detail == "Account locked"


class TestValidationExceptions:
    
    def test_validation_exception(self):
        exc = ValidationException()
        assert exc.status_code == 400
        assert exc.error == "validation_error"
        assert exc.detail == "Validation failed"
    
    def test_validation_with_custom_message(self):
        exc = ValidationException("Shares must be greater than 0")
        assert exc.detail == "Shares must be greater than 0"
    
    def test_not_found_exception(self):
        exc = NotFoundException("Position")
        assert exc.status_code == 404
        assert exc.error == "not_found"
        assert exc.detail == "Position not found"
    
    def test_not_found_default(self):
        exc = NotFoundException()
        assert exc.detail == "Resource not found"
    
    def test_not_found_custom_detail(self):
        exc = NotFoundException("ProfilePicture", "No profile picture to delete")
        assert exc.detail == "No profile picture to delete"
    
    def test_conflict_exception(self):
        exc = ConflictException()
        assert exc.status_code == 409
        assert exc.error == "conflict"
        assert exc.detail == "Resource conflict"
    
    def test_conflict_with_custom_message(self):
        exc = ConflictException("Username already exists")
        assert exc.detail == "Username already exists"
    
    def test_bad_request_exception(self):
        exc = BadRequestException()
        assert exc.status_code == 400
        assert exc.error == "bad_request"
        assert exc.detail == "Bad request"
    
    def test_bad_request_with_custom_message(self):
        exc = BadRequestException("Invalid file type")
        assert exc.detail == "Invalid file type"


class TestServerExceptions:
    
    def test_internal_server_exception(self):
        exc = InternalServerException()
        assert exc.status_code == 500
        assert exc.error == "internal_error"
        assert exc.detail == "An unexpected error occurred"
    
    def test_internal_server_with_custom_message(self):
        exc = InternalServerException("Database connection failed")
        assert exc.detail == "Database connection failed"
