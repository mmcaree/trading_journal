from sqlalchemy.orm import Session
from app.models.position_models import (
    TradingPosition, TradingPositionEvent, ImportedPendingOrder, 
    TradingPositionJournalEntry, TradingPositionChart, InstructorNote, PositionTag,
    position_tag_assignment, AccountTransaction
)


def clear_all_user_data(db: Session, user_id: int) -> None:
    """Clear ALL user trading data while keeping the user account intact"""
    
    try:
        # Delete in order to respect foreign key constraints
        # Start with dependent tables first, then master tables
        
        # Get all position IDs for this user
        position_ids = [p.id for p in db.query(TradingPosition.id).filter(TradingPosition.user_id == user_id).all()]
        
        if position_ids:
            # Delete position_tag_assignment entries using the table object
            db.execute(
                position_tag_assignment.delete().where(
                    position_tag_assignment.c.position_id.in_(position_ids)
                )
            )
            
            # Delete dependent data for these positions
            db.query(InstructorNote).filter(InstructorNote.position_id.in_(position_ids)).delete(synchronize_session=False)
            db.query(TradingPositionJournalEntry).filter(TradingPositionJournalEntry.position_id.in_(position_ids)).delete(synchronize_session=False)
            db.query(TradingPositionChart).filter(TradingPositionChart.position_id.in_(position_ids)).delete(synchronize_session=False)
            db.query(TradingPositionEvent).filter(TradingPositionEvent.position_id.in_(position_ids)).delete(synchronize_session=False)
        
        # Delete trading positions (current system)
        db.query(TradingPosition).filter(TradingPosition.user_id == user_id).delete(synchronize_session=False)
        
        # Delete imported pending orders
        db.query(ImportedPendingOrder).filter(ImportedPendingOrder.user_id == user_id).delete(synchronize_session=False)
        
        # Delete user's custom tags
        db.query(PositionTag).filter(PositionTag.user_id == user_id).delete(synchronize_session=False)
        
        # Delete account transactions
        db.query(AccountTransaction).filter(AccountTransaction.user_id == user_id).delete(synchronize_session=False)
        
        # Commit all changes
        db.commit()
        
    except Exception as e:
        db.rollback()
        raise e