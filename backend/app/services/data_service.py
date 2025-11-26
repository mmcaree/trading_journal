from sqlalchemy.orm import Session
from app.models.position_models import TradingPosition, TradingPositionEvent, ImportedPendingOrder, TradingPositionJournalEntry, TradingPositionChart


def clear_all_user_data(db: Session, user_id: int) -> None:
    """Clear ALL user trading data while keeping the user account intact"""
    
    try:
        # Delete in order to respect foreign key constraints
        # Start with dependent tables first, then master tables
        
        # Delete current v2 API data (actively used)
        from sqlalchemy.orm import joinedload
        trading_positions = db.query(TradingPosition).options(
            joinedload(TradingPosition.events)
        ).filter(TradingPosition.user_id == user_id).all()
        for trading_position in trading_positions:
            # Delete journal entries for this position
            db.query(TradingPositionJournalEntry).filter(TradingPositionJournalEntry.position_id == trading_position.id).delete()
            # Delete charts for this position
            db.query(TradingPositionChart).filter(TradingPositionChart.position_id == trading_position.id).delete()
            # Delete events for this position
            db.query(TradingPositionEvent).filter(TradingPositionEvent.position_id == trading_position.id).delete()
        
        # Delete trading positions (current system)
        db.query(TradingPosition).filter(TradingPosition.user_id == user_id).delete()
        
        # Delete imported pending orders
        db.query(ImportedPendingOrder).filter(ImportedPendingOrder.user_id == user_id).delete()
        
        # Commit all changes
        db.commit()
        
    except Exception as e:
        db.rollback()
        raise e