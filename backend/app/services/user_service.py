from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext
import secrets

from app.core.config import settings
from app.models.models import User
from app.models.schemas import UserCreate, UserUpdate, NotificationSettings

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
        created_at=datetime.utcnow()
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
    
    user.updated_at = datetime.utcnow()
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
    
    user.updated_at = datetime.utcnow()
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
    user.updated_at = datetime.utcnow()
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
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def export_user_data(db: Session, user_id: int) -> dict:
    """Export all user data including trades"""
    user = get_user_by_id(db, user_id)
    if not user:
        raise ValueError("User not found")
    
    # Import Trade model here to avoid circular imports
    from app.models.models import Trade
    
    # Get all user trades
    trades = db.query(Trade).filter(Trade.user_id == user_id).all()
    
    trades_data = []
    for trade in trades:
        trade_dict = {
            "id": trade.id,
            "ticker": trade.ticker,
            "trade_type": trade.trade_type.value if trade.trade_type else None,
            "status": trade.status.value if trade.status else None,
            "position_size": float(trade.position_size) if trade.position_size else None,
            "position_value": float(trade.position_value) if trade.position_value else None,
            "entry_price": float(trade.entry_price) if trade.entry_price else None,
            "exit_price": float(trade.exit_price) if trade.exit_price else None,
            "entry_date": trade.entry_date.isoformat() if trade.entry_date else None,
            "exit_date": trade.exit_date.isoformat() if trade.exit_date else None,
            "entry_notes": trade.entry_notes,
            "exit_notes": trade.exit_notes,
            "profit_loss": float(trade.profit_loss) if trade.profit_loss else None,
            "profit_loss_percent": float(trade.profit_loss_percent) if trade.profit_loss_percent else None,
            "setup_type": trade.setup_type,
            "strategy": trade.strategy,
            "timeframe": trade.timeframe,
            "market_conditions": trade.market_conditions,
            "stop_loss": float(trade.stop_loss) if trade.stop_loss else None,
            "take_profit": float(trade.take_profit) if trade.take_profit else None,
            "risk_per_share": float(trade.risk_per_share) if trade.risk_per_share else None,
            "total_risk": float(trade.total_risk) if trade.total_risk else None,
            "risk_reward_ratio": float(trade.risk_reward_ratio) if trade.risk_reward_ratio else None,
            "mistakes": trade.mistakes,
            "lessons": trade.lessons,
            "created_at": trade.created_at.isoformat() if trade.created_at else None,
            "updated_at": trade.updated_at.isoformat() if trade.updated_at else None
        }
        trades_data.append(trade_dict)
    
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
        "trades": trades_data,
        "export_date": datetime.utcnow().isoformat(),
        "total_trades": len(trades_data)
    }
    
    return user_data


def delete_user_account(db: Session, user_id: int) -> bool:
    """Delete user account and all associated data"""
    user = get_user_by_id(db, user_id)
    if not user:
        raise ValueError("User not found")
    
    # Import models here to avoid circular imports
    from app.models.models import Trade, Chart, PartialExit
    from app.models.import_models import ImportedOrder, ImportBatch, Position, PositionOrder
    
    try:
        # Delete in order to respect foreign key constraints
        
        # 1. Delete charts (depend on trades)
        trades = db.query(Trade).filter(Trade.user_id == user_id).all()
        for trade in trades:
            db.query(Chart).filter(Chart.trade_id == trade.id).delete()
            db.query(PartialExit).filter(PartialExit.trade_id == trade.id).delete()
        
        # 2. Delete position orders (depend on positions and imported orders)
        positions = db.query(Position).filter(Position.user_id == user_id).all()
        for position in positions:
            db.query(PositionOrder).filter(PositionOrder.position_id == position.id).delete()
        
        # 3. Delete positions
        db.query(Position).filter(Position.user_id == user_id).delete()
        
        # 4. Delete trades (now that charts and partial exits are gone)
        db.query(Trade).filter(Trade.user_id == user_id).delete()
        
        # 5. Delete imported orders
        db.query(ImportedOrder).filter(ImportedOrder.user_id == user_id).delete()
        
        # 6. Delete import batches
        db.query(ImportBatch).filter(ImportBatch.user_id == user_id).delete()
        
        # 7. Finally, delete the user
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
    expires_at = datetime.utcnow() + timedelta(hours=1)
    
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
        User.password_reset_expires > datetime.utcnow()
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
