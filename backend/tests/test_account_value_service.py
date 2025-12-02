import pytest
from datetime import datetime, timedelta, UTC

from app.services.account_value_service import AccountValueService
from app.models.position_models import User, TradingPosition, AccountTransaction, PositionStatus


# Helper to avoid repeating utcnow() deprecation warnings
def now():
    return datetime.now(UTC)


def test_account_value_starting_balance_only(test_db):
    user = User(username="u", email="u@x.com", hashed_password="x", initial_account_balance=10000.0)
    test_db.add(user)
    test_db.commit()

    service = AccountValueService(test_db)
    assert service.get_current_account_value(user.id) == 10000.0


def test_account_value_with_realized_pnl(test_db):
    user = User(username="u", email="u@x.com", hashed_password="x", initial_account_balance=10000.0)
    test_db.add(user)
    test_db.commit()

    pos = TradingPosition(
        user_id=user.id,
        ticker="AAPL",
        total_realized_pnl=500.0,
        status=PositionStatus.CLOSED,
        opened_at=now() - timedelta(days=5),   # REQUIRED
        closed_at=now(),
    )
    test_db.add(pos)
    test_db.commit()

    service = AccountValueService(test_db)
    assert service.get_current_account_value(user.id) == 10500.0


def test_account_value_with_deposits(test_db):
    user = User(username="u", email="u@x.com", hashed_password="x", initial_account_balance=10000.0)
    test_db.add(user)
    test_db.commit()

    test_db.add(AccountTransaction(
        user_id=user.id,
        transaction_type="DEPOSIT",
        amount=5000.0,
        transaction_date=now(),
    ))
    test_db.commit()

    service = AccountValueService(test_db)
    assert service.get_current_account_value(user.id) == 15000.0


def test_account_value_with_withdrawals(test_db):
    user = User(username="u", email="u@x.com", hashed_password="x", initial_account_balance=10000.0)
    test_db.add(user)
    test_db.commit()

    test_db.add(AccountTransaction(
        user_id=user.id,
        transaction_type="WITHDRAWAL",
        amount=2000.0,
        transaction_date=now(),
    ))
    test_db.commit()

    service = AccountValueService(test_db)
    assert service.get_current_account_value(user.id) == 8000.0


def test_account_value_complete_formula(test_db):
    user = User(username="u", email="u@x.com", hashed_password="x", initial_account_balance=10000.0)
    test_db.add(user)
    test_db.commit()

    test_db.add(TradingPosition(
        user_id=user.id,
        ticker="AAPL",
        total_realized_pnl=1500.0,
        status=PositionStatus.CLOSED,
        opened_at=now() - timedelta(days=10),
        closed_at=now(),
    ))
    test_db.add(AccountTransaction(user_id=user.id, transaction_type="DEPOSIT", amount=5000.0, transaction_date=now()))
    test_db.add(AccountTransaction(user_id=user.id, transaction_type="WITHDRAWAL", amount=2000.0, transaction_date=now()))
    test_db.commit()

    service = AccountValueService(test_db)
    assert service.get_current_account_value(user.id) == 14500.0


def test_account_value_at_historical_date(test_db):
    user = User(username="u", email="u@x.com", hashed_password="x", initial_account_balance=10000.0)
    test_db.add(user)
    test_db.commit()

    past = now() - timedelta(days=30)
    recent = now() - timedelta(days=5)

    test_db.add(TradingPosition(
        user_id=user.id,
        ticker="AAPL",
        total_realized_pnl=500.0,
        status=PositionStatus.CLOSED,
        opened_at=past - timedelta(days=1),
        closed_at=past,
    ))
    test_db.add(TradingPosition(
        user_id=user.id,
        ticker="MSFT",
        total_realized_pnl=300.0,
        status=PositionStatus.CLOSED,
        opened_at=recent - timedelta(days=1),
        closed_at=recent,
    ))
    test_db.commit()

    service = AccountValueService(test_db)
    assert service.get_account_value_at_date(user.id, past + timedelta(days=1)) == 10500.0
    assert service.get_current_account_value(user.id) == 10800.0


def test_breakdown_shows_all_components(test_db):
    user = User(username="u", email="u@x.com", hashed_password="x", initial_account_balance=10000.0)
    test_db.add(user)
    test_db.commit()

    service = AccountValueService(test_db)
    breakdown = service.get_account_value_breakdown(user.id)

    expected = {
        "starting_balance", "realized_pnl", "total_deposits",
        "total_withdrawals", "net_cash_flow", "current_value"
    }
    assert expected.issubset(breakdown.keys())
    assert breakdown["starting_balance"] == 10000.0
    assert breakdown["current_value"] == 10000.0


def test_equity_curve_generation(test_db):
    user = User(username="u", email="u@x.com", hashed_password="x", initial_account_balance=10000.0)
    test_db.add(user)
    test_db.commit()

    test_db.add(TradingPosition(
        user_id=user.id,
        ticker="AAPL",
        total_realized_pnl=500.0,
        status=PositionStatus.CLOSED,
        opened_at=now() - timedelta(days=15),
        closed_at=now() - timedelta(days=10),
    ))
    test_db.commit()

    service = AccountValueService(test_db)
    curve = service.get_equity_curve(user.id)

    assert len(curve) >= 2
    assert any(p["value"] == 10500.0 for p in curve)