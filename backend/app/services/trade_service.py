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
        
        # Get user's current account balance for snapshotting
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
                update_data["profit_loss_percent"] = (profit_loss / (entry_price * position_size)) * 100    # Update the trade with the new data
    for key, value in update_data.items():
        # Skip partial_exits as we'll handle them separately
        if key != "partial_exits":
            setattr(db_trade, key, value)
    
    # Handle partial exits if provided
    if "partial_exits" in update_data:
        print(f"Found partial_exits in update data: {update_data['partial_exits']}")
        # Ensure it's a list before processing
        if update_data["partial_exits"] is not None:
            handle_partial_exits(db, db_trade, update_data["partial_exits"])
        else:
            print("partial_exits is None, skipping")
    else:
        print("No partial_exits found in update data")
    
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
    
    # Debug logging
    print(f"Processing partial exits for trade {trade.id}")
    print(f"Partial exits data received: {partial_exits_data}")
    
    if not partial_exits_data:
        print("No partial exits data provided")
        return
        
    # First, delete all existing partial exits
    existing_exits = db.query(PartialExit).filter(PartialExit.trade_id == trade.id).all()
    print(f"Found {len(existing_exits)} existing partial exits to delete")
    db.query(PartialExit).filter(PartialExit.trade_id == trade.id).delete()
    
    # Then create new ones
    for exit_data in partial_exits_data:
        print(f"Creating partial exit: {exit_data}")
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
    """Calculate current shares = total entries - total exits"""
    
    # Sum all entry shares
    total_entries = db.query(TradeEntry).filter(
        TradeEntry.trade_id == trade_id,
        TradeEntry.is_active == True
    ).all()
    entry_shares = sum(entry.shares for entry in total_entries)
    
    # Sum all exit shares
    total_exits = db.query(PartialExit).filter(PartialExit.trade_id == trade_id).all()
    exit_shares = sum(exit.shares_sold for exit in total_exits)
    
    return entry_shares - exit_shares


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
    """Add a new entry to an existing position (create new trade in same group)"""
    
    # Get the original trade to copy metadata
    original_trade = db.query(Trade).filter(Trade.trade_group_id == trade_group_id).first()
    if not original_trade:
        raise HTTPException(status_code=404, detail="Position not found")
    
    # Create a new trade record in the same trade group
    new_trade = Trade(
        user_id=original_trade.user_id,
        trade_group_id=trade_group_id,
        ticker=original_trade.ticker,
        trade_type=original_trade.trade_type,
        status='active',
        entry_price=entry.entry_price,
        entry_date=entry.entry_date,
        entry_notes=entry.notes,
        position_size=entry.shares,
        position_value=entry.entry_price * entry.shares,
        stop_loss=entry.stop_loss,
        take_profit=original_trade.take_profit,  # Copy from original
        strategy=original_trade.strategy,
        setup_type=original_trade.setup_type,
        timeframe=original_trade.timeframe,
        market_conditions=original_trade.market_conditions,
        created_at=datetime.utcnow()
    )
    
    # Calculate risk metrics for this entry
    if entry.stop_loss and entry.entry_price:
        risk_per_share = abs(entry.entry_price - entry.stop_loss)
        new_trade.risk_per_share = risk_per_share
        new_trade.total_risk = risk_per_share * entry.shares
        
        if original_trade.take_profit:
            reward_per_share = abs(original_trade.take_profit - entry.entry_price)
            if risk_per_share > 0:
                new_trade.risk_reward_ratio = reward_per_share / risk_per_share
    
    db.add(new_trade)
    db.commit()
    db.refresh(new_trade)
    
    return {
        "message": "Successfully added to position",
        "trade_id": new_trade.id,
        "trade_group_id": trade_group_id,
        "entry_price": entry.entry_price,
        "shares": entry.shares,
        "stop_loss": entry.stop_loss
    }
    
    db.commit()
    db.refresh(new_entry)
    
    return {
        "id": new_entry.id,
        "trade_id": new_entry.trade_id,
        "entry_price": new_entry.entry_price,
        "entry_date": new_entry.entry_date,
        "shares": new_entry.shares,
        "stop_loss": new_entry.stop_loss,
        "notes": new_entry.notes,
        "is_active": new_entry.is_active,
        "created_at": new_entry.created_at
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
    
    # Get all entries
    entries = db.query(TradeEntry).filter(TradeEntry.trade_id == trade_id).all()
    
    # Get all exits
    exits = db.query(PartialExit).filter(PartialExit.trade_id == trade_id).all()
    
    # Calculate aggregated metrics
    current_shares = calculate_current_position_size(db, trade_id)
    avg_entry_price = calculate_average_entry_price(db, trade_id)
    total_invested = sum(entry.shares * entry.entry_price for entry in entries)
    
    return {
        "trade": trade_to_response_dict(trade),
        "entries": [
            {
                "id": entry.id,
                "entry_price": entry.entry_price,
                "entry_date": entry.entry_date,
                "shares": entry.shares,
                "stop_loss": entry.stop_loss,
                "notes": entry.notes,
                "is_active": entry.is_active,
                "created_at": entry.created_at
            }
            for entry in entries
        ],
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
            "active_stop_losses": [entry.stop_loss for entry in entries if entry.is_active]
        }
    }

def calculate_current_position_size(db: Session, trade_id: int) -> int:
    """Calculate the current position size (entries - exits)"""
    
    total_entries = db.query(TradeEntry).filter(TradeEntry.trade_id == trade_id).with_entities(
        db.func.sum(TradeEntry.shares)
    ).scalar() or 0
    
    total_exits = db.query(PartialExit).filter(PartialExit.trade_id == trade_id).with_entities(
        db.func.sum(PartialExit.shares_sold)
    ).scalar() or 0
    
    return int(total_entries - total_exits)

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


def get_positions(db: Session, user_id: int, skip: int = 0, limit: int = 100) -> List[dict]:
    """Get trading positions (grouped by trade_group_id) for the positions page"""
    
    # Query to get position data grouped by trade_group_id
    # Only include positions that are not fully closed
    positions_query = db.query(
        Trade.trade_group_id,
        func.min(Trade.ticker).label('ticker'),
        func.min(Trade.trade_type).label('trade_type'),
        func.min(Trade.strategy).label('strategy'),
        func.min(Trade.setup_type).label('setup_type'),
        func.min(Trade.timeframe).label('timeframe'),
        func.min(Trade.entry_date).label('entry_date'),
        func.avg(Trade.entry_price).label('avg_entry_price'),
        func.sum(Trade.position_size).label('total_position_size'),
        func.min(Trade.stop_loss).label('stop_loss'),  # Use minimum stop loss as position stop
        func.max(Trade.take_profit).label('take_profit'),
        func.sum(Trade.total_risk).label('total_risk'),
        func.max(Trade.created_at).label('last_updated')
    ).filter(
        Trade.user_id == user_id,
        Trade.status.in_(['ACTIVE', 'PLANNED'])  # Only show open positions (uppercase)
    ).group_by(
        Trade.trade_group_id
    ).order_by(
        desc('last_updated')
    ).offset(skip).limit(limit)
    
    positions = []
    for row in positions_query.all():
        # Calculate current position size after partial exits
        current_shares = calculate_current_position_size_by_group(db, row.trade_group_id)
        
        # Skip positions with no remaining shares
        if current_shares <= 0:
            continue
            
        # Calculate realized P&L from partial exits
        trades_in_group = db.query(Trade.id).filter(Trade.trade_group_id == row.trade_group_id).all()
        trade_ids = [trade.id for trade in trades_in_group]
        
        realized_pnl = 0
        if trade_ids:
            partial_exits = db.query(PartialExit).filter(
                PartialExit.trade_id.in_(trade_ids)
            ).all()
            realized_pnl = sum(exit.profit_loss for exit in partial_exits if exit.profit_loss)
            
        position = {
            'id': row.trade_group_id,  # Use trade_group_id as the position ID
            'trade_group_id': row.trade_group_id,
            'ticker': row.ticker,
            'trade_type': row.trade_type,
            'displayDirection': 'Long' if row.trade_type == 'long' else 'Short',
            'strategy': row.strategy,
            'setup_type': row.setup_type,
            'timeframe': row.timeframe,
            'entry_date': row.entry_date,
            'entry_price': round(row.avg_entry_price, 2),
            'position_size': current_shares,
            'stop_loss': row.stop_loss,
            'take_profit': row.take_profit,
            'total_risk': row.total_risk,
            'realized_pnl': round(realized_pnl, 2),  # Add realized P&L
            'status': 'active',  # All positions returned here are active
            'last_updated': row.last_updated
        }
        
        # Calculate risk percentage if stop loss exists
        if row.stop_loss and row.avg_entry_price:
            risk_per_share = abs(row.avg_entry_price - row.stop_loss)
            position['risk_per_share'] = risk_per_share
            position['risk_percent'] = round((risk_per_share / row.avg_entry_price) * 100, 2)
        
        positions.append(position)
    
    return positions


def calculate_current_position_size_by_group(db: Session, trade_group_id: str) -> float:
    """Calculate current position size for a trade group after partial exits"""
    
    # Get total shares from all trades in the group
    total_shares = db.query(func.sum(Trade.position_size)).filter(
        Trade.trade_group_id == trade_group_id
    ).scalar() or 0
    
    # Get total shares sold via partial exits for all trades in the group
    trades_in_group = db.query(Trade.id).filter(Trade.trade_group_id == trade_group_id).all()
    trade_ids = [trade.id for trade in trades_in_group]
    
    total_sold = 0
    if trade_ids:
        total_sold = db.query(func.sum(PartialExit.shares_sold)).filter(
            PartialExit.trade_id.in_(trade_ids)
        ).scalar() or 0
    
    return max(0, total_shares - total_sold)


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
    
    # Check if position is fully closed
    remaining_shares = current_shares - exit_data.shares_sold
    if remaining_shares <= 0:
        # Mark all trades in the group as closed
        for trade in trades_in_group:
            trade.status = 'closed'
            trade.exit_date = exit_data.exit_date
            trade.exit_price = exit_data.exit_price
    
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


def update_account_balance_from_trades(db: Session, user_id: int):
    """
    Update user's current account balance based on initial balance + all closed trades P&L
    """
    try:
        # Get the user
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            return
        
        # Get initial balance (fallback to default_account_size or 10000)
        initial_balance = user.initial_account_balance or user.default_account_size or 10000.0
        
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
        
        print(f"Updated account balance for user {user_id}: ${initial_balance} + ${total_pnl} = ${new_balance}")
        
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
