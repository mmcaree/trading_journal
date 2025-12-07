from fastapi import APIRouter, Depends
from typing import Optional, List
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.models.schemas import PerformanceMetrics, SetupPerformance
from app.services.analytics_service import get_performance_metrics, get_setup_performance, get_pnl_calendar_data, get_day_event_details
from app.models import User
from app.utils.exceptions import NotFoundException, AppException
from app.services.analytics_service import get_advanced_performance_metrics, get_account_growth_metrics
from pydantic import BaseModel

router = APIRouter(tags=["analytics"])

class DayEventDetail(BaseModel):
    event_id: int
    position_id: int
    ticker: str
    event_type: str
    event_date: str
    shares: int
    price: float
    realized_pnl: float
    notes: Optional[str] = None
    strategy: Optional[str] = None
    setup_type: Optional[str] = None


class DailyPnLEntry(BaseModel):
    date: str
    net_pnl: float
    trades_count: int
    event_ids: List[int]
    position_ids: List[int]
    tickers: List[str]


class CalendarSummary(BaseModel):
    total_pnl: float
    trading_days: int
    winning_days: int
    losing_days: int
    win_rate: float
    best_day: Optional[dict] = None
    worst_day: Optional[dict] = None
    avg_winning_day: float
    avg_losing_day: float


class PnLCalendarResponse(BaseModel):
    daily_pnl: List[DailyPnLEntry]
    summary: CalendarSummary


@router.get("/performance", response_model=PerformanceMetrics)
def read_performance_metrics(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get overall performance metrics (v2 - uses TradingPosition)"""
    return get_performance_metrics(
        db=db,
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
    )


@router.get("/performance-debug", response_model=PerformanceMetrics)
def read_performance_metrics_debug(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Debug version without auth"""
    user = db.query(User).first()
    if not user:
        raise NotFoundException("No users found in database")
    return get_performance_metrics(db=db, user_id=user.id, start_date=start_date, end_date=end_date)


@router.get("/setups", response_model=List[SetupPerformance])
def read_setup_performance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get performance by setup type (v2)"""
    return get_setup_performance(db=db, user_id=current_user.id)


@router.get("/setups-debug", response_model=List[SetupPerformance])
def read_setup_performance_debug(db: Session = Depends(get_db)):
    """Debug version"""
    user = db.query(User).first()
    if not user:
        raise NotFoundException("No users found in database")
    return get_setup_performance(db=db, user_id=user.id)


@router.get("/advanced")
def read_advanced_analytics(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Advanced analytics: drawdown, Sharpe, monthly returns"""
    return get_advanced_performance_metrics(
        db=db,
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date,
    )

@router.get("/advanced-debug")
def read_advanced_analytics_debug(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    user = db.query(User).first()
    if not user:
        raise NotFoundException("No users found")
    return get_advanced_performance_metrics(db=db, user_id=user.id, start_date=start_date, end_date=end_date)


@router.get("/account-growth-metrics")
def read_account_growth_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get comprehensive account growth metrics (Phase 2.2)"""
    return get_account_growth_metrics(db=db, user_id=current_user.id)


@router.get("/pnl-calendar", response_model=PnLCalendarResponse)
def read_pnl_calendar(
    year: Optional[int] = None,
    month: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_pnl_calendar_data(
        db=db,
        user_id=current_user.id,
        year=year,
        month=month,
        start_date=start_date,
        end_date=end_date
    )


@router.get("/pnl-calendar/day/{event_date}", response_model=List[DayEventDetail])
def read_day_event_details(
    event_date: str,
    event_ids: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    parsed_event_ids = None
    if event_ids:
        try:
            parsed_event_ids = [int(id.strip()) for id in event_ids.split(',')]
        except ValueError:
            raise AppException(
                status_code=400,
                error="invalid_event_ids",
                detail="event_ids must be comma-separated integers"
            )
    
    return get_day_event_details(
        db=db,
        user_id=current_user.id,
        event_date=event_date,
        event_ids=parsed_event_ids
    )


@router.get("/pnl-calendar-debug", response_model=PnLCalendarResponse)
def read_pnl_calendar_debug(
    year: Optional[int] = None,
    month: Optional[int] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    user = db.query(User).first()
    if not user:
        raise NotFoundException("No users found in database")
    
    return get_pnl_calendar_data(
        db=db,
        user_id=user.id,
        year=year,
        month=month,
        start_date=start_date,
        end_date=end_date
    )


# Legacy endpoints — permanently removed
@router.get("/partial-exits-summary")
@router.get("/partial-exits-detail")
@router.get("/weekly-stats")
@router.post("/send-weekly-email")
def legacy_endpoint_removed():
    raise AppException(
        status_code=410,
        error="gone",
        detail="This endpoint has been removed. Functionality moved to v2 position system."
    )