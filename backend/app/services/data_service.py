from sqlalchemy.orm import Session
from app.models.models import Trade, Chart, PartialExit, TradeEntry
from app.models.import_models import ImportedOrder, ImportBatch, Position, PositionOrder


def clear_all_user_data(db: Session, user_id: int) -> None:
    """Clear all user trading data while keeping the user account intact"""
    
    try:
        # Delete in order to respect foreign key constraints
        
        # 1. Delete charts (depend on trades)
        trades = db.query(Trade).filter(Trade.user_id == user_id).all()
        for trade in trades:
            db.query(Chart).filter(Chart.trade_id == trade.id).delete()
            db.query(PartialExit).filter(PartialExit.trade_id == trade.id).delete()
            db.query(TradeEntry).filter(TradeEntry.trade_id == trade.id).delete()
        
        # 2. Delete position orders (depend on positions and imported orders)
        positions = db.query(Position).filter(Position.user_id == user_id).all()
        for position in positions:
            db.query(PositionOrder).filter(PositionOrder.position_id == position.id).delete()
        
        # 3. Delete positions
        db.query(Position).filter(Position.user_id == user_id).delete()
        
        # 4. Delete trades (now that charts and partial exits are gone)
        db.query(Trade).filter(Trade.user_id == user_id).delete()
        
        # 5. Delete imported orders
        db.query(ImportedOrder).filter(ImportedOrder.user_id == user_id).delete()
        
        # 6. Delete import batches
        db.query(ImportBatch).filter(ImportBatch.user_id == user_id).delete()
        
        # Commit all changes
        db.commit()
        
    except Exception as e:
        db.rollback()
        raise e