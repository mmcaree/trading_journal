#!/usr/bin/env python3
"""
Position Service - Core business logic for the new position-based architecture
Handles all position operations with immutable event sourcing
"""

from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc
from decimal import Decimal, ROUND_HALF_UP

from app.utils.datetime_utils import utc_now

from app.models.position_models import (
    TradingPosition, TradingPositionEvent, PositionStatus, EventType, EventSource
)
from app.models import User


class PositionService:
    """Clean, focused position management service"""
    
    def __init__(self, db: Session):
        self.db = db
    
    # === Position Creation ===
    
    def create_position(
        self,
        user_id: int,
        ticker: str,
        strategy: Optional[str] = None,
        setup_type: Optional[str] = None,
        timeframe: Optional[str] = None,
        account_value_at_entry: Optional[float] = None,
        **kwargs
    ) -> TradingPosition:
        """Create a new position"""
        position = TradingPosition(
            user_id=user_id,
            ticker=ticker.upper(),
            strategy=strategy,
            setup_type=setup_type,
            timeframe=timeframe,
            account_value_at_entry=account_value_at_entry,
            opened_at=utc_now(),
            **kwargs
        )
        
        self.db.add(position)
        self.db.flush()  # Get the ID
        return position
    
    def get_or_create_position(
        self,
        user_id: int,
        ticker: str,
        strategy: Optional[str] = None,
        setup_type: Optional[str] = None,
        **kwargs
    ) -> TradingPosition:
        """Get existing open position or create new one"""
        # Look for existing open position
        position = self.db.query(TradingPosition).filter(
            TradingPosition.user_id == user_id,
            TradingPosition.ticker == ticker.upper(),
            TradingPosition.status == PositionStatus.OPEN
        ).first()
        
        if position:
            return position
        
        return self.create_position(
            user_id=user_id,
            ticker=ticker,
            strategy=strategy,
            setup_type=setup_type,
            **kwargs
        )
    
    # === Event Operations ===
    
    def add_shares(
        self,
        position_id: int,
        shares: int,
        price: float,
        event_date: Optional[datetime] = None,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
        notes: Optional[str] = None,
        source: EventSource = EventSource.MANUAL,
        source_id: Optional[str] = None
    ) -> TradingPositionEvent:
        """Add shares to position via buy event"""
        if shares <= 0:
            raise ValueError("Shares must be positive for buy events")
        
        position = self.db.query(TradingPosition).get(position_id)
        if not position:
            raise ValueError(f"Position {position_id} not found")
        
        # Create buy event
        event = TradingPositionEvent(
            position_id=position_id,
            event_type=EventType.BUY,
            event_date=event_date or utc_now(),
            shares=shares,  # Always positive
            price=price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            notes=notes,
            source=source,
            source_id=source_id,
            position_shares_before=position.current_shares
        )
        
        self.db.add(event)
        self.db.flush()
        
        # Recalculate position
        self._recalculate_position(position_id)
        
        # Update event with after state
        position = self.db.query(TradingPosition).get(position_id)
        event.position_shares_after = position.current_shares
        
        return event
    
    def sell_shares(
        self,
        position_id: int,
        shares: int,
        price: float,
        event_date: Optional[datetime] = None,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
        notes: Optional[str] = None,
        source: EventSource = EventSource.MANUAL,
        source_id: Optional[str] = None
    ) -> TradingPositionEvent:
        """Sell shares from position via sell event"""
        if shares <= 0:
            raise ValueError("Shares must be positive for sell events")
        
        position = self.db.query(TradingPosition).get(position_id)
        if not position:
            raise ValueError(f"Position {position_id} not found")
        
        if shares > position.current_shares:
            raise ValueError(f"Cannot sell {shares} shares, only {position.current_shares} available")
        
        # Calculate realized P&L using FIFO
        realized_pnl = self._calculate_sell_pnl(position_id, shares, price)
        
        # Create sell event
        event = TradingPositionEvent(
            position_id=position_id,
            event_type=EventType.SELL,
            event_date=event_date or utc_now(),
            shares=-shares,  # Always negative
            price=price,
            stop_loss=stop_loss,
            take_profit=take_profit,
            notes=notes,
            source=source,
            source_id=source_id,
            position_shares_before=position.current_shares,
            realized_pnl=realized_pnl
        )
        
        self.db.add(event)
        self.db.flush()
        
        # Recalculate position
        self._recalculate_position(position_id)
        
        # Update event with after state
        position = self.db.query(TradingPosition).get(position_id)
        event.position_shares_after = position.current_shares
        
        return event
    
    def update_event(
        self,
        event_id: int,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
        notes: Optional[str] = None
    ) -> TradingPositionEvent:
        """Update stop loss, take profit, or notes for a specific event (legacy method)"""
        event = self.db.query(TradingPositionEvent).get(event_id)
        if not event:
            raise ValueError(f"Event {event_id} not found")
        
        # Update fields if provided
        if stop_loss is not None:
            event.stop_loss = stop_loss
        if take_profit is not None:
            event.take_profit = take_profit
        if notes is not None:
            event.notes = notes
        
        self.db.commit()
        self.db.refresh(event)
        
        return event
    
    def update_event_comprehensive(
        self,
        event_id: int,
        shares: Optional[int] = None,
        price: Optional[float] = None,
        event_date: Optional[datetime] = None,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None,
        notes: Optional[str] = None
    ) -> TradingPositionEvent:
        """Comprehensive event update - modifies shares, price, date, and risk management"""
        event = self.db.query(TradingPositionEvent).get(event_id)
        if not event:
            raise ValueError(f"Event {event_id} not found")
        
        position_id = event.position_id
        
        # Validate shares for buy/sell events
        if shares is not None and shares <= 0:
            raise ValueError("Shares must be positive")
        
        # Validate price
        if price is not None and price <= 0:
            raise ValueError("Price must be positive")
        
        # Update event fields
        if shares is not None:
            event.shares = shares
        if price is not None:
            event.price = price
        if event_date is not None:
            event.event_date = event_date
        if stop_loss is not None:
            event.stop_loss = stop_loss
        if take_profit is not None:
            event.take_profit = take_profit
        if notes is not None:
            event.notes = notes
        
        # Set updated timestamp
        event.created_at = utc_now()  # Track when the modification was made
        
        self.db.commit()
        
        # Recalculate position metrics since financial data may have changed
        self._recalculate_position(position_id)
        
        self.db.refresh(event)
        return event
    
    def delete_event(self, event_id: int) -> bool:
        """Delete a specific event and recalculate position"""
        event = self.db.query(TradingPositionEvent).get(event_id)
        if not event:
            raise ValueError(f"Event {event_id} not found")
        
        position_id = event.position_id
        
        # Check if this is the only event in the position
        events_count = self.db.query(TradingPositionEvent).filter_by(position_id=position_id).count()
        if events_count <= 1:
            raise ValueError("Cannot delete the only event in a position. Delete the entire position instead.")
        
        # Delete the event
        self.db.delete(event)
        self.db.commit()
        
        # Recalculate position metrics
        self._recalculate_position(position_id)
        
        return True
    
    def delete_position(self, position_id: int) -> bool:
        """Delete a position and all its related data (events, journal entries, charts, etc.)"""
        position = self.db.query(TradingPosition).get(position_id)
        if not position:
            raise ValueError(f"Position {position_id} not found")
        
        try:
            # Delete related data in the correct order to avoid foreign key constraints
            
            # 1. Delete journal entries
            from app.models.position_models import TradingPositionJournalEntry
            journal_entries = self.db.query(TradingPositionJournalEntry).filter_by(position_id=position_id).all()
            for entry in journal_entries:
                self.db.delete(entry)
            
            # 2. Delete charts
            from app.models.position_models import TradingPositionChart
            charts = self.db.query(TradingPositionChart).filter_by(position_id=position_id).all()
            for chart in charts:
                self.db.delete(chart)
            
            # 3. Delete pending orders (if they exist)
            try:
                from app.models.import_models import ImportedPendingOrder
                pending_orders = self.db.query(ImportedPendingOrder).filter_by(position_id=position_id).all()
                for order in pending_orders:
                    self.db.delete(order)
            except ImportError:
                # ImportedPendingOrder might not exist in all setups
                pass
            
            # 4. Delete all events
            events = self.db.query(TradingPositionEvent).filter_by(position_id=position_id).all()
            for event in events:
                self.db.delete(event)
            
            # 5. Finally, delete the position itself
            self.db.delete(position)
            
            # Commit all deletions
            self.db.commit()
            
            return True
            
        except Exception as e:
            # Rollback in case of error
            self.db.rollback()
            raise ValueError(f"Failed to delete position: {str(e)}")
    
    # === Position Calculations ===
    
    def _recalculate_position(self, position_id: int) -> None:
        """Recalculate all position metrics from events (FIFO cost basis)"""
        position = self.db.query(TradingPosition).get(position_id)
        events = self.db.query(TradingPositionEvent).filter_by(
            position_id=position_id
        ).order_by(TradingPositionEvent.event_date).all()
        
        # Initialize state
        total_shares = 0
        total_realized_pnl = 0
        buy_queue = []  # FIFO queue: [{shares, price, cost}]
        current_stop_loss = None
        current_take_profit = None
        
        for event in events:
            if event.event_type == EventType.BUY:
                # Add to position
                cost = event.shares * event.price
                buy_queue.append({
                    'shares': event.shares,
                    'price': event.price,
                    'cost': cost
                })
                total_shares += event.shares
                
                # Update risk management from most recent buy
                current_stop_loss = event.stop_loss
                current_take_profit = event.take_profit
                
            elif event.event_type == EventType.SELL:
                # Remove from position using FIFO
                # Handle both imported (positive shares) and manual (negative shares) events
                shares_to_sell = abs(event.shares)  # Always positive
                sell_proceeds = shares_to_sell * event.price
                
                # Calculate cost basis using FIFO
                sell_cost = 0
                remaining_to_sell = shares_to_sell
                
                while remaining_to_sell > 0 and buy_queue:
                    buy_lot = buy_queue[0]
                    
                    if buy_lot['shares'] <= remaining_to_sell:
                        # Use entire lot
                        sell_cost += buy_lot['cost']
                        remaining_to_sell -= buy_lot['shares']
                        buy_queue.pop(0)
                    else:
                        # Use partial lot
                        partial_ratio = remaining_to_sell / buy_lot['shares']
                        partial_cost = partial_ratio * buy_lot['cost']
                        sell_cost += partial_cost
                        
                        # Update remaining lot
                        buy_lot['shares'] -= remaining_to_sell
                        buy_lot['cost'] -= partial_cost
                        remaining_to_sell = 0
                
                # Add to realized P&L
                trade_pnl = sell_proceeds - sell_cost
                total_realized_pnl += trade_pnl
                total_shares -= shares_to_sell
        
        # Calculate current cost basis and average price
        total_cost = sum(lot['cost'] for lot in buy_queue)
        avg_entry_price = total_cost / total_shares if total_shares > 0 else 0
        
        # Update position
        position.current_shares = total_shares
        position.total_cost = total_cost
        position.avg_entry_price = avg_entry_price
        position.total_realized_pnl = total_realized_pnl
        position.current_stop_loss = current_stop_loss
        position.current_take_profit = current_take_profit
        position.status = PositionStatus.CLOSED if total_shares <= 0 else PositionStatus.OPEN
        position.updated_at = utc_now()
        
        if position.status == PositionStatus.CLOSED and not position.closed_at:
            position.closed_at = utc_now()
        elif position.status == PositionStatus.OPEN and position.closed_at:
            position.closed_at = None  # Re-opened
        
        self.db.commit()
    
    def _calculate_sell_pnl(self, position_id: int, shares_to_sell: int, sell_price: float) -> float:
        """Calculate P&L for a sell using FIFO cost basis"""
        events = self.db.query(TradingPositionEvent).filter_by(
            position_id=position_id
        ).order_by(TradingPositionEvent.event_date).all()
        
        # Rebuild buy queue up to this point
        buy_queue = []
        for event in events:
            if event.event_type == EventType.BUY:
                buy_queue.append({
                    'shares': event.shares,
                    'price': event.price,
                    'cost': event.shares * event.price
                })
            elif event.event_type == EventType.SELL:
                # Process previous sells to maintain FIFO state
                shares_sold = -event.shares
                remaining = shares_sold
                
                while remaining > 0 and buy_queue:
                    buy_lot = buy_queue[0]
                    if buy_lot['shares'] <= remaining:
                        remaining -= buy_lot['shares']
                        buy_queue.pop(0)
                    else:
                        partial_ratio = remaining / buy_lot['shares']
                        buy_lot['shares'] -= remaining
                        buy_lot['cost'] -= partial_ratio * buy_lot['cost']
                        remaining = 0
        
        # Now calculate cost for the current sell
        sell_cost = 0
        remaining_to_sell = shares_to_sell
        
        while remaining_to_sell > 0 and buy_queue:
            buy_lot = buy_queue[0]
            
            if buy_lot['shares'] <= remaining_to_sell:
                sell_cost += buy_lot['cost']
                remaining_to_sell -= buy_lot['shares']
                buy_queue.pop(0)
            else:
                partial_ratio = remaining_to_sell / buy_lot['shares']
                sell_cost += partial_ratio * buy_lot['cost']
                remaining_to_sell = 0
        
        sell_proceeds = shares_to_sell * sell_price
        return sell_proceeds - sell_cost
    
    # === Query Methods ===
    
    def get_position(self, position_id: int) -> Optional[TradingPosition]:
        """Get position by ID"""
        return self.db.query(TradingPosition).get(position_id)
    
    def get_user_positions(
        self,
        user_id: int,
        status: Optional[PositionStatus] = None,
        ticker: Optional[str] = None,
        include_events: bool = False
    ) -> List[TradingPosition]:
        """Get positions for a user with optimized queries"""
        from sqlalchemy.orm import joinedload
        
        query = self.db.query(TradingPosition).filter(TradingPosition.user_id == user_id)
        
        # Eager load events if requested to avoid N+1 queries
        if include_events:
            query = query.options(joinedload(TradingPosition.events))
        
        if status:
            query = query.filter(TradingPosition.status == status)
        
        if ticker:
            query = query.filter(TradingPosition.ticker == ticker.upper())
        
        return query.order_by(desc(TradingPosition.opened_at)).all()
    
    def get_position_events(self, position_id: int) -> List[TradingPositionEvent]:
        """Get all events for a position"""
        return self.db.query(TradingPositionEvent).filter_by(
            position_id=position_id
        ).order_by(TradingPositionEvent.event_date).all()
    
    def get_position_summary(self, position_id: int) -> Dict[str, Any]:
        """Get comprehensive position summary with metrics"""
        position = self.get_position(position_id)
        if not position:
            return {}
        
        events = self.get_position_events(position_id)
        
        # Calculate additional metrics
        buy_events = [e for e in events if e.event_type == EventType.BUY]
        sell_events = [e for e in events if e.event_type == EventType.SELL]
        
        total_bought = sum(e.shares for e in buy_events)
        total_sold = sum(-e.shares for e in sell_events)  # Convert negative to positive
        
        avg_buy_price = (
            sum(e.shares * e.price for e in buy_events) / total_bought
            if total_bought > 0 else 0
        )
        
        avg_sell_price = (
            sum(-e.shares * e.price for e in sell_events) / total_sold
            if total_sold > 0 else 0
        )
        
        return {
            'position': position,
            'events': events,
            'metrics': {
                'total_bought': total_bought,
                'total_sold': total_sold,
                'avg_buy_price': round(avg_buy_price, 4),
                'avg_sell_price': round(avg_sell_price, 4),
                'realized_pnl': position.total_realized_pnl,
                'current_value': position.current_shares * avg_buy_price if position.current_shares > 0 else 0,
                'total_events': len(events)
            }
        }
    
    def update_position_metadata(
        self,
        position_id: int,
        strategy: Optional[str] = None,
        setup_type: Optional[str] = None,
        timeframe: Optional[str] = None,
        notes: Optional[str] = None,
        lessons: Optional[str] = None,
        mistakes: Optional[str] = None,
        **kwargs
    ) -> TradingPosition:
        """Update position metadata (non-financial fields)"""
        position = self.get_position(position_id)
        if not position:
            raise ValueError(f"Position {position_id} not found")
        
        if strategy is not None:
            position.strategy = strategy
        if setup_type is not None:
            position.setup_type = setup_type
        if timeframe is not None:
            position.timeframe = timeframe
        if notes is not None:
            position.notes = notes
        if lessons is not None:
            position.lessons = lessons
        if mistakes is not None:
            position.mistakes = mistakes
        
        # Update any other provided fields
        for key, value in kwargs.items():
            if hasattr(position, key) and value is not None:
                setattr(position, key, value)
        
        position.updated_at = utc_now()
        self.db.commit()
        
        return position