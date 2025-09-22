from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.schemas import (
    TradeCreate, TradeResponse, TradeUpdate, TradeEntryCreate, TradeEntryResponse, 
    PartialExitCreate, PositionStopLossUpdate, PositionStopLossResponse,
    TradeEntryStopLossUpdate, TradeEntryNotesUpdate, TradeEntryUpdateResponse
)
from app.services.trade_service import (
    create_trade, get_trades, get_trade, update_trade, delete_trade,
    get_trade_details, trade_to_response_dict,
    add_to_position, sell_from_position_by_group, get_positions,
    update_position_stop_loss, get_active_entries
)
from app.models.models import User, Trade, PartialExit, TradeEntry

router = APIRouter()

@router.post("/", response_model=TradeResponse, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=TradeResponse, status_code=status.HTTP_201_CREATED)  # Handle both /trades/ and /trades
def create_new_trade(
    trade: TradeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new trade entry"""
    try:
        if not trade.market_conditions:
            trade.market_conditions = "Normal"
        
        print(f"Creating new trade from API route: {trade.dict()}")
        print(f"Using user ID: {current_user.id}")
            
        return create_trade(db=db, trade=trade, user_id=current_user.id)
    except Exception as e:
        import traceback
        print(f"Error in create_new_trade route: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        if hasattr(e, 'status_code'):
            print(f"Exception has status code: {e.status_code}")
        
        # Determine appropriate status code based on the error
        if hasattr(e, 'status_code') and isinstance(e.status_code, int):
            status_code = e.status_code
        else:
            status_code = 500 
        
        raise HTTPException(
            status_code=status_code,
            detail=f"Internal server error: {str(e)}"
        )

@router.get("/", response_model=List[TradeResponse])
@router.get("", response_model=List[TradeResponse])  # Handle both /trades/ and /trades
def read_trades(
    skip: int = 0,
    limit: int = 10000,  # Increased from 100 to 10000 to show more trades
    status: Optional[str] = None,
    ticker: Optional[str] = None,
    setup_type: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user) 
):
    """Get all trades with optional filtering"""
    user_id = current_user.id
    return get_trades(
        db=db, 
        user_id=user_id, 
        skip=skip, 
        limit=limit,
        status=status,
        ticker=ticker,
        setup_type=setup_type
    )

@router.get("/positions")
def get_trading_positions(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all open trading positions (grouped by trade_group_id)"""
    return get_positions(db=db, user_id=current_user.id, skip=skip, limit=limit)

@router.get("/entries")
def get_trading_entries(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all individual active trading entries (not aggregated)"""
    return get_active_entries(db=db, user_id=current_user.id, skip=skip, limit=limit)

@router.get("/positions/{trade_group_id}/details")
def get_position_details(
    trade_group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed breakdown of a position including all individual trade entries and exits"""
    # Verify the position belongs to the current user
    position_trade = db.query(Trade).filter(
        Trade.trade_group_id == trade_group_id,
        Trade.user_id == current_user.id
    ).first()
    if not position_trade:
        raise HTTPException(status_code=404, detail="Position not found")
    
    # Get all trades in the group
    trades_in_group = db.query(Trade).filter(
        Trade.trade_group_id == trade_group_id
    ).order_by(Trade.entry_date).all()
    
    # Get all trade entries for this group
    trade_ids = [trade.id for trade in trades_in_group]
    
    # Get active trade entries (remaining positions)
    active_trade_entries = db.query(TradeEntry).filter(
        TradeEntry.trade_id.in_(trade_ids),
        TradeEntry.is_active == True,
        TradeEntry.shares > 0
    ).order_by(TradeEntry.entry_date).all()
    
    # Get ALL trade entries for original purchase history (only from this trade group)
    all_trade_entries = db.query(TradeEntry).filter(
        TradeEntry.trade_id.in_(trade_ids)
    ).order_by(TradeEntry.entry_date).all() if trade_ids else []
    
    # Get all partial exits for the group
    partial_exits = db.query(PartialExit).filter(
        PartialExit.trade_id.in_(trade_ids)
    ).order_by(PartialExit.exit_date).all()
    
    # Build OPEN ORDERS list (pending sell orders grouped by stop loss)
    open_orders_by_stop_loss = {}
    
    # For imported trades, get pending sell orders and group by stop loss
    from app.models.import_models import ImportedOrder
    
    ticker = trades_in_group[0].ticker
    
    # Check if this ticker has pending sell orders
    pending_sells = db.query(ImportedOrder).filter(
        ImportedOrder.user_id == current_user.id,
        ImportedOrder.symbol == ticker,
        ImportedOrder.status.in_(['Pending', 'Open', 'Working']),
        ImportedOrder.side == 'Sell'
    ).all()
    
    if pending_sells:
        # Group pending sell orders by stop loss price
        for sell_order in pending_sells:
            stop_price = sell_order.price or 0  # Use 0 for market orders
            
            if stop_price in open_orders_by_stop_loss:
                # Combine orders with same stop loss
                open_orders_by_stop_loss[stop_price]["shares"] += sell_order.total_qty
                open_orders_by_stop_loss[stop_price]["order_count"] += 1
            else:
                # Create new order group for this stop loss
                open_orders_by_stop_loss[stop_price] = {
                    "stop_loss": stop_price,
                    "shares": sell_order.total_qty,
                    "order_count": 1,
                    "ticker": ticker
                }
    else:
        # No pending sells - initialize empty
        pass
    
    # Always add manual trade entries to positions (even if we have pending sells)
    for entry in active_trade_entries:
        # Skip entries that look like they were auto-created from imports
        if entry.notes and any(phrase in entry.notes.lower() for phrase in ["import", "open position:"]):
            continue
            
        stop_loss = entry.stop_loss or 0  # Use 0 for None stop loss
        
        if stop_loss in open_orders_by_stop_loss:
            # Combine with existing at same stop loss
            open_orders_by_stop_loss[stop_loss]["shares"] += entry.shares
            if "entry_ids" not in open_orders_by_stop_loss[stop_loss]:
                open_orders_by_stop_loss[stop_loss]["entry_ids"] = []
            open_orders_by_stop_loss[stop_loss]["entry_ids"].append(entry.id)
            # Calculate weighted average entry price
            current_shares = open_orders_by_stop_loss[stop_loss]["shares"] - entry.shares
            current_cost = open_orders_by_stop_loss[stop_loss].get("avg_entry_price", 0) * current_shares
            total_cost = current_cost + entry.entry_price * entry.shares
            open_orders_by_stop_loss[stop_loss]["avg_entry_price"] = total_cost / open_orders_by_stop_loss[stop_loss]["shares"]
            # Update entry date to earliest
            existing_date = open_orders_by_stop_loss[stop_loss].get("entry_date")
            if not existing_date or entry.entry_date < existing_date:
                open_orders_by_stop_loss[stop_loss]["entry_date"] = entry.entry_date
        else:
            # Create new order group for manual entry
            open_orders_by_stop_loss[stop_loss] = {
                "stop_loss": stop_loss,
                "shares": entry.shares,
                "avg_entry_price": entry.entry_price,
                "entry_ids": [entry.id],
                "ticker": ticker,
                "order_count": 1,
                "entry_date": entry.entry_date
            }
    
    # For imported trades with pending sells, calculate weighted average entry prices
    if pending_sells:
        for stop_loss, order_data in open_orders_by_stop_loss.items():
            # Calculate weighted average entry price for these shares using FIFO from trade entries
            shares_needed = order_data['shares']
            allocated_shares = 0
            total_cost = 0
            earliest_date = None
            
            for entry in active_trade_entries:
                if allocated_shares >= shares_needed:
                    break
                    
                shares_from_this_entry = min(entry.shares, shares_needed - allocated_shares)
                total_cost += shares_from_this_entry * entry.entry_price
                allocated_shares += shares_from_this_entry
                
                # Track earliest entry date
                if earliest_date is None or entry.entry_date < earliest_date:
                    earliest_date = entry.entry_date
            
            order_data['avg_entry_price'] = total_cost / allocated_shares if allocated_shares > 0 else 0
            order_data['entry_date'] = earliest_date
    
    # Apply manual sells to reduce position shares (FIFO by highest stop loss first)  
    # Only include manual sells, not imported exits that are already accounted for
    manual_sells = []
    for exit in partial_exits:
        # Skip exits that look like they were auto-created from imports
        if exit.notes and any(phrase in exit.notes.lower() for phrase in ["import", "partial exit from open position"]):
            continue
        manual_sells.append(exit)
    
    total_manual_sold = sum(exit.shares_sold for exit in manual_sells)
    
    if total_manual_sold > 0:
        # Sort positions by stop loss (highest first for FIFO)
        sorted_positions = sorted(open_orders_by_stop_loss.items(), key=lambda x: x[0], reverse=True)
        remaining_to_sell = total_manual_sold
        
        for stop_loss, order_data in sorted_positions:
            if remaining_to_sell <= 0:
                break
                
            shares_to_reduce = min(order_data["shares"], remaining_to_sell)
            order_data["shares"] -= shares_to_reduce
            remaining_to_sell -= shares_to_reduce
            
            # Remove position if shares go to 0
            if order_data["shares"] <= 0:
                del open_orders_by_stop_loss[stop_loss]
    
    # Convert to list format for API response
    open_orders = []
    for stop_loss, order_data in open_orders_by_stop_loss.items():
        notes = f"Open order @ ${stop_loss:.2f}" if stop_loss > 0 else "Market order"
        if pending_sells:
            # For imported trades with pending sells
            if order_data.get("order_count", 1) > 1:
                notes = f"{order_data['order_count']} combined orders @ ${stop_loss:.2f}"
        else:
            # For manual trades
            notes = f"Manual position @ ${stop_loss:.2f}" if stop_loss > 0 else "Manual position (no stop)"
            
        open_orders.append({
            "id": f"order_{stop_loss}_{order_data.get('entry_ids', ['pending'])[0]}",
            "entry_date": order_data.get("entry_date").isoformat() if order_data.get("entry_date") else None,
            "stop_loss": stop_loss if stop_loss > 0 else None,
            "shares": order_data["shares"],
            "avg_entry_price": round(order_data.get("avg_entry_price", 0), 2),
            "entry_price": round(order_data.get("avg_entry_price", 0), 2),  # Alias for frontend compatibility
            "notes": notes,
            "ticker": order_data["ticker"],
            "order_count": order_data.get("order_count", 1)
        })
    
    # Sort open orders by stop loss (highest first for exit priority)
    open_orders.sort(key=lambda x: x["stop_loss"] or 0, reverse=True)
    
    # Build ENTRIES list (original purchase history)
    entries = []
    
    # For all trades, check if there are imported orders for this ticker
    from app.models.import_models import ImportedOrder
    
    ticker = trades_in_group[0].ticker
    
    # Check if this ticker has imported buy orders (regardless of linking)
    has_imported_orders = db.query(ImportedOrder).filter(
        ImportedOrder.user_id == current_user.id,
        ImportedOrder.symbol == ticker,
        ImportedOrder.side == 'Buy',
        ImportedOrder.status == 'Filled'
    ).first() is not None
    
    if has_imported_orders:
        # For imported symbols, determine if position ever went to zero
        # If it did, only show orders after the last zero (new trade)
        # If not, show recent orders (continuous position)
        
        # Get all orders chronologically to check for position continuity
        all_orders = db.query(ImportedOrder).filter(
            ImportedOrder.user_id == current_user.id,
            ImportedOrder.symbol == ticker,
            ImportedOrder.status == 'Filled'
        ).order_by(ImportedOrder.filled_time).all()
        
        # Track position to find when it went to zero
        running_position = 0
        last_zero_time = None
        
        for order in all_orders:
            if order.side == 'Buy':
                running_position += order.filled_qty
            elif order.side in ['Sell', 'Short']:
                running_position -= order.filled_qty
                
            if running_position == 0:
                last_zero_time = order.filled_time
        
        if last_zero_time:
            # Position went to zero - show only buy orders after the last zero
            relevant_buys = db.query(ImportedOrder).filter(
                ImportedOrder.user_id == current_user.id,
                ImportedOrder.symbol == ticker,
                ImportedOrder.side == 'Buy',
                ImportedOrder.status == 'Filled',
                ImportedOrder.filled_time > last_zero_time
            ).order_by(ImportedOrder.filled_time).all()
        else:
            # Continuous position - show recent buy orders for context
            relevant_buys = db.query(ImportedOrder).filter(
                ImportedOrder.user_id == current_user.id,
                ImportedOrder.symbol == ticker,
                ImportedOrder.side == 'Buy',
                ImportedOrder.status == 'Filled'
            ).order_by(ImportedOrder.filled_time.desc()).limit(4).all()
            relevant_buys.reverse()  # Chronological order
        
        # Add imported buy orders to entries
        for buy_order in relevant_buys:
            # Find associated sell order to get original stop loss
            associated_sell = db.query(ImportedOrder).filter(
                ImportedOrder.user_id == current_user.id,
                ImportedOrder.symbol == ticker,
                ImportedOrder.side == 'Sell',
                ImportedOrder.placed_time >= buy_order.filled_time
            ).order_by(ImportedOrder.placed_time).first()
            
            original_stop_loss = associated_sell.price if associated_sell else None
            
            entries.append({
                "id": f"import_{buy_order.id}",
                "trade_id": None,  # This is from import, not a specific trade
                "entry_date": buy_order.filled_time or buy_order.placed_time,
                "entry_price": buy_order.avg_price or buy_order.price,
                "shares": buy_order.filled_qty,  # Original purchase amount
                "original_stop_loss": original_stop_loss,  # From associated sell order
                "notes": f"Imported buy @ ${buy_order.avg_price or buy_order.price:.2f}",
                "ticker": buy_order.symbol,
                "entry_type": "imported_buy"
            })
    
    # Also add manual trade entries (but not ones that duplicate imported data)
    for entry in all_trade_entries:
        # Get the trade this entry belongs to
        trade = next((t for t in trades_in_group if t.id == entry.trade_id), None)
        if not trade:
            continue
            
        # Skip trade entries that were auto-created from imports
        # These would have notes indicating they're from imports or old deprecated logic
        if entry.notes and any(phrase in entry.notes.lower() for phrase in ["import", "open position:"]):
            continue
        
        # For manual trades in mixed positions, just show the actual entry amount
        # Don't add sold shares since this is an addition to an existing position
        entries.append({
            "id": entry.id,
            "trade_id": entry.trade_id,
            "entry_date": entry.entry_date,
            "entry_price": entry.entry_price,
            "shares": entry.shares,  # Actual shares added, not calculated "original"
            "original_stop_loss": entry.original_stop_loss,  # Include original stop loss
            "notes": entry.notes or f"Manual purchase @ ${entry.entry_price:.2f}",
            "ticker": trade.ticker,
            "entry_type": "manual"
        })
    
    # Sort all entries by date
    entries.sort(key=lambda x: x["entry_date"])
    
    # Calculate summary data
    total_current_shares = sum(order["shares"] for order in open_orders)
    total_realized_pnl = sum(exit.profit_loss for exit in partial_exits if exit.profit_loss)
    total_shares_sold = sum(exit.shares_sold for exit in partial_exits)
    
    # For imported trades, also include actual sell orders from imported data
    if has_imported_orders:
        # Get actual sell orders for this ticker from imported data
        ticker = trades_in_group[0].ticker
        
        # Get recent sell orders that relate to the current position timeframe
        # Use the same timeframe as the recent buys we're showing in entries
        if entries:
            earliest_entry_date = min(entry["entry_date"] for entry in entries)
            
            recent_sells = db.query(ImportedOrder).filter(
                ImportedOrder.user_id == current_user.id,
                ImportedOrder.symbol == ticker,
                ImportedOrder.side == 'Sell',
                ImportedOrder.status == 'Filled',
                ImportedOrder.filled_time >= earliest_entry_date
            ).all()
            
            # Add sold shares from recent imported sell orders (avoid double counting)
            recent_sell_total = sum(sell.filled_qty for sell in recent_sells)
            
            # Check if partial exits already include these imported sells
            # If partial exits were auto-created from imports, don't double count
            imported_sells_in_partial_exits = sum(
                exit.shares_sold for exit in partial_exits 
                if exit.notes and "partial exit from open position" in exit.notes.lower()
            )
            
            # Only add imported sells that aren't already counted in partial exits
            additional_imported_sells = recent_sell_total - imported_sells_in_partial_exits
            if additional_imported_sells > 0:
                total_shares_sold += additional_imported_sells
    
    # Calculate total cost and average entry price from current open orders
    total_cost = sum(order["shares"] * order["avg_entry_price"] for order in open_orders)
    avg_entry_price = total_cost / total_current_shares if total_current_shares > 0 else 0
    
    # For total shares bought, use different logic for imported vs manual trades
    if has_imported_orders:
        # For imported trades, sum the actual entry amounts shown
        total_shares_bought = sum(entry["shares"] for entry in entries)
    else:
        # For manual trades, add current + sold
        total_shares_bought = total_current_shares + total_shares_sold
    
    # Prepare exits list - include both partial exits and any missing imported sells
    exits_list = []
    
    # Add all partial exits
    for exit in partial_exits:
        exits_list.append({
            "id": exit.id,
            "exit_date": exit.exit_date,
            "exit_price": exit.exit_price,
            "shares_sold": exit.shares_sold,
            "profit_loss": exit.profit_loss,
            "notes": exit.notes
        })
    
    # For imported trades, add any imported sells not already in partial exits
    if has_imported_orders:
        ticker = trades_in_group[0].ticker
        if entries:
            earliest_entry_date = min(entry["entry_date"] for entry in entries)
            
            recent_sells = db.query(ImportedOrder).filter(
                ImportedOrder.user_id == current_user.id,
                ImportedOrder.symbol == ticker,
                ImportedOrder.side == 'Sell',
                ImportedOrder.status == 'Filled',
                ImportedOrder.filled_time >= earliest_entry_date
            ).all()
            
            # Find imported sells that don't have corresponding partial exits
            for sell in recent_sells:
                # Check if this sell is already represented in partial exits
                matching_partial_exit = next((
                    exit for exit in partial_exits 
                    if exit.shares_sold == sell.filled_qty and 
                       abs((exit.exit_date - sell.filled_time).total_seconds()) < 60  # Within 1 minute
                ), None)
                
                if not matching_partial_exit:
                    # This is an imported sell not in partial exits - add it
                    exits_list.append({
                        "id": f"imported_{sell.id}",  # Unique ID for imported sells
                        "exit_date": sell.filled_time,
                        "exit_price": sell.price,
                        "shares_sold": sell.filled_qty,
                        "profit_loss": None,  # Imported sells don't have calculated P&L here
                        "notes": f"Imported sell order @ ${sell.price}"
                    })

    # Calculate overall original risk percentage for this position
    from app.services.trade_service import calculate_original_risk_percentage
    overall_original_risk_percent = calculate_original_risk_percentage(
        db, current_user.id, trades_in_group[0].ticker if trades_in_group else "", trade_group_id
    )

    return {
        "trade_group_id": trade_group_id,
        "ticker": trades_in_group[0].ticker if trades_in_group else "",
        "open_orders": open_orders,  # Grouped by stop loss
        "entries": entries,      # Original purchase history
        "exits": exits_list,
        "summary": {
            "current_shares": total_current_shares,
            "total_shares_bought": total_shares_bought,
            "total_shares_sold": total_shares_sold,
            "avg_entry_price": round(avg_entry_price, 2),
            "total_cost": round(total_cost, 2),
            "total_realized_pnl": round(total_realized_pnl, 2),
            "original_risk_percent": round(overall_original_risk_percent, 2),  # New field
            "open_orders_count": len(open_orders),  # Count of open order groups (by stop loss)
            "entries_count": len(entries),      # Count of original purchases
            "exits_count": len(partial_exits)
        }
    }


@router.get("/{trade_id}")
def read_trade(
    trade_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific trade by ID"""
    trade = get_trade(db=db, trade_id=trade_id, user_id=current_user.id)    
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    return trade_to_response_dict(trade)

@router.put("/{trade_id}", response_model=TradeResponse)
def update_existing_trade(
    trade_id: int,
    trade_update: TradeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an existing trade"""
    trade = get_trade(db=db, trade_id=trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    if trade.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this trade")
    
    result = update_trade(db=db, trade_id=trade_id, trade_update=trade_update)
    return result

@router.delete("/{trade_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_existing_trade(
    trade_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a trade"""
    trade = get_trade(db=db, trade_id=trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    if trade.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this trade")
    
    delete_trade(db=db, trade_id=trade_id)
    return None

@router.post("/{trade_id}/entries", response_model=TradeEntryResponse, status_code=status.HTTP_201_CREATED)
def add_trade_entry(
    trade_id: int,
    entry: TradeEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add to an existing position (create a new entry)"""
    trade = get_trade(db=db, trade_id=trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    if trade.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this trade")
    
    return add_to_position(db=db, trade_id=trade_id, entry=entry)

@router.post("/{trade_id}/exits", response_model=dict, status_code=status.HTTP_201_CREATED)
def sell_trade_shares(
    trade_id: int,
    exit_data: PartialExitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Sell shares from an existing position"""
    trade = get_trade(db=db, trade_id=trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    if trade.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this trade")
    
    return sell_from_position(db=db, trade_id=trade_id, exit_data=exit_data)

@router.get("/{trade_id}/details")
def get_trade_full_details(
    trade_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed trade information including all entries and exits"""
    trade = get_trade(db=db, trade_id=trade_id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    if trade.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this trade")
    
    return get_trade_details(db=db, trade_id=trade_id)

@router.post("/positions/{trade_group_id}/entries", response_model=dict, status_code=status.HTTP_201_CREATED)
def add_to_trading_position(
    trade_group_id: str,
    entry: TradeEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add to an existing trading position"""
    # Verify the position belongs to the current user
    position_trade = db.query(Trade).filter(
        Trade.trade_group_id == trade_group_id,
        Trade.user_id == current_user.id
    ).first()
    if not position_trade:
        raise HTTPException(status_code=404, detail="Position not found")
    
    return add_to_position(db=db, trade_group_id=trade_group_id, entry=entry)

@router.post("/positions/{trade_group_id}/exits", response_model=dict, status_code=status.HTTP_201_CREATED)
def sell_from_trading_position(
    trade_group_id: str,
    exit_data: PartialExitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Sell shares from an existing trading position"""
    # Verify the position belongs to the current user
    position_trade = db.query(Trade).filter(
        Trade.trade_group_id == trade_group_id,
        Trade.user_id == current_user.id
    ).first()
    if not position_trade:
        raise HTTPException(status_code=404, detail="Position not found")
    
    return sell_from_position_by_group(db=db, trade_group_id=trade_group_id, exit_data=exit_data)

@router.put("/positions/{trade_group_id}/stop-loss", response_model=PositionStopLossResponse)
def update_position_stop_loss_endpoint(
    trade_group_id: str,
    stop_loss_update: PositionStopLossUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update stop loss for all entries in a trading position"""
    try:
        result = update_position_stop_loss(
            db=db, 
            trade_group_id=trade_group_id, 
            new_stop_loss=stop_loss_update.stop_loss,
            user_id=current_user.id
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update stop loss: {str(e)}")


@router.put("/entries/{entry_id}/stop-loss", response_model=TradeEntryUpdateResponse)
def update_trade_entry_stop_loss(
    entry_id: int,
    stop_loss_update: TradeEntryStopLossUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update stop loss for a specific trade entry"""
    # Get the trade entry and verify ownership
    entry = db.query(TradeEntry).filter(TradeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Trade entry not found")
    
    # Get the trade to verify ownership
    trade = db.query(Trade).filter(Trade.id == entry.trade_id).first()
    if not trade or trade.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this trade entry")
    
    try:
        # Update the stop loss
        entry.stop_loss = stop_loss_update.stop_loss
        db.commit()
        
        return TradeEntryUpdateResponse(
            id=entry_id,
            success=True,
            message="Stop loss updated successfully"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update stop loss: {str(e)}")


@router.put("/entries/{entry_id}/notes", response_model=TradeEntryUpdateResponse)
def update_trade_entry_notes(
    entry_id: int,
    notes_update: TradeEntryNotesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update notes for a specific trade entry"""
    # Get the trade entry and verify ownership
    entry = db.query(TradeEntry).filter(TradeEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Trade entry not found")
    
    # Get the trade to verify ownership
    trade = db.query(Trade).filter(Trade.id == entry.trade_id).first()
    if not trade or trade.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to update this trade entry")
    
    try:
        # Update the notes
        entry.notes = notes_update.notes
        db.commit()
        
        return TradeEntryUpdateResponse(
            id=entry_id,
            success=True,
            message="Notes updated successfully"
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update notes: {str(e)}")


@router.put("/positions/{trade_group_id}/stop-loss-group")
def update_position_group_stop_loss(
    trade_group_id: str,
    current_stop_loss: float = Query(..., description="Current stop loss value to identify the group"),
    new_stop_loss: float = Query(..., description="New stop loss value"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update stop loss for all orders in a specific stop loss group within a position"""
    # Verify the position belongs to the current user
    position_trade = db.query(Trade).filter(
        Trade.trade_group_id == trade_group_id,
        Trade.user_id == current_user.id
    ).first()
    if not position_trade:
        raise HTTPException(status_code=404, detail="Position not found")
    
    ticker = position_trade.ticker
    
    # For imported trades, update pending sell orders
    from app.models.import_models import ImportedOrder
    
    # Check if this ticker has pending sell orders with the current stop loss
    pending_sells_to_update = db.query(ImportedOrder).filter(
        ImportedOrder.user_id == current_user.id,
        ImportedOrder.symbol == ticker,
        ImportedOrder.status.in_(['Pending', 'Open', 'Working']),
        ImportedOrder.side == 'Sell',
        ImportedOrder.price == current_stop_loss
    ).all()
    
    if pending_sells_to_update:
        # This is an imported trade - update the pending sell orders
        try:
            updated_count = 0
            total_shares = 0
            
            for sell_order in pending_sells_to_update:
                sell_order.price = new_stop_loss
                total_shares += sell_order.total_qty
                updated_count += 1
            
            db.commit()
            
            return {
                "success": True,
                "message": f"Updated {updated_count} pending sell orders from {current_stop_loss} to {new_stop_loss}",
                "orders_updated": updated_count,
                "shares_affected": total_shares,
                "trade_group_id": trade_group_id,
                "update_type": "pending_sell_orders"
            }
            
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to update pending sell orders: {str(e)}")
    
    else:
        # Fallback for manual trades - update trade entries
        trades_in_group = db.query(Trade).filter(
            Trade.trade_group_id == trade_group_id
        ).all()
        
        trade_ids = [trade.id for trade in trades_in_group]
        
        # Get all active trade entries with the current stop loss
        entries_to_update = db.query(TradeEntry).filter(
            TradeEntry.trade_id.in_(trade_ids),
            TradeEntry.is_active == True,
            TradeEntry.shares > 0,
            TradeEntry.stop_loss == current_stop_loss
        ).all()
        
        if not entries_to_update:
            raise HTTPException(
                status_code=404, 
                detail=f"No active orders found with stop loss {current_stop_loss}"
            )
        
        try:
            # Update stop loss for all entries in this group
            updated_count = 0
            total_shares = 0
            
            for entry in entries_to_update:
                entry.stop_loss = new_stop_loss
                total_shares += entry.shares
                updated_count += 1
            
            db.commit()
            
            return {
                "success": True,
                "message": f"Updated stop loss from {current_stop_loss} to {new_stop_loss}",
                "entries_updated": updated_count,
                "shares_affected": total_shares,
                "trade_group_id": trade_group_id,
                "update_type": "trade_entries"
            }
            
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to update trade entries: {str(e)}")
