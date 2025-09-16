from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_current_active_user
from app.db.session import get_db
from app.models.models import User
from app.models.schemas import (
    UserResponse, UserUpdate, ChangePasswordRequest, 
    NotificationSettings, TwoFactorSetup, TwoFactorVerification
)
from app.services.user_service import update_user_profile, change_password, update_notification_settings
from app.services.two_factor_service import two_factor_service

router = APIRouter()

@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_active_user)):
    return current_user

@router.put("/me", response_model=UserResponse)
def update_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try:
        updated_user = update_user_profile(db, current_user.id, user_update)
        return updated_user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.put("/me/password")
def change_user_password(
    password_data: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try:
        change_password(
            db, 
            current_user.id, 
            password_data.current_password, 
            password_data.new_password
        )
        return {"message": "Password changed successfully"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.put("/me/notifications", response_model=UserResponse)
def update_notification_preferences(
    settings: NotificationSettings,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update notification preferences"""
    try:
        updated_user = update_notification_settings(db, current_user.id, settings)
        return updated_user
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/me/2fa/setup", response_model=TwoFactorSetup)
def setup_two_factor_auth(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Set up 2FA for the current user"""
    try:
        secret, qr_code, backup_codes = two_factor_service.setup_2fa(current_user, db)
        return TwoFactorSetup(
            secret=secret,
            qr_code=qr_code,
            backup_codes=backup_codes
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to set up 2FA"
        )

@router.post("/me/2fa/verify")
def verify_two_factor_setup(
    verification: TwoFactorVerification,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Verify and enable 2FA setup"""
    try:
        success = two_factor_service.enable_2fa(current_user, verification.token, db)
        if success:
            return {"message": "2FA enabled successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification token"
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.delete("/me/2fa")
def disable_two_factor_auth(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Disable 2FA for the current user"""
    try:
        two_factor_service.disable_2fa(current_user, db)
        return {"message": "2FA disabled successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to disable 2FA"
        )

@router.post("/me/2fa/backup-codes")
def regenerate_backup_codes(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Regenerate backup codes for 2FA"""
    try:
        backup_codes = two_factor_service.regenerate_backup_codes(current_user, db)
        if backup_codes:
            return {"backup_codes": backup_codes}
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="2FA is not enabled"
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to regenerate backup codes"
        )

@router.get("/me/export")
def export_user_data(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Export all user data"""
    try:
        from app.services.user_service import export_user_data as export_data
        data = export_data(db, current_user.id)
        return data
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to export user data"
        )

@router.delete("/me")
def delete_account(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete user account and all associated data"""
    try:
        from app.services.user_service import delete_user_account
        delete_user_account(db, current_user.id)
        return {"message": "Account deleted successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account"
        )

@router.delete("/me/data")
def clear_all_data(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Clear all user trading data while keeping the account"""
    try:
        from app.services.data_service import clear_all_user_data
        clear_all_user_data(db, current_user.id)
        return {"message": "All trading data cleared successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to clear user data"
        )
