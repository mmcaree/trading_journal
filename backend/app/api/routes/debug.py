from pydantic import BaseModel
from fastapi import APIRouter, HTTPException, status, Depends
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from app.api.deps import get_db

router = APIRouter()

class DebugRequest(BaseModel):
    data: Dict[str, Any]

@router.get("/")
async def debug_info():
    """Return basic debug information about the API"""
    return {
        "status": "online",
        "version": "1.0.0",
        "endpoints": ["/debug", "/debug/validate-trade", "/debug/analytics-data"],
        "message": "API is functioning correctly"
    }

@router.post("/validate-trade")
async def validate_trade_data(request: DebugRequest):
    """Validate trade data without creating a trade in the database"""
    from app.models.schemas import TradeCreate
    
    try:
        # Try to create a TradeCreate instance to validate the data
        data = request.data
        print(f"Validating trade data: {data}")
        
        # Check required fields
        required_fields = ["ticker", "trade_type", "status", "entry_price", "position_size", "stop_loss", "setup_type", "timeframe"]
        missing_fields = [field for field in required_fields if field not in data or data[field] is None]
        
        if missing_fields:
            return {
                "valid": False,
                "missing_fields": missing_fields,
                "message": f"Missing required fields: {', '.join(missing_fields)}"
            }
            
        # Create a TradeCreate model to validate the data
        trade = TradeCreate(**data)
        
        # If we got here, validation succeeded
        return {
            "valid": True,
            "data": trade.dict(),
            "message": "Trade data is valid"
        }
    except Exception as e:
        import traceback
        print(f"Validation error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        
        return {
            "valid": False,
            "error": str(e),
            "message": "Trade data is invalid"
        }

@router.get("/analytics-data")
async def debug_analytics(db: Session = Depends(get_db)):
    """Return debug information about analytics data"""
    from app.services.analytics_service import get_performance_metrics, get_setup_performance

    Trade = None
    
    if Trade is None:
        return {
            "status": "legacy_model_removed",
            "message": "Old Trade model has been permanently deleted.",
            "note": "This debug endpoint is deprecated. Use frontend dashboard or future v2 analytics."
        }

    try:
        # Count trades by status
        trade_counts = {}
        for status in ["planned", "active", "closed861", "canceled"]:
            count = db.query(Trade).filter(Trade.status == status).count()
            trade_counts[status] = count
            
        # Get some sample trades with profit_loss
        sample_trades = db.query(
            Trade.id, 
            Trade.ticker, 
            Trade.status, 
            Trade.profit_loss,
            Trade.setup_type,
            Trade.entry_date,
            Trade.exit_date
        ).filter(Trade.profit_loss != None).limit(5).all()
        
        sample_trade_data = []
        for trade in sample_trades:
            sample_trade_data.append({
                "id": trade.id,
                "ticker": trade.ticker,
                "status": trade.status,
                "profit_loss": trade.profit_loss,
                "setup_type": trade.setup_type,
                "entry_date": trade.entry_date.isoformat() if trade.entry_date else None,
                "exit_date": trade.exit_date.isoformat() if trade.exit_date else None
            })
            
        # Get a dummy user ID (first user in DB)
        first_user = db.query(Trade.user_id).first()
        user_id = first_user[0] if first_user else None
        
        # Get analytics if we have a user
        performance_metrics = None
        setup_performance = None
        
        if user_id:
            performance_metrics = get_performance_metrics(db, user_id)
            setup_performance = get_setup_performance(db, user_id)
            
            # Convert to dict for json serialization
            if performance_metrics:
                performance_metrics = performance_metrics.dict()
            if setup_performance:
                setup_performance = [setup.dict() for setup in setup_performance]
        
        return {
            "trade_counts": trade_counts,
            "sample_trades": sample_trade_data,
            "performance_metrics": performance_metrics,
            "setup_performance": setup_performance
        }
    except Exception as e:
        import traceback
        print(f"Analytics debug error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        
        return {
            "error": str(e),
            "message": "Error retrieving analytics debug data"
        }