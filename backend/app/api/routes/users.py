from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
import os
import uuid
import shutil
from pathlib import Path
from PIL import Image

from app.api.deps import get_current_user, get_current_active_user
from app.db.session import get_db
from app.models import User
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


@router.get("/account-balance")
def get_account_balance(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's account balance information"""
    return {
        "current_account_balance": current_user.current_account_balance,
        "initial_account_balance": current_user.initial_account_balance,
        "default_account_size": current_user.default_account_size
    }


@router.put("/account-balance")
def update_account_balance(
    current_balance: float,
    initial_balance: float = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user's account balance"""
    try:
        current_user.current_account_balance = current_balance
        if initial_balance is not None:
            current_user.initial_account_balance = initial_balance
        
        db.commit()
        
        return {
            "message": "Account balance updated successfully",
            "current_account_balance": current_user.current_account_balance,
            "initial_account_balance": current_user.initial_account_balance
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update account balance"
        )


@router.post("/me/profile-picture")
def upload_profile_picture(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Upload and update user's profile picture"""
    try:
        # Validate file type
        allowed_types = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file type. Only JPEG, PNG, and WebP images are allowed."
            )
        
        # Validate file size (max 5MB)
        max_size = 5 * 1024 * 1024  # 5MB
        file_content = file.file.read()
        if len(file_content) > max_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File too large. Maximum size is 5MB."
            )
        
        # Reset file pointer
        file.file.seek(0)
        
        # Create uploads directory if it doesn't exist
        upload_dir = Path("static/uploads")
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        # Generate unique filename
        file_extension = file.filename.split('.')[-1].lower()
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = upload_dir / unique_filename
        
        # Save the uploaded file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Process image - resize to reasonable dimensions and optimize
        try:
            with Image.open(file_path) as img:
                # Convert to RGB if necessary (for PNG with transparency)
                if img.mode in ('RGBA', 'LA', 'P'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                    img = background
                
                # Resize to max 400x400 while maintaining aspect ratio
                img.thumbnail((400, 400), Image.Resampling.LANCZOS)
                
                # Save optimized image
                img.save(file_path, "JPEG", quality=85, optimize=True)
        except Exception as e:
            # If image processing fails, remove the file and raise error
            if file_path.exists():
                file_path.unlink()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid image file or image processing failed."
            )
        
        # Delete old profile picture if it exists
        if current_user.profile_picture_url:
            old_file_path = Path(current_user.profile_picture_url.lstrip('/'))
            if old_file_path.exists():
                try:
                    old_file_path.unlink()
                except:
                    pass  # Ignore errors when deleting old file
        
        # Update user's profile picture URL
        profile_picture_url = f"/static/uploads/{unique_filename}"
        current_user.profile_picture_url = profile_picture_url
        
        db.commit()
        
        return {
            "message": "Profile picture updated successfully",
            "profile_picture_url": profile_picture_url
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        # Clean up uploaded file if there was an error
        if 'file_path' in locals() and file_path.exists():
            try:
                file_path.unlink()
            except:
                pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to upload profile picture"
        )


@router.delete("/me/profile-picture")
def delete_profile_picture(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete user's profile picture"""
    try:
        if not current_user.profile_picture_url:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No profile picture to delete"
            )
        
        # Delete the file
        file_path = Path(current_user.profile_picture_url.lstrip('/'))
        if file_path.exists():
            try:
                file_path.unlink()
            except:
                pass  # Ignore errors when deleting file
        
        # Clear the profile picture URL
        current_user.profile_picture_url = None
        db.commit()
        
        return {"message": "Profile picture deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete profile picture"
        )
