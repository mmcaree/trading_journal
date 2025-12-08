from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
import os
import uuid
import shutil
import logging
from pathlib import Path
from PIL import Image
import cloudinary
import cloudinary.uploader

from app.api.deps import get_current_user, get_current_active_user
from app.db.session import get_db
from app.models import User
from app.models.schemas import (
    UserResponse, UserUpdate, ChangePasswordRequest, 
    NotificationSettings, TwoFactorSetup, TwoFactorVerification,
    AccountValueResponse, AccountValueBreakdown, EquityCurveResponse, StartingBalanceResponse
)
from app.services.user_service import (
    update_user_profile, change_password, update_notification_settings,
    export_user_data, delete_user_account
)
from app.services.data_service import clear_all_user_data, clear_trade_history
from app.services.two_factor_service import two_factor_service
from app.services.risk_calculation_service import recalculate_user_risk_percentages
from app.utils.exceptions import (
    NotFoundException,
    BadRequestException,
    InternalServerException,
    ValidationException
)

from app.services.account_value_service import AccountValueService
from typing import Optional
from datetime import datetime
from app.utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)

router = APIRouter()

# Configure Cloudinary
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET")
)

# Check if Cloudinary is configured
USE_CLOUDINARY = all([
    os.getenv("CLOUDINARY_CLOUD_NAME"),
    os.getenv("CLOUDINARY_API_KEY"),
    os.getenv("CLOUDINARY_API_SECRET")
])

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
        return update_user_profile(db, current_user.id, user_update)
    except ValueError as e:
        raise BadRequestException(str(e))

@router.put("/me/password")
def change_user_password(
    password_data: ChangePasswordRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try:
        change_password(db, current_user.id, password_data.current_password, password_data.new_password)
        return {"message": "Password changed successfully"}
    except ValueError as e:
        raise BadRequestException(str(e))

@router.put("/me/notifications", response_model=UserResponse)
def update_notification_preferences(
    settings: NotificationSettings,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try:
        return update_notification_settings(db, current_user.id, settings)
    except ValueError as e:
        raise BadRequestException(str(e))

@router.post("/me/2fa/setup", response_model=TwoFactorSetup)
def setup_two_factor_auth(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try:
        secret, qr_code, backup_codes = two_factor_service.setup_2fa(current_user, db)
        return TwoFactorSetup(secret=secret, qr_code=qr_code, backup_codes=backup_codes)
    except Exception:
        raise InternalServerException("Failed to set up 2FA")

@router.post("/me/2fa/verify")
def verify_two_factor_setup(
    verification: TwoFactorVerification,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try:
        if two_factor_service.enable_2fa(current_user, verification.token, db):
            return {"message": "2FA enabled successfully"}
        raise BadRequestException("Invalid verification token")
    except Exception as e:
        raise BadRequestException(str(e))

@router.delete("/me/2fa")
def disable_two_factor_auth(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try:
        two_factor_service.disable_2fa(current_user, db)
        return {"message": "2FA disabled successfully"}
    except Exception:
        raise InternalServerException("Failed to disable 2FA")

@router.post("/me/2fa/backup-codes")
def regenerate_backup_codes(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try:
        codes = two_factor_service.regenerate_backup_codes(current_user, db)
        if not codes:
            raise BadRequestException("2FA is not enabled")
        return {"backup_codes": codes}
    except Exception:
        raise InternalServerException("Failed to regenerate backup codes")

@router.get("/me/export")
def export_user_data_route(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try:
        return export_user_data(db, current_user.id)
    except Exception:
        raise InternalServerException("Failed to export user data")

@router.delete("/me")
def delete_account(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try:
        delete_user_account(db, current_user.id)
        return {"message": "Account deleted successfully"}
    except Exception as e:
        import traceback
        print(f"Delete account error: {str(e)}")
        print(traceback.format_exc())
        raise InternalServerException(f"Failed to delete account: {str(e)}")

@router.delete("/me/data")
def clear_all_data(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try:
        clear_all_user_data(db, current_user.id)
        return {"message": "All trading data cleared successfully"}
    except Exception as e:
        import traceback
        print(f"Clear data error: {str(e)}")
        print(traceback.format_exc())
        raise InternalServerException(f"Failed to clear user data: {str(e)}")

@router.delete("/me/trade-history")
def clear_trade_history_endpoint(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Clear only trade history (positions and events) while keeping user settings and deposits/withdrawals"""
    try:
        clear_trade_history(db, current_user.id)
        
        # Invalidate account value cache since positions changed
        account_value_service = AccountValueService(db)
        account_value_service.invalidate_cache(current_user.id)
        
        return {"message": "Trade history cleared successfully. User settings and deposits/withdrawals preserved."}
    except Exception as e:
        import traceback
        print(f"Clear trade history error: {str(e)}")
        print(traceback.format_exc())
        raise InternalServerException(f"Failed to clear trade history: {str(e)}")

@router.get("/account-balance")
def get_account_balance(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return {
        "current_account_balance": current_user.current_account_balance,
        "initial_account_balance": current_user.initial_account_balance
    }

@router.put("/account-balance")
def update_account_balance(
    current_balance: float,
    initial_balance: float = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
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
        raise InternalServerException("Failed to update account balance")

@router.post("/me/profile-picture")
def upload_profile_picture(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try:
        allowed_types = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
        if file.content_type not in allowed_types:
            raise BadRequestException("Invalid file type. Only JPEG, PNG, and WebP images are allowed.")
        
        max_size = 5 * 1024 * 1024
        content = file.file.read()
        if len(content) > max_size:
            raise BadRequestException("File too large. Maximum size is 5MB.")
        
        # Delete old profile picture if it exists
        if current_user.profile_picture_url:
            try:
                if USE_CLOUDINARY and current_user.profile_picture_url.startswith('http'):
                    # Extract public_id from Cloudinary URL
                    # URL format: https://res.cloudinary.com/{cloud_name}/image/upload/{version}/{public_id}.{format}
                    url_parts = current_user.profile_picture_url.split('/')
                    if 'trading_journal_v2' in url_parts:
                        idx = url_parts.index('trading_journal_v2')
                        public_id_with_ext = '/'.join(url_parts[idx:])
                        public_id = public_id_with_ext.rsplit('.', 1)[0]  # Remove extension
                        cloudinary.uploader.destroy(public_id)
                else:
                    # Delete local file
                    old_path = Path(current_user.profile_picture_url.lstrip('/'))
                    old_path.unlink(missing_ok=True)
            except Exception as e:
                # Log but don't fail if old file deletion fails
                print(f"Warning: Failed to delete old profile picture: {e}")
        
        if USE_CLOUDINARY:
            # Upload to Cloudinary
            file.file.seek(0)
            result = cloudinary.uploader.upload(
                file.file,
                folder="trading_journal_v2/profile_pictures",
                resource_type="image",
                public_id=f"user_{current_user.id}_{uuid.uuid4()}",
                transformation=[
                    {"width": 400, "height": 400, "crop": "fill", "gravity": "face"},
                    {"quality": "auto:good"}
                ],
                format="jpg"
            )
            profile_picture_url = result["secure_url"]
        else:
            # Fallback to local storage
            file.file.seek(0)
            upload_dir = Path("static/uploads")
            upload_dir.mkdir(parents=True, exist_ok=True)
            file_extension = file.filename.split('.')[-1].lower()
            unique_filename = f"{uuid.uuid4()}.{file_extension}"
            file_path = upload_dir / unique_filename
            
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
            try:
                with Image.open(file_path) as img:
                    if img.mode in ('RGBA', 'LA', 'P'):
                        background = Image.new('RGB', img.size, (255, 255, 255))
                        if img.mode == 'P':
                            img = img.convert('RGBA')
                        background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                        img = background
                    img.thumbnail((400, 400), Image.Resampling.LANCZOS)
                    img.save(file_path, "JPEG", quality=85, optimize=True)
            except Exception:
                file_path.unlink(missing_ok=True)
                raise BadRequestException("Invalid image file or image processing failed.")
            
            profile_picture_url = f"/static/uploads/{unique_filename}"
        
        current_user.profile_picture_url = profile_picture_url
        db.commit()
        
        return {
            "message": "Profile picture updated successfully",
            "profile_picture_url": current_user.profile_picture_url
        }
    except BadRequestException:
        raise
    except Exception as e:
        db.rollback()
        if 'file_path' in locals() and file_path.exists():
            file_path.unlink(missing_ok=True)
        raise InternalServerException("Failed to upload profile picture")

@router.delete("/me/profile-picture")
def delete_profile_picture(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    try:
        if not current_user.profile_picture_url:
            raise NotFoundException("No profile picture to delete")
        
        # Delete from Cloudinary or local storage
        try:
            if USE_CLOUDINARY and current_user.profile_picture_url.startswith('http'):
                # Extract public_id from Cloudinary URL
                url_parts = current_user.profile_picture_url.split('/')
                if 'trading_journal_v2' in url_parts:
                    idx = url_parts.index('trading_journal_v2')
                    public_id_with_ext = '/'.join(url_parts[idx:])
                    public_id = public_id_with_ext.rsplit('.', 1)[0]  # Remove extension
                    cloudinary.uploader.destroy(public_id)
            else:
                # Delete local file
                file_path = Path(current_user.profile_picture_url.lstrip('/'))
                file_path.unlink(missing_ok=True)
        except Exception as e:
            # Log but don't fail if file deletion fails
            print(f"Warning: Failed to delete profile picture file: {e}")
        
        current_user.profile_picture_url = None
        db.commit()
        return {"message": "Profile picture deleted successfully"}
    except NotFoundException:
        raise
    except Exception:
        db.rollback()
        raise InternalServerException("Failed to delete profile picture")


# ADD NEW ENDPOINTS (don't remove old ones yet)

@router.get("/me/account-value", response_model=AccountValueResponse)
def get_account_value(
    at_date: Optional[datetime] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get account value at specific date (or current)"""
    account_value_service = AccountValueService(db)
    
    target_date = at_date or utc_now()
    value = account_value_service.get_account_value_at_date(
        user_id=current_user.id,
        target_date=target_date
    )
    
    return {
        "account_value": value,
        "as_of_date": target_date.isoformat()
    }


@router.get("/me/account-value/breakdown", response_model=AccountValueBreakdown)
def get_account_value_breakdown(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed breakdown of how account value is calculated"""
    account_value_service = AccountValueService(db)
    return account_value_service.get_account_value_breakdown(current_user.id)


@router.get("/me/equity-curve", response_model=EquityCurveResponse)
def get_equity_curve(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get historical equity curve data for charting"""
    account_value_service = AccountValueService(db)
    return {
        "equity_curve": account_value_service.get_equity_curve(
            user_id=current_user.id,
            start_date=start_date,
            end_date=end_date
        )
    }


@router.put("/me/starting-balance", response_model=StartingBalanceResponse)
def update_starting_balance(
    starting_balance: float,
    starting_date: Optional[datetime] = None,
    background_tasks: BackgroundTasks = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Update user's starting balance and invalidate account value cache.
    Automatically triggers background recalculation of risk percentages for all positions.
    """
    if starting_balance < 0:
        raise HTTPException(status_code=400, detail="Starting balance must be positive")
    
    current_user.initial_account_balance = starting_balance
    
    # Only update starting_balance_date if explicitly provided
    # Don't reset to today if not provided
    if starting_date is not None:
        current_user.starting_balance_date = starting_date
    
    db.commit()
    db.refresh(current_user)
    
    # Invalidate cached account values since starting balance changed
    from app.services.account_value_service import AccountValueService
    account_value_service = AccountValueService(db)
    account_value_service.invalidate_cache(current_user.id)
    
    # Trigger background recalculation of risk percentages for all user positions
    # This ensures stored risk % values reflect the new starting balance
    if background_tasks:
        background_tasks.add_task(
            recalculate_user_risk_percentages,
            db,
            current_user.id
        )
        logger.info(f"Scheduled background risk recalculation for user {current_user.id}")
    
    return {
        "success": True,
        "starting_balance": starting_balance,
        "starting_date": current_user.starting_balance_date.isoformat() if current_user.starting_balance_date else None
    }

from typing import List
from pydantic import BaseModel

class AccountValueRequest(BaseModel):
    dates: List[str]  # ISO date strings

class AccountValueAtDate(BaseModel):
    date: str
    account_value: float

@router.post("/me/account-values", response_model=List[AccountValueAtDate])
def get_account_values_at_dates(
    request: AccountValueRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get account values at multiple dates for frontend risk calculations"""
    from app.services.account_value_service import AccountValueService
    
    account_value_service = AccountValueService(db)
    results = []
    
    for date_str in request.dates:
        try:
            target_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            account_value = account_value_service.get_account_value_at_date(
                current_user.id,
                target_date
            )
            results.append({
                "date": date_str,
                "account_value": account_value
            })
        except Exception as e:
            logger.error(f"Error calculating account value for {date_str}: {e}")
            results.append({
                "date": date_str,
                "account_value": current_user.initial_account_balance or 10000.0
            })
    
    return results