#!/usr/bin/env python3
"""
Models for trade import functionality
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.models.models import Base
import enum

class OrderStatus(str, enum.Enum):
    FILLED = "Filled"
    PENDING = "Pending" 
    CANCELLED = "Cancelled"
    FAILED = "Failed"

class OrderSide(str, enum.Enum):
    BUY = "Buy"
    SELL = "Sell" 
    SHORT = "Short"

class TimeInForce(str, enum.Enum):
    DAY = "DAY"
    GTC = "GTC"

class ImportedOrder(Base):
    """Individual orders imported from broker data"""
    __tablename__ = "imported_orders"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Basic order information
    company_name = Column(String(255), nullable=False)
    symbol = Column(String(20), nullable=False, index=True)
    side = Column(String(10), nullable=False)  # Buy, Sell, Short
    status = Column(String(20), nullable=False)  # Filled, Pending, Cancelled, Failed
    
    # Quantity and pricing
    filled_qty = Column(Integer, nullable=False, default=0)
    total_qty = Column(Integer, nullable=False)
    price = Column(Float, nullable=True)  # Order price
    avg_price = Column(Float, nullable=True)  # Average fill price
    
    # Order details
    time_in_force = Column(String(10), nullable=True)  # DAY, GTC
    placed_time = Column(DateTime, nullable=False)
    filled_time = Column(DateTime, nullable=True)
    
    # Import metadata
    import_batch_id = Column(String(50), ForeignKey("import_batches.batch_id"), nullable=False, index=True)
    original_data = Column(Text, nullable=True)  # Store original CSV row
    processed = Column(Boolean, default=False)
    
    # Relationships
    user = relationship("User", back_populates="imported_orders")
    batch = relationship("ImportBatch", back_populates="orders")
    trades = relationship("Trade", back_populates="imported_order")

class ImportBatch(Base):
    """Track import batches for data integrity"""
    __tablename__ = "import_batches"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    batch_id = Column(String(50), unique=True, nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    total_orders = Column(Integer, nullable=False, default=0)
    processed_orders = Column(Integer, nullable=False, default=0)
    
    # Statistics
    filled_orders = Column(Integer, nullable=False, default=0)
    pending_orders = Column(Integer, nullable=False, default=0)
    cancelled_orders = Column(Integer, nullable=False, default=0)
    failed_orders = Column(Integer, nullable=False, default=0)
    
    created_at = Column(DateTime, nullable=False)
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="import_batches")
    orders = relationship("ImportedOrder", back_populates="batch")

class Position(Base):
    """Current and historical positions derived from orders"""
    __tablename__ = "positions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Position identification
    symbol = Column(String(20), nullable=False, index=True)
    company_name = Column(String(255), nullable=False)
    
    # Position details
    quantity = Column(Integer, nullable=False)  # Current quantity (can be 0 for closed)
    avg_cost_basis = Column(Float, nullable=False)  # Average cost per share
    total_cost = Column(Float, nullable=False)  # Total invested
    
    # Position status
    is_open = Column(Boolean, default=True, index=True)
    position_type = Column(String(10), default="LONG")  # LONG, SHORT
    
    # Timestamps
    opened_at = Column(DateTime, nullable=False)
    closed_at = Column(DateTime, nullable=True)
    last_updated = Column(DateTime, nullable=False)
    
    # P&L tracking
    realized_pnl = Column(Float, default=0.0)  # Profit/Loss from closed portions
    unrealized_pnl = Column(Float, default=0.0)  # Mark-to-market for open position
    
    # Relationships
    user = relationship("User")
    position_orders = relationship("PositionOrder", back_populates="position")

class PositionOrder(Base):
    """Links between positions and the orders that created them"""
    __tablename__ = "position_orders"
    
    id = Column(Integer, primary_key=True, index=True)
    position_id = Column(Integer, ForeignKey("positions.id"), nullable=False)
    imported_order_id = Column(Integer, ForeignKey("imported_orders.id"), nullable=False)
    
    # Order contribution to position
    quantity_contribution = Column(Integer, nullable=False)  # How much this order contributed
    cost_contribution = Column(Float, nullable=False)  # Cost basis contribution
    
    # Relationships
    position = relationship("Position", back_populates="position_orders")
    imported_order = relationship("ImportedOrder")