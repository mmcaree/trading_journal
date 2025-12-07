#!/usr/bin/env python3
"""
Risk Percentage Recalculation Service
Provides functions for recalculating risk percentages for positions
"""

import logging
from typing import Dict, Any
from sqlalchemy.orm import Session
from app.models.position_models import TradingPosition, TradingPositionEvent, EventType
from app.services.account_value_service import AccountValueService

logger = logging.getLogger(__name__)


def recalculate_user_risk_percentages(db: Session, user_id: int) -> Dict[str, Any]:
    """
    Recalculate original_risk_percent for all positions belonging to a user.
    This should be called when a user updates their starting balance or starting date.
    
    Args:
        db: Database session
        user_id: User ID to recalculate positions for
        
    Returns:
        Dictionary with statistics about the recalculation
    """
    logger.info(f"Starting risk percentage recalculation for user {user_id}")
    
    # Initialize account value service
    account_value_service = AccountValueService(db)
    
    # Query all positions for this user that can be recalculated
    positions = db.query(TradingPosition).filter(
        TradingPosition.user_id == user_id,
        TradingPosition.original_shares.isnot(None),
        TradingPosition.avg_entry_price.isnot(None),
        TradingPosition.opened_at.isnot(None)
    ).all()
    
    logger.info(f"Found {len(positions)} positions to recalculate for user {user_id}")
    
    if len(positions) == 0:
        return {
            "success": True,
            "total_positions": 0,
            "updated": 0,
            "unchanged": 0,
            "errors": 0,
            "message": "No positions found to recalculate"
        }
    
    # Statistics
    updated_count = 0
    unchanged_count = 0
    error_count = 0
    
    # Process each position
    for position in positions:
        try:
            # Get original_stop_loss from first BUY event
            first_buy_event = db.query(TradingPositionEvent).filter(
                TradingPositionEvent.position_id == position.id,
                TradingPositionEvent.event_type == EventType.BUY
            ).order_by(TradingPositionEvent.event_date.asc()).first()
            
            # Skip if no original_stop_loss (can't calculate risk)
            if not first_buy_event or not first_buy_event.original_stop_loss:
                unchanged_count += 1
                continue
            
            original_stop_loss = first_buy_event.original_stop_loss
            
            # Get dynamic account value at position entry date
            try:
                account_value_at_entry = account_value_service.get_account_value_at_date(
                    user_id=user_id,
                    target_date=position.opened_at
                )
            except Exception as e:
                logger.error(
                    f"Failed to get account value for position {position.id}: {e}"
                )
                error_count += 1
                continue
            
            # Skip if account value is invalid
            if account_value_at_entry <= 0:
                logger.warning(
                    f"Position {position.id} ({position.ticker}): "
                    f"Invalid account value: ${account_value_at_entry}"
                )
                error_count += 1
                continue
            
            # Calculate new risk percentage using stop loss distance
            risk_amount = abs((position.avg_entry_price - original_stop_loss) * position.original_shares)
            new_risk_percent = (risk_amount / account_value_at_entry) * 100
            new_risk_percent = round(new_risk_percent, 3)
            
            old_risk = position.original_risk_percent
            
            # Check if change is significant (> 0.01%)
            if old_risk is not None:
                diff = abs(new_risk_percent - old_risk)
                if diff < 0.01:
                    unchanged_count += 1
                    continue
            
            # Update position
            position.original_risk_percent = new_risk_percent
            position.account_value_at_entry = account_value_at_entry
            updated_count += 1
            
            # Log significant changes
            if old_risk is not None and abs(new_risk_percent - old_risk) > 0.5:
                logger.info(
                    f"Position {position.id} ({position.ticker}): "
                    f"{old_risk:.2f}% → {new_risk_percent:.2f}%"
                )
            
        except Exception as e:
            logger.error(
                f"Error processing position {position.id} ({position.ticker}): {str(e)}"
            )
            error_count += 1
    
    # Commit all changes
    try:
        db.commit()
        logger.info(
            f"Risk recalculation complete for user {user_id}: "
            f"{updated_count} updated, {unchanged_count} unchanged, {error_count} errors"
        )
    except Exception as e:
        logger.error(f"Failed to commit risk recalculation: {e}")
        db.rollback()
        raise
    
    return {
        "success": True,
        "total_positions": len(positions),
        "updated": updated_count,
        "unchanged": unchanged_count,
        "errors": error_count,
        "message": f"Updated {updated_count} positions successfully"
    }


def recalculate_single_position_risk(db: Session, position: TradingPosition) -> bool:
    """
    Recalculate risk percentage for a single position.
    Used when creating new positions or updating position data.
    
    Args:
        db: Database session
        position: Position to recalculate
        
    Returns:
        True if successful, False otherwise
    """
    if not position.original_shares or not position.avg_entry_price or not position.opened_at:
        logger.warning(f"Position {position.id} missing required data for risk calculation")
        return False
    
    # Get original_stop_loss from first BUY event
    first_buy_event = db.query(TradingPositionEvent).filter(
        TradingPositionEvent.position_id == position.id,
        TradingPositionEvent.event_type == EventType.BUY
    ).order_by(TradingPositionEvent.event_date.asc()).first()
    
    # Can't calculate risk without stop loss
    if not first_buy_event or not first_buy_event.original_stop_loss:
        logger.debug(f"Position {position.id} has no original_stop_loss in first event - cannot calculate risk")
        return False
    
    original_stop_loss = first_buy_event.original_stop_loss
    
    try:
        account_value_service = AccountValueService(db)
        account_value_at_entry = account_value_service.get_account_value_at_date(
            user_id=position.user_id,
            target_date=position.opened_at
        )
        
        if account_value_at_entry <= 0:
            logger.warning(f"Invalid account value for position {position.id}")
            return False
        
        # Calculate risk using stop loss distance
        risk_amount = abs((position.avg_entry_price - original_stop_loss) * position.original_shares)
        position.original_risk_percent = round(
            (risk_amount / account_value_at_entry) * 100, 
            3
        )
        position.account_value_at_entry = account_value_at_entry
        
        return True
        
    except Exception as e:
        logger.error(f"Failed to recalculate risk for position {position.id}: {e}")
        return False
