from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from sqlalchemy import func

from app.models.models import Trade
from app.models.schemas import PerformanceMetrics, SetupPerformance

def get_performance_metrics(
    db: Session, 
    user_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> PerformanceMetrics:
    """Calculate performance metrics for the user"""
    # Start with base query for the user's closed trades
    query = db.query(Trade).filter(
        Trade.user_id == user_id,
        Trade.status == "closed"
    )
    
    # Apply date filters if provided
    if start_date:
        try:
            start_date_obj = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query = query.filter(Trade.exit_date >= start_date_obj)
        except ValueError:
            pass
        
    if end_date:
        try:
            end_date_obj = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query = query.filter(Trade.exit_date <= end_date_obj)
        except ValueError:
            pass
    
    # Get all closed trades
    trades = query.all()
    
    # Initialize metrics
    total_trades = len(trades)
    winning_trades = 0
    losing_trades = 0
    total_profit = 0.0
    total_loss = 0.0
    largest_win = 0.0
    largest_loss = 0.0
    total_holding_time = 0.0
    
    if total_trades == 0:
        # Return default metrics if no trades
        return PerformanceMetrics(
            total_trades=0,
            winning_trades=0,
            losing_trades=0,
            win_rate=0.0,
            average_profit=0.0,
            average_loss=0.0,
            profit_factor=0.0,
            largest_win=0.0,
            largest_loss=0.0,
            average_holding_time=0.0,
            total_profit_loss=0.0,
            total_profit_loss_percent=0.0
        )
    
    # Calculate metrics
    for trade in trades:
        # Skip trades with no profit/loss data
        if trade.profit_loss is None:
            continue
            
        # Calculate win/loss stats
        if trade.profit_loss > 0:
            winning_trades += 1
            total_profit += trade.profit_loss
            largest_win = max(largest_win, trade.profit_loss)
        else:
            losing_trades += 1
            total_loss += abs(trade.profit_loss)
            largest_loss = max(largest_loss, abs(trade.profit_loss))
        
        # Calculate holding time if entry and exit dates are available
        if trade.entry_date and trade.exit_date:
            holding_time = (trade.exit_date - trade.entry_date).total_seconds() / 86400  # Convert to days
            total_holding_time += holding_time
    
    # Derived metrics
    win_rate = (winning_trades / total_trades) * 100 if total_trades > 0 else 0
    average_profit = total_profit / winning_trades if winning_trades > 0 else 0
    average_loss = total_loss / losing_trades if losing_trades > 0 else 0
    profit_factor = total_profit / total_loss if total_loss > 0 else float('inf')
    average_holding_time = total_holding_time / total_trades if total_trades > 0 else 0
    total_profit_loss = total_profit - total_loss
    
    # Calculate total profit/loss percent
    total_investment = sum(trade.position_value for trade in trades if trade.position_value is not None)
    total_profit_loss_percent = (total_profit_loss / total_investment) * 100 if total_investment > 0 else 0
    
    return PerformanceMetrics(
        total_trades=total_trades,
        winning_trades=winning_trades,
        losing_trades=losing_trades,
        win_rate=win_rate,
        average_profit=average_profit,
        average_loss=average_loss,
        profit_factor=profit_factor,
        largest_win=largest_win,
        largest_loss=largest_loss,
        average_holding_time=average_holding_time,
        total_profit_loss=total_profit_loss,
        total_profit_loss_percent=total_profit_loss_percent
    )


def get_setup_performance(db: Session, user_id: int) -> List[SetupPerformance]:
    """Get performance metrics by setup type"""
    # Get all unique setup types for the user (case-insensitive grouping)
    setup_types_query = db.query(Trade.setup_type).filter(
        Trade.user_id == user_id,
        Trade.status == "closed",
        Trade.setup_type.isnot(None)
    ).distinct()
    
    # Group by lowercase setup type to handle case-insensitive matching
    setup_groups = {}
    for (setup_type,) in setup_types_query:
        if setup_type:
            key = setup_type.lower()
            if key not in setup_groups:
                setup_groups[key] = setup_type  # Keep first occurrence for display
    
    result = []
    
    # Calculate metrics for each setup type group
    for lowercase_setup, display_setup in setup_groups.items():
        # Get all trades for this setup type (case-insensitive)
        trades = db.query(Trade).filter(
            Trade.user_id == user_id,
            Trade.status == "closed",
            func.lower(Trade.setup_type) == lowercase_setup
        ).all()
        
        trade_count = len(trades)
        winning_trades = sum(1 for t in trades if t.profit_loss and t.profit_loss > 0)
        win_rate = (winning_trades / trade_count) * 100 if trade_count > 0 else 0
        
        # Calculate profit/loss in percentages
        total_profit_loss_percent = 0
        trades_with_percent_data = 0
        
        for trade in trades:
            # Use profit_loss_percent if available, otherwise calculate from profit_loss/position_value
            percent_return = 0
            if trade.profit_loss_percent is not None:
                percent_return = trade.profit_loss_percent
            elif trade.profit_loss is not None and trade.position_value is not None and trade.position_value > 0:
                percent_return = (trade.profit_loss / trade.position_value) * 100
            else:
                continue  # Skip trades where we can't calculate percentage
                
            total_profit_loss_percent += percent_return
            trades_with_percent_data += 1
        
        average_profit_loss = total_profit_loss_percent / trades_with_percent_data if trades_with_percent_data > 0 else 0
        
        result.append(SetupPerformance(
            setup_type=display_setup,  # Use original case for display
            trade_count=trade_count,
            win_rate=win_rate,
            average_profit_loss=average_profit_loss,
            total_profit_loss=total_profit_loss_percent
        ))
    
    # Sort by total profit/loss in descending order
    result.sort(key=lambda x: x.total_profit_loss, reverse=True)
    
    return result
