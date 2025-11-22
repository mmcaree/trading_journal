from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta

from app.core.config import settings
from app.db.session import get_db
from app.models.schemas import Token, UserCreate, UserResponse, PasswordResetRequest, PasswordResetConfirm
from app.services.user_service import (
    authenticate_user, 
    create_user, 
    create_access_token,
    get_user_by_email,
    get_user_by_username,
    generate_password_reset_token,
    reset_password_with_token
)
from app.services.email_service import email_service
from app.utils.exceptions import (
    BadRequestException,
    UnauthorizedException,
    ValidationException
)

router = APIRouter()

@router.post("/register", response_model=UserResponse)
def register(user: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
    # Check if username exists
    if get_user_by_username(db, user.username):
        raise BadRequestException("Username already registered")
    
    # Check if email exists
    if get_user_by_email(db, user.email):
        raise BadRequestException("Email already registered")
    
    # Create the user
    try:
        db_user = create_user(db, user)
        return db_user
    except ValueError as e:
        raise ValidationException(str(e))

@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Login and get access token"""
    # Authenticate the user
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise UnauthorizedException("Incorrect username or password")
    
    # Create access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/forgot-password")
def forgot_password(
    request: PasswordResetRequest,
    db: Session = Depends(get_db)
):
    """Request password reset"""
    # Generate reset token (returns None if email doesn't exist)
    reset_token = generate_password_reset_token(db, request.email)
    
    # Always return success to prevent email enumeration
    # Don't reveal whether the email exists or not
    if reset_token:
        # Get user for name
        user = get_user_by_email(db, request.email)
        user_name = user.display_name or user.first_name or user.username
        
        # Send reset email
        email_service.send_password_reset_email(
            user_email=request.email,
            user_name=user_name,
            reset_token=reset_token
        )
    
    return {"message": "If the email address exists, a password reset link has been sent."}


@router.post("/reset-password")
def reset_password(
    request: PasswordResetConfirm,
    db: Session = Depends(get_db)
):
    """Reset password with token"""
    success = reset_password_with_token(db, request.token, request.new_password)
    
    if not success:
        raise BadRequestException("Invalid or expired reset token")
    
    return {"message": "Password has been reset successfully"}