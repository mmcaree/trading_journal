from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional

from app.core.config import settings
from app.db.session import get_db
from app.models import User
from app.services.user_service import get_user_by_username
from app.utils.exceptions import InvalidCredentialsException, ForbiddenException

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_current_user(
    db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)
) -> User:
    """
    Validate the access token and return the current user
    """
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        username: str = payload.get("sub")
        if not username:
            raise InvalidCredentialsException()
    except JWTError:
        raise InvalidCredentialsException(headers={"WWW-Authenticate": "Bearer"})
    
    user = get_user_by_username(db, username)
    if user is None:
        raise InvalidCredentialsException(headers={"WWW-Authenticate": "Bearer"})
    
    return user

def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    """
    Check if the current user is active
    """
    if not current_user.is_active:
        raise ForbiddenException("Inactive user")
    return current_user
