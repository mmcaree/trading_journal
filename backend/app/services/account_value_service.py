from datetime import datetime
from typing import Optional, List, Dict, Any
import time
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.models.position_models import (
    TradingPosition, AccountTransaction, User, PositionStatus
)


class AccountValueService:
    """
    Calculate account value dynamically at any point in time.
    
    Formula: Starting Balance + Realized P&L + Deposits - Withdrawals
    
    Implements service-layer caching for performance with cache invalidation
    when user updates account settings or transactions.
    """
    
    # Class-level cache shared across instances (in-memory, per worker process)
    _cache: Dict[tuple, float] = {}
    _cache_timestamps: Dict[tuple, float] = {}
    _cache_ttl: int = 300  # 5 minutes
    
    def __init__(self, db: Session):
        self.db = db
    
    def invalidate_cache(self, user_id: int):
        """
        Clear cached account values for a user.
        
        Call this when user updates:
        - initial_account_balance
        - starting_balance_date
        - Adds/edits/deletes AccountTransaction
        - Corrects realized P&L
        
        Args:
            user_id: User ID to clear cache for
        """
        keys_to_remove = [k for k in self._cache if k[0] == user_id]
        for key in keys_to_remove:
            if key in self._cache:
                del self._cache[key]
            if key in self._cache_timestamps:
                del self._cache_timestamps[key]
    
    @classmethod
    def clear_all_cache(cls):
        """Clear entire cache (useful for testing or maintenance)"""
        cls._cache.clear()
        cls._cache_timestamps.clear()
    
    def get_account_value_at_date(
        self,
        user_id: int,
        target_date: datetime
    ) -> float:
        """
        Calculate account value at specific date with caching.
        
        Args:
            user_id: User ID
            target_date: Calculate value as of this date
            
        Returns:
            Account value in dollars
        """
        # Create cache key (user_id, date only - ignore time for better cache hits)
        cache_key = (user_id, target_date.date())
        
        # Check cache
        if cache_key in self._cache:
            cache_age = time.time() - self._cache_timestamps.get(cache_key, 0)
            if cache_age < self._cache_ttl:
                # Cache hit - return cached value
                return self._cache[cache_key]
        
        # Cache miss or expired - calculate fresh value
        account_value = self._calculate_account_value(user_id, target_date)
        
        # Store in cache
        self._cache[cache_key] = account_value
        self._cache_timestamps[cache_key] = time.time()
        
        return account_value
    
    def _calculate_account_value(
        self,
        user_id: int,
        target_date: datetime
    ) -> float:
        """
        Internal method to calculate account value (no caching).
        
        Args:
            user_id: User ID
            target_date: Calculate value as of this date
            
        Returns:
            Account value in dollars
        """
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError(f"User {user_id} not found")
        
        # Get starting balance (fallback to 10000.0 if not set)
        starting_balance = user.initial_account_balance or 10000.0
        
        # Sum realized P&L from closed positions up to target_date
        realized_pnl = self.db.query(
            func.coalesce(func.sum(TradingPosition.total_realized_pnl), 0.0)
        ).filter(
            TradingPosition.user_id == user_id,
            TradingPosition.closed_at <= target_date,
            TradingPosition.status == PositionStatus.CLOSED
        ).scalar()
        
        # Sum deposits up to target_date
        deposits = self.db.query(
            func.coalesce(func.sum(AccountTransaction.amount), 0.0)
        ).filter(
            AccountTransaction.user_id == user_id,
            AccountTransaction.transaction_type == 'DEPOSIT',
            AccountTransaction.transaction_date <= target_date
        ).scalar()
        
        # Sum withdrawals up to target_date
        withdrawals = self.db.query(
            func.coalesce(func.sum(AccountTransaction.amount), 0.0)
        ).filter(
            AccountTransaction.user_id == user_id,
            AccountTransaction.transaction_type == 'WITHDRAWAL',
            AccountTransaction.transaction_date <= target_date
        ).scalar()
        
        account_value = starting_balance + realized_pnl + deposits - withdrawals
        
        return max(account_value, 0.0)  # Never return negative
    
    def get_current_account_value(self, user_id: int) -> float:
        """Get current account value (convenience method)"""
        from app.utils.datetime_utils import utc_now
        return self.get_account_value_at_date(user_id, utc_now())
    
    def get_account_value_breakdown(self, user_id: int) -> Dict[str, float]:
        """
        Get detailed breakdown of account value components.
        Useful for debugging and displaying to users.
        """
        from app.utils.datetime_utils import utc_now
        
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError(f"User {user_id} not found")
        
        target_date = utc_now()
        
        starting_balance = user.initial_account_balance or 10000.0
        
        realized_pnl = self.db.query(
            func.coalesce(func.sum(TradingPosition.total_realized_pnl), 0.0)
        ).filter(
            TradingPosition.user_id == user_id,
            TradingPosition.closed_at <= target_date,
            TradingPosition.status == PositionStatus.CLOSED
        ).scalar()
        
        deposits = self.db.query(
            func.coalesce(func.sum(AccountTransaction.amount), 0.0)
        ).filter(
            AccountTransaction.user_id == user_id,
            AccountTransaction.transaction_type == 'DEPOSIT',
            AccountTransaction.transaction_date <= target_date
        ).scalar()
        
        withdrawals = self.db.query(
            func.coalesce(func.sum(AccountTransaction.amount), 0.0)
        ).filter(
            AccountTransaction.user_id == user_id,
            AccountTransaction.transaction_type == 'WITHDRAWAL',
            AccountTransaction.transaction_date <= target_date
        ).scalar()
        
        current_value = starting_balance + realized_pnl + deposits - withdrawals
        
        return {
            'starting_balance': starting_balance,
            'realized_pnl': realized_pnl,
            'total_deposits': deposits,
            'total_withdrawals': withdrawals,
            'net_cash_flow': deposits - withdrawals,
            'current_value': max(current_value, 0.0),
            'calculation': f"{starting_balance} + {realized_pnl} + {deposits} - {withdrawals} = {current_value}"
        }
    
    def get_equity_curve(
        self,
        user_id: int,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate daily equity curve.
        
        Returns list of {date, value} points for charting.
        """
        from app.utils.datetime_utils import utc_now
        from datetime import timedelta
        
        user = self.db.query(User).filter(User.id == user_id).first()
        if not user:
            raise ValueError(f"User {user_id} not found")
        
        # Default to last 90 days
        end_date = end_date or utc_now()
        start_date = start_date or (end_date - timedelta(days=90))
        
        # Get all significant events (position closes, deposits, withdrawals)
        events = []
        
        # Closed positions
        closed_positions = self.db.query(TradingPosition).filter(
            TradingPosition.user_id == user_id,
            TradingPosition.closed_at.between(start_date, end_date),
            TradingPosition.status == PositionStatus.CLOSED
        ).all()
        
        for pos in closed_positions:
            events.append({
                'date': pos.closed_at,
                'type': 'position_close',
                'value': pos.total_realized_pnl
            })
        
        # Account transactions
        transactions = self.db.query(AccountTransaction).filter(
            AccountTransaction.user_id == user_id,
            AccountTransaction.transaction_date.between(start_date, end_date)
        ).all()
        
        for txn in transactions:
            events.append({
                'date': txn.transaction_date,
                'type': txn.transaction_type.lower(),
                'value': txn.amount if txn.transaction_type == 'DEPOSIT' else -txn.amount
            })
        
        # Sort events by date
        events.sort(key=lambda x: x['date'])
        
        # Calculate cumulative values
        equity_curve = []
        current_date = start_date
        
        # Get value at start date
        value_at_start = self.get_account_value_at_date(user_id, start_date)
        equity_curve.append({
            'date': start_date.isoformat(),
            'value': value_at_start
        })
        
        # Add points for each event
        for event in events:
            value = self.get_account_value_at_date(user_id, event['date'])
            equity_curve.append({
                'date': event['date'].isoformat(),
                'value': value,
                'event_type': event['type']
            })
        
        # Add current value at end date
        if not equity_curve or equity_curve[-1]['date'] != end_date.isoformat():
            value_at_end = self.get_account_value_at_date(user_id, end_date)
            equity_curve.append({
                'date': end_date.isoformat(),
                'value': value_at_end
            })
        
        return equity_curve