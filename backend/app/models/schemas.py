from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from enum import Enum

class TradeType(str, Enum):
    LONG = "long"
    SHORT = "short"

class TradeStatus(str, Enum):
    PLANNED = "planned"
    ACTIVE = "active"
    CLOSED = "closed"
    CANCELED = "canceled"

# Partial Exit schemas
class PartialExitBase(BaseModel):
    exit_price: float
    exit_date: datetime
    shares_sold: int
    profit_loss: float
    notes: Optional[str] = None

class PartialExitCreate(PartialExitBase):
    pass

class PartialExitResponse(PartialExitBase):
    id: Optional[int] = None
    trade_id: Optional[int] = None
    
    class Config:
        from_attributes = True

# User schemas
class UserBase(BaseModel):
    username: str
    email: str

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
    email: Optional[str] = None
    default_account_size: Optional[float] = None

class NotificationSettings(BaseModel):
    email_notifications_enabled: bool = True
    daily_email_enabled: bool = False
    daily_email_time: Optional[str] = None  # Format: "09:00"
    weekly_email_enabled: bool = False
    weekly_email_time: Optional[str] = None  # Format: "09:00"

class TwoFactorSetup(BaseModel):
    secret: str
    qr_code: str
    backup_codes: List[str]

class TwoFactorVerification(BaseModel):
    token: str

class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
    profile_picture_url: Optional[str] = None
    updated_at: Optional[datetime] = None
    
    # Notification settings (excluding sensitive fields)
    email_notifications_enabled: bool = True
    daily_email_enabled: bool = False
    daily_email_time: Optional[str] = None
    weekly_email_enabled: bool = False
    weekly_email_time: Optional[str] = None
    
    # 2FA status (excluding secret)
    two_factor_enabled: bool = False
    
    # Trading settings
    default_account_size: Optional[float] = None
    
    class Config:
        from_attributes = True

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

# Trade schemas
class TradeBase(BaseModel):
    ticker: str
    trade_type: TradeType
    status: TradeStatus
    
    # Entry details
    entry_price: float
    entry_date: Optional[datetime] = None
    entry_notes: Optional[str] = None
    
    # Risk management
    position_size: float
    stop_loss: Optional[float] = None  # Made optional for imported trades
    take_profit: Optional[float] = None
    
    # Analysis
    strategy: Optional[str] = None    # Made optional for imported trades
    setup_type: Optional[str] = None  # Made optional for imported trades
    timeframe: Optional[str] = None   # Made optional for imported trades
    market_conditions: Optional[str] = None
    tags: Optional[List[str]] = None

class TradeCreate(BaseModel):
    ticker: str
    trade_type: TradeType
    status: TradeStatus
    
    # Entry details
    entry_price: float
    entry_date: Optional[datetime] = None
    entry_notes: Optional[str] = None
    
    # Exit details
    exit_price: Optional[float] = None
    exit_date: Optional[datetime] = None
    exit_notes: Optional[str] = None
    
    # Risk management
    position_size: float
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    
    # Analysis
    strategy: str
    setup_type: str
    timeframe: str
    market_conditions: Optional[str] = None
    tags: Optional[List[str]] = None
    partial_exits: Optional[List[PartialExitCreate]] = None

class TradeUpdate(BaseModel):
    ticker: Optional[str] = None
    trade_type: Optional[TradeType] = None
    status: Optional[TradeStatus] = None
    
    # Entry details
    entry_price: Optional[float] = None
    entry_date: Optional[datetime] = None
    entry_notes: Optional[str] = None
    
    # Exit details
    exit_price: Optional[float] = None
    exit_date: Optional[datetime] = None
    exit_notes: Optional[str] = None
    
    # Risk management
    position_size: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
      # Analysis
    strategy: Optional[str] = None
    setup_type: Optional[str] = None
    timeframe: Optional[str] = None
    market_conditions: Optional[str] = None
    mistakes: Optional[str] = None
    lessons: Optional[str] = None
    tags: Optional[List[str]] = None
    partial_exits: Optional[List[PartialExitCreate]] = None

class TradeResponse(BaseModel):
    id: int
    user_id: int
    ticker: str
    trade_type: TradeType
    status: TradeStatus
    
    # Entry details
    entry_price: float
    entry_date: Optional[datetime] = None
    entry_notes: Optional[str] = None
    
    # Exit details
    exit_price: Optional[float] = None
    exit_date: Optional[datetime] = None
    exit_notes: Optional[str] = None
    
    # Risk management
    position_size: float
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    
    # Risk calculations (can be None for imported trades)
    position_value: Optional[float] = None
    risk_per_share: Optional[float] = None
    total_risk: Optional[float] = None
    risk_reward_ratio: Optional[float] = None
    
    # Performance
    profit_loss: Optional[float] = None
    profit_loss_percent: Optional[float] = None
    
    # Analysis
    setup_type: Optional[str] = None
    strategy: Optional[str] = None
    timeframe: Optional[str] = None
    market_conditions: Optional[str] = None
    mistakes: Optional[str] = None
    lessons: Optional[str] = None
    
    # Tags
    tags: Optional[List[str]] = None
    
    # Partial exits
    partial_exits: Optional[List[PartialExitResponse]] = None
    
    # Image URLs
    imageUrls: Optional[List[str]] = None
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Chart schemas
class ChartBase(BaseModel):
    trade_id: int
    image_url: str
    timeframe: str
    description: Optional[str] = None
    annotations: Optional[str] = None

class ChartCreate(ChartBase):
    pass

class ChartResponse(ChartBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# Analytics schemas
class PerformanceMetrics(BaseModel):
    total_trades: int
    winning_trades: int
    losing_trades: int
    win_rate: float
    average_profit: float
    average_loss: float
    profit_factor: float
    largest_win: float
    largest_loss: float
    average_holding_time: float
    total_profit_loss: float
    total_profit_loss_percent: float

class SetupPerformance(BaseModel):
    setup_type: str
    trade_count: int
    win_rate: float
    average_profit_loss: float
    total_profit_loss: float

# Authentication schemas
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# Partial Exit schemas
class PartialExitBase(BaseModel):
    exit_price: float
    exit_date: datetime
    shares_sold: int
    profit_loss: float
    notes: Optional[str] = None

class PartialExitCreate(PartialExitBase):
    pass

class PartialExitResponse(PartialExitBase):
    id: int
    trade_id: int
    
    class Config:
        from_attributes = True
