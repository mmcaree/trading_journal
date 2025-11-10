"""
NEW Analytics Service using v2 Position Models
Replaces analytics_service.py with TradingPosition + TradingPositionEvent based calculations
"""
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from sqlalchemy import func, and_

from app.models.position_models import TradingPosition, TradingPositionEvent, PositionStatus, EventType
from app.models.schemas import PerformanceMetrics, SetupPerformance

def get_performance_metrics(
    db: Session, 
    user_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> PerformanceMetrics:
    """Calculate performance metrics for the user using v2 Position models"""
    from sqlalchemy.orm import joinedload
    
    # Start with base query for the user's closed positions with eager loading
    query = db.query(TradingPosition).options(
        joinedload(TradingPosition.events)
    ).filter(
        TradingPosition.user_id == user_id,
        TradingPosition.status == PositionStatus.CLOSED
    )
    
    # Apply date filters if provided (filter on position close date)
    if start_date:
        try:
            start_date_obj = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query = query.filter(TradingPosition.closed_at >= start_date_obj)
        except ValueError:
            pass
        
    if end_date:
        try:
            end_date_obj = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query = query.filter(TradingPosition.closed_at <= end_date_obj)
        except ValueError:
            pass
    
    # Get all closed positions
    positions = query.all()
    
    # Initialize metrics
    total_trades = len(positions)
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
    
    # Calculate metrics from closed positions
    total_investment = 0.0
    
    for position in positions:
        # Use realized P&L from the position (calculated from SELL events)
        realized_pnl = position.total_realized_pnl or 0.0
        
        # Track investment (total cost of position)
        total_investment += position.total_cost or 0.0
        
        # Calculate win/loss stats
        if realized_pnl > 0:
            winning_trades += 1
            total_profit += realized_pnl
            largest_win = max(largest_win, realized_pnl)
        elif realized_pnl < 0:
            losing_trades += 1
            total_loss += abs(realized_pnl)
            largest_loss = max(largest_loss, abs(realized_pnl))
        
        # Calculate holding time if open and close dates are available
        if position.opened_at and position.closed_at:
            holding_time = (position.closed_at - position.opened_at).total_seconds() / 86400  # Convert to days
            total_holding_time += holding_time
    
    # Derived metrics
    win_rate = (winning_trades / total_trades) * 100 if total_trades > 0 else 0
    average_profit = total_profit / winning_trades if winning_trades > 0 else 0
    average_loss = total_loss / losing_trades if losing_trades > 0 else 0
    profit_factor = total_profit / total_loss if total_loss > 0 else float('inf')
    average_holding_time = total_holding_time / total_trades if total_trades > 0 else 0
    total_profit_loss = total_profit - total_loss
    
    # Calculate total profit/loss percent
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

def get_setup_performance(
    db: Session, 
    user_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> List[SetupPerformance]:
    """Calculate performance metrics by setup type using v2 Position models"""
    from sqlalchemy.orm import joinedload
    
    # Start with base query for the user's closed positions with eager loading
    query = db.query(TradingPosition).options(
        joinedload(TradingPosition.events)
    ).filter(
        TradingPosition.user_id == user_id,
        TradingPosition.status == PositionStatus.CLOSED,
        TradingPosition.setup_type.isnot(None)  # Only positions with setup types
    )
    
    # Apply date filters if provided
    if start_date:
        try:
            start_date_obj = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query = query.filter(TradingPosition.closed_at >= start_date_obj)
        except ValueError:
            pass
        
    if end_date:
        try:
            end_date_obj = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query = query.filter(TradingPosition.closed_at <= end_date_obj)
        except ValueError:
            pass
    
    # Get all closed positions
    positions = query.all()
    
    # Group by setup type
    setup_stats = {}
    
    for position in positions:
        setup_type = position.setup_type
        if not setup_type:
            continue
            
        if setup_type not in setup_stats:
            setup_stats[setup_type] = {
                'total_trades': 0,
                'winning_trades': 0,
                'losing_trades': 0,
                'total_profit': 0.0,
                'total_loss': 0.0,
                'largest_win': 0.0,
                'largest_loss': 0.0,
                'total_investment': 0.0
            }
        
        stats = setup_stats[setup_type]
        stats['total_trades'] += 1
        
        # Use realized P&L from position
        realized_pnl = position.total_realized_pnl or 0.0
        stats['total_investment'] += position.total_cost or 0.0
        
        # Calculate win/loss
        if realized_pnl > 0:
            stats['winning_trades'] += 1
            stats['total_profit'] += realized_pnl
            stats['largest_win'] = max(stats['largest_win'], realized_pnl)
        elif realized_pnl < 0:
            stats['losing_trades'] += 1
            stats['total_loss'] += abs(realized_pnl)
            stats['largest_loss'] = max(stats['largest_loss'], abs(realized_pnl))
    
    # Convert to SetupPerformance objects
    setup_performances = []
    for setup_type, stats in setup_stats.items():
        win_rate = (stats['winning_trades'] / stats['total_trades']) * 100 if stats['total_trades'] > 0 else 0
        average_profit = stats['total_profit'] / stats['winning_trades'] if stats['winning_trades'] > 0 else 0
        average_loss = stats['total_loss'] / stats['losing_trades'] if stats['losing_trades'] > 0 else 0
        profit_factor = stats['total_profit'] / stats['total_loss'] if stats['total_loss'] > 0 else float('inf')
        total_profit_loss = stats['total_profit'] - stats['total_loss']
        total_profit_loss_percent = (total_profit_loss / stats['total_investment']) * 100 if stats['total_investment'] > 0 else 0
        
        setup_performances.append(SetupPerformance(
            setup_type=setup_type,
            total_trades=stats['total_trades'],
            winning_trades=stats['winning_trades'],
            losing_trades=stats['losing_trades'],
            win_rate=win_rate,
            average_profit=average_profit,
            average_loss=average_loss,
            profit_factor=profit_factor,
            largest_win=stats['largest_win'],
            largest_loss=stats['largest_loss'],
            total_profit_loss=total_profit_loss,
            total_profit_loss_percent=total_profit_loss_percent
        ))
    
    # Sort by total trades descending
    setup_performances.sort(key=lambda x: x.total_trades, reverse=True)
    
    return setup_performances