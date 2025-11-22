from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext
import secrets

from app.core.config import settings
from app.models import User
from app.models.schemas import UserCreate, UserUpdate, NotificationSettings
from app.utils.datetime_utils import utc_now

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_user(db: Session, user: UserCreate) -> User:
    existing_user = db.query(User).filter(
        (User.username == user.username) | (User.email == user.email)
    ).first()
    
    if existing_user:
        if existing_user.username == user.username:
            raise ValueError("Username already registered")
        else:
            raise ValueError("Email already registered")
    
    # Hash the password
    hashed_password = get_password_hash(user.password)
    
    # Create new user
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        is_active=True,
        created_at=utc_now()
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def update_user_profile(db: Session, user_id: int, user_update: UserUpdate) -> User:
    user = get_user_by_id(db, user_id)
    if not user:
        raise ValueError("User not found")
    
    if user_update.email and user_update.email != user.email:
        existing_user = db.query(User).filter(
            User.email == user_update.email,
            User.id != user_id
        ).first()
        if existing_user:
            raise ValueError("Email already in use")
    
    update_data = user_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)
    
    user.updated_at = utc_now()
    db.commit()
    db.refresh(user)
    return user


def update_notification_settings(db: Session, user_id: int, settings: NotificationSettings) -> User:
    """Update user notification preferences"""
    user = get_user_by_id(db, user_id)
    if not user:
        raise ValueError("User not found")
    
    # Validate time format if provided
    if settings.daily_email_time and not _is_valid_time_format(settings.daily_email_time):
        raise ValueError("Invalid daily email time format. Use HH:MM")
    
    if settings.weekly_email_time and not _is_valid_time_format(settings.weekly_email_time):
        raise ValueError("Invalid weekly email time format. Use HH:MM")
    
    # Update notification settings
    user.email_notifications_enabled = settings.email_notifications_enabled
    user.daily_email_enabled = settings.daily_email_enabled
    user.daily_email_time = settings.daily_email_time
    user.weekly_email_enabled = settings.weekly_email_enabled
    user.weekly_email_time = settings.weekly_email_time
    
    user.updated_at = utc_now()
    db.commit()
    db.refresh(user)
    return user


def _is_valid_time_format(time_str: str) -> bool:
    """Validate time format HH:MM"""
    try:
        datetime.strptime(time_str, "%H:%M")
        return True
    except ValueError:
        return False


def change_password(db: Session, user_id: int, current_password: str, new_password: str) -> bool:
    """Change user password"""
    user = get_user_by_id(db, user_id)
    if not user:
        raise ValueError("User not found")
    
    # Verify current password
    if not verify_password(current_password, user.hashed_password):
        raise ValueError("Current password is incorrect")
    
    # Update password
    user.hashed_password = get_password_hash(new_password)
    user.updated_at = utc_now()
    db.commit()
    return True


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    """Authenticate a user"""
    user = get_user_by_username(db, username)
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user


def get_user_by_username(db: Session, username: str) -> Optional[User]:
    """Get user by username"""
    return db.query(User).filter(User.username == username).first()


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get user by email"""
    return db.query(User).filter(User.email == email).first()


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    """Get user by ID"""
    return db.query(User).filter(User.id == user_id).first()


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    
    if expires_delta:
        expire = utc_now() + expires_delta
    else:
        expire = utc_now() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def export_user_data(db: Session, user_id: int) -> dict:
    """Export all user data including positions and events"""
    user = get_user_by_id(db, user_id)
    if not user:
        raise ValueError("User not found")
    
    # Import v2 Position models
    from app.models.position_models import TradingPosition, TradingPositionEvent
    
    # Get all user positions
    positions = db.query(TradingPosition).filter(TradingPosition.user_id == user_id).all()
    
    positions_data = []
    for position in positions:
        # Get events for this position
        events_data = []
        for event in position.events:
            event_dict = {
                "id": event.id,
                "event_type": event.event_type.value if event.event_type else None,
                "event_date": event.event_date.isoformat() if event.event_date else None,
                "shares": event.shares,
                "price": float(event.price) if event.price else None,
                "stop_loss": float(event.stop_loss) if event.stop_loss else None,
                "take_profit": float(event.take_profit) if event.take_profit else None,
                "notes": event.notes,
                "source": event.source.value if event.source else None,
                "source_id": event.source_id,
                "position_shares_before": event.position_shares_before,
                "position_shares_after": event.position_shares_after,
                "real neuromuscular_pnl": float(event.realized_pnl) if event.realized_pnl else None,
                "created_at": event.created_at.isoformat() if event.created_at else None
            }
            events_data.append(event_dict)
        
        position_dict = {
            "id": position.id,
            "ticker": position.ticker,
            "strategy": position.strategy,
            "setup_type": position.setup_type,
            "timeframe": position.timeframe,
            "status": position.status.value if position.status else None,
            "instrument_type": position.instrument_type.value if position.instrument_type else None,
            "strike_price": float(position.strike_price) if position.strike_price else None,
            "expiration_date": position.expiration_date.isoformat() if position.expiration_date else None,
            "option_type": position.option_type.value if position.option_type else None,
            "current_shares": position.current_shares,
            "avg_entry_price": float(position.avg_entry_price) if position.avg_entry_price else None,
            "total_cost": float(position.total_cost) if position.total_cost else None,
            "total_realized_pnl": float(position.total_realized_pnl) if position.total_realized_pnl else None,
            "current_stop_loss": float(position.current_stop_loss) if position.current_stop_loss else None,
            "current_take_profit": float(position.current_take_profit) if position.current_take_profit else None,
            "original_risk_percent": float(position.original_risk_percent) if position.original_risk_percent else None,
            "current_risk_percent": float(position.current_risk_percent) if position.current_risk_percent else None,
            "original_shares": position.original_shares,
            "account_value_at_entry": float(position.account_value_at_entry) if position.account_value_at_entry else None,
            "opened_at": position.opened_at.isoformat() if position.opened_at else None,
            "closed_at": position.closed_at.isoformat() if position.closed_at else None,
            "market_conditions": position.market_conditions,
            "notes": position.notes,
            "lessons": position.lessons,
            "mistakes": position.mistakes,
            "created_at": position.created_at.isoformat() if position.created_at else None,
            "updated_at": position.updated_at.isoformat() if position.updated_at else None,
            "events": events_data
        }
        positions_data.append(position_dict)
    
    # User data (excluding sensitive information)
    user_data = {
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "display_name": user.display_name,
            "bio": user.bio,
            "profile_picture_url": user.profile_picture_url,
            "default_account_size": float(user.default_account_size) if user.default_account_size else None,
            "email_notifications_enabled": user.email_notifications_enabled,
            "daily_email_enabled": user.daily_email_enabled,
            "daily_email_time": user.daily_email_time,
            "weekly_email_enabled": user.weekly_email_enabled,
            "weekly_email_time": user.weekly_email_time,
            "two_factor_enabled": user.two_factor_enabled,
            "is_active": user.is_active,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "updated_at": user.updated_at.isoformat() if user.updated_at else None
        },
        "positions": positions_data,
        "export_date": utc_now().isoformat(),
        "total_positions": len(positions_data),
        "format_version": "v2"  # Indicate this is v2 export format
    }
    
    return user_data


def delete_user_account(db: Session, user_id: int) -> bool:
    user = get_user_by_id(db, user_id)
    if not user:
        raise ValueError("User not found")
    
    from app.models import TradingPosition, TradingPositionEvent, ImportedPendingOrder

    # Gracefully handle legacy data cleanup — safe even if models.py is gone
    Trade = Chart = PartialExit = TradeEntry = None

    try:
        # Delete current v2 data
        for pos in db.query(TradingPosition).filter(TradingPosition.user_id == user_id):
            db.query(TradingPositionEvent).filter(TradingPositionEvent.position_id == pos.id).delete()
        db.query(TradingPosition).filter(TradingPosition.user_id == user_id).delete()
        db.query(ImportedPendingOrder).filter(ImportedPendingOrder.user_id == user_id).delete()

        # Delete any legacy data that might still exist
        if Trade is not None:
            for trade in db.query(Trade).filter(Trade.user_id == user_id):
                if Chart:
                    db.query(Chart).filter(Chart.trade_id == trade.id).delete()
                if PartialExit:
                    db.query(PartialExit).filter(PartialExit.trade_id == trade.id).delete()
                if TradeEntry:
                    db.query(TradeEntry).filter(TradeEntry.trade_id == trade.id).delete()
            db.query(Trade).filter(Trade.user_id == user_id).delete()

        db.delete(user)
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        raise ValueError(f"Failed to delete user account: {str(e)}")


def generate_password_reset_token(db: Session, email: str) -> Optional[str]:
    """Generate a password reset token for the user"""
    user = get_user_by_email(db, email)
    if not user:
        return None
    
    # Generate a secure random token
    reset_token = secrets.token_urlsafe(32)
    
    # Set expiration to 1 hour from now
    expires_at = utc_now() + timedelta(hours=1)
    
    # Update user with reset token and expiration
    user.password_reset_token = reset_token
    user.password_reset_expires = expires_at
    
    db.commit()
    db.refresh(user)
    
    return reset_token


def verify_password_reset_token(db: Session, token: str) -> Optional[User]:
    """Verify password reset token and return user if valid"""
    user = db.query(User).filter(
        User.password_reset_token == token,
        User.password_reset_expires > utc_now()
    ).first()
    
    return user


def reset_password_with_token(db: Session, token: str, new_password: str) -> bool:
    """Reset password using valid token"""
    user = verify_password_reset_token(db, token)
    if not user:
        return False
    
    # Hash the new password
    hashed_password = get_password_hash(new_password)
    
    # Update user password and clear reset token
    user.hashed_password = hashed_password
    user.password_reset_token = None
    user.password_reset_expires = None
    
    db.commit()
    return True