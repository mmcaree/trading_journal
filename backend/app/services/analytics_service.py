"""
NEW Analytics Service using v2 Position Models
Replaces analytics_service.py with TradingPosition + TradingPositionEvent based calculations
"""
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any, Tuple
import numpy as np
from datetime import datetime
from sqlalchemy import func, and_
from collections import defaultdict
import statistics

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


def _calculate_streaks(positions: List[TradingPosition]) -> Tuple[int, int, int, int]:
    """
    Calculate consecutive win/loss streaks from a list of positions.
    
    Algorithm: Iterate through positions in order, track consecutive wins/losses,
    and update max streaks whenever the streak type changes (win→loss or loss→win).
    
    Returns (current_win_streak, current_loss_streak, max_win_streak, max_loss_streak)
    """
    if not positions:
        return 0, 0, 0, 0

    current_win = 0
    current_loss = 0
    max_win = 0
    max_loss = 0

    for i, pos in enumerate(positions):
        pnl = pos.total_realized_pnl or 0
        is_win = pnl > 0

        if i == 0:
            if is_win:
                current_win = 1
            else:
                current_loss = 1
        else:
            prev_was_win = positions[i-1].total_realized_pnl > 0
            if is_win == prev_was_win:
                if is_win:
                    current_win += 1
                else:
                    current_loss += 1
            else:
                if current_win > max_win:
                    max_win = current_win
                if current_loss > max_loss:
                    max_loss = current_loss
                current_win = 1 if is_win else 0
                current_loss = 1 if not is_win else 0

    # Final update for max streaks
    if current_win > max_win:
        max_win = current_win
    if current_loss > max_loss:
        max_loss = current_loss

    return current_win, current_loss, max_win, max_loss


def get_advanced_performance_metrics(
    db: Session,
    user_id: int,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Calculate comprehensive advanced performance metrics including risk-adjusted returns,
    drawdown analysis, and trading quality metrics.
    
    Metrics calculated:
    - Max Drawdown: Maximum decline from peak to trough in portfolio value
    - Sharpe Ratio: (Return - Risk-free rate) / Standard deviation * √252 (annualized)
    - Sortino Ratio: Like Sharpe but uses only downside deviation * √252
    - Calmar Ratio: Annualized return / Maximum drawdown percentage
    - Kelly %: (Win% × Avg Win - Loss% × Avg Loss) / Avg Win (optimal position size)
    - Expectancy: (Win% × Avg Win) - (Loss% × Avg Loss) (expected $ per trade)
    - Recovery Factor: Net profit / Maximum drawdown
    - Profit Factor: Gross profit / Gross loss
    - Consecutive Win/Loss Streaks: Current and maximum streaks
    
    Returns float('inf') for ratios when denominator is zero.
    """
    query = db.query(TradingPosition).filter(
        TradingPosition.user_id == user_id,
        TradingPosition.status == PositionStatus.CLOSED
    )

    if start_date:
        try:
            s = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query = query.filter(TradingPosition.closed_at >= s)
        except ValueError:
            pass
    if end_date:
        try:
            e = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query = query.filter(TradingPosition.closed_at <= e)
        except ValueError:
            pass

    positions = query.order_by(TradingPosition.closed_at.asc()).all()

    if not positions:
        return {
            "total_trades": 0,
            "total_pnl": 0.0,
            "win_rate": 0.0,
            "profit_factor": 0.0,
            "max_drawdown": 0.0,
            "max_drawdown_percent": 0.0,
            "sharpe_ratio": 0.0,
            "sortino_ratio": 0.0,
            "calmar_ratio": 0.0,
            "kelly_percentage": 0.0,
            "expectancy": 0.0,
            "recovery_factor": 0.0,
            "consecutive_wins": 0,
            "consecutive_losses": 0,
            "max_consecutive_wins": 0,
            "max_consecutive_losses": 0,
            "monthly_returns": [],
            "equity_curve": []
        }

    # === 1. Basic stats (reuse your existing function) ===
    standard = get_performance_metrics(db, user_id, start_date, end_date)

    total_pnl = standard.total_profit_loss
    win_rate = standard.win_rate
    avg_win = standard.average_profit
    avg_loss = standard.average_loss or 1  # avoid div by zero
    
    # Use the correctly calculated gross profit and loss from standard metrics
    # gross_profit is sum of all winning trades, gross_loss is sum of all losing trades (as positive value)
    winning_trades_total = 0.0
    losing_trades_total = 0.0
    
    for pos in positions:
        realized_pnl = pos.total_realized_pnl or 0.0
        if realized_pnl > 0:
            winning_trades_total += realized_pnl
        elif realized_pnl < 0:
            losing_trades_total += abs(realized_pnl)
    
    gross_profit = winning_trades_total
    gross_loss = losing_trades_total

    # Get user's initial account balance
    from app.models.position_models import User, AccountTransaction
    user = db.query(User).filter(User.id == user_id).first()
    
    # Use initial_account_balance if available, otherwise use a default or first position cost as estimate
    if user and user.initial_account_balance:
        starting_capital = user.initial_account_balance
    elif positions and positions[0].total_cost:
        # Estimate: assume starting capital was at least enough to cover first position
        starting_capital = max(10000, positions[0].total_cost * 2)
    else:
        starting_capital = 10000  # Default fallback

    # === 2. Query deposits/withdrawals for the date range ===
    transactions_query = db.query(AccountTransaction).filter(
        AccountTransaction.user_id == user_id
    )
    
    # Apply date filters to transactions if provided
    if start_date:
        try:
            start_date_obj = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            transactions_query = transactions_query.filter(AccountTransaction.transaction_date >= start_date_obj)
        except ValueError:
            pass
    
    if end_date:
        try:
            end_date_obj = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            transactions_query = transactions_query.filter(AccountTransaction.transaction_date <= end_date_obj)
        except ValueError:
            pass
    
    transactions = transactions_query.all()
    
    # Build daily transaction totals (net cash flow per day)
    daily_transactions = defaultdict(float)
    total_deposits = 0.0
    total_withdrawals = 0.0
    
    for txn in transactions:
        day = txn.transaction_date.date()
        if txn.transaction_type == "DEPOSIT":
            daily_transactions[day] += txn.amount
            total_deposits += txn.amount
        else:  # WITHDRAWAL
            daily_transactions[day] -= txn.amount
            total_withdrawals += txn.amount

    # === 3. Daily P&L for equity curve & drawdown ===
    daily_pnl = defaultdict(float)
    for pos in positions:
        if pos.closed_at:
            day = pos.closed_at.date()
            daily_pnl[day] += float(pos.total_realized_pnl or 0)

    # Combine all dates (P&L dates + transaction dates)
    all_dates = set(daily_pnl.keys()) | set(daily_transactions.keys())
    sorted_days = sorted(all_dates)
    
    # Build equity curve from actual account value (starting capital + cumulative P&L + net deposits/withdrawals)
    account_value = starting_capital
    peak = starting_capital
    max_dd = 0.0
    max_dd_percent = 0.0
    equity_curve = []
    dates = []

    for day in sorted_days:
        # Add trading P&L for this day
        account_value += daily_pnl.get(day, 0.0)
        
        # Add net deposits/withdrawals for this day
        account_value += daily_transactions.get(day, 0.0)
        
        equity_curve.append(round(account_value, 2))
        dates.append(day)
        
        # Track peak account value
        if account_value > peak:
            peak = account_value
        
        # Calculate drawdown in dollars
        dd = peak - account_value
        if dd > max_dd:
            max_dd = dd
            # Calculate percentage based on peak account value
            max_dd_percent = (dd / peak * 100) if peak > 0 else 0
    
    # Calculate daily returns array for risk metrics (P&L only, excluding cash flows)
    daily_returns = np.array([daily_pnl.get(day, 0.0) for day in sorted_days])

    # === 3. Risk Metrics ===
    # Sharpe (annualized, risk-free rate = 0)
    if len(daily_returns) > 1 and daily_returns.std() != 0:
        sharpe = (daily_returns.mean() / daily_returns.std()) * (252 ** 0.5)
    else:
        sharpe = 0.0

    # Sortino (downside deviation only)
    downside = daily_returns[daily_returns < 0]
    if len(downside) > 0 and downside.std() != 0:
        sortino = (daily_returns.mean() / downside.std()) * (252 ** 0.5)
    else:
        sortino = 0.0

    # Calmar Ratio
    years = max(1, (dates[-1] - dates[0]).days / 365.25) if len(dates) > 1 else 1
    # Calculate annualized return based on actual account growth
    final_account_value = equity_curve[-1] if equity_curve else starting_capital
    
    # Calculate net deposits/withdrawals for the period
    net_cash_flow = total_deposits - total_withdrawals
    
    # Adjusted return: exclude cash flows from return calculation
    # Return = (Ending Value - Starting Value - Net Deposits) / Starting Value
    if starting_capital > 0:
        total_return = (final_account_value - starting_capital - net_cash_flow) / starting_capital
        annualized_return = (1 + total_return) ** (1 / years) - 1 if years > 0 else 0
    else:
        annualized_return = 0
    
    calmar = abs(annualized_return / (max_dd_percent / 100)) if max_dd_percent > 0 and annualized_return != 0 else float('inf')

    # Kelly Criterion (%)
    win_prob = win_rate / 100.0
    loss_prob = 1 - win_prob
    if avg_win > 0:
        kelly = (win_prob * avg_win - loss_prob * avg_loss) / avg_win
        kelly_percentage = max(0.0, round(kelly * 100, 2))
    else:
        kelly_percentage = 0.0

    # Expectancy
    expectancy = (win_prob * avg_win) - (loss_prob * avg_loss)

    # Recovery Factor: Net profit divided by maximum drawdown
    # Only makes sense if there was a drawdown, otherwise it's undefined
    if max_dd > 0:
        recovery_factor = abs(total_pnl / max_dd)
    else:
        # No drawdown means no losses yet - return None instead of infinity
        recovery_factor = None

    # Profit Factor: Gross profit divided by gross loss
    # If there are no losses, profit factor is technically infinite, but we'll return None for clarity
    if gross_loss > 0:
        profit_factor = gross_profit / gross_loss
    else:
        # No losses yet - return None instead of infinity
        profit_factor = None

    # Streaks
    curr_win, curr_loss, max_win, max_loss = _calculate_streaks(positions)

    # Monthly returns (unchanged)
    monthly = defaultdict(lambda: {"pnl": 0.0, "trades": 0})
    for pos in positions:
        if pos.closed_at:
            key = pos.closed_at.strftime("%Y-%m")
            monthly[key]["pnl"] += float(pos.total_realized_pnl or 0)
            monthly[key]["trades"] += 1

    monthly_returns = [
        {
            "month": k,
            "monthName": datetime.strptime(k, "%Y-%m").strftime("%b %Y"),
            "pnl": round(v["pnl"], 2),
            "trades": v["trades"]
        }
        for k, v in sorted(monthly.items())
    ]

    return {
        "total_trades": len(positions),
        "total_pnl": round(total_pnl, 2),
        "win_rate": round(win_rate, 2),
        "profit_factor": round(profit_factor, 2) if profit_factor is not None else None,
        "max_drawdown": round(max_dd, 2),
        "max_drawdown_percent": round(max_dd_percent, 2),
        "sharpe_ratio": round(sharpe, 2),
        "sortino_ratio": round(sortino, 2),
        "calmar_ratio": round(calmar, 2) if calmar != float('inf') else None,
        "kelly_percentage": kelly_percentage,
        "expectancy": round(expectancy, 2),
        "recovery_factor": round(recovery_factor, 2) if recovery_factor is not None else None,
        "consecutive_wins": curr_win,
        "consecutive_losses": curr_loss,
        "max_consecutive_wins": max_win,
        "max_consecutive_losses": max_loss,
        "monthly_returns": monthly_returns,
        "equity_curve": [
            {"date": d.strftime("%Y-%m-%d"), "equity": e}
            for d, e in zip(dates, equity_curve)
        ],
        "starting_capital": round(starting_capital, 2),
        "total_deposits": round(total_deposits, 2),
        "total_withdrawals": round(total_withdrawals, 2),
        "net_cash_flow": round(net_cash_flow, 2),
        "annualized_return_percent": round(annualized_return * 100, 2)
    }
