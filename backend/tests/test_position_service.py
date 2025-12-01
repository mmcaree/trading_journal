"""
Comprehensive unit tests for PositionService
Tests all core business logic including FIFO cost basis, position lifecycle, and event management
"""
import pytest
from datetime import datetime, timedelta
from decimal import Decimal

from app.services.position_service import PositionService
from app.models.position_models import (
    TradingPosition, 
    TradingPositionEvent, 
    PositionStatus, 
    EventType,
    EventSource
)
from app.utils.datetime_utils import utc_now


class TestPositionCreation:
    """Test position creation methods"""
    
    def test_create_position_basic(self, db_session, test_user):
        """Test basic position creation"""
        service = PositionService(db_session)
        
        position = service.create_position(
            user_id=test_user.id,
            ticker="AAPL",
            strategy="Swing Trade",
            setup_type="Breakout"
        )
        
        assert position.id is not None
        assert position.ticker == "AAPL"
        assert position.strategy == "Swing Trade"
        assert position.setup_type == "Breakout"
        assert position.status == PositionStatus.OPEN
        assert position.current_shares == 0
        assert position.user_id == test_user.id
    
    def test_create_position_uppercase_ticker(self, db_session, test_user):
        """Test ticker is automatically uppercased"""
        service = PositionService(db_session)
        
        position = service.create_position(
            user_id=test_user.id,
            ticker="aapl"
        )
        
        assert position.ticker == "AAPL"
    
    def test_get_or_create_position_creates_new(self, db_session, test_user):
        """Test get_or_create creates new position when none exists"""
        service = PositionService(db_session)
        
        position = service.get_or_create_position(
            user_id=test_user.id,
            ticker="TSLA",
            strategy="Day Trade"
        )
        
        assert position.id is not None
        assert position.ticker == "TSLA"
        assert position.status == PositionStatus.OPEN
    
    def test_get_or_create_position_returns_existing(self, db_session, test_user):
        """Test get_or_create returns existing open position"""
        service = PositionService(db_session)
        
        # Create first position
        position1 = service.create_position(
            user_id=test_user.id,
            ticker="NVDA"
        )
        db_session.commit()
        
        # Try to create another - should return existing
        position2 = service.get_or_create_position(
            user_id=test_user.id,
            ticker="NVDA"
        )
        
        assert position1.id == position2.id


class TestBuyEvents:
    """Test adding shares via buy events"""
    
    def test_add_shares_first_buy(self, db_session, test_user):
        """Test first buy event creates position correctly"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        event = service.add_shares(
            position_id=position.id,
            shares=100,
            price=150.0,
            stop_loss=145.0,
            notes="Initial entry"
        )
        
        db_session.refresh(position)
        
        assert event.event_type == EventType.BUY
        assert event.shares == 100
        assert event.price == 150.0
        assert event.stop_loss == 145.0
        assert event.position_shares_before == 0
        assert event.position_shares_after == 100
        
        assert position.current_shares == 100
        assert position.avg_entry_price == 150.0
        assert position.total_cost == 15000.0
        assert position.current_stop_loss == 145.0
    
    def test_add_shares_second_buy_averages_cost(self, db_session, test_user):
        """Test second buy event averages cost basis correctly"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        # First buy: 100 shares at $150
        service.add_shares(position_id=position.id, shares=100, price=150.0)
        
        # Second buy: 50 shares at $160
        service.add_shares(position_id=position.id, shares=50, price=160.0)
        
        db_session.refresh(position)
        
        # Total: 150 shares at average of $153.33
        assert position.current_shares == 150
        assert abs(position.avg_entry_price - 153.333333) < 0.001
        assert position.total_cost == 23000.0  # (100*150) + (50*160)
    
    def test_add_shares_validation_negative_shares(self, db_session, test_user):
        """Test validation rejects negative shares"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        with pytest.raises(ValueError, match="Shares must be positive"):
            service.add_shares(position_id=position.id, shares=-10, price=150.0)
    
    def test_add_shares_with_custom_date(self, db_session, test_user):
        """Test adding shares with custom event date"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        custom_date = datetime(2024, 1, 15, 10, 30, 0)
        event = service.add_shares(
            position_id=position.id,
            shares=100,
            price=150.0,
            event_date=custom_date
        )
        
        assert event.event_date == custom_date
    
    def test_add_shares_with_source_tracking(self, db_session, test_user):
        """Test event source tracking"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        event = service.add_shares(
            position_id=position.id,
            shares=100,
            price=150.0,
            source=EventSource.IMPORT,
            source_id="webull_12345"
        )
        
        assert event.source == EventSource.IMPORT
        assert event.source_id == "webull_12345"


class TestSellEvents:
    """Test selling shares and P&L calculations"""
    
    def test_sell_shares_basic(self, db_session, test_user):
        """Test basic sell event"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        # Buy 100 shares at $150
        service.add_shares(position_id=position.id, shares=100, price=150.0)
        
        # Sell 50 shares at $160
        sell_event = service.sell_shares(position_id=position.id, shares=50, price=160.0)
        
        db_session.refresh(position)
        
        assert sell_event.event_type == EventType.SELL
        assert sell_event.shares == -50
        assert sell_event.price == 160.0
        assert sell_event.realized_pnl == 500.0  # (160 - 150) * 50
        
        assert position.current_shares == 50
        assert position.total_realized_pnl == 500.0
    
    def test_sell_shares_fifo_cost_basis(self, db_session, test_user):
        """Test FIFO cost basis calculation"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        # First buy: 100 shares at $150
        service.add_shares(position_id=position.id, shares=100, price=150.0)
        
        # Second buy: 100 shares at $160
        service.add_shares(position_id=position.id, shares=100, price=160.0)
        
        # Sell 150 shares at $170 - should use FIFO (100@150 + 50@160)
        sell_event = service.sell_shares(position_id=position.id, shares=150, price=170.0)
        
        db_session.refresh(position)
        
        # Expected P&L: (170-150)*100 + (170-160)*50 = 2000 + 500 = 2500
        assert sell_event.realized_pnl == 2500.0
        assert position.current_shares == 50
        assert position.total_realized_pnl == 2500.0
        assert abs(position.avg_entry_price - 160.0) < 0.001  # Remaining 50 shares at $160
    
    def test_sell_shares_complete_close(self, db_session, test_user):
        """Test selling all shares closes position"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        # Buy 100 shares at $150
        service.add_shares(position_id=position.id, shares=100, price=150.0)
        
        # Sell all 100 shares at $160
        service.sell_shares(position_id=position.id, shares=100, price=160.0)
        
        db_session.refresh(position)
        
        assert position.current_shares == 0
        assert position.status == PositionStatus.CLOSED
        assert position.closed_at is not None
        assert position.total_realized_pnl == 1000.0  # (160-150)*100
    
    def test_sell_shares_validation_exceeds_holdings(self, db_session, test_user):
        """Test validation prevents overselling"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        # Buy 100 shares
        service.add_shares(position_id=position.id, shares=100, price=150.0)
        
        # Try to sell 150 shares - should fail
        with pytest.raises(ValueError, match="Cannot sell 150 shares"):
            service.sell_shares(position_id=position.id, shares=150, price=160.0)
    
    def test_sell_shares_validation_negative_shares(self, db_session, test_user):
        """Test validation rejects negative shares"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        service.add_shares(position_id=position.id, shares=100, price=150.0)
        
        with pytest.raises(ValueError, match="Shares must be positive"):
            service.sell_shares(position_id=position.id, shares=-10, price=160.0)
    
    def test_sell_shares_partial_multiple_sells(self, db_session, test_user):
        """Test multiple partial sells with FIFO"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        # Buy 100 shares at $150
        service.add_shares(position_id=position.id, shares=100, price=150.0)
        
        # Sell 30 shares at $155
        sell1 = service.sell_shares(position_id=position.id, shares=30, price=155.0)
        
        # Sell 40 shares at $160
        sell2 = service.sell_shares(position_id=position.id, shares=40, price=160.0)
        
        db_session.refresh(position)
        
        assert sell1.realized_pnl == 150.0  # (155-150)*30
        assert sell2.realized_pnl == 400.0  # (160-150)*40
        assert position.current_shares == 30
        assert position.total_realized_pnl == 550.0


class TestEventManagement:
    """Test event update and deletion"""
    
    def test_update_event_basic_fields(self, db_session, test_user):
        """Test updating event stop loss and notes"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        event = service.add_shares(
            position_id=position.id,
            shares=100,
            price=150.0,
            stop_loss=145.0,
            notes="Initial"
        )
        
        # Update event
        updated = service.update_event(
            event_id=event.id,
            stop_loss=148.0,
            notes="Updated stop loss"
        )
        
        assert updated.stop_loss == 148.0
        assert updated.notes == "Updated stop loss"
    
    def test_update_event_comprehensive(self, db_session, test_user):
        """Test comprehensive event update with recalculation"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        event = service.add_shares(position_id=position.id, shares=100, price=150.0)
        
        # Update shares and price - should trigger recalculation
        updated = service.update_event_comprehensive(
            event_id=event.id,
            shares=150,
            price=155.0,
            notes="Corrected quantity"
        )
        
        db_session.refresh(position)
        
        assert updated.shares == 150
        assert updated.price == 155.0
        assert position.current_shares == 150
        assert position.avg_entry_price == 155.0
        assert position.total_cost == 23250.0  # 150 * 155
    
    def test_update_event_validation_negative_shares(self, db_session, test_user):
        """Test validation prevents negative shares in update"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        event = service.add_shares(position_id=position.id, shares=100, price=150.0)
        
        with pytest.raises(ValueError, match="Shares must be positive"):
            service.update_event_comprehensive(event_id=event.id, shares=-10)
    
    def test_update_event_validation_negative_price(self, db_session, test_user):
        """Test validation prevents negative price in update"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        event = service.add_shares(position_id=position.id, shares=100, price=150.0)
        
        with pytest.raises(ValueError, match="Price must be positive"):
            service.update_event_comprehensive(event_id=event.id, price=-150.0)
    
    def test_delete_event(self, db_session, test_user):
        """Test event deletion and recalculation"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        # Add two buy events
        event1 = service.add_shares(position_id=position.id, shares=100, price=150.0)
        event2 = service.add_shares(position_id=position.id, shares=50, price=160.0)
        
        db_session.refresh(position)
        assert position.current_shares == 150
        
        # Delete second event
        service.delete_event(event_id=event2.id)
        
        db_session.refresh(position)
        
        assert position.current_shares == 100
        assert position.avg_entry_price == 150.0
        assert position.total_cost == 15000.0
    
    def test_delete_event_validation_last_event(self, db_session, test_user):
        """Test cannot delete the only event in a position"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        event = service.add_shares(position_id=position.id, shares=100, price=150.0)
        
        with pytest.raises(ValueError, match="Cannot delete the only event"):
            service.delete_event(event_id=event.id)


class TestPositionDeletion:
    """Test position deletion with cascade"""
    
    def test_delete_position_with_events(self, db_session, test_user):
        """Test deleting position removes all events"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        # Add events
        service.add_shares(position_id=position.id, shares=100, price=150.0)
        service.add_shares(position_id=position.id, shares=50, price=160.0)
        
        position_id = position.id
        
        # Delete position
        result = service.delete_position(position_id=position_id)
        
        assert result is True
        
        # Verify position is gone
        deleted_position = db_session.query(TradingPosition).get(position_id)
        assert deleted_position is None
        
        # Verify events are gone
        events = db_session.query(TradingPositionEvent).filter_by(position_id=position_id).all()
        assert len(events) == 0
    
    def test_delete_nonexistent_position(self, db_session, test_user):
        """Test deleting non-existent position raises error"""
        service = PositionService(db_session)
        
        with pytest.raises(ValueError, match="Position 99999 not found"):
            service.delete_position(position_id=99999)


class TestPositionQueries:
    """Test position query methods"""
    
    def test_get_position_basic(self, db_session, test_user):
        """Test basic position retrieval"""
        service = PositionService(db_session)
        
        created = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        retrieved = service.get_position(position_id=created.id)
        
        assert retrieved is not None
        assert retrieved.id == created.id
        assert retrieved.ticker == "AAPL"
    
    def test_get_position_with_events(self, db_session, test_user):
        """Test position retrieval with eager-loaded events"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        service.add_shares(position_id=position.id, shares=100, price=150.0)
        service.add_shares(position_id=position.id, shares=50, price=160.0)
        
        retrieved = service.get_position(position_id=position.id, include_events=True)
        
        assert retrieved is not None
        assert len(retrieved.events) == 2
    
    def test_get_user_positions(self, db_session, test_user):
        """Test getting all positions for a user"""
        service = PositionService(db_session)
        
        # Create multiple positions
        service.create_position(user_id=test_user.id, ticker="AAPL")
        service.create_position(user_id=test_user.id, ticker="TSLA")
        service.create_position(user_id=test_user.id, ticker="NVDA")
        db_session.commit()
        
        positions = service.get_user_positions(user_id=test_user.id)
        
        assert len(positions) == 3
        tickers = [p.ticker for p in positions]
        assert "AAPL" in tickers
        assert "TSLA" in tickers
        assert "NVDA" in tickers
    
    def test_get_user_positions_filter_by_status(self, db_session, test_user):
        """Test filtering positions by status"""
        service = PositionService(db_session)
        
        # Create and close one position
        pos1 = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        service.add_shares(position_id=pos1.id, shares=100, price=150.0)
        service.sell_shares(position_id=pos1.id, shares=100, price=160.0)
        
        # Create open position
        service.create_position(user_id=test_user.id, ticker="TSLA")
        db_session.commit()
        
        open_positions = service.get_user_positions(user_id=test_user.id, status=PositionStatus.OPEN)
        closed_positions = service.get_user_positions(user_id=test_user.id, status=PositionStatus.CLOSED)
        
        assert len(open_positions) == 1
        assert open_positions[0].ticker == "TSLA"
        assert len(closed_positions) == 1
        assert closed_positions[0].ticker == "AAPL"
    
    def test_get_user_positions_filter_by_ticker(self, db_session, test_user):
        """Test filtering positions by ticker"""
        service = PositionService(db_session)
        
        service.create_position(user_id=test_user.id, ticker="AAPL")
        service.create_position(user_id=test_user.id, ticker="AAPL")
        service.create_position(user_id=test_user.id, ticker="TSLA")
        db_session.commit()
        
        aapl_positions = service.get_user_positions(user_id=test_user.id, ticker="AAPL")
        
        assert len(aapl_positions) == 2
        assert all(p.ticker == "AAPL" for p in aapl_positions)
    
    def test_get_position_events(self, db_session, test_user):
        """Test getting all events for a position"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        service.add_shares(position_id=position.id, shares=100, price=150.0)
        service.add_shares(position_id=position.id, shares=50, price=160.0)
        service.sell_shares(position_id=position.id, shares=75, price=165.0)
        
        events = service.get_position_events(position_id=position.id)
        
        assert len(events) == 3
        assert events[0].event_type == EventType.BUY
        assert events[1].event_type == EventType.BUY
        assert events[2].event_type == EventType.SELL
    
    def test_get_position_summary(self, db_session, test_user):
        """Test getting comprehensive position summary"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        service.add_shares(position_id=position.id, shares=100, price=150.0)
        service.add_shares(position_id=position.id, shares=50, price=160.0)
        service.sell_shares(position_id=position.id, shares=75, price=165.0)
        
        summary = service.get_position_summary(position_id=position.id)
        
        assert summary['position'].id == position.id
        assert len(summary['events']) == 3
        assert summary['metrics']['total_bought'] == 150
        assert summary['metrics']['total_sold'] == 75
        assert summary['metrics']['total_events'] == 3


class TestPositionMetadata:
    """Test updating position metadata"""
    
    def test_update_position_metadata(self, db_session, test_user):
        """Test updating position non-financial fields"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        updated = service.update_position_metadata(
            position_id=position.id,
            strategy="Swing Trade",
            setup_type="Breakout",
            notes="Testing breakout above resistance",
            lessons="Should have taken profit earlier"
        )
        
        assert updated.strategy == "Swing Trade"
        assert updated.setup_type == "Breakout"
        assert updated.notes == "Testing breakout above resistance"
        assert updated.lessons == "Should have taken profit earlier"
    
    def test_update_position_metadata_partial(self, db_session, test_user):
        """Test partial metadata update"""
        service = PositionService(db_session)
        
        position = service.create_position(
            user_id=test_user.id,
            ticker="AAPL",
            strategy="Initial"
        )
        db_session.commit()
        
        # Update only notes
        updated = service.update_position_metadata(
            position_id=position.id,
            notes="Added notes"
        )
        
        assert updated.strategy == "Initial"  # Unchanged
        assert updated.notes == "Added notes"


class TestComplexPositionScenarios:
    """Test complex multi-event scenarios"""
    
    def test_scale_in_and_out_scenario(self, db_session, test_user):
        """Test realistic scale-in and scale-out trading"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        # Scale in: 3 buys
        service.add_shares(position_id=position.id, shares=50, price=150.0)
        service.add_shares(position_id=position.id, shares=50, price=152.0)
        service.add_shares(position_id=position.id, shares=50, price=155.0)
        
        db_session.refresh(position)
        assert position.current_shares == 150
        assert abs(position.avg_entry_price - 152.333333) < 0.001
        
        # Scale out: 3 sells
        service.sell_shares(position_id=position.id, shares=50, price=160.0)
        service.sell_shares(position_id=position.id, shares=50, price=165.0)
        service.sell_shares(position_id=position.id, shares=50, price=170.0)
        
        db_session.refresh(position)
        assert position.current_shares == 0
        assert position.status == PositionStatus.CLOSED
        
        # Calculate expected P&L with FIFO:
        # First 50 out at 160: (160-150)*50 = 500
        # Next 50 out at 165: (165-152)*50 = 650
        # Last 50 out at 170: (170-155)*50 = 750
        # Total: 1900
        assert abs(position.total_realized_pnl - 1900.0) < 0.01
    
    def test_partial_position_multiple_cycles(self, db_session, test_user):
        """Test opening, partially closing, and re-adding to position"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="TSLA")
        db_session.commit()
        
        # Cycle 1: Buy and partial sell
        service.add_shares(position_id=position.id, shares=100, price=200.0)
        service.sell_shares(position_id=position.id, shares=60, price=210.0)
        
        db_session.refresh(position)
        assert position.current_shares == 40
        assert position.total_realized_pnl == 600.0  # (210-200)*60
        
        # Cycle 2: Add more shares
        service.add_shares(position_id=position.id, shares=80, price=205.0)
        
        db_session.refresh(position)
        assert position.current_shares == 120
        
        # Remaining 40 @ 200 + new 80 @ 205 = avg of 203.33
        expected_avg = (40 * 200 + 80 * 205) / 120
        assert abs(position.avg_entry_price - expected_avg) < 0.01
    
    def test_loss_making_position(self, db_session, test_user):
        """Test position with realized losses"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="NVDA")
        db_session.commit()
        
        # Buy at high price
        service.add_shares(position_id=position.id, shares=100, price=500.0)
        
        # Sell at loss
        service.sell_shares(position_id=position.id, shares=100, price=450.0)
        
        db_session.refresh(position)
        
        assert position.total_realized_pnl == -5000.0  # (450-500)*100
        assert position.status == PositionStatus.CLOSED
    
    def test_reopening_closed_position(self, db_session, test_user):
        """Test that buying after closing reopens position"""
        service = PositionService(db_session)
        
        position = service.create_position(user_id=test_user.id, ticker="AAPL")
        db_session.commit()
        
        # Open and close position
        service.add_shares(position_id=position.id, shares=100, price=150.0)
        service.sell_shares(position_id=position.id, shares=100, price=160.0)
        
        db_session.refresh(position)
        assert position.status == PositionStatus.CLOSED
        
        # Buy again - should reopen
        service.add_shares(position_id=position.id, shares=50, price=165.0)
        
        db_session.refresh(position)
        assert position.status == PositionStatus.OPEN
        assert position.current_shares == 50
        assert position.closed_at is None
