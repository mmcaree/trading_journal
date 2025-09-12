from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.schemas import TradeCreate, TradeResponse, TradeUpdate, UserCreate
from app.services.trade_service import create_trade, get_trades, get_trade, update_trade, delete_trade, trade_to_response_dict
from app.services.user_service import get_user_by_id, create_user
from app.models.models import User

router = APIRouter()

@router.post("/", response_model=TradeResponse, status_code=status.HTTP_201_CREATED)
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
            
        # For development, use a mock user ID
        mock_user_id = 1
        
        # Check if mock user exists, if not create it
        mock_user = get_user_by_id(db, mock_user_id)
        if not mock_user:
            print(f"Mock user with ID {mock_user_id} not found, creating...")
            mock_user_data = UserCreate(
                username="mockuser",
                email="mock@example.com",
                password="mockpassword123"
            )
            try:
                mock_user = create_user(db, mock_user_data)
                print(f"Created mock user with ID: {mock_user.id}")
            except Exception as user_error:
                print(f"Error creating mock user: {str(user_error)}")
                raise
        
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
