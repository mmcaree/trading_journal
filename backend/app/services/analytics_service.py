"""
NEW Analytics Service using v2 Position Models
Replaces analytics_service.py with TradingPosition + TradingPositionEvent based calculations
"""
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any, Tuple
import numpy as np
from datetime import datetime, date
from sqlalchemy import func, and_
from collections import defaultdict
import statistics

from app.models.position_models import TradingPosition, TradingPositionEvent, PositionStatus, EventType, AccountTransaction, User
from app.models.schemas import PerformanceMetrics, SetupPerformance
from app.services.account_value_service import AccountValueService
from app.utils.cache import cached, TTL_MEDIUM, TTL_SHORT


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

    risk_query = db.query(
        func.avg(TradingPosition.original_risk_percent).label('avg_risk')
    ).filter(
        TradingPosition.user_id == user_id,
        TradingPosition.original_risk_percent.isnot(None),
        TradingPosition.original_risk_percent > 0
    )
    if start_date:
        try:
            s = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            risk_query = risk_query.filter(TradingPosition.opened_at >= s)
        except ValueError:
            pass
    if end_date:
        try:
            e = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            risk_query = risk_query.filter(TradingPosition.opened_at <= e)
        except ValueError:
            pass

    avg_original_risk = risk_query.scalar()
    avg_original_risk = round(float(avg_original_risk), 3) if avg_original_risk else None

    # Optional: change vs previous period (super cool)
    prev_avg = None
    if avg_original_risk and start_date:
        try:
            prev_start = s - (datetime.fromisoformat(end_date.replace('Z', '+00:00')) - s if end_date else 
                             datetime.now() - s)  # same length before
            prev_query = risk_query.filter(TradingPosition.opened_at < s)
            prev_avg = prev_query.scalar()
            prev_avg = round(float(prev_avg), 3) if prev_avg else avg_original_risk
        except:
            pass

    avg_original_risk_change = round(avg_original_risk - prev_avg, 3) if avg_original_risk and prev_avg else None

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
        "annualized_return_percent": round(annualized_return * 100, 2),
        "avg_original_risk": avg_original_risk,
        "avg_original_risk_change": avg_original_risk_change,
    }


# === Phase 2.2: Dynamic Account Value Integration ===

def calculate_trading_growth_rate(db: Session, user_id: int) -> float:
    """
    Calculate growth from trading only (exclude deposits/withdrawals).
    
    Formula: (Realized P&L / Total Capital Invested) × 100
    
    Total Capital Invested = Starting Balance + All Deposits
    This shows the % return on all the money you put into the account.
    
    Example: Start with $500, deposit $37,500 more, make $17,500 profit
    Trading Growth = (17,500 / (500 + 37,500)) × 100 = 46.05%
    """
    account_value_service = AccountValueService(db)
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        return 0.0
    
    # Get starting balance
    starting_balance = user.initial_account_balance or 10000.0
    
    # Get all deposits
    total_deposits = db.query(
        func.coalesce(func.sum(AccountTransaction.amount), 0.0)
    ).filter(
        AccountTransaction.user_id == user_id,
        AccountTransaction.transaction_type == 'DEPOSIT'
    ).scalar()
    
    # Get realized P&L (trading profits/losses)
    realized_pnl = db.query(
        func.coalesce(func.sum(TradingPosition.total_realized_pnl), 0.0)
    ).filter(
        TradingPosition.user_id == user_id,
        TradingPosition.status == PositionStatus.CLOSED
    ).scalar()
    
    # Total capital invested = starting balance + all deposits
    total_capital_invested = starting_balance + total_deposits
    
    # Trading growth % = (P&L / Total Capital Invested) × 100
    if total_capital_invested > 0:
        trading_growth = (realized_pnl / total_capital_invested) * 100
    else:
        trading_growth = 0.0
    
    return trading_growth


def get_account_growth_metrics(db: Session, user_id: int) -> Dict[str, Any]:
    """
    Get comprehensive account growth metrics using dynamic calculations.
    Separates trading growth from total growth (which includes deposits/withdrawals).
    """
    account_value_service = AccountValueService(db)
    
    # Get detailed breakdown
    breakdown = account_value_service.get_account_value_breakdown(user_id)
    
    # Calculate trading growth
    trading_growth = calculate_trading_growth_rate(db, user_id)
    
    # Calculate total growth
    starting_balance = breakdown['starting_balance']
    current_value = breakdown['current_value']
    
    total_growth_percent = 0.0
    if starting_balance > 0:
        total_growth_percent = ((current_value - starting_balance) / starting_balance) * 100
    
    return {
        'current_value': round(current_value, 2),
        'starting_balance': round(starting_balance, 2),
        'realized_pnl': round(breakdown['realized_pnl'], 2),
        'net_deposits': round(breakdown['net_cash_flow'], 2),
        'total_deposits': round(breakdown['total_deposits'], 2),
        'total_withdrawals': round(breakdown['total_withdrawals'], 2),
        'trading_growth_percent': round(trading_growth, 2),
        'total_growth_percent': round(total_growth_percent, 2),
        'pnl_from_trading': round(breakdown['realized_pnl'], 2),
        'pnl_from_deposits': round(breakdown['net_cash_flow'], 2),
        'calculation': breakdown['calculation']
    }

@cached(prefix='pnl_calendar', ttl=TTL_MEDIUM)
def get_pnl_calendar_data(
    db: Session,
    user_id: int,
    year: Optional[int] = None,
    month: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get daily P&L calendar data with Redis caching (30 min TTL)
    Cache is automatically invalidated when positions are updated
    """
    from sqlalchemy import func, extract
    
    query = db.query(
        func.date(TradingPositionEvent.event_date).label('event_date'),
        func.sum(TradingPositionEvent.realized_pnl).label('net_pnl'),
        func.count(TradingPositionEvent.id).label('trades_count')
    ).join(
        TradingPosition,
        TradingPositionEvent.position_id == TradingPosition.id
    ).filter(
        TradingPosition.user_id == user_id,
        TradingPositionEvent.event_type == EventType.SELL,
        TradingPositionEvent.realized_pnl.isnot(None)
    )
    
    if year:
        query = query.filter(extract('year', TradingPositionEvent.event_date) == year)
    if month:
        query = query.filter(extract('month', TradingPositionEvent.event_date) == month)
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query = query.filter(TradingPositionEvent.event_date >= start_dt)
        except ValueError:
            pass
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query = query.filter(TradingPositionEvent.event_date <= end_dt)
        except ValueError:
            pass
    
    query = query.group_by(func.date(TradingPositionEvent.event_date))
    query = query.order_by(func.date(TradingPositionEvent.event_date))
    
    results = query.all()
    
    # PERFORMANCE OPTIMIZATION: Fetch all events for the date range in ONE query
    # This avoids N+1 queries (one per day)
    events_query = db.query(
        func.date(TradingPositionEvent.event_date).label('event_date'),
        TradingPositionEvent.id.label('event_id'),
        TradingPositionEvent.position_id,
        TradingPosition.ticker
    ).join(
        TradingPosition,
        TradingPositionEvent.position_id == TradingPosition.id
    ).filter(
        TradingPosition.user_id == user_id,
        TradingPositionEvent.event_type == EventType.SELL,
        TradingPositionEvent.realized_pnl.isnot(None)
    )
    
    # Apply same date filters
    if year:
        events_query = events_query.filter(extract('year', TradingPositionEvent.event_date) == year)
    if month:
        events_query = events_query.filter(extract('month', TradingPositionEvent.event_date) == month)
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            events_query = events_query.filter(TradingPositionEvent.event_date >= start_dt)
        except ValueError:
            pass
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            events_query = events_query.filter(TradingPositionEvent.event_date <= end_dt)
        except ValueError:
            pass
    
    all_events = events_query.all()
    
    # Group events by date for fast lookup
    events_by_date = {}
    for event in all_events:
        date_key = event.event_date if isinstance(event.event_date, date) else event.event_date
        if date_key not in events_by_date:
            events_by_date[date_key] = []
        events_by_date[date_key].append({
            'event_id': event.event_id,
            'position_id': event.position_id,
            'ticker': event.ticker
        })
    
    daily_pnl = []
    winning_days = 0
    losing_days = 0
    best_day = None
    worst_day = None
    winning_day_total = 0.0
    losing_day_total = 0.0
    
    for row in results:
        event_date = row.event_date
        net_pnl = float(row.net_pnl or 0)
        trades_count = row.trades_count
        
        if isinstance(event_date, str):
            date_obj = datetime.strptime(event_date, '%Y-%m-%d').date()
        else:
            date_obj = event_date
        
        # Get events for this day from pre-fetched data (O(1) lookup)
        day_events = events_by_date.get(date_obj, [])
        event_ids = [e['event_id'] for e in day_events]
        position_ids = list(set([e['position_id'] for e in day_events]))
        tickers = list(set([e['ticker'] for e in day_events]))
        
        daily_entry = {
            "date": date_obj.isoformat(),
            "net_pnl": round(net_pnl, 2),
            "trades_count": trades_count,
            "event_ids": event_ids,
            "position_ids": position_ids,
            "tickers": tickers
        }
        daily_pnl.append(daily_entry)
        
        if net_pnl > 0:
            winning_days += 1
            winning_day_total += net_pnl
            if best_day is None or net_pnl > best_day['pnl']:
                best_day = {"date": date_obj.isoformat(), "pnl": round(net_pnl, 2)}
        elif net_pnl < 0:
            losing_days += 1
            losing_day_total += abs(net_pnl)
            if worst_day is None or net_pnl < worst_day['pnl']:
                worst_day = {"date": date_obj.isoformat(), "pnl": round(net_pnl, 2)}
    
    total_pnl = sum(day['net_pnl'] for day in daily_pnl)
    trading_days = len(daily_pnl)
    win_rate = (winning_days / trading_days * 100) if trading_days > 0 else 0
    avg_winning_day = (winning_day_total / winning_days) if winning_days > 0 else 0
    avg_losing_day = -(losing_day_total / losing_days) if losing_days > 0 else 0
    
    summary = {
        "total_pnl": round(total_pnl, 2),
        "trading_days": trading_days,
        "winning_days": winning_days,
        "losing_days": losing_days,
        "win_rate": round(win_rate, 2),
        "best_day": best_day,
        "worst_day": worst_day,
        "avg_winning_day": round(avg_winning_day, 2),
        "avg_losing_day": round(avg_losing_day, 2)
    }
    
    return {
        "daily_pnl": daily_pnl,
        "summary": summary
    }


@cached(prefix='day_events', ttl=TTL_MEDIUM)
def get_day_event_details(
    db: Session,
    user_id: int,
    event_date: str,
    event_ids: Optional[List[int]] = None
) -> List[Dict[str, Any]]:
    """
    Get event details for a specific day with Redis caching (30 min TTL)
    """
    from sqlalchemy.orm import joinedload
    
    try:
        target_date = datetime.fromisoformat(event_date).date()
    except ValueError:
        return []
    
    query = db.query(TradingPositionEvent).options(
        joinedload(TradingPositionEvent.position)
    ).join(
        TradingPosition,
        TradingPositionEvent.position_id == TradingPosition.id
    ).filter(
        TradingPosition.user_id == user_id,
        func.date(TradingPositionEvent.event_date) == target_date,
        TradingPositionEvent.event_type == EventType.SELL,
        TradingPositionEvent.realized_pnl.isnot(None)
    )
    
    if event_ids:
        query = query.filter(TradingPositionEvent.id.in_(event_ids))
    
    events = query.order_by(TradingPositionEvent.event_date).all()
    
    event_details = []
    for event in events:
        event_details.append({
            "event_id": event.id,
            "position_id": event.position_id,
            "ticker": event.position.ticker,
            "event_type": event.event_type.value,
            "event_date": event.event_date.isoformat(),
            "shares": abs(event.shares),
            "price": round(event.price, 2),
            "realized_pnl": round(event.realized_pnl or 0, 2),
            "notes": event.notes,
            "strategy": event.position.strategy,
            "setup_type": event.position.setup_type
        })
    
    return event_details