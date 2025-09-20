from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.schemas import TradeCreate, TradeResponse, TradeUpdate, TradeEntryCreate, TradeEntryResponse, PartialExitCreate
from app.services.trade_service import create_trade, get_trades, get_trade, update_trade, delete_trade, trade_to_response_dict, add_to_position, sell_from_position, get_trade_details, get_positions, sell_from_position_by_group
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

@router.get("/positions/{trade_group_id}/details")
def get_position_details(
    trade_group_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed breakdown of a position including all entries and exits"""
    # Verify the position belongs to the current user
    position_trade = db.query(Trade).filter(
        Trade.trade_group_id == trade_group_id,
        Trade.user_id == current_user.id
    ).first()
    if not position_trade:
        raise HTTPException(status_code=404, detail="Position not found")
    
    # Get all trades in the group (entries)
    trades_in_group = db.query(Trade).filter(
        Trade.trade_group_id == trade_group_id
    ).order_by(Trade.entry_date).all()
    
    # Get all partial exits for the group
    trade_ids = [trade.id for trade in trades_in_group]
    partial_exits = db.query(PartialExit).filter(
        PartialExit.trade_id.in_(trade_ids)
    ).order_by(PartialExit.exit_date).all()
    
    # Calculate aggregated data using the same logic as get_positions()
    # For ACTIVE trades: total_bought = current_shares + total_sold
    # For CLOSED trades: use position_size
    
    total_shares_sold = sum(exit.shares_sold for exit in partial_exits)
    
    # Calculate current shares and total bought using the same logic as get_positions()
    current_shares = 0
    total_shares_bought = 0
    
    for trade in trades_in_group:
        if trade.status.name == 'ACTIVE':
            # Get current shares from active TradeEntry records
            active_lots = db.query(TradeEntry).filter(
                TradeEntry.trade_id == trade.id,
                TradeEntry.is_active == True
            ).all()
            
            trade_current_shares = sum(lot.shares for lot in active_lots if lot.shares > 0)
            current_shares += trade_current_shares
            
            # Calculate total bought for this trade using the get_positions() logic
            trade_partial_exits = [pe for pe in partial_exits if pe.trade_id == trade.id]
            total_sold_for_trade = sum(pe.shares_sold for pe in trade_partial_exits)
            total_bought_for_trade = trade_current_shares + total_sold_for_trade
            total_shares_bought += total_bought_for_trade
        else:
            # For closed trades, position_size should be correct
            current_shares += trade.position_size
            total_shares_bought += trade.position_size
    
    # Create mapping of trade ID to original purchase amounts using same logic as get_positions()
    trade_original_amounts = {}
    
    for trade in trades_in_group:
        if trade.status.name == 'ACTIVE':
            # For active trades, calculate original amount = current + sold
            trade_partial_exits = [pe for pe in partial_exits if pe.trade_id == trade.id]
            total_sold_for_trade = sum(pe.shares_sold for pe in trade_partial_exits)
            
            # Get current shares from TradeEntry records
            active_lots = db.query(TradeEntry).filter(
                TradeEntry.trade_id == trade.id,
                TradeEntry.is_active == True
            ).all()
            trade_current_shares = sum(lot.shares for lot in active_lots if lot.shares > 0)
            
            trade_original_amounts[trade.id] = trade_current_shares + total_sold_for_trade
        else:
            # For closed trades, use position_size
            trade_original_amounts[trade.id] = trade.position_size
    
    # Calculate correct total cost using original amounts
    total_cost = sum(trade_original_amounts[trade.id] * trade.entry_price for trade in trades_in_group)
    avg_entry_price = total_cost / total_shares_bought if total_shares_bought > 0 else 0
    
    total_realized_pnl = sum(exit.profit_loss for exit in partial_exits if exit.profit_loss)
    
    return {
        "trade_group_id": trade_group_id,
        "ticker": trades_in_group[0].ticker if trades_in_group else "",
        "entries": [
            {
                "id": trade.id,
                "entry_date": trade.entry_date,
                "entry_price": trade.entry_price,
                "shares": trade_original_amounts[trade.id],  # Use original amount
                "current_shares": trade.position_size if trade.status.name != 'ACTIVE' else sum(
                    lot.shares for lot in db.query(TradeEntry).filter(
                        TradeEntry.trade_id == trade.id,
                        TradeEntry.is_active == True
                    ).all() if lot.shares > 0
                ),  # Add current shares for reference
                "stop_loss": trade.stop_loss,
                "take_profit": trade.take_profit,
                "cost": trade_original_amounts[trade.id] * trade.entry_price,  # Use original amount
                "notes": trade.entry_notes
            }
            for trade in trades_in_group
        ],
        "exits": [
            {
                "id": exit.id,
                "exit_date": exit.exit_date,
                "exit_price": exit.exit_price,
                "shares_sold": exit.shares_sold,
                "profit_loss": exit.profit_loss,
                "proceeds": exit.shares_sold * exit.exit_price,
                "notes": exit.notes
            }
            for exit in partial_exits
        ],
        "summary": {
            "total_shares_bought": total_shares_bought,
            "total_shares_sold": total_shares_sold,
            "current_shares": current_shares,
            "avg_entry_price": round(avg_entry_price, 2),
            "total_cost": round(total_cost, 2),
            "total_realized_pnl": round(total_realized_pnl, 2),
            "entries_count": len(trades_in_group),
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
    
    return update_trade(db=db, trade_id=trade_id, trade_update=trade_update)

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
