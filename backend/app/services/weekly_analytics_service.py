#!/usr/bin/env python3
"""
Weekly Analytics Service for TradeJournal
Calculates comprehensive trading statistics for Monday-Friday periods
"""

from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
import pytz
from statistics import mean, median

from app.models.models import Trade, User, TradeStatus
from app.db.session import get_db


class WeeklyAnalyticsService:
    def __init__(self, db: Session):
        self.db = db
    
    def get_week_range_in_timezone(self, user_timezone: str, target_date: Optional[datetime] = None) -> Tuple[datetime, datetime]:
        """
        Get the Monday-Friday range for the previous week in user's timezone
        Returns UTC times for database queries
        """
        if target_date is None:
            target_date = datetime.now()
        
        # Convert to user's timezone
        user_tz = pytz.timezone(user_timezone)
        local_time = user_tz.localize(target_date) if target_date.tzinfo is None else target_date.astimezone(user_tz)
        
        # Get the previous Monday (or current Monday if today is Monday)
        days_since_monday = local_time.weekday()
        if days_since_monday == 0:  # If today is Monday, get last week
            week_start = local_time - timedelta(days=7)
        else:
            week_start = local_time - timedelta(days=days_since_monday + 7)
        
        # Set to start of Monday
        week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Friday end of day
        week_end = week_start + timedelta(days=4, hours=23, minutes=59, seconds=59)
        
        # Convert back to UTC for database queries
        week_start_utc = week_start.astimezone(pytz.UTC).replace(tzinfo=None)
        week_end_utc = week_end.astimezone(pytz.UTC).replace(tzinfo=None)
        
        return week_start_utc, week_end_utc
    
    def calculate_weekly_stats(self, user_id: int, user_timezone: str = 'America/New_York') -> Dict[str, Any]:
        """
        Calculate comprehensive weekly trading statistics
        """
        week_start, week_end = self.get_week_range_in_timezone(user_timezone)
        
        # Get all closed trades for the week
        closed_trades = self.db.query(Trade).filter(
            and_(
                Trade.user_id == user_id,
                Trade.status == TradeStatus.CLOSED,
                Trade.exit_date >= week_start,
                Trade.exit_date <= week_end,
                Trade.profit_loss.isnot(None)
            )
        ).all()
        
        # Basic stats
        total_trades = len(closed_trades)
        
        if total_trades == 0:
            return self._empty_stats_response(week_start, week_end, user_timezone)
        
        # Calculate P&L metrics
        profits = [trade.profit_loss for trade in closed_trades if trade.profit_loss > 0]
        losses = [abs(trade.profit_loss) for trade in closed_trades if trade.profit_loss < 0]
        all_pnl = [trade.profit_loss for trade in closed_trades]
        
        wins = len(profits)
        losses_count = len(losses)
        win_rate = (wins / total_trades * 100) if total_trades > 0 else 0
        
        weekly_pnl = sum(all_pnl)
        largest_win = max(profits) if profits else 0
        largest_loss = max(losses) if losses else 0
        
        # Average metrics
        avg_win = mean(profits) if profits else 0
        avg_loss = mean(losses) if losses else 0
        avg_trade_pnl = mean(all_pnl)
        
        # Risk metrics
        risk_amounts = [abs(trade.total_risk) for trade in closed_trades if trade.total_risk]
        avg_risk = mean(risk_amounts) if risk_amounts else 0
        total_risk_taken = sum(risk_amounts)
        
        # Holding time analysis
        holding_times = []
        for trade in closed_trades:
            if trade.entry_date and trade.exit_date:
                hold_time = trade.exit_date - trade.entry_date
                holding_times.append(hold_time.total_seconds() / 3600)  # Convert to hours
        
        avg_holding_time = self._format_holding_time(mean(holding_times)) if holding_times else "N/A"
        
        # Strategy/Setup performance
        strategy_performance = self._analyze_strategy_performance(closed_trades)
        setup_performance = self._analyze_setup_performance(closed_trades)
        
        # Generate insights
        insights = self._generate_insights(
            total_trades, win_rate, weekly_pnl, largest_win, largest_loss,
            avg_win, avg_loss, strategy_performance, setup_performance
        )
        
        return {
            'week_start': week_start,
            'week_end': week_end,
            'user_timezone': user_timezone,
            'total_trades': total_trades,
            'wins': wins,
            'losses': losses_count,
            'win_rate': round(win_rate, 1),
            'weekly_pnl': round(weekly_pnl, 2),
            'largest_win': round(largest_win, 2),
            'largest_loss': round(largest_loss, 2),
            'avg_win': round(avg_win, 2),
            'avg_loss': round(avg_loss, 2),
            'avg_trade_pnl': round(avg_trade_pnl, 2),
            'avg_risk': round(avg_risk, 2),
            'total_risk_taken': round(total_risk_taken, 2),
            'avg_holding_time': avg_holding_time,
            'strategy_performance': strategy_performance,
            'setup_performance': setup_performance,
            'insights': insights,
            'profit_factor': round(sum(profits) / sum(losses), 2) if losses else "inf",
            'trades_data': self._format_trades_for_email(closed_trades[:5])  # Top 5 trades
        }
    
    def _empty_stats_response(self, week_start: datetime, week_end: datetime, user_timezone: str) -> Dict[str, Any]:
        """Return empty stats when no trades found"""
        return {
            'week_start': week_start,
            'week_end': week_end,
            'user_timezone': user_timezone,
            'total_trades': 0,
            'wins': 0,
            'losses': 0,
            'win_rate': 0,
            'weekly_pnl': 0,
            'largest_win': 0,
            'largest_loss': 0,
            'avg_win': 0,
            'avg_loss': 0,
            'avg_trade_pnl': 0,
            'avg_risk': 0,
            'total_risk_taken': 0,
            'avg_holding_time': "N/A",
            'strategy_performance': [],
            'setup_performance': [],
            'insights': ["No trades taken this week. Focus on finding quality setups for next week!"],
            'profit_factor': 0,
            'trades_data': []
        }
    
    def _analyze_strategy_performance(self, trades: List[Trade]) -> List[Dict[str, Any]]:
        """Analyze performance by strategy"""
        strategy_stats = {}
        
        for trade in trades:
            strategy = trade.strategy or "Unknown"
            if strategy not in strategy_stats:
                strategy_stats[strategy] = {'trades': [], 'pnl': 0}
            
            strategy_stats[strategy]['trades'].append(trade)
            strategy_stats[strategy]['pnl'] += trade.profit_loss
        
        # Sort by total P&L
        performance = []
        for strategy, stats in strategy_stats.items():
            trades_count = len(stats['trades'])
            wins = len([t for t in stats['trades'] if t.profit_loss > 0])
            win_rate = (wins / trades_count * 100) if trades_count > 0 else 0
            
            performance.append({
                'strategy': strategy,
                'trades': trades_count,
                'pnl': round(stats['pnl'], 2),
                'win_rate': round(win_rate, 1)
            })
        
        return sorted(performance, key=lambda x: x['pnl'], reverse=True)
    
    def _analyze_setup_performance(self, trades: List[Trade]) -> List[Dict[str, Any]]:
        """Analyze performance by setup type"""
        setup_stats = {}
        
        for trade in trades:
            setup = trade.setup_type or "Unknown"
            if setup not in setup_stats:
                setup_stats[setup] = {'trades': [], 'pnl': 0}
            
            setup_stats[setup]['trades'].append(trade)
            setup_stats[setup]['pnl'] += trade.profit_loss
        
        # Sort by total P&L
        performance = []
        for setup, stats in setup_stats.items():
            trades_count = len(stats['trades'])
            wins = len([t for t in stats['trades'] if t.profit_loss > 0])
            win_rate = (wins / trades_count * 100) if trades_count > 0 else 0
            
            performance.append({
                'setup': setup,
                'trades': trades_count,
                'pnl': round(stats['pnl'], 2),
                'win_rate': round(win_rate, 1)
            })
        
        return sorted(performance, key=lambda x: x['pnl'], reverse=True)
    
    def _format_holding_time(self, hours: float) -> str:
        """Format holding time in a readable format"""
        if hours < 1:
            return f"{int(hours * 60)}m"
        elif hours < 24:
            return f"{hours:.1f}h"
        else:
            days = int(hours // 24)
            remaining_hours = int(hours % 24)
            if remaining_hours == 0:
                return f"{days}d"
            else:
                return f"{days}d {remaining_hours}h"
    
    def _format_trades_for_email(self, trades: List[Trade]) -> List[Dict[str, Any]]:
        """Format trades for email display"""
        formatted_trades = []
        
        for trade in trades:
            formatted_trades.append({
                'ticker': trade.ticker,
                'direction': trade.trade_type.value.upper(),
                'entry_price': trade.entry_price,
                'exit_price': trade.exit_price,
                'profit_loss': trade.profit_loss,
                'profit_loss_percent': trade.profit_loss_percent,
                'strategy': trade.strategy,
                'setup_type': trade.setup_type,
                'entry_date': trade.entry_date.strftime('%m/%d') if trade.entry_date else '',
                'exit_date': trade.exit_date.strftime('%m/%d') if trade.exit_date else ''
            })
        
        # Sort by P&L descending
        return sorted(formatted_trades, key=lambda x: x['profit_loss'] or 0, reverse=True)
    
    def _generate_insights(self, total_trades: int, win_rate: float, weekly_pnl: float,
                          largest_win: float, largest_loss: float, avg_win: float, avg_loss: float,
                          strategy_performance: List[Dict], setup_performance: List[Dict]) -> List[str]:
        """Generate actionable insights based on weekly performance"""
        insights = []
        
        # Trade volume insights
        if total_trades < 3:
            insights.append(f"Consider increasing trade frequency - only {total_trades} trades taken this week")
        elif total_trades > 15:
            insights.append("High trade frequency - ensure you're being selective with quality setups")
        
        # Win rate insights
        if win_rate >= 70:
            insights.append(f"Excellent {win_rate}% win rate! Consider increasing position sizes on high-conviction trades")
        elif win_rate >= 50:
            insights.append(f"Good {win_rate}% win rate - focus on letting winners run longer")
        elif win_rate < 40:
            insights.append(f"Win rate of {win_rate}% needs improvement - review entry criteria and setups")
        
        # Risk/Reward insights
        if avg_win > 0 and avg_loss > 0:
            rr_ratio = avg_win / avg_loss
            if rr_ratio >= 2:
                insights.append(f"Great risk/reward ratio of {rr_ratio:.1f}:1 - keep targeting larger wins")
            elif rr_ratio < 1:
                insights.append(f"Risk/reward ratio of {rr_ratio:.1f}:1 is concerning - consider tighter stops or larger targets")
        
        # P&L insights
        if weekly_pnl > 0:
            insights.append(f"Profitable week with ${weekly_pnl:.2f} gained - maintain discipline and consistency")
        else:
            insights.append(f"Down ${abs(weekly_pnl):.2f} this week - review and learn from losing trades")
        
        # Strategy insights
        if strategy_performance:
            best_strategy = strategy_performance[0]
            if best_strategy['pnl'] > 0:
                insights.append(f"'{best_strategy['strategy']}' strategy performed best with ${best_strategy['pnl']:.2f} profit")
            
            if len(strategy_performance) > 1:
                worst_strategy = strategy_performance[-1]
                if worst_strategy['pnl'] < 0:
                    insights.append(f"Avoid '{worst_strategy['strategy']}' setups - lost ${abs(worst_strategy['pnl']):.2f} this week")
        
        # Setup insights
        if setup_performance:
            best_setup = setup_performance[0]
            if best_setup['pnl'] > 0:
                insights.append(f"'{best_setup['setup']}' setups were most profitable - focus on these patterns")
        
        return insights[:6]  # Limit to 6 insights max


def get_weekly_analytics_service(db: Session = None) -> WeeklyAnalyticsService:
    """Get weekly analytics service instance"""
    if db is None:
        db = next(get_db())
    return WeeklyAnalyticsService(db)