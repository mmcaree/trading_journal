from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import User, Trade
from app.api.deps import get_current_user
from app.services.chart_service import ChartDataService

router = APIRouter()


@router.get("/trade/{trade_id}")
def get_trade_chart_data(
    trade_id: int,
    timeframe: str = "1d",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get chart data for a specific trade"""
    
    # Get the trade and verify ownership
    trade = db.query(Trade).filter(Trade.id == trade_id).first()
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    if trade.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view this trade")
    
    # Get chart data
    chart_data = ChartDataService.get_chart_data(
        ticker=trade.ticker,
        entry_date=trade.entry_date,
        exit_date=trade.exit_date
    )
    
    # Add trade-specific information
    chart_data['trade_info'] = {
        'id': trade.id,
        'entry_price': float(trade.entry_price),
        'exit_price': float(trade.exit_price) if trade.exit_price else None,
        'stop_loss': float(trade.stop_loss) if trade.stop_loss else None,
        'take_profit': float(trade.take_profit) if trade.take_profit else None,
        'position_size': trade.position_size,
        'trade_type': trade.trade_type.value if hasattr(trade.trade_type, 'value') else str(trade.trade_type),
        'status': trade.status.value if hasattr(trade.status, 'value') else str(trade.status)
    }
    
    return chart_data


@router.get("/ticker/{ticker}")
def get_ticker_chart_data(
    ticker: str,
    days: int = 30,
    current_user: User = Depends(get_current_user)
):
    """Get chart data for any ticker (for analysis)"""
    
    # Validate ticker
    if not ChartDataService.validate_ticker(ticker):
        raise HTTPException(status_code=400, detail=f"Invalid ticker: {ticker}")
    
    # Get current date and calculate start date
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)
    
    # Get chart data (no trade-specific markers)
    chart_data = ChartDataService.get_chart_data(
        ticker=ticker,
        entry_date=start_date,
        exit_date=end_date,
        days_before=0
    )
    
    return chart_data


@router.get("/price/{ticker}")
def get_current_price(
    ticker: str,
    current_user: User = Depends(get_current_user)
):
    """Get current price for a ticker"""
    
    price = ChartDataService.get_current_price(ticker)
    if price is None:
        raise HTTPException(status_code=400, detail=f"Could not fetch price for {ticker}")
    
    return {
        'ticker': ticker,
        'current_price': price,
        'timestamp': datetime.now().isoformat()
    }
