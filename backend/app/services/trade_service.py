from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional
from fastapi import HTTPException
from datetime import datetime
import uuid

from app.models.models import Trade, TradeEntry, PartialExit, User
from app.models.schemas import TradeCreate, TradeUpdate, TradeEntryCreate, PartialExitCreate

def extract_image_urls_from_notes(notes: str) -> List[str]:
    """Extract image URLs from notes field"""
    if not notes:
        return []
    
    image_urls = []
    for line in notes.split('\n'):
        if line.startswith('IMAGE_URL:'):
            url = line.replace('IMAGE_URL:', '').strip()
            if url:
                image_urls.append(url)
    return image_urls

def clean_notes_of_image_urls(notes: str) -> str:
    """Remove image URLs from notes and return clean notes"""
    if not notes:
        return ""
    
    filtered_lines = [line for line in notes.split('\n') if not line.startswith('IMAGE_URL:')]
    return '\n'.join(filtered_lines).strip()

# TODO: move calculations to utils module
# NOTE: this whole file needs refactoring
def calculate_trade_metrics(trade_data):
    position_value = trade_data.position_size * trade_data.entry_price
    
    # Calculate risk per share and total risk only if stop_loss is provided
    if trade_data.stop_loss is not None:
        risk_per_share = trade_data.entry_price - trade_data.stop_loss if trade_data.trade_type == "long" else trade_data.stop_loss - trade_data.entry_price
        total_risk = risk_per_share * trade_data.position_size
    else:
        risk_per_share = None
        total_risk = None
    
    # Calculate risk reward ratio if take profit is provided and we have risk_per_share
    risk_reward_ratio = None
    if trade_data.take_profit and risk_per_share is not None and risk_per_share > 0:
        reward_per_share = trade_data.take_profit - trade_data.entry_price if trade_data.trade_type == "long" else trade_data.entry_price - trade_data.take_profit
        risk_reward_ratio = reward_per_share / risk_per_share
    
    return {
        "position_value": position_value,
        "risk_per_share": risk_per_share,
        "total_risk": total_risk,
        "risk_reward_ratio": risk_reward_ratio
    }


def create_trade(db: Session, trade: TradeCreate, user_id: int) -> Trade:
    try:
        print(f"Received trade data: {trade}")
        
        # Use account balance from trade request, fallback to user's stored balance
        account_balance_snapshot = trade.account_balance_snapshot
        if account_balance_snapshot is None:
            # Fallback to user's stored balance
            user = db.query(User).filter(User.id == user_id).first()
            account_balance_snapshot = (user.current_account_balance if user and user.current_account_balance 
                                      else user.default_account_size if user and user.default_account_size 
                                      else 10000.0)
        
        metrics = calculate_trade_metrics(trade)
        
        # Generate a unique trade group ID if not provided
        trade_group_id = trade.trade_group_id or f"tg_{str(uuid.uuid4()).replace('-', '')[:12]}"
        
        db_trade = Trade(
            user_id=user_id,
            trade_group_id=trade_group_id,
            ticker=trade.ticker,
            trade_type=trade.trade_type,
            status=trade.status,
            entry_price=trade.entry_price,
            entry_date=trade.entry_date or datetime.utcnow(),
            entry_notes=trade.entry_notes,
            exit_price=trade.exit_price,
            exit_date=trade.exit_date,
            exit_notes=None,
            position_size=trade.position_size,
            position_value=metrics["position_value"],
            stop_loss=trade.stop_loss,
            take_profit=trade.take_profit,
            risk_per_share=metrics["risk_per_share"],
            total_risk=metrics["total_risk"],
            risk_reward_ratio=metrics["risk_reward_ratio"],
            account_balance_snapshot=account_balance_snapshot,  # Store account balance at trade creation
            strategy=trade.strategy,
            setup_type=trade.setup_type,
            timeframe=trade.timeframe,
            market_conditions=trade.market_conditions or "Normal",
            mistakes=None,  # Handle this separately if needed
            lessons=None    # Handle this separately if needed
        )
        
        # Calculate P&L if trade is closed and has exit price
        if trade.status == "closed" and trade.exit_price:
            if trade.trade_type == "long":
                db_trade.profit_loss = (trade.exit_price - trade.entry_price) * trade.position_size
            else:  # short
                db_trade.profit_loss = (trade.entry_price - trade.exit_price) * trade.position_size
                
            if trade.entry_price > 0:
                db_trade.profit_loss_percent = (db_trade.profit_loss / (trade.entry_price * trade.position_size)) * 100
        db.add(db_trade)
        db.commit()
        db.refresh(db_trade)
        
        # Create corresponding TradeEntry record for manual trades
        # This ensures manually created trades appear in the positions page
        from app.models.models import TradeEntry
        
        trade_entry = TradeEntry(
            trade_id=db_trade.id,
            entry_date=db_trade.entry_date,
            entry_price=db_trade.entry_price,
            shares=db_trade.position_size,
            stop_loss=db_trade.stop_loss,
            notes=db_trade.entry_notes,
            is_active=True if db_trade.status.upper() in ['ACTIVE', 'PLANNED'] else False
        )
        
        db.add(trade_entry)
        db.commit()
        db.refresh(trade_entry)

        # Handle partial exits if provided
        if trade.partial_exits:
            handle_partial_exits(db, db_trade, trade.partial_exits)
            db.commit()
            db.refresh(db_trade)
        
        # Update account balance if trade is closed
        if trade.status and trade.status.upper() == "CLOSED":
            update_account_balance_from_trades(db, user_id)
        
        # Return trade with tags field for API response
        # Since we don't have tags in the database yet, return empty list
        # In a real implementation, you would handle tags properly
        return db_trade
        
    except Exception as e:
        db.rollback()
        # Print detailed error information
        import traceback
        print(f"Error in create_trade: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


def get_trades(
    db: Session, 
    user_id: int, 
    skip: int = 0, 
    limit: int = 10000,  # Increased from 100 to 10000 to show more trades
    status: Optional[str] = None,
    ticker: Optional[str] = None,
    setup_type: Optional[str] = None
) -> List[Trade]:
    """Get all trades with optional filtering"""
    query = db.query(Trade).filter(Trade.user_id == user_id)
    
    # Apply filters if provided
    if status:
        query = query.filter(Trade.status == status)
    if ticker:
        query = query.filter(Trade.ticker == ticker)
    if setup_type:
        query = query.filter(Trade.setup_type == setup_type)
        
    # Order by entry date descending (newest first)
    query = query.order_by(Trade.entry_date.desc())
    
    # Apply pagination
    return query.offset(skip).limit(limit).all()


def get_trade(db: Session, trade_id: int, user_id: int = None) -> Optional[Trade]:
    """Get a specific trade by ID"""
    query = db.query(Trade).filter(Trade.id == trade_id)
    if user_id:
        query = query.filter(Trade.user_id == user_id)
    return query.first()


def trade_to_response_dict(trade: Trade) -> dict:
    """Convert Trade object to dict with imageUrls extracted from entry_notes"""
    return trade_to_dict_with_images(trade)


def update_trade(db: Session, trade_id: int, trade_update: TradeUpdate) -> Trade:
    """Update an existing trade"""
    # Get the existing trade
    db_trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not db_trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    # Update trade data based on the provided fields
    update_data = trade_update.dict(exclude_unset=True)
    
    # If any metrics-related fields are updated, recalculate the metrics
    should_recalculate = any(field in update_data for field in 
                            ["entry_price", "stop_loss", "take_profit", "position_size", "trade_type"])
    
    if should_recalculate:
        # Create a temporary object with updated values for calculation
        temp_trade = TradeCreate(
            ticker=update_data.get("ticker", db_trade.ticker),
            trade_type=update_data.get("trade_type", db_trade.trade_type),
            status=update_data.get("status", db_trade.status),
            entry_price=update_data.get("entry_price", db_trade.entry_price),
            stop_loss=update_data.get("stop_loss", db_trade.stop_loss),
            take_profit=update_data.get("take_profit", db_trade.take_profit),
            position_size=update_data.get("position_size", db_trade.position_size),
            strategy=update_data.get("strategy", db_trade.strategy),
            setup_type=update_data.get("setup_type", db_trade.setup_type),
            timeframe=update_data.get("timeframe", db_trade.timeframe)
        )
        
        # Calculate new metrics
        metrics = calculate_trade_metrics(temp_trade)
        
        # Update metrics in the trade data
        update_data.update(metrics)
    
    # Calculate P&L if status changes to closed or exit price is updated
    if "exit_price" in update_data or ("status" in update_data and update_data["status"] == "closed"):
        exit_price = update_data.get("exit_price", db_trade.exit_price)
        if exit_price:  # Only calculate if exit price exists
            trade_type = update_data.get("trade_type", db_trade.trade_type)
            entry_price = update_data.get("entry_price", db_trade.entry_price)
            position_size = update_data.get("position_size", db_trade.position_size)
            
            if trade_type == "long":
                profit_loss = (exit_price - entry_price) * position_size
            else:  # short
                profit_loss = (entry_price - exit_price) * position_size
                
            update_data["profit_loss"] = profit_loss
            
            if entry_price > 0:
                update_data["profit_loss_percent"] = (profit_loss / (entry_price * position_size)) * 100
    
    # Update the trade with the new data
    for key, value in update_data.items():
        # Skip partial_exits as we'll handle them separately
        if key != "partial_exits":
            setattr(db_trade, key, value)
    
    # Handle partial exits if provided
    if "partial_exits" in update_data:
        # Ensure it's a list before processing
        if update_data["partial_exits"] is not None:
            handle_partial_exits(db, db_trade, update_data["partial_exits"])
    
    # Update the modified timestamp
    db_trade.updated_at = datetime.utcnow()
    
    # Update account balance if trade status changed to closed
    if "status" in update_data and update_data["status"].upper() == "CLOSED":
        update_account_balance_from_trades(db, db_trade.user_id)
    
    db.commit()
    db.refresh(db_trade)
    return db_trade


def delete_trade(db: Session, trade_id: int) -> None:
    """Delete a trade"""
    db_trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not db_trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    db.delete(db_trade)
    db.commit()


def handle_partial_exits(db: Session, trade: Trade, partial_exits_data):
    """Handle partial exits for a trade, either creating new ones or updating existing ones"""
    from app.models.models import PartialExit
    
    if not partial_exits_data:
        return
        
    # First, delete all existing partial exits
    existing_exits = db.query(PartialExit).filter(PartialExit.trade_id == trade.id).all()
    db.query(PartialExit).filter(PartialExit.trade_id == trade.id).delete()
    
    # Then create new ones
    for exit_data in partial_exits_data:
        # Check if exit_data is a dict or an object and access accordingly
        if isinstance(exit_data, dict):
            db_exit = PartialExit(
                trade_id=trade.id,
                exit_price=exit_data["exit_price"],
                exit_date=exit_data["exit_date"],
                shares_sold=exit_data["shares_sold"],
                profit_loss=exit_data["profit_loss"],
                notes=exit_data.get("notes")  # Using .get() for optional field
            )
        else:
            # Handle as object with attributes (for cases where Pydantic models are passed)
            db_exit = PartialExit(
                trade_id=trade.id,
                exit_price=exit_data.exit_price,
                exit_date=exit_data.exit_date,
                shares_sold=exit_data.shares_sold,
                profit_loss=exit_data.profit_loss,
                notes=exit_data.notes
            )
        db.add(db_exit)
    
    # Calculate total shares sold in partial exits
    # Handle both dict and object cases
    if partial_exits_data and isinstance(partial_exits_data[0], dict):
        total_shares_sold = sum(exit_data["shares_sold"] for exit_data in partial_exits_data)
        print(f"Total shares sold in partial exits: {total_shares_sold}")
    else:
        total_shares_sold = sum(exit_data.shares_sold for exit_data in partial_exits_data)
        print(f"Total shares sold in partial exits: {total_shares_sold}")
    
    print(f"Trade position size: {trade.position_size}")
    
    # If all shares have been sold in partial exits, we don't need an exit price
    # But if exit price is already set (e.g., stop loss hit), we'll keep it
    if total_shares_sold >= trade.position_size and not trade.exit_price:
        print("All shares sold via partial exits, setting trade status to closed")
        trade.status = "closed"
        
        # Calculate overall profit/loss from partial exits
        if partial_exits_data and isinstance(partial_exits_data[0], dict):
            total_profit_loss = sum(exit_data["profit_loss"] for exit_data in partial_exits_data)
        else:
            total_profit_loss = sum(exit_data.profit_loss for exit_data in partial_exits_data)
        trade.profit_loss = total_profit_loss
        
        # Calculate percentage profit/loss
        if trade.entry_price > 0:
            trade.profit_loss_percent = (total_profit_loss / (trade.entry_price * trade.position_size)) * 100
        
        print(f"Updated trade profit/loss to: {trade.profit_loss}")
    
    # Recalculate total profit/loss if the trade has partial exits and is closed with an exit price
    elif trade.status == "closed" and trade.exit_price:
        # Calculate remaining shares after partial exits
        remaining_shares = max(0, trade.position_size - total_shares_sold)
        print(f"Remaining shares for final exit: {remaining_shares}")
        
        # Get base profit/loss from the final exit (only for remaining shares)
        if remaining_shares > 0:
            if trade.trade_type == "long":
                base_profit_loss = (trade.exit_price - trade.entry_price) * remaining_shares
            else:  # short
                base_profit_loss = (trade.entry_price - trade.exit_price) * remaining_shares
        else:
            base_profit_loss = 0
              # Add profit/loss from all partial exits
        if partial_exits_data and isinstance(partial_exits_data[0], dict):
            partial_exits_profit_loss = sum(exit_data["profit_loss"] for exit_data in partial_exits_data)
        else:
            partial_exits_profit_loss = sum(exit_data.profit_loss for exit_data in partial_exits_data)
            
        total_profit_loss = base_profit_loss + partial_exits_profit_loss
        
        print(f"Final exit P&L: {base_profit_loss}, Partial exits P&L: {partial_exits_profit_loss}")
        print(f"Total P&L: {total_profit_loss}")
        
        trade.profit_loss = total_profit_loss
        
        # Recalculate profit_loss_percent
        if trade.entry_price > 0:
            trade.profit_loss_percent = (total_profit_loss / (trade.entry_price * trade.position_size)) * 100


def trade_to_dict_with_images(trade) -> dict:
    """Convert a Trade object to dict with imageUrls extracted from entry_notes"""
    # Clean notes (without IMAGE_URL lines)
    clean_notes = clean_notes_of_image_urls(trade.entry_notes or "")
    
    trade_dict = {
        'id': trade.id,
        'user_id': trade.user_id,
        'ticker': trade.ticker,
        'trade_type': trade.trade_type,
        'status': trade.status,
        'instrument_type': trade.instrument_type.value if trade.instrument_type else 'STOCK',
        'entry_price': trade.entry_price,
        'entry_date': trade.entry_date,
        'entry_notes': clean_notes,  # Clean notes for display
        'notes': clean_notes,  # Also map to 'notes' for frontend compatibility
        'exit_price': trade.exit_price,
        'exit_date': trade.exit_date,
        'exit_notes': trade.exit_notes,
        'position_size': trade.position_size,
        'position_value': trade.position_value,
        'stop_loss': trade.stop_loss,
        'take_profit': trade.take_profit,
        'risk_per_share': trade.risk_per_share,
        'total_risk': trade.total_risk,
        'risk_reward_ratio': trade.risk_reward_ratio,
        'account_balance_snapshot': trade.account_balance_snapshot,
        'profit_loss': trade.profit_loss,
        'profit_loss_percent': trade.profit_loss_percent,
        'strategy': trade.strategy,
        'setup_type': trade.setup_type,
        'timeframe': trade.timeframe,
        'market_conditions': trade.market_conditions,
        'mistakes': trade.mistakes,
        'lessons': trade.lessons,
        'created_at': trade.created_at,
        'updated_at': trade.updated_at,
        # Extract image URLs from entry_notes
        'imageUrls': extract_image_urls_from_notes(trade.entry_notes or "")
    }
    
    return trade_dict


# Multi-entry position management functions

def add_to_position(db: Session, trade_id: int, entry: TradeEntryCreate) -> TradeEntry:
    """Add a new entry to an existing position"""
    
    # Get the trade to ensure it exists and is active
    trade = get_trade(db, trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    if trade.status not in ['active', 'planned']:
        raise HTTPException(status_code=400, detail="Cannot add to closed or canceled positions")
    
    # Create new entry
    db_entry = TradeEntry(
        trade_id=trade_id,
        entry_price=entry.entry_price,
        entry_date=entry.entry_date,
        shares=entry.shares,
        stop_loss=entry.stop_loss,
        notes=entry.notes,
        is_active=True
    )
    
    db.add(db_entry)
    db.flush()  # Flush to get the ID
    
    # Update trade with aggregated position data
    _update_trade_aggregates(db, trade_id)
    
    db.commit()
    db.refresh(db_entry)
    
    return db_entry


def sell_from_position(db: Session, trade_id: int, exit_data: PartialExitCreate) -> dict:
    """Sell shares from a position (create partial exit)"""
    
    # Get the trade
    trade = get_trade(db, trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    # Calculate current position size
    current_shares = _calculate_current_shares(db, trade_id)
    
    if exit_data.shares_sold > current_shares:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot sell {exit_data.shares_sold} shares. Only {current_shares} shares available."
        )
    
    # Create partial exit record
    db_exit = PartialExit(
        trade_id=trade_id,
        exit_price=exit_data.exit_price,
        exit_date=exit_data.exit_date,
        shares_sold=exit_data.shares_sold,
        profit_loss=exit_data.profit_loss,
        notes=exit_data.notes
    )
    
    db.add(db_exit)
    db.flush()
    
    # Update trade aggregates
    _update_trade_aggregates(db, trade_id)
    
    # Check if position is now fully closed
    remaining_shares = _calculate_current_shares(db, trade_id)
    if remaining_shares <= 0:
        trade.status = 'closed'
        if not trade.exit_date:
            trade.exit_date = exit_data.exit_date
        if not trade.exit_price:
            trade.exit_price = exit_data.exit_price
    
    db.commit()
    db.refresh(db_exit)
    
    return {
        "exit_id": db_exit.id,
        "shares_sold": db_exit.shares_sold,
        "remaining_shares": remaining_shares,
        "status": trade.status
    }


def get_trade_details(db: Session, trade_id: int) -> dict:
    """Get comprehensive trade details with all entries and exits"""
    
    trade = get_trade(db, trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    # Get all entries
    entries = db.query(TradeEntry).filter(TradeEntry.trade_id == trade_id).all()
    
    # Get all exits
    exits = db.query(PartialExit).filter(PartialExit.trade_id == trade_id).all()
    
    # Calculate aggregated data
    current_shares = _calculate_current_shares(db, trade_id)
    avg_entry_price = _calculate_average_entry_price(db, trade_id)
    total_invested = sum(entry.shares * entry.entry_price for entry in entries)
    total_risk = _calculate_total_risk(db, trade_id, avg_entry_price)
    
    return {
        "trade": trade_to_response_dict(trade),
        "entries": [_entry_to_dict(entry) for entry in entries],
        "exits": [_exit_to_dict(exit) for exit in exits],
        "calculated": {
            "current_shares": current_shares,
            "avg_entry_price": avg_entry_price,
            "total_invested": total_invested,
            "total_risk": total_risk,
            "entries_count": len(entries),
            "exits_count": len(exits)
        }
    }


# Helper functions for multi-entry calculations

def _calculate_current_shares(db: Session, trade_id: int) -> int:
    """Calculate current shares from active TradeEntry records"""
    
    # Sum current shares from active entries (shares are already reduced when sold)
    active_entries = db.query(TradeEntry).filter(
        TradeEntry.trade_id == trade_id,
        TradeEntry.is_active == True
    ).all()
    
    return sum(entry.shares for entry in active_entries if entry.shares > 0)


def _calculate_average_entry_price(db: Session, trade_id: int) -> float:
    """Calculate weighted average entry price"""
    
    entries = db.query(TradeEntry).filter(
        TradeEntry.trade_id == trade_id,
        TradeEntry.is_active == True
    ).all()
    
    if not entries:
        return 0.0
    
    total_cost = sum(entry.shares * entry.entry_price for entry in entries)
    total_shares = sum(entry.shares for entry in entries)
    
    return total_cost / total_shares if total_shares > 0 else 0.0


def _calculate_total_risk(db: Session, trade_id: int, current_price: float = None) -> float:
    """Calculate total risk from all entries (only stops that create actual risk)"""
    
    entries = db.query(TradeEntry).filter(
        TradeEntry.trade_id == trade_id,
        TradeEntry.is_active == True
    ).all()
    
    total_risk = 0.0
    
    for entry in entries:
        # For long positions: risk only if stop_loss < entry_price (actual risk)
        # For short positions: risk only if stop_loss > entry_price
        if entry.entry_price > entry.stop_loss:  # Assuming long positions for now
            risk_per_share = entry.entry_price - entry.stop_loss
            total_risk += risk_per_share * entry.shares
    
    return total_risk


def _update_trade_aggregates(db: Session, trade_id: int):
    """Update trade-level aggregated fields"""
    
    trade = get_trade(db, trade_id)
    if not trade:
        return
    
    # Update position size
    trade.position_size = _calculate_current_shares(db, trade_id)
    
    # Update average entry price
    avg_price = _calculate_average_entry_price(db, trade_id)
    if avg_price > 0:
        trade.entry_price = avg_price
    
    # Update position value
    trade.position_value = trade.position_size * trade.entry_price
    
    # Update total risk
    trade.total_risk = _calculate_total_risk(db, trade_id)
    
    # Update status if position is empty
    if trade.position_size <= 0:
        trade.status = 'closed'


def _entry_to_dict(entry: TradeEntry) -> dict:
    """Convert TradeEntry to dict"""
    return {
        "id": entry.id,
        "trade_id": entry.trade_id,
        "entry_price": entry.entry_price,
        "entry_date": entry.entry_date,
        "shares": entry.shares,
        "stop_loss": entry.stop_loss,
        "notes": entry.notes,
        "is_active": entry.is_active,
        "created_at": entry.created_at
    }


def _exit_to_dict(exit: PartialExit) -> dict:
    """Convert PartialExit to dict"""
    return {
        "id": exit.id,
        "trade_id": exit.trade_id,
        "exit_price": exit.exit_price,
        "exit_date": exit.exit_date,
        "shares_sold": exit.shares_sold,
        "profit_loss": exit.profit_loss,
        "notes": exit.notes,
        "created_at": exit.created_at
    }

def add_to_position(db: Session, trade_group_id: str, entry: TradeEntryCreate) -> dict:
    """Add a new entry to an existing position (create TradeEntry within existing trade group)"""
    
    # Get any active trade in the trade group (we just need one to link the TradeEntry to)
    existing_trade = db.query(Trade).filter(
        Trade.trade_group_id == trade_group_id,
        Trade.status == 'active'
    ).first()
    
    if not existing_trade:
        raise HTTPException(status_code=404, detail="No active trade found in position")
    
    # Create only a TradeEntry record linked to the existing trade
    new_entry = TradeEntry(
        trade_id=existing_trade.id,  # Link to existing trade, don't create new trade
        entry_date=entry.entry_date,
        entry_price=entry.entry_price,
        shares=entry.shares,
        stop_loss=entry.stop_loss,
        notes=entry.notes,
        is_active=True
    )
    
    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)
    
    return {
        "message": "Successfully added to position",
        "trade_entry_id": new_entry.id,
        "trade_id": existing_trade.id,
        "trade_group_id": trade_group_id,
        "entry_price": entry.entry_price,
        "shares": entry.shares,
        "stop_loss": entry.stop_loss
    }


def sell_from_position(db: Session, trade_id: int, exit_data: PartialExitCreate) -> dict:
    """Sell shares from an existing position"""
    
    # Verify the trade exists and is active
    trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    if trade.status not in ['active', 'planned']:
        raise HTTPException(status_code=400, detail="Cannot sell from closed or cancelled positions")
    
    # Calculate current position size
    current_shares = calculate_current_position_size(db, trade_id)
    
    if exit_data.shares_sold > current_shares:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot sell {exit_data.shares_sold} shares. Only {current_shares} shares available."
        )
    
    # Create partial exit record
    partial_exit = PartialExit(
        trade_id=trade_id,
        exit_price=exit_data.exit_price,
        exit_date=exit_data.exit_date,
        shares_sold=exit_data.shares_sold,
        profit_loss=exit_data.profit_loss,
        notes=exit_data.notes,
        created_at=datetime.utcnow()
    )
    
    db.add(partial_exit)
    
    # Update trade aggregates
    update_trade_aggregates(db, trade_id)
    
    # Check if position is fully closed
    remaining_shares = calculate_current_position_size(db, trade_id)
    if remaining_shares <= 0:
        trade.status = 'closed'
        trade.exit_date = exit_data.exit_date
        trade.exit_price = exit_data.exit_price
    
    db.commit()
    db.refresh(partial_exit)
    
    return {
        "id": partial_exit.id,
        "trade_id": partial_exit.trade_id,
        "exit_price": partial_exit.exit_price,
        "exit_date": partial_exit.exit_date,
        "shares_sold": partial_exit.shares_sold,
        "profit_loss": partial_exit.profit_loss,
        "notes": partial_exit.notes,
        "remaining_shares": remaining_shares
    }

def get_trade_details(db: Session, trade_id: int) -> dict:
    """Get comprehensive trade details including all entries and exits"""
    
    trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    # Get active entries (remaining positions)
    active_entries = db.query(TradeEntry).filter(
        TradeEntry.trade_id == trade_id,
        TradeEntry.is_active == True,
        TradeEntry.shares > 0
    ).all()
    
    # Get ALL entries for original purchase history
    all_entries = db.query(TradeEntry).filter(TradeEntry.trade_id == trade_id).all()
    
    # Get all exits
    exits = db.query(PartialExit).filter(PartialExit.trade_id == trade_id).all()
    
    # Calculate aggregated metrics
    current_shares = calculate_current_position_size(db, trade_id)
    avg_entry_price = calculate_average_entry_price(db, trade_id)
    total_invested = sum(entry.shares * entry.entry_price for entry in active_entries)
    
    # Build positions list (remaining lots with stop losses)
    positions = [
        {
            "id": entry.id,
            "entry_price": entry.entry_price,
            "entry_date": entry.entry_date,
            "shares": entry.shares,  # Current remaining shares
            "stop_loss": entry.stop_loss,
            "notes": entry.notes,
            "is_active": entry.is_active,
            "created_at": entry.created_at
        }
        for entry in active_entries
    ]
    
    # Build entries list (original purchase history)
    # For single trades, calculate original shares by adding back sold shares
    total_sold = sum(exit.shares_sold for exit in exits)
    entries = []
    
    for entry in all_entries:
        # For single trade, simple calculation: current + proportional sales
        if len(all_entries) == 1:
            # Single entry: original = current + all sales
            original_shares = entry.shares + total_sold
        else:
            # Multiple entries: use current shares as fallback (needs proper FIFO tracking)
            original_shares = entry.shares
            
        entries.append({
            "id": entry.id,
            "entry_price": entry.entry_price,
            "entry_date": entry.entry_date,
            "shares": original_shares,  # Original purchase amount
            "notes": entry.notes or f"Purchase @ ${entry.entry_price:.2f}",
            "created_at": entry.created_at
        })
    
    return {
        "trade": trade_to_response_dict(trade),
        "positions": positions,  # Remaining lots with stop losses
        "entries": entries,      # Original purchase history
        "exits": [
            {
                "id": exit.id,
                "exit_price": exit.exit_price,
                "exit_date": exit.exit_date,
                "shares_sold": exit.shares_sold,
                "profit_loss": exit.profit_loss,
                "notes": exit.notes,
                "created_at": exit.created_at
            }
            for exit in exits
        ],
        "calculated": {
            "current_shares": current_shares,
            "avg_entry_price": avg_entry_price,
            "total_invested": total_invested,
            "positions_count": len(positions),
            "entries_count": len(entries),
            "exits_count": len(exits),
            "active_stop_losses": [entry.stop_loss for entry in active_entries if entry.is_active]
        }
    }

def calculate_current_position_size(db: Session, trade_id: int) -> int:
    """Calculate current position size from active TradeEntry records"""
    
    # Sum current shares from active entries (shares are already reduced when sold)
    active_entries = db.query(TradeEntry).filter(
        TradeEntry.trade_id == trade_id,
        TradeEntry.is_active == True
    ).all()
    
    return sum(entry.shares for entry in active_entries if entry.shares > 0)

def calculate_average_entry_price(db: Session, trade_id: int) -> float:
    """Calculate the weighted average entry price"""
    
    entries = db.query(TradeEntry).filter(TradeEntry.trade_id == trade_id).all()
    
    if not entries:
        return 0.0
    
    total_value = sum(entry.shares * entry.entry_price for entry in entries)
    total_shares = sum(entry.shares for entry in entries)
    
    return total_value / total_shares if total_shares > 0 else 0.0

def calculate_position_risk(db: Session, trade_id: int) -> float:
    """Calculate total position risk considering only stops that create actual risk"""
    
    entries = db.query(TradeEntry).filter(
        TradeEntry.trade_id == trade_id,
        TradeEntry.is_active == True
    ).all()
    
    if not entries:
        return 0.0
    
    trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not trade:
        return 0.0
    
    total_risk = 0.0
    
    for entry in entries:
        # Calculate risk per share for this entry
        if trade.trade_type == 'long':
            # For long positions, risk only exists if stop is below entry
            if entry.stop_loss < entry.entry_price:
                risk_per_share = entry.entry_price - entry.stop_loss
                total_risk += risk_per_share * entry.shares
        else:  # short position
            # For short positions, risk only exists if stop is above entry
            if entry.stop_loss > entry.entry_price:
                risk_per_share = entry.stop_loss - entry.entry_price
                total_risk += risk_per_share * entry.shares
    
    return total_risk

def update_trade_aggregates(db: Session, trade_id: int):
    """Update trade-level aggregated fields based on entries and exits"""
    
    trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not trade:
        return
    
    # Update position size
    trade.position_size = calculate_current_position_size(db, trade_id)
    
    # Update average entry price
    avg_entry = calculate_average_entry_price(db, trade_id)
    if avg_entry > 0:
        trade.entry_price = avg_entry
    
    # Update position value
    trade.position_value = trade.position_size * trade.entry_price
    
    # Update total risk
    trade.total_risk = calculate_position_risk(db, trade_id)
    
    # Update risk per share (average)
    if trade.position_size > 0:
        trade.risk_per_share = trade.total_risk / trade.position_size
    
    db.add(trade)


def update_position_stop_loss(db: Session, trade_group_id: str, new_stop_loss: float, user_id: int) -> dict:
    """Update stop loss for all active trade entries in a position"""
    from app.models.models import TradeEntry
    
    # Verify the position belongs to the user
    position_trades = db.query(Trade).filter(
        Trade.trade_group_id == trade_group_id,
        Trade.user_id == user_id,
        Trade.status == 'ACTIVE'
    ).all()
    
    if not position_trades:
        raise ValueError("Position not found or no active trades")
    
    # Update all active trade entries in this position
    entries_updated = 0
    for trade in position_trades:
        # Update all active TradeEntry records for this trade
        active_entries = db.query(TradeEntry).filter(
            TradeEntry.trade_id == trade.id,
            TradeEntry.is_active == True
        ).all()
        
        for entry in active_entries:
            entry.stop_loss = new_stop_loss
            entries_updated += 1
        
        # Also update the trade-level stop loss for consistency
        trade.stop_loss = new_stop_loss
        
        # Recalculate risk metrics for the trade
        if trade.entry_price and new_stop_loss:
            trade.risk_per_share = abs(trade.entry_price - new_stop_loss)
            trade.total_risk = trade.position_size * trade.risk_per_share
    
    db.commit()
    
    # Return updated position summary
    updated_weighted_stop = calculate_position_weighted_stop_loss(db, trade_group_id)
    
    return {
        "trade_group_id": trade_group_id,
        "new_stop_loss": new_stop_loss,
        "weighted_stop_loss": updated_weighted_stop,
        "entries_updated": entries_updated,
        "trades_updated": len(position_trades),
        "success": True
    }


def calculate_position_weighted_stop_loss(db: Session, trade_group_id: str) -> float:
    """Calculate weighted average stop loss for a position based on active trade entries"""
    from app.models.models import TradeEntry
    
    # Get all active trade entries for this position
    active_trades = db.query(Trade).filter(
        Trade.trade_group_id == trade_group_id,
        Trade.status == 'ACTIVE'
    ).all()
    
    total_weighted_stop = 0
    total_shares_with_stop = 0
    
    for trade in active_trades:
        # Get active trade entries for this trade
        active_entries = db.query(TradeEntry).filter(
            TradeEntry.trade_id == trade.id,
            TradeEntry.is_active == True
        ).all()
        
        for entry in active_entries:
            if entry.stop_loss is not None and entry.shares > 0:
                total_weighted_stop += entry.stop_loss * entry.shares
                total_shares_with_stop += entry.shares
    
    # Return weighted average, or None if no stop losses are set
    return total_weighted_stop / total_shares_with_stop if total_shares_with_stop > 0 else None


def get_positions(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[dict]:
    """Get trading positions grouped by stop-loss for the positions page"""
    
    # Get all active trades for the user
    active_trades = db.query(Trade).filter(
        Trade.user_id == user_id,
        Trade.status == 'ACTIVE'
    ).all()
    
    if not active_trades:
        return []
    
    # Get all active trade entries for these trades
    trade_ids = [trade.id for trade in active_trades]
    active_trade_entries = db.query(TradeEntry).filter(
        TradeEntry.trade_id.in_(trade_ids),
        TradeEntry.is_active == True,
        TradeEntry.shares > 0
    ).all()
    
    # Group by ticker first, then we'll handle stop-loss grouping per ticker
    positions_by_ticker = {}
    
    for entry in active_trade_entries:
        # Get the trade this entry belongs to
        trade = next((t for t in active_trades if t.id == entry.trade_id), None)
        if not trade:
            continue
        
        ticker = trade.ticker
        if ticker not in positions_by_ticker:
            positions_by_ticker[ticker] = {
                'trade_group_id': trade.trade_group_id,
                'ticker': ticker,
                'trade': trade,
                'entries': []
            }
        positions_by_ticker[ticker]['entries'].append(entry)
    
    # Now for each ticker, check if there are pending sell orders that should define stop losses
    from app.models.import_models import ImportedOrder
    
    final_positions = []
    
    for ticker, ticker_data in positions_by_ticker.items():
        trade = ticker_data['trade']
        entries = ticker_data['entries']
        
        # Check for pending sell orders for this ticker
        pending_sells = db.query(ImportedOrder).filter(
            ImportedOrder.user_id == user_id,
            ImportedOrder.symbol == ticker,
            ImportedOrder.status.in_(['Pending', 'Open', 'Working']),
            ImportedOrder.side == 'Sell'
        ).all()
        
        if pending_sells:
            # For main positions page: create ONE combined position per ticker
            
            # For imported trades: Current shares = pending sells + manual additions
            current_shares_from_sells = sum(sell.total_qty for sell in pending_sells)
            
            # Add manual trade entry shares (filter out auto-generated entries)
            manual_shares = 0
            for entry in entries:
                if entry.notes and any(phrase in entry.notes.lower() for phrase in ["import", "open position:"]):
                    continue  # Skip auto-generated entries
                manual_shares += entry.shares
            
            total_current_shares = current_shares_from_sells + manual_shares
            
            # Only subtract truly manual sells (recent sells without import-style notes)
            partial_exits = db.query(PartialExit).filter(PartialExit.trade_id == trade.id).all()
            
            # Manual sells are those without notes OR with notes that don't look like imports
            manual_sells = []
            for exit in partial_exits:
                # Skip exits that look like they were auto-created from imports
                if exit.notes and any(phrase in exit.notes.lower() for phrase in ["import", "partial exit from open position"]):
                    continue
                manual_sells.append(exit)
            
            total_manual_sold = sum(exit.shares_sold for exit in manual_sells)
            total_current_shares -= total_manual_sold
            
            # Calculate original position size from buy orders for this trade group
            # Get the trade start time to find relevant buy orders
            trade_start_time = trade.entry_date
            
            # Find buy orders for this position (since trade start time)
            from app.models.import_models import ImportedOrder
            buy_orders = db.query(ImportedOrder).filter(
                ImportedOrder.symbol == ticker,
                ImportedOrder.side == 'Buy',
                ImportedOrder.status == 'Filled',
                ImportedOrder.filled_time >= trade_start_time
            ).all()
            
            # Calculate original position size from buy orders + manual additions
            original_position_size = sum(order.total_qty for order in buy_orders) if buy_orders else current_shares_from_sells
            original_position_size += manual_shares  # Add manual additions to total bought
            
            # Calculate entry price from trade entries (these should match the buy orders)
            total_cost = sum(e.shares * e.entry_price for e in entries)
            total_entry_shares = sum(e.shares for e in entries)
            avg_entry_price = total_cost / total_entry_shares if total_entry_shares > 0 else 0
            
            # Calculate realized P&L from partial exits for this trade
            partial_exits = db.query(PartialExit).filter(
                PartialExit.trade_id == trade.id
            ).all()
            
            total_realized_pnl = sum(exit.profit_loss for exit in partial_exits if exit.profit_loss)
            
            # Use the most restrictive (highest) stop loss from pending sells
            stop_losses = [sell.price for sell in pending_sells if sell.price]
            combined_stop_loss = max(stop_losses) if stop_losses else None
            
            # Create ONE combined position for this ticker
            position = {
                "id": f"{ticker}_combined",
                "trade_group_id": trade.trade_group_id,
                "ticker": ticker,
                "trade_type": trade.trade_type,
                "displayDirection": 'Long' if trade.trade_type == 'long' else 'Short',
                "strategy": trade.strategy,
                "setup_type": trade.setup_type,
                "timeframe": trade.timeframe,
                "entry_date": min(e.entry_date for e in entries),
                "entry_price": round(avg_entry_price, 2),
                "avg_entry_price": round(avg_entry_price, 2),
                "current_shares": total_current_shares,  # Current remaining shares (imported + manual)
                "position_size": original_position_size,  # Total shares originally bought for this position
                "total_position_size": original_position_size,
                "stop_loss": combined_stop_loss,
                "take_profit": trade.take_profit,
                "total_risk": trade.total_risk,
                "realized_pnl": round(total_realized_pnl, 2),
                "status": "active",
                "last_updated": trade.created_at,
                "entry_ids": [e.id for e in entries],
                "trade_ids": [trade.id],
                "pending_sell_count": len(pending_sells)
            }
            
            final_positions.append(position)
        else:
            # No pending sell orders - for manual trades, combine into ONE position per ticker
            print(f"No pending sell orders for {ticker} - combining manual entries into one position")
            
            # Calculate total shares and weighted average entry price for all entries
            total_shares = sum(e.shares for e in entries)
            total_cost = sum(e.shares * e.entry_price for e in entries)
            avg_entry_price = total_cost / total_shares if total_shares > 0 else 0
            
            # Use the most restrictive stop loss (highest for long positions)
            stop_losses = [e.stop_loss for e in entries if e.stop_loss is not None]
            combined_stop_loss = max(stop_losses) if stop_losses else None
            
            # Create ONE combined position for this ticker
            position = {
                "id": f"{ticker}_manual_combined",
                "trade_group_id": trade.trade_group_id,
                "ticker": ticker,
                "trade_type": trade.trade_type,
                "displayDirection": 'Long' if trade.trade_type == 'long' else 'Short',
                "strategy": trade.strategy,
                "setup_type": trade.setup_type,
                "timeframe": trade.timeframe,
                "entry_date": min(e.entry_date for e in entries),
                "entry_price": round(avg_entry_price, 2),
                "avg_entry_price": round(avg_entry_price, 2),
                "current_shares": total_shares,
                "position_size": total_shares,
                "total_position_size": total_shares,
                "stop_loss": combined_stop_loss,
                "take_profit": trade.take_profit,
                "total_risk": trade.total_risk,
                "realized_pnl": 0.0,
                "status": "active",
                "last_updated": trade.created_at,
                "entry_ids": [e.id for e in entries],
                "trade_ids": [trade.id],
                "manual_entries_count": len(entries)
            }
            
            final_positions.append(position)
    
    # Sort by last_updated (most recent first)
    final_positions.sort(key=lambda x: x["last_updated"], reverse=True)
    
    # Apply pagination
    return final_positions[skip:skip + limit]


def calculate_current_position_size_by_group(db: Session, trade_group_id: str) -> float:
    """Calculate current position size for a trade group from active TradeEntry records"""
    
    # Get all trades in the group
    trades_in_group = db.query(Trade).filter(Trade.trade_group_id == trade_group_id).all()
    if not trades_in_group:
        return 0
    
    # Calculate current shares from active TradeEntry records (same logic as get_positions)
    from app.models.models import TradeEntry
    
    current_shares = 0
    for trade in trades_in_group:
        # Sum up active share lots for this trade
        active_lots = db.query(TradeEntry).filter(
            TradeEntry.trade_id == trade.id,
            TradeEntry.is_active == True
        ).all()
        
        trade_current_shares = sum(lot.shares for lot in active_lots if lot.shares > 0)
        current_shares += trade_current_shares
    
    return current_shares


def sell_from_position_by_group(db: Session, trade_group_id: str, exit_data: PartialExitCreate) -> dict:
    """Sell shares from a position (trade group)"""
    
    # Get all trades in the group
    trades_in_group = db.query(Trade).filter(Trade.trade_group_id == trade_group_id).all()
    if not trades_in_group:
        raise HTTPException(status_code=404, detail="Position not found")
    
    # Calculate current position size
    current_shares = calculate_current_position_size_by_group(db, trade_group_id)
    
    if exit_data.shares_sold > current_shares:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot sell {exit_data.shares_sold} shares. Only {current_shares} shares available."
        )
    
    # Use the first trade in the group for the partial exit (for tracking purposes)
    # This is arbitrary but we need to attach the exit to a specific trade record
    primary_trade = trades_in_group[0]
    
    # Create partial exit record
    partial_exit = PartialExit(
        trade_id=primary_trade.id,
        exit_price=exit_data.exit_price,
        exit_date=exit_data.exit_date,
        shares_sold=exit_data.shares_sold,
        profit_loss=exit_data.profit_loss,
        notes=exit_data.notes,
        created_at=datetime.utcnow()
    )
    
    db.add(partial_exit)
    
    # Update TradeEntry records to reduce shares (FIFO)
    from app.models.models import TradeEntry
    
    # Get all active trade entries for this group, ordered by entry date (FIFO)
    trade_ids = [trade.id for trade in trades_in_group]
    active_entries = db.query(TradeEntry).filter(
        TradeEntry.trade_id.in_(trade_ids),
        TradeEntry.is_active == True,
        TradeEntry.shares > 0
    ).order_by(TradeEntry.entry_date).all()
    
    shares_to_sell = exit_data.shares_sold
    
    for entry in active_entries:
        if shares_to_sell <= 0:
            break
            
        if entry.shares <= shares_to_sell:
            # This entry is completely sold
            shares_to_sell -= entry.shares
            entry.shares = 0
            entry.is_active = False
        else:
            # Partial sale of this entry
            entry.shares -= shares_to_sell
            shares_to_sell = 0
    
    # Check if position is fully closed
    remaining_shares = current_shares - exit_data.shares_sold
    if remaining_shares <= 0:
        # Mark all trades in the group as closed and all entries as inactive
        for trade in trades_in_group:
            trade.status = 'closed'
            trade.exit_date = exit_data.exit_date
            trade.exit_price = exit_data.exit_price
        
        for entry in active_entries:
            entry.is_active = False
    
    db.commit()
    db.refresh(partial_exit)
    
    return {
        "message": "Successfully sold from position",
        "trade_group_id": trade_group_id,
        "shares_sold": exit_data.shares_sold,
        "exit_price": exit_data.exit_price,
        "remaining_shares": max(0, remaining_shares),
        "partial_exit_id": partial_exit.id
    }


def get_active_entries(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[dict]:
    """Get individual active trade entries (not aggregated positions) for the positions page"""
    
    # Query to get all active trade entries with their trade information
    entries_query = db.query(
        TradeEntry.id,
        TradeEntry.trade_id,
        TradeEntry.shares,
        TradeEntry.entry_price,
        TradeEntry.stop_loss,
        TradeEntry.entry_date,
        TradeEntry.notes,
        Trade.trade_group_id,
        Trade.ticker,
        Trade.trade_type,
        Trade.strategy,
        Trade.setup_type,
        Trade.timeframe,
        Trade.take_profit
    ).join(
        Trade, TradeEntry.trade_id == Trade.id
    ).filter(
        Trade.user_id == user_id,
        Trade.status == 'ACTIVE',
        TradeEntry.is_active == True,
        TradeEntry.shares > 0
    ).order_by(
        Trade.ticker,
        TradeEntry.entry_date
    ).offset(skip).limit(limit)
    
    entries = []
    for row in entries_query.all():
        # Calculate remaining shares after partial exits
        from app.models.models import PartialExit
        
        # Get partial exits for this specific trade entry
        partial_exits = db.query(PartialExit).filter(
            PartialExit.trade_id == row.trade_id
        ).all()
        
        # Calculate total shares sold from this trade
        total_sold = sum(exit.shares_sold for exit in partial_exits if exit.shares_sold)
        
        # Calculate remaining shares for this entry
        # Note: This is a simplified approach - in reality we'd need to track
        # which partial exits came from which entries using FIFO
        remaining_shares = row.shares
        
        # For now, we'll use the corrected values we set manually
        # In future, this should be calculated properly during import
        if row.ticker == 'OPEN':
            # Use the corrected values we already set
            remaining_shares = row.shares
        else:
            # For other positions, subtract proportionally
            if total_sold > 0:
                # This is a simplified calculation - proper FIFO tracking needed
                remaining_shares = max(0, row.shares - total_sold)
        
        # Skip entries with no remaining shares
        if remaining_shares <= 0:
            continue
            
        # Calculate current market value
        current_value = remaining_shares * row.entry_price
        
        # Calculate unrealized P&L if stop loss is set
        unrealized_pnl = 0
        if row.stop_loss:
            unrealized_pnl = (row.entry_price - row.stop_loss) * remaining_shares
            if row.trade_type.upper() == 'SHORT':
                unrealized_pnl = -unrealized_pnl
        
        entry = {
            'id': f"{row.trade_group_id}_{row.id}",  # Unique ID combining group and entry
            'entry_id': row.id,
            'trade_id': row.trade_id,
            'trade_group_id': row.trade_group_id,
            'ticker': row.ticker,
            'trade_type': row.trade_type,
            'displayDirection': 'Long' if row.trade_type.upper() == 'LONG' else 'Short',
            'strategy': row.strategy,
            'setup_type': row.setup_type,
            'timeframe': row.timeframe,
            'entry_date': row.entry_date,
            'entry_price': round(row.entry_price, 2),
            'shares': remaining_shares,  # Use calculated remaining shares
            'position_size': remaining_shares,  # For this entry
            'current_shares': remaining_shares,
            'stop_loss': row.stop_loss,
            'take_profit': row.take_profit,
            'current_value': round(current_value, 2),
            'unrealized_pnl': round(unrealized_pnl, 2),
            'notes': row.notes,
            'is_individual_entry': True  # Flag to identify individual entries
        }
        entries.append(entry)
    
    return entries


def update_account_balance_from_trades(db: Session, user_id: int):
    """
    Update user's current account balance based on initial balance + all closed trades P&L
    """
    try:
        # Get the user
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return
        
        # Get initial balance (fallback to 10000 if not set)
        initial_balance = user.initial_account_balance or 10000.0
        
        # Calculate total P&L from all closed trades
        total_pnl = db.query(func.sum(Trade.profit_loss)).filter(
            Trade.user_id == user_id,
            Trade.status == "CLOSED",
            Trade.profit_loss.isnot(None)
        ).scalar() or 0.0
        
        # Update current account balance
        new_balance = initial_balance + total_pnl
        user.current_account_balance = new_balance
        
        db.commit()
        
    except Exception as e:
        print(f"Error updating account balance: {e}")
        db.rollback()


def recalculate_all_account_balances(db: Session):
    """
    Recalculate account balances for all users based on their trades
    """
    try:
        # Get all users with trades
        users_with_trades = db.query(User.id).join(Trade).distinct().all()
        
        for (user_id,) in users_with_trades:
            update_account_balance_from_trades(db, user_id)
            
        print(f"Recalculated account balances for {len(users_with_trades)} users")
        
    except Exception as e:
        print(f"Error recalculating account balances: {e}")
        db.rollback()


def get_position_size_for_ticker(db: Session, user_id: int, ticker: str, trade_group_id: str) -> int:
    """
    Get the position size for a specific ticker and trade group.
    This matches the logic used in get_positions() for consistency.
    """
    from app.models.import_models import ImportedOrder
    
    # Check if this ticker has imported orders
    has_imported_orders = db.query(ImportedOrder).filter(
        ImportedOrder.user_id == user_id,
        ImportedOrder.symbol == ticker,
        ImportedOrder.side == 'Buy',
        ImportedOrder.status == 'Filled'
    ).first() is not None
    
    if has_imported_orders:
        # For imported symbols, use original buy orders for position size
        buy_orders = db.query(ImportedOrder).filter(
            ImportedOrder.user_id == user_id,
            ImportedOrder.symbol == ticker,
            ImportedOrder.side == 'Buy',
            ImportedOrder.status == 'Filled'
        ).order_by(ImportedOrder.filled_time).all()
        
        # Calculate position size from most recent buy orders (LIFO)
        pending_sells = db.query(ImportedOrder).filter(
            ImportedOrder.user_id == user_id,
            ImportedOrder.symbol == ticker,
            ImportedOrder.status.in_(['Pending', 'Open', 'Working']),
            ImportedOrder.side == 'Sell'
        ).all()
        
        current_shares = sum(sell.total_qty for sell in pending_sells)
        
        # Work backwards from most recent buys to find position size
        position_size = 0
        shares_accounted = 0
        
        for buy_order in reversed(buy_orders):
            if shares_accounted >= current_shares:
                break
            shares_accounted += buy_order.filled_qty
            position_size += buy_order.filled_qty
        
        return position_size
    else:
        # For manual trades, get position size from the trade record
        trade = db.query(Trade).filter(
            Trade.user_id == user_id,
            Trade.ticker == ticker,
            Trade.trade_group_id == trade_group_id,
            Trade.status == 'ACTIVE'
        ).first()
        
        return int(trade.position_size) if trade else 0
