"""
Comprehensive unit tests for Analytics Service
Tests performance metrics, risk-adjusted returns, drawdown analysis, and trading quality metrics
"""
import pytest
from datetime import datetime, timedelta
import numpy as np

from app.services.analytics_service import (
    get_performance_metrics,
    get_setup_performance,
    get_advanced_performance_metrics,
    _calculate_streaks
)
from app.models.position_models import (
    TradingPosition,
    TradingPositionEvent,
    PositionStatus,
    EventType
)
from app.services.position_service import PositionService
from app.models.position_models import User

class TestPerformanceMetrics:
    """Test basic performance metrics calculations"""
    
    def test_performance_metrics_no_positions(self, test_db, test_user):
        """Test metrics with no closed positions"""
        metrics = get_performance_metrics(test_db, test_user.id)
        
        assert metrics.total_trades == 0
        assert metrics.winning_trades == 0
        assert metrics.losing_trades == 0
        assert metrics.win_rate == 0.0
        assert metrics.total_profit_loss == 0.0
    
    def test_performance_metrics_single_winning_trade(self, test_db, test_user):
        """Test metrics with single winning trade"""
        service = PositionService(test_db)
        
        # Create and close winning position
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        test_db.commit()
        service.add_shares(position_id=position.id, shares=100, price=150.0)
        service.sell_shares(position_id=position.id, shares=100, price=160.0)
        test_db.commit()
        
        metrics = get_performance_metrics(test_db, test_user.id)
        
        assert metrics.total_trades == 1
        assert metrics.winning_trades == 1
        assert metrics.losing_trades == 0
        assert metrics.win_rate == 100.0
        assert metrics.total_profit_loss == 1000.0
        assert metrics.largest_win == 1000.0
        assert metrics.average_profit == 1000.0
    
    def test_performance_metrics_single_losing_trade(self, test_db, test_user):
        """Test metrics with single losing trade"""
        service = PositionService(test_db)
        
        # Create and close losing position
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        test_db.commit()
        service.add_shares(position_id=position.id, shares=100, price=160.0)
        service.sell_shares(position_id=position.id, shares=100, price=150.0)
        test_db.commit()
        
        metrics = get_performance_metrics(test_db, test_user.id)
        
        assert metrics.total_trades == 1
        assert metrics.winning_trades == 0
        assert metrics.losing_trades == 1
        assert metrics.win_rate == 0.0
        assert metrics.total_profit_loss == -1000.0
        assert metrics.largest_loss == 1000.0
        assert metrics.average_loss == 1000.0
    
    def test_performance_metrics_mixed_trades(self, test_db, test_user):
        """Test metrics with mixed winning and losing trades"""
        service = PositionService(test_db)
        
        # Winning trade 1: +1000
        pos1 = service.create_position(user_id=test_user.id, ticker="AAPL")
        test_db.commit()
        service.add_shares(position_id=pos1.id, shares=100, price=150.0)
        service.sell_shares(position_id=pos1.id, shares=100, price=160.0)
        
        # Winning trade 2: +2000
        pos2 = service.create_position(user_id=test_user.id, ticker="TSLA")
        test_db.commit()
        service.add_shares(position_id=pos2.id, shares=100, price=200.0)
        service.sell_shares(position_id=pos2.id, shares=100, price=220.0)
        
        # Losing trade 1: -500
        pos3 = service.create_position(user_id=test_user.id, ticker="NVDA")
        test_db.commit()
        service.add_shares(position_id=pos3.id, shares=100, price=500.0)
        service.sell_shares(position_id=pos3.id, shares=100, price=495.0)
        
        test_db.commit()
        
        metrics = get_performance_metrics(test_db, test_user.id)
        
        assert metrics.total_trades == 3
        assert metrics.winning_trades == 2
        assert metrics.losing_trades == 1
        assert metrics.win_rate == pytest.approx(66.67, rel=0.1)
        assert metrics.total_profit_loss == 2500.0  # 1000 + 2000 - 500
        assert metrics.largest_win == 2000.0
        assert metrics.largest_loss == 500.0
        assert metrics.average_profit == 1500.0  # (1000 + 2000) / 2
        assert metrics.average_loss == 500.0
        assert metrics.profit_factor == 6.0  # 3000 / 500
    
    def test_performance_metrics_ignores_open_positions(self, test_db, test_user):
        """Test that open positions are not included in metrics"""
        service = PositionService(test_db)
        
        # Closed position
        pos1 = service.create_position(user_id=test_user.id, ticker="AAPL")
        test_db.commit()
        service.add_shares(position_id=pos1.id, shares=100, price=150.0)
        service.sell_shares(position_id=pos1.id, shares=100, price=160.0)
        
        # Open position (should be ignored)
        pos2 = service.create_position(user_id=test_user.id, ticker="TSLA")
        test_db.commit()
        service.add_shares(position_id=pos2.id, shares=100, price=200.0)
        
        test_db.commit()
        
        metrics = get_performance_metrics(test_db, test_user.id)
        
        assert metrics.total_trades == 1  # Only closed position
    
    def test_performance_metrics_with_date_filter(self, test_db, test_user):
        """Test filtering metrics by date range"""
        service = PositionService(test_db)
        
        # Old position (Jan 2024)
        pos1 = service.create_position(user_id=test_user.id, ticker="AAPL")
        pos1.opened_at = datetime(2024, 1, 15)
        pos1.closed_at = datetime(2024, 1, 20)
        pos1.status = PositionStatus.CLOSED
        pos1.total_realized_pnl = 1000.0
        test_db.commit()
        
        # Recent position (Feb 2024)
        pos2 = service.create_position(user_id=test_user.id, ticker="TSLA")
        pos2.opened_at = datetime(2024, 2, 15)
        pos2.closed_at = datetime(2024, 2, 20)
        pos2.status = PositionStatus.CLOSED
        pos2.total_realized_pnl = 2000.0
        test_db.commit()
        
        # Filter to only February
        metrics = get_performance_metrics(
            test_db,
            test_user.id,
            start_date="2024-02-01T00:00:00Z",
            end_date="2024-02-28T23:59:59Z"
        )
        
        assert metrics.total_trades == 1
        assert metrics.total_profit_loss == 2000.0
    
    def test_performance_metrics_profit_factor_infinity(self, test_db, test_user):
        """Test profit factor when there are no losses"""
        service = PositionService(test_db)
        
        # Only winning trades
        pos1 = service.create_position(user_id=test_user.id, ticker="AAPL")
        test_db.commit()
        service.add_shares(position_id=pos1.id, shares=100, price=150.0)
        service.sell_shares(position_id=pos1.id, shares=100, price=160.0)
        
        test_db.commit()
        
        metrics = get_performance_metrics(test_db, test_user.id)
        
        assert metrics.profit_factor == float('inf')


class TestSetupPerformance:
    """Test performance metrics by setup type"""
    
    def test_setup_performance_single_setup(self, test_db, test_user):
        """Test performance for single setup type"""
        service = PositionService(test_db)
        
        # Create positions with same setup
        pos1 = service.create_position(
            user_id=test_user.id,
            ticker="AAPL",
            setup_type="Breakout"
        )
        test_db.commit()
        service.add_shares(position_id=pos1.id, shares=100, price=150.0)
        service.sell_shares(position_id=pos1.id, shares=100, price=160.0)
        
        test_db.commit()
        
        setups = get_setup_performance(test_db, test_user.id)
        
        assert len(setups) == 1
        assert setups[0].setup_type == "Breakout"
        assert setups[0].total_trades == 1
        assert setups[0].winning_trades == 1
    
    def test_setup_performance_multiple_setups(self, test_db, test_user):
        """Test performance across multiple setup types"""
        service = PositionService(test_db)
        
        # Breakout setup: 2 trades
        pos1 = service.create_position(user_id=test_user.id, ticker="AAPL", setup_type="Breakout")
        test_db.commit()
        service.add_shares(position_id=pos1.id, shares=100, price=150.0)
        service.sell_shares(position_id=pos1.id, shares=100, price=160.0)
        
        pos2 = service.create_position(user_id=test_user.id, ticker="TSLA", setup_type="Breakout")
        test_db.commit()
        service.add_shares(position_id=pos2.id, shares=100, price=200.0)
        service.sell_shares(position_id=pos2.id, shares=100, price=190.0)
        
        # Pullback setup: 1 trade
        pos3 = service.create_position(user_id=test_user.id, ticker="NVDA", setup_type="Pullback")
        test_db.commit()
        service.add_shares(position_id=pos3.id, shares=100, price=500.0)
        service.sell_shares(position_id=pos3.id, shares=100, price=520.0)
        
        test_db.commit()
        
        setups = get_setup_performance(test_db, test_user.id)
        
        assert len(setups) == 2
        
        # Find breakout setup
        breakout = next(s for s in setups if s.setup_type == "Breakout")
        assert breakout.total_trades == 2
        assert breakout.winning_trades == 1
        assert breakout.losing_trades == 1
        assert breakout.win_rate == 50.0
        
        # Find pullback setup
        pullback = next(s for s in setups if s.setup_type == "Pullback")
        assert pullback.total_trades == 1
        assert pullback.winning_trades == 1
    
    def test_setup_performance_sorted_by_trade_count(self, test_db, test_user):
        """Test setups are sorted by trade count descending"""
        service = PositionService(test_db)
        
        # Setup A: 3 trades
        for i in range(3):
            pos = service.create_position(
                user_id=test_user.id,
                ticker=f"TICK{i}",
                setup_type="Setup A"
            )
            test_db.commit()
            service.add_shares(position_id=pos.id, shares=100, price=100.0)
            service.sell_shares(position_id=pos.id, shares=100, price=110.0)
        
        # Setup B: 1 trade
        pos = service.create_position(user_id=test_user.id, ticker="LAST", setup_type="Setup B")
        test_db.commit()
        service.add_shares(position_id=pos.id, shares=100, price=100.0)
        service.sell_shares(position_id=pos.id, shares=100, price=110.0)
        
        test_db.commit()
        
        setups = get_setup_performance(test_db, test_user.id)
        
        assert setups[0].setup_type == "Setup A"
        assert setups[0].total_trades == 3
        assert setups[1].setup_type == "Setup B"
        assert setups[1].total_trades == 1
    
    def test_setup_performance_ignores_null_setups(self, test_db, test_user):
        """Test positions without setup_type are ignored"""
        service = PositionService(test_db)
        
        # Position without setup
        pos1 = service.create_position(user_id=test_user.id, ticker="AAPL")
        test_db.commit()
        service.add_shares(position_id=pos1.id, shares=100, price=150.0)
        service.sell_shares(position_id=pos1.id, shares=100, price=160.0)
        
        # Position with setup
        pos2 = service.create_position(user_id=test_user.id, ticker="TSLA", setup_type="Breakout")
        test_db.commit()
        service.add_shares(position_id=pos2.id, shares=100, price=200.0)
        service.sell_shares(position_id=pos2.id, shares=100, price=210.0)
        
        test_db.commit()
        
        setups = get_setup_performance(test_db, test_user.id)
        
        assert len(setups) == 1
        assert setups[0].setup_type == "Breakout"


class TestAdvancedMetrics:
    """Test advanced performance metrics including risk-adjusted returns"""
    
    def test_advanced_metrics_no_positions(self, test_db, test_user):
        """Test advanced metrics with no positions"""
        metrics = get_advanced_performance_metrics(test_db, test_user.id)
        
        assert metrics['total_trades'] == 0
        assert metrics['total_pnl'] == 0.0
        assert metrics['max_drawdown'] == 0.0
        assert metrics['sharpe_ratio'] == 0.0
    
    def test_advanced_metrics_basic_calculations(self, test_db, test_user):
        """Test basic advanced metrics calculations"""
        service = PositionService(test_db)
        
        # Create some closed positions
        pos1 = service.create_position(user_id=test_user.id, ticker="AAPL")
        pos1.closed_at = datetime(2024, 1, 15)
        test_db.commit()
        service.add_shares(position_id=pos1.id, shares=100, price=150.0)
        service.sell_shares(position_id=pos1.id, shares=100, price=160.0)
        
        pos2 = service.create_position(user_id=test_user.id, ticker="TSLA")
        pos2.closed_at = datetime(2024, 1, 16)
        test_db.commit()
        service.add_shares(position_id=pos2.id, shares=100, price=200.0)
        service.sell_shares(position_id=pos2.id, shares=100, price=210.0)
        
        test_db.commit()
        
        metrics = get_advanced_performance_metrics(test_db, test_user.id)
        
        assert metrics['total_trades'] == 2
        assert metrics['total_pnl'] == 2000.0
        assert metrics['win_rate'] == 100.0
        assert 'equity_curve' in metrics
        assert len(metrics['equity_curve']) > 0
    
    def test_advanced_metrics_drawdown_calculation(self, test_db, test_user):
        """Test max drawdown calculation"""
        service = PositionService(test_db)
        
        # Win -> Loss -> Win pattern to create drawdown
        pos1 = service.create_position(user_id=test_user.id, ticker="T1")
        pos1.closed_at = datetime(2024, 1, 1)
        pos1.total_realized_pnl = 1000.0
        pos1.status = PositionStatus.CLOSED
        test_db.add(pos1)
        
        pos2 = service.create_position(user_id=test_user.id, ticker="T2")
        pos2.closed_at = datetime(2024, 1, 2)
        pos2.total_realized_pnl = -800.0  # Drawdown
        pos2.status = PositionStatus.CLOSED
        test_db.add(pos2)
        
        pos3 = service.create_position(user_id=test_user.id, ticker="T3")
        pos3.closed_at = datetime(2024, 1, 3)
        pos3.total_realized_pnl = 500.0
        pos3.status = PositionStatus.CLOSED
        test_db.add(pos3)
        
        test_db.commit()
        
        metrics = get_advanced_performance_metrics(test_db, test_user.id)
        
        assert metrics['max_drawdown'] == 800.0
        assert metrics['max_drawdown_percent'] > 0
    
    def test_advanced_metrics_sharpe_ratio(self, test_db, test_user):
        """Test Sharpe ratio calculation"""
        service = PositionService(test_db)
        
        # Create consistent winning positions
        for i in range(10):
            pos = service.create_position(user_id=test_user.id, ticker=f"T{i}")
            pos.closed_at = datetime(2024, 1, i + 1)
            pos.total_realized_pnl = 100.0 + (i * 10)  # Increasing returns
            pos.status = PositionStatus.CLOSED
            test_db.add(pos)
        
        test_db.commit()
        
        metrics = get_advanced_performance_metrics(test_db, test_user.id)
        
        # Should have positive Sharpe ratio for consistent wins
        assert metrics['sharpe_ratio'] > 0
    
    def test_advanced_metrics_sortino_ratio(self, test_db, test_user):
        """Test Sortino ratio calculation (downside deviation only)"""
        service = PositionService(test_db)
        
        # Mix of wins and losses
        pnls = [100, 200, -50, 150, -30, 180, 120]
        
        for i, pnl in enumerate(pnls):
            pos = service.create_position(user_id=test_user.id, ticker=f"T{i}")
            pos.closed_at = datetime(2024, 1, i + 1)
            pos.total_realized_pnl = pnl
            pos.status = PositionStatus.CLOSED
            test_db.add(pos)
        
        test_db.commit()
        
        metrics = get_advanced_performance_metrics(test_db, test_user.id)
        
        # Sortino should be present (uses only downside deviation)
        assert 'sortino_ratio' in metrics
        assert isinstance(metrics['sortino_ratio'], (int, float))
    
    def test_advanced_metrics_kelly_criterion(self, test_db, test_user):
        """Test Kelly percentage calculation"""
        service = PositionService(test_db)
        
        # 60% win rate with favorable risk/reward
        wins = [200, 180, 220, 190, 210, 195]  # 6 wins
        losses = [-100, -90, -110, -95]  # 4 losses
        
        for i, pnl in enumerate(wins + losses):
            pos = service.create_position(user_id=test_user.id, ticker=f"T{i}")
            pos.closed_at = datetime(2024, 1, i + 1)
            pos.total_realized_pnl = pnl
            pos.status = PositionStatus.CLOSED
            test_db.add(pos)
        
        test_db.commit()
        
        metrics = get_advanced_performance_metrics(test_db, test_user.id)
        
        assert 'kelly_percentage' in metrics
        assert metrics['kelly_percentage'] >= 0  # Should suggest some position sizing
    
    def test_advanced_metrics_expectancy(self, test_db, test_user):
        """Test expectancy calculation (expected $ per trade)"""
        service = PositionService(test_db)
        
        # Simple case: 2 wins of $100, 1 loss of $50
        # Expectancy = (2/3 * 100) - (1/3 * 50) = 66.67 - 16.67 = 50
        
        pos1 = service.create_position(user_id=test_user.id, ticker="T1")
        pos1.closed_at = datetime(2024, 1, 1)
        pos1.total_realized_pnl = 100.0
        pos1.status = PositionStatus.CLOSED
        test_db.add(pos1)
        
        pos2 = service.create_position(user_id=test_user.id, ticker="T2")
        pos2.closed_at = datetime(2024, 1, 2)
        pos2.total_realized_pnl = 100.0
        pos2.status = PositionStatus.CLOSED
        test_db.add(pos2)
        
        pos3 = service.create_position(user_id=test_user.id, ticker="T3")
        pos3.closed_at = datetime(2024, 1, 3)
        pos3.total_realized_pnl = -50.0
        pos3.status = PositionStatus.CLOSED
        test_db.add(pos3)
        
        test_db.commit()
        
        metrics = get_advanced_performance_metrics(test_db, test_user.id)
        
        assert 'expectancy' in metrics
        assert metrics['expectancy'] == pytest.approx(50.0, rel=0.1)
    
    def test_advanced_metrics_monthly_returns(self, test_db, test_user):
        """Test monthly returns grouping"""
        service = PositionService(test_db)
        
        # Jan trades
        pos1 = service.create_position(user_id=test_user.id, ticker="T1")
        pos1.closed_at = datetime(2024, 1, 15)
        pos1.total_realized_pnl = 500.0
        pos1.status = PositionStatus.CLOSED
        test_db.add(pos1)
        
        # Feb trades
        pos2 = service.create_position(user_id=test_user.id, ticker="T2")
        pos2.closed_at = datetime(2024, 2, 10)
        pos2.total_realized_pnl = 300.0
        pos2.status = PositionStatus.CLOSED
        test_db.add(pos2)
        
        pos3 = service.create_position(user_id=test_user.id, ticker="T3")
        pos3.closed_at = datetime(2024, 2, 20)
        pos3.total_realized_pnl = 200.0
        pos3.status = PositionStatus.CLOSED
        test_db.add(pos3)
        
        test_db.commit()
        
        metrics = get_advanced_performance_metrics(test_db, test_user.id)
        
        assert 'monthly_returns' in metrics
        assert len(metrics['monthly_returns']) == 2
        
        jan = next(m for m in metrics['monthly_returns'] if m['month'] == '2024-01')
        assert jan['pnl'] == 500.0
        assert jan['trades'] == 1
        
        feb = next(m for m in metrics['monthly_returns'] if m['month'] == '2024-02')
        assert feb['pnl'] == 500.0
        assert feb['trades'] == 2


class TestStreakCalculations:
    """Test consecutive win/loss streak calculations"""
    
    def test_calculate_streaks_empty(self, test_db, test_user):
        """Test streak calculation with no positions"""
        positions = []
        curr_win, curr_loss, max_win, max_loss = _calculate_streaks(positions)
        
        assert curr_win == 0
        assert curr_loss == 0
        assert max_win == 0
        assert max_loss == 0
    
    def test_calculate_streaks_single_win(self, test_db, test_user):
        """Test streak with single win"""
        service = PositionService(test_db)
        
        pos = service.create_position(user_id=test_user.id, ticker="AAPL")
        pos.total_realized_pnl = 100.0
        pos.status = PositionStatus.CLOSED
        test_db.add(pos)
        test_db.commit()
        
        positions = [pos]
        curr_win, curr_loss, max_win, max_loss = _calculate_streaks(positions)
        
        assert curr_win == 1
        assert curr_loss == 0
        assert max_win == 1
        assert max_loss == 0
    
    def test_calculate_streaks_consecutive_wins(self, test_db, test_user):
        """Test streak with consecutive wins"""
        from datetime import datetime
        positions = []
        
        for i in range(5):
            pos = TradingPosition(
                user_id=test_user.id,
                ticker=f"T{i}",
                total_realized_pnl=100.0 + i,
                status=PositionStatus.CLOSED,
                opened_at=datetime(2024, 1, i + 1),
                closed_at=datetime(2024, 1, i + 1)
            )
            test_db.add(pos)
            positions.append(pos)
        
        test_db.commit()
        
        curr_win, curr_loss, max_win, max_loss = _calculate_streaks(positions)
        
        assert curr_win == 5
        assert curr_loss == 0
        assert max_win == 5
        assert max_loss == 0
    
    def test_calculate_streaks_consecutive_losses(self, test_db, test_user):
        """Test streak with consecutive losses"""
        from datetime import datetime
        positions = []
        
        for i in range(3):
            pos = TradingPosition(
                user_id=test_user.id,
                ticker=f"T{i}",
                total_realized_pnl=-50.0 - i,
                status=PositionStatus.CLOSED,
                opened_at=datetime(2024, 1, i + 1),
                closed_at=datetime(2024, 1, i + 1)
            )
            test_db.add(pos)
            positions.append(pos)
        
        test_db.commit()
        
        curr_win, curr_loss, max_win, max_loss = _calculate_streaks(positions)
        
        assert curr_win == 0
        assert curr_loss == 3
        assert max_win == 0
        assert max_loss == 3
    
    def test_calculate_streaks_alternating(self, test_db, test_user):
        """Test streak with alternating wins and losses"""
        from datetime import datetime
        pnls = [100, -50, 200, -30, 150]
        positions = []
        
        for i, pnl in enumerate(pnls):
            pos = TradingPosition(
                user_id=test_user.id,
                ticker=f"T{i}",
                total_realized_pnl=pnl,
                status=PositionStatus.CLOSED,
                opened_at=datetime(2024, 1, i + 1),
                closed_at=datetime(2024, 1, i + 1)
            )
            test_db.add(pos)
            positions.append(pos)
        
        test_db.commit()
        
        curr_win, curr_loss, max_win, max_loss = _calculate_streaks(positions)
        
        assert curr_win == 1  # Last trade was a win
        assert curr_loss == 0
        assert max_win == 1  # Never more than 1 consecutive win
        assert max_loss == 1  # Never more than 1 consecutive loss
    
    def test_calculate_streaks_complex_pattern(self, test_db, test_user):
        """Test streak with complex win/loss pattern"""
        from datetime import datetime
        # Pattern: 3 wins, 2 losses, 4 wins, 1 loss
        pnls = [100, 150, 200, -50, -30, 180, 220, 190, 210, -40]
        positions = []
        
        for i, pnl in enumerate(pnls):
            pos = TradingPosition(
                user_id=test_user.id,
                ticker=f"T{i}",
                total_realized_pnl=pnl,
                status=PositionStatus.CLOSED,
                opened_at=datetime(2024, 1, i + 1),
                closed_at=datetime(2024, 1, i + 1)
            )
            test_db.add(pos)
            positions.append(pos)
        
        test_db.commit()
        
        curr_win, curr_loss, max_win, max_loss = _calculate_streaks(positions)
        
        assert curr_loss == 1  # Currently on 1 loss
        assert curr_win == 0
        assert max_win == 4  # Best streak was 4 wins
        assert max_loss == 2  # Worst streak was 2 losses
    
    def test_advanced_metrics_includes_streaks(self, test_db, test_user):
        """Test that advanced metrics include streak data"""
        service = PositionService(test_db)
        
        # Create pattern: 3 wins, 2 losses
        pnls = [100, 150, 200, -50, -30]
        
        for i, pnl in enumerate(pnls):
            pos = service.create_position(user_id=test_user.id, ticker=f"T{i}")
            pos.closed_at = datetime(2024, 1, i + 1)
            pos.total_realized_pnl = pnl
            pos.status = PositionStatus.CLOSED
            test_db.add(pos)
        
        test_db.commit()
        
        metrics = get_advanced_performance_metrics(test_db, test_user.id)
        
        assert 'consecutive_wins' in metrics
        assert 'consecutive_losses' in metrics
        assert 'max_consecutive_wins' in metrics
        assert 'max_consecutive_losses' in metrics
        
        assert metrics['consecutive_losses'] == 2  # Currently on losing streak
        assert metrics['max_consecutive_wins'] == 3  # Best was 3 wins


class TestEquityCurve:
    """Test equity curve generation"""
    
    def test_equity_curve_generation(self, test_db, test_user):
        """Test equity curve is generated correctly"""
        service = PositionService(test_db)
        
        # Create positions on different days
        pos1 = service.create_position(user_id=test_user.id, ticker="T1")
        pos1.closed_at = datetime(2024, 1, 1)
        pos1.total_realized_pnl = 100.0
        pos1.status = PositionStatus.CLOSED
        test_db.add(pos1)
        
        pos2 = service.create_position(user_id=test_user.id, ticker="T2")
        pos2.closed_at = datetime(2024, 1, 2)
        pos2.total_realized_pnl = 50.0
        pos2.status = PositionStatus.CLOSED
        test_db.add(pos2)
        
        pos3 = service.create_position(user_id=test_user.id, ticker="T3")
        pos3.closed_at = datetime(2024, 1, 3)
        pos3.total_realized_pnl = -30.0
        pos3.status = PositionStatus.CLOSED
        test_db.add(pos3)
        
        test_db.commit()
        
        metrics = get_advanced_performance_metrics(test_db, test_user.id)
        
        assert 'equity_curve' in metrics
        assert len(metrics['equity_curve']) == 3
        
        # Check equity values are cumulative
        assert metrics['equity_curve'][0]['equity'] == 10100.0
        assert metrics['equity_curve'][1]['equity'] == 10150.0  # 100 + 50
        assert metrics['equity_curve'][2]['equity'] == 10120.0  # 150 - 30
    
    def test_equity_curve_with_same_day_trades(self, test_db, test_user):
        """Test equity curve groups trades on same day"""
        service = PositionService(test_db)
        
        # Multiple trades on same day
        same_day = datetime(2024, 1, 1)
        
        pos1 = service.create_position(user_id=test_user.id, ticker="T1")
        pos1.closed_at = same_day
        pos1.total_realized_pnl = 100.0
        pos1.status = PositionStatus.CLOSED
        test_db.add(pos1)
        
        pos2 = service.create_position(user_id=test_user.id, ticker="T2")
        pos2.closed_at = same_day
        pos2.total_realized_pnl = 50.0
        pos2.status = PositionStatus.CLOSED
        test_db.add(pos2)
        
        test_db.commit()
        
        metrics = get_advanced_performance_metrics(test_db, test_user.id)
        
        # Should combine both trades into single day
        assert len(metrics['equity_curve']) == 1
        assert metrics['equity_curve'][0]['equity'] == 10150.0  # 100 + 50


class TestRecoveryAndRiskMetrics:
    """Test recovery factor and other risk metrics"""
    
    def test_recovery_factor(self, test_db, test_user):
        """Test recovery factor calculation"""
        service = PositionService(test_db)
        
        # Create drawdown scenario
        pos1 = service.create_position(user_id=test_user.id, ticker="T1")
        pos1.closed_at = datetime(2024, 1, 1)
        pos1.total_realized_pnl = 1000.0
        pos1.status = PositionStatus.CLOSED
        test_db.add(pos1)
        
        pos2 = service.create_position(user_id=test_user.id, ticker="T2")
        pos2.closed_at = datetime(2024, 1, 2)
        pos2.total_realized_pnl = -600.0  # Drawdown
        pos2.status = PositionStatus.CLOSED
        test_db.add(pos2)
        
        pos3 = service.create_position(user_id=test_user.id, ticker="T3")
        pos3.closed_at = datetime(2024, 1, 3)
        pos3.total_realized_pnl = 800.0  # Recovery
        pos3.status = PositionStatus.CLOSED
        test_db.add(pos3)
        
        test_db.commit()
        
        metrics = get_advanced_performance_metrics(test_db, test_user.id)
        
        # Total P&L = 1200, Max DD = 600
        # Recovery Factor = 1200 / 600 = 2.0
        assert 'recovery_factor' in metrics
        assert metrics['recovery_factor'] == pytest.approx(2.0, rel=0.1)
    
    def test_calmar_ratio(self, test_db, test_user):
        """Test Calmar ratio (annualized return / max drawdown)"""
        service = PositionService(test_db)
        
        # Create positions over time with drawdown
        for i in range(12):
            pos = service.create_position(user_id=test_user.id, ticker=f"T{i}")
            pos.closed_at = datetime(2024, 1, i + 1)
            # Alternating pattern with net positive
            pos.total_realized_pnl = 200.0 if i % 2 == 0 else -100.0
            pos.status = PositionStatus.CLOSED
            test_db.add(pos)
        
        test_db.commit()
        
        metrics = get_advanced_performance_metrics(test_db, test_user.id)
        
        assert 'calmar_ratio' in metrics
        # Calmar should be a number (or None if infinite)
        assert metrics['calmar_ratio'] is None or isinstance(metrics['calmar_ratio'], (int, float))
