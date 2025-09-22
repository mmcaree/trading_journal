from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Text, Enum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import enum
from datetime import datetime

Base = declarative_base()

class TradeType(str, enum.Enum):
    LONG = "long"
    SHORT = "short"

class TradeStatus(str, enum.Enum):
    PLANNED = "planned"
    ACTIVE = "active"
    CLOSED = "closed"
    CANCELED = "canceled"

class InstrumentType(str, enum.Enum):
    STOCK = "stock"
    OPTIONS = "options"

class OptionType(str, enum.Enum):
    CALL = "call"
    PUT = "put"

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Profile fields
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    display_name = Column(String, nullable=True)
    bio = Column(Text, nullable=True)
    profile_picture_url = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Notification settings
    email_notifications_enabled = Column(Boolean, default=True)
    daily_email_enabled = Column(Boolean, default=False)
    daily_email_time = Column(String, nullable=True)  # Format: "09:00"
    weekly_email_enabled = Column(Boolean, default=False)
    weekly_email_time = Column(String, nullable=True)  # Format: "09:00"
    
    # 2FA settings
    two_factor_enabled = Column(Boolean, default=False)
    two_factor_secret = Column(String, nullable=True)
    backup_codes = Column(Text, nullable=True)  # JSON string of backup codes
    
    # Password reset fields
    password_reset_token = Column(String, nullable=True, index=True)
    password_reset_expires = Column(DateTime, nullable=True)
    
    # User preferences
    timezone = Column(String, default='America/New_York')  # User's local timezone for email scheduling
    
    # Trading settings
    current_account_balance = Column(Float, nullable=True)  # Current account balance (updated with P&L)
    initial_account_balance = Column(Float, nullable=True)  # Starting balance for P&L tracking
    
    trades = relationship("Trade", back_populates="user")
    imported_orders = relationship("ImportedOrder", back_populates="user")
    import_batches = relationship("ImportBatch", back_populates="user")
    
class Trade(Base):
    __tablename__ = "trades"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    trade_group_id = Column(String, index=True)  # Groups related trade events (entries, exits, etc.)
    ticker = Column(String, index=True)
    trade_type = Column(Enum(TradeType))
    status = Column(Enum(TradeStatus))
    
    # Instrument type and options details
    instrument_type = Column(Enum(InstrumentType), default=InstrumentType.STOCK)
    strike_price = Column(Float, nullable=True)  # Options only
    expiration_date = Column(DateTime, nullable=True)  # Options only
    option_type = Column(Enum(OptionType), nullable=True)  # Options only (call/put)
    
    # Entry details
    entry_price = Column(Float)
    entry_date = Column(DateTime)
    entry_notes = Column(Text)
    
    # Exit details
    exit_price = Column(Float, nullable=True)
    exit_date = Column(DateTime, nullable=True)
    exit_notes = Column(Text, nullable=True)
    
    # Risk management
    position_size = Column(Float)  # Number of shares/contracts
    position_value = Column(Float)  # Total value of position
    stop_loss = Column(Float)
    take_profit = Column(Float, nullable=True)
    risk_per_share = Column(Float)
    total_risk = Column(Float)
    risk_reward_ratio = Column(Float)
    account_balance_snapshot = Column(Float, nullable=True)  # Account balance when trade was created
    
    # Performance
    profit_loss = Column(Float, nullable=True)
    profit_loss_percent = Column(Float, nullable=True)
    
    # Analysis
    strategy = Column(String, index=True)  # e.g., "Breakout", "Reversal", etc.
    setup_type = Column(String, index=True)  # e.g., "Flag", "Cup and Handle", etc.
    timeframe = Column(String)  # e.g., "Daily", "4H", etc.
    market_conditions = Column(String)
    mistakes = Column(Text, nullable=True)
    lessons = Column(Text, nullable=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Import tracking
    imported_order_id = Column(Integer, ForeignKey("imported_orders.id"), nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="trades")
    charts = relationship("Chart", back_populates="trade")
    partial_exits = relationship("PartialExit", back_populates="trade")
    trade_entries = relationship("TradeEntry", back_populates="trade")
    imported_order = relationship("ImportedOrder", back_populates="trades")
    
class Chart(Base):
    __tablename__ = "charts"
    
    id = Column(Integer, primary_key=True, index=True)
    trade_id = Column(Integer, ForeignKey("trades.id"))
    image_url = Column(String)
    description = Column(Text, nullable=True)
    timeframe = Column(String)
    annotations = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    trade = relationship("Trade", back_populates="charts")
    
class PartialExit(Base):
    __tablename__ = "partial_exits"
    
    id = Column(Integer, primary_key=True, index=True)
    trade_id = Column(Integer, ForeignKey("trades.id"))
    exit_price = Column(Float)
    exit_date = Column(DateTime)
    shares_sold = Column(Integer)
    profit_loss = Column(Float)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    trade = relationship("Trade", back_populates="partial_exits")

class TradeEntry(Base):
    __tablename__ = "trade_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    trade_id = Column(Integer, ForeignKey("trades.id"))
    entry_price = Column(Float)
    entry_date = Column(DateTime)
    shares = Column(Integer)  # Current remaining shares (modified by partial exits)
    original_shares = Column(Integer, nullable=True)  # Original shares at time of entry creation (for risk calculations)
    stop_loss = Column(Float)
    original_stop_loss = Column(Float, nullable=True)  # Stop loss at time of entry creation
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Track if this entry is still active (for risk calculations)
    is_active = Column(Boolean, default=True)
    
    trade = relationship("Trade", back_populates="trade_entries")
