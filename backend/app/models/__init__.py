"""
Models package - exports all SQLAlchemy models
"""

# Import Base from position models (current models only)
from .position_models import Base, User

# Import deprecated models from models.py 
from .models import (
    Trade,
    TradeEntry,
    PartialExit,
    TradeType,
    TradeStatus,
    InstrumentType,
    OptionType
)

# Make all models available at package level
__all__ = [
    "Base",
    "User",
    "Trade", 
    "TradeEntry",
    "PartialExit",
    "TradeType",
    "TradeStatus",
    "InstrumentType",
    "OptionType"
]