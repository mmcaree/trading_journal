#!/usr/bin/env python3
"""
New Position-Based Models for Ground-Up Rebuild
Clean, event-sourced architecture with immutable history
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Text, Enum, Table, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
import enum
from datetime import datetime

# Create separate Base for current models only
Base = declarative_base()

class PositionStatus(str, enum.Enum):
    OPEN = "open"
    CLOSED = "closed"

class EventType(str, enum.Enum):
    BUY = "buy"
    SELL = "sell"
    SPLIT = "split"
    DIVIDEND = "dividend"

class InstrumentType(str, enum.Enum):
    STOCK = "stock"
    OPTIONS = "options"

class OptionType(str, enum.Enum):
    CALL = "call"
    PUT = "put"

class EventSource(str, enum.Enum):
    MANUAL = "manual"
    IMPORT = "import"
    SPLIT = "split"
    ADJUSTMENT = "adjustment"

class JournalEntryType(str, enum.Enum):
    NOTE = "note"
    LESSON = "lesson"
    MISTAKE = "mistake"
    ANALYSIS = "analysis"

class TradingPosition(Base):
    """Master position record - aggregated view calculated from events"""
    __tablename__ = "trading_positions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Position identification
    ticker = Column(String(20), nullable=False, index=True)
    strategy = Column(String(50), nullable=True, index=True)
    setup_type = Column(String(50), nullable=True, index=True)
    timeframe = Column(String(20), nullable=True)
    status = Column(Enum(PositionStatus), default=PositionStatus.OPEN, index=True)
    
    # Instrument details
    instrument_type = Column(Enum(InstrumentType), default=InstrumentType.STOCK)
    strike_price = Column(Float, nullable=True)  # Options only
    expiration_date = Column(DateTime, nullable=True)  # Options only
    option_type = Column(Enum(OptionType), nullable=True)  # Options only
    
    # Current calculated fields (derived from events)
    current_shares = Column(Integer, default=0, nullable=False)
    avg_entry_price = Column(Float, nullable=True)  # FIFO cost basis
    total_cost = Column(Float, default=0.0, nullable=False)  # Current cost basis
    total_realized_pnl = Column(Float, default=0.0, nullable=False)  # Realized P&L from sells
    
    # Risk management fields
    current_stop_loss = Column(Float, nullable=True)
    current_take_profit = Column(Float, nullable=True)
    original_risk_percent = Column(Float, nullable=True)  # Risk % when position opened
    current_risk_percent = Column(Float, nullable=True)   # Current risk % based on current stop
    original_shares = Column(Integer, nullable=True)      # Shares when position first opened
    account_value_at_entry = Column(Float, nullable=True) # Account value when position opened
    
    # Position lifecycle
    opened_at = Column(DateTime, nullable=False)
    closed_at = Column(DateTime, nullable=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Analysis fields
    market_conditions = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    lessons = Column(Text, nullable=True)
    mistakes = Column(Text, nullable=True)
    
    # Relationships
    events = relationship("TradingPositionEvent", back_populates="position", order_by="TradingPositionEvent.event_date")
    user = relationship("User")
    charts = relationship("TradingPositionChart", back_populates="position")
    pending_orders = relationship("ImportedPendingOrder", back_populates="position")
    journal_entries = relationship("TradingPositionJournalEntry", back_populates="position", order_by="TradingPositionJournalEntry.entry_date.desc()")
    instructor_notes = relationship("InstructorNote", back_populates="position", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<TradingPosition(id={self.id}, ticker={self.ticker}, shares={self.current_shares}, status={self.status})>"

class TradingPositionEvent(Base):
    """Immutable event log - never modified after creation"""
    __tablename__ = "trading_position_events"
    
    id = Column(Integer, primary_key=True, index=True)
    position_id = Column(Integer, ForeignKey("trading_positions.id"), nullable=False)
    
    # Event classification
    event_type = Column(Enum(EventType), nullable=False, index=True)
    event_date = Column(DateTime, nullable=False, index=True)
    
    # Event data
    shares = Column(Integer, nullable=False)  # positive for buy, negative for sell
    price = Column(Float, nullable=False)  # price per share
    
    # Risk management at time of event
    stop_loss = Column(Float, nullable=True)
    take_profit = Column(Float, nullable=True)
    
    # Event context
    notes = Column(Text, nullable=True)
    source = Column(Enum(EventSource), default=EventSource.MANUAL, nullable=False)
    source_id = Column(String(50), nullable=True)  # reference to import batch, order ID, etc.
    
    # Calculated fields at time of event (for audit trail)
    position_shares_before = Column(Integer, nullable=True)  # shares before this event
    position_shares_after = Column(Integer, nullable=True)   # shares after this event
    realized_pnl = Column(Float, nullable=True)              # P&L from this event (sells only)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    position = relationship("TradingPosition", back_populates="events")
    
    def __repr__(self):
        return f"<TradingPositionEvent(id={self.id}, type={self.event_type}, shares={self.shares}, price=${self.price})>"

class TradingPositionChart(Base):
    """Charts associated with positions"""
    __tablename__ = "trading_position_charts"
    
    id = Column(Integer, primary_key=True, index=True)
    position_id = Column(Integer, ForeignKey("trading_positions.id"), nullable=False)
    
    # Chart details
    image_url = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    timeframe = Column(String(20), nullable=True)
    annotations = Column(Text, nullable=True)  # JSON annotations
    
    # Chart metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    position = relationship("TradingPosition", back_populates="charts")


class TradingPositionJournalEntry(Base):
    """Diary-style journal entries for positions - like writing in a physical notebook"""
    __tablename__ = "trading_position_journal_entries"
    
    id = Column(Integer, primary_key=True, index=True)
    position_id = Column(Integer, ForeignKey("trading_positions.id"), nullable=False)
    
    # Entry details
    entry_date = Column(DateTime, nullable=False, index=True)  # When the entry was written
    entry_type = Column(Enum(JournalEntryType), default=JournalEntryType.NOTE, nullable=False)
    content = Column(Text, nullable=False)  # The actual journal entry content
    
    # Image attachments (JSON array of image URLs and chart IDs)
    attached_images = Column(Text, nullable=True)  # JSON: [{"url": "...", "description": "..."}, ...]
    attached_charts = Column(Text, nullable=True)  # JSON: [chart_id1, chart_id2, ...]
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    position = relationship("TradingPosition", back_populates="journal_entries")
    
    def __repr__(self):
        return f"<TradingPositionJournalEntry(id={self.id}, type={self.entry_type}, date={self.entry_date})>"


class OrderStatus(str, enum.Enum):
    PENDING = "pending"
    CANCELLED = "cancelled"
    WORKING = "working"
    OPEN = "open"


class ImportedPendingOrder(Base):
    """
    Storage for pending/cancelled orders from CSV imports
    These orders were not filled but provide important context for sub-lot breakdowns
    """
    __tablename__ = "imported_pending_orders"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Order identification
    symbol = Column(String(20), nullable=False, index=True)
    side = Column(String(10), nullable=False)  # Buy/Sell
    status = Column(Enum(OrderStatus), nullable=False, index=True)
    
    # Order details
    shares = Column(Integer, nullable=False)
    price = Column(Float, nullable=True)  # Limit price, None for market orders
    order_type = Column(String(20), nullable=True)  # Limit, Market, Stop, etc.
    
    # Timing
    placed_time = Column(DateTime, nullable=False)
    
    # Risk management
    stop_loss = Column(Float, nullable=True)
    take_profit = Column(Float, nullable=True)
    
    # Import tracking
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    import_batch_id = Column(String(100), nullable=True)  # Track which import batch
    
    # Position relationship - link to the TradingPosition this order belongs to
    position_id = Column(Integer, ForeignKey("trading_positions.id"), nullable=True, index=True)
    
    # Metadata
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    position = relationship("TradingPosition", back_populates="pending_orders")
    user = relationship("User")  # Link to User model


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
    starting_balance_date = Column(DateTime, nullable=True)
    
    # Admin system - simple role-based access
    role = Column(String, default='STUDENT')  # 'STUDENT' or 'INSTRUCTOR'
    
    # Relationships
    position_tags = relationship("PositionTag", back_populates="user")
    account_transactions = relationship("AccountTransaction", back_populates="user", cascade="all, delete-orphan")


class InstructorNote(Base):
    """Notes that instructors can add about students"""
    __tablename__ = "instructor_notes"
    
    id = Column(Integer, primary_key=True, index=True)
    instructor_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    position_id = Column(Integer, ForeignKey("trading_positions.id", ondelete="CASCADE"), nullable=False, index=True)

    note_text = Column(Text, nullable=False)
    is_flagged = Column(Boolean, default=False)  # Flag student for attention
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    instructor = relationship("User", foreign_keys=[instructor_id])
    student = relationship("User", foreign_keys=[student_id])
    position = relationship("TradingPosition", back_populates="instructor_notes")


position_tag_assignment = Table(
    "position_tag_assignment",
    Base.metadata,
    Column("position_id", Integer, ForeignKey("trading_positions.id"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("position_tags.id"), primary_key=True),
    Column("assigned_at", DateTime, default=datetime.utcnow),
)

class PositionTag(Base):
    __tablename__ = "position_tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    color = Column(String, default="#1976d2")
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    user = relationship("User", back_populates="position_tags")
    positions = relationship(
        "TradingPosition",
        secondary=position_tag_assignment,
        back_populates="tags"
    )

    __table_args__ = (
        UniqueConstraint('name', 'user_id', name='uix_user_tag_name'),
    )


class AccountTransaction(Base):
    """Track deposits and withdrawals to calculate accurate returns"""
    __tablename__ = "account_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    transaction_type = Column(String, nullable=False)  # 'DEPOSIT' or 'WITHDRAWAL'
    amount = Column(Float, nullable=False)  # Positive for both types
    transaction_date = Column(DateTime, nullable=False, index=True)
    
    description = Column(String, nullable=True)  # Optional note
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationship
    user = relationship("User", back_populates="account_transactions")

    def __repr__(self):
        return f"<PositionTag {self.name} ({self.color})>"
    

TradingPosition.tags = relationship(
    "PositionTag",
    secondary=position_tag_assignment,
    back_populates="positions",
    lazy="joined"
)

User.position_tags = relationship(
    "PositionTag",
    back_populates="user",
    cascade="all, delete-orphan",
    lazy="selectin"
)#