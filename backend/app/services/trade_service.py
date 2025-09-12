from sqlalchemy.orm import Session
from typing import List, Optional
from fastapi import HTTPException
from datetime import datetime

from app.models.models import Trade
from app.models.schemas import TradeCreate, TradeUpdate

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
        
        metrics = calculate_trade_metrics(trade)
        
        db_trade = Trade(
            user_id=user_id,
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


def get_trade(db: Session, trade_id: int) -> Optional[Trade]:
    """Get a specific trade by ID"""
    return db.query(Trade).filter(Trade.id == trade_id).first()


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
