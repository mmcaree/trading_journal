#!/usr/bin/env python3
"""
Position API Routes - Clean API for new position-based architecture
Uses PositionService for core business logic
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional, Dict, Any
import json
from sqlalchemy.orm import Session, joinedload
from datetime import datetime

from app.api.deps import get_db, get_current_user
from app.models import User
from app.models.position_models import TradingPosition, TradingPositionEvent, PositionStatus, EventType, ImportedPendingOrder, TradingPositionJournalEntry, JournalEntryType
from app.services.position_service import PositionService
from pydantic import BaseModel
from app.utils.exceptions import (
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    InternalServerException,
    ValidationException
)


# === Pydantic Schemas ===

class EventCreate(BaseModel):
    event_type: str  # 'buy' or 'sell'
    shares: int
    price: float
    event_date: Optional[datetime] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    notes: Optional[str] = None

class EventUpdate(BaseModel):
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    notes: Optional[str] = None

class EventUpdateComprehensive(BaseModel):
    shares: Optional[int] = None
    price: Optional[float] = None
    event_date: Optional[datetime] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    notes: Optional[str] = None

class PositionCreate(BaseModel):
    ticker: str
    strategy: Optional[str] = None
    setup_type: Optional[str] = None
    timeframe: Optional[str] = None
    initial_event: EventCreate
    notes: Optional[str] = None
    account_balance_at_entry: Optional[float] = None  # Account balance when position is created

class PositionUpdate(BaseModel):
    strategy: Optional[str] = None
    setup_type: Optional[str] = None
    timeframe: Optional[str] = None
    notes: Optional[str] = None
    lessons: Optional[str] = None
    mistakes: Optional[str] = None

class JournalEntryCreate(BaseModel):
    entry_type: str  # 'note', 'lesson', 'mistake', 'analysis'
    content: str
    entry_date: Optional[datetime] = None  # Defaults to now if not provided
    attached_images: Optional[List[Dict[str, str]]] = None  # [{"url": "...", "description": "..."}, ...]
    attached_charts: Optional[List[int]] = None  # [chart_id1, chart_id2, ...]

class JournalEntryUpdate(BaseModel):
    entry_type: Optional[str] = None
    content: Optional[str] = None
    entry_date: Optional[datetime] = None
    attached_images: Optional[List[Dict[str, str]]] = None
    attached_charts: Optional[List[int]] = None

class JournalEntryResponse(BaseModel):
    id: int
    entry_type: str
    content: str
    entry_date: datetime
    created_at: datetime
    updated_at: datetime
    attached_images: Optional[List[Dict[str, str]]] = None
    attached_charts: Optional[List[int]] = None
    
    class Config:
        from_attributes = True

class PositionResponse(BaseModel):
    id: int
    ticker: str
    strategy: Optional[str]
    setup_type: Optional[str]
    timeframe: Optional[str]
    status: str
    current_shares: int
    avg_entry_price: Optional[float]
    total_cost: float
    total_realized_pnl: float
    current_stop_loss: Optional[float]
    current_take_profit: Optional[float]
    opened_at: datetime
    closed_at: Optional[datetime]
    notes: Optional[str]
    lessons: Optional[str]
    mistakes: Optional[str]
    events_count: int
    return_percent: Optional[float]  # Return percentage for closed positions
    original_risk_percent: Optional[float]  # Original risk % when opened
    current_risk_percent: Optional[float]   # Current risk % based on current stop
    original_shares: Optional[int]          # Shares when position opened
    account_value_at_entry: Optional[float] # Account value when opened
    events: Optional[List['EventResponse']] = None  # Optional events for analytics
    tags: List[Dict[str, Any]] = []

class EventResponse(BaseModel):
    id: int
    event_type: str
    event_date: datetime
    shares: int
    price: float
    stop_loss: Optional[float]
    take_profit: Optional[float]
    notes: Optional[str]
    source: str
    realized_pnl: Optional[float]
    position_shares_before: Optional[int]
    position_shares_after: Optional[int]

class PositionSummaryResponse(BaseModel):
    position: PositionResponse
    events: List[EventResponse]
    metrics: Dict[str, Any]

class PendingOrderResponse(BaseModel):
    id: int
    symbol: str
    side: str  # Buy/Sell
    status: str  # pending/cancelled/etc
    shares: int
    price: Optional[float]
    order_type: Optional[str]
    placed_time: datetime
    stop_loss: Optional[float]
    take_profit: Optional[float]
    notes: Optional[str]


# === Router ===

router = APIRouter(prefix="/positions", tags=["positions-v2"])


# === Universal Import System - Broker Information ===
# NOTE: These routes MUST come before /{position_id} routes to avoid path conflicts

from app.services.universal_import_service import UniversalImportService
from app.services.broker_profiles import list_all_brokers, generate_csv_template, get_broker_profile
from app.models.schemas import BrokerListResponse, BrokerInfo, ImportValidationResponse
from fastapi.responses import PlainTextResponse

@router.get("/brokers", response_model=BrokerListResponse)
async def get_supported_brokers():
    """Get list of all supported broker formats"""
    brokers = list_all_brokers()
    return BrokerListResponse(
        brokers=[BrokerInfo(**broker) for broker in brokers]
    )


@router.get("/brokers/{broker_name}/template", response_class=PlainTextResponse)
async def download_broker_template(broker_name: str):
    """Download CSV template for a specific broker format"""
    broker_profile = get_broker_profile(broker_name)
    if not broker_profile:
        raise NotFoundException(f"Broker '{broker_name}' not found")
    
    template_content = generate_csv_template(broker_profile)
    
    return PlainTextResponse(
        content=template_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{broker_name}_template.csv"'
        }
    )


# === Position Management ===

@router.post("/", response_model=PositionResponse, status_code=201)
def create_position(
    position_data: PositionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new position with initial buy event"""
    position_service = PositionService(db)

    if not position_data.ticker or not position_data.ticker.strip():
        raise ValidationException("Ticker is required and cannot be empty")
    
    initial_event = position_data.initial_event
    if initial_event.shares <= 0:
        raise ValidationException("Shares must be greater than 0")
    if initial_event.price <= 0:
        raise ValidationException("Price must be greater than 0")
    if initial_event.event_type.lower() != "buy":
        raise ValidationException("Initial event must be a 'buy'")
    
    try:
        # Create position
        position = position_service.create_position(
            user_id=current_user.id,
            ticker=position_data.ticker,
            strategy=position_data.strategy,
            setup_type=position_data.setup_type,
            timeframe=position_data.timeframe,
            notes=position_data.notes,
            account_value_at_entry=position_data.account_balance_at_entry
        )
        
        # Add initial event
        position_service.add_shares(
            position_id=position.id,
            shares=initial_event.shares,
            price=initial_event.price,
            event_date=initial_event.event_date,
            stop_loss=initial_event.stop_loss,
            take_profit=initial_event.take_profit,
            notes=initial_event.notes
        )
            
            # Update position opened_at to match the initial event date
        if initial_event.event_date:
            position.opened_at = initial_event.event_date
        
        db.commit()
        
        # Return formatted response
        position = position_service.get_position(position.id)
        events_count = len(position_service.get_position_events(position.id))
        
        return PositionResponse(
            id=position.id,
            ticker=position.ticker,
            strategy=position.strategy,
            setup_type=position.setup_type,
            timeframe=position.timeframe,
            status=position.status.value,
            current_shares=position.current_shares,
            avg_entry_price=position.avg_entry_price,
            total_cost=position.total_cost,
            total_realized_pnl=position.total_realized_pnl,
            current_stop_loss=position.current_stop_loss,
            current_take_profit=position.current_take_profit,
            opened_at=position.opened_at,
            closed_at=position.closed_at,
            notes=position.notes,
            lessons=position.lessons,
            mistakes=position.mistakes,
            events_count=events_count,
            return_percent=None,  # New position, no return yet
            original_risk_percent=position.original_risk_percent,
            current_risk_percent=position.current_risk_percent,
            original_shares=position.original_shares,
            account_value_at_entry=position.account_value_at_entry
        )
        
    except ValueError as e:
        db.rollback()
        raise ValidationException(str(e))
    except AppException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise InternalServerException(f"Failed to create position: {str(e)}")

@router.get("/", response_model=List[PositionResponse])
def get_positions(
    status_filter: Optional[str] = Query(None, alias="status"),
    ticker: Optional[str] = Query(None),
    strategy: Optional[str] = Query(None),
    include_events: bool = Query(False, description="Include position events for analytics"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get user's positions with optional filtering"""
    position_service = PositionService(db)
    
    # Convert status string to enum
    # if status_filter:
    #     try:
    #         status_enum = PositionStatus(status_filter.lower())
    #     except ValueError:
    #         raise BadRequestException(f"Invalid status: {status_filter}")
    
    # # Get positions with events preloaded to avoid N+1 queries (only if requested)
    # positions = position_service.get_user_positions(
    #     user_id=current_user.id,
    #     status=status_enum,
    #     ticker=ticker,
    #     include_events=include_events
    # )

    status_enum = None
    query = db.query(TradingPosition) \
        .filter(TradingPosition.user_id == current_user.id) \
        .options(joinedload(TradingPosition.tags))  # ← THIS LINE ADDS TAGS
    
    if status_enum:
        query = query.filter(TradingPosition.status == status_enum)
    if ticker:
        query = query.filter(TradingPosition.ticker.ilike(f"%{ticker}%"))
    
    if include_events:
        query = query.options(joinedload(TradingPosition.events))
    
    positions = query.all()
    
    # Apply additional filters
    if strategy:
        positions = [p for p in positions if p.strategy == strategy]
    
    # Apply pagination
    positions = positions[skip:skip + limit]
    
    # Format responses (events already loaded)
    responses = []
    for position in positions:
        events_count = len(position.events) if hasattr(position, 'events') else 0
        
        # Calculate return percentage for closed positions
        return_percent = None
        if position.status.value == 'closed' and position.total_realized_pnl is not None:
            # Calculate original investment from buy events
            buy_events = [e for e in position.events if e.event_type.value == 'buy']
            if buy_events and position.avg_entry_price:
                total_shares_bought = sum(event.shares for event in buy_events)
                original_investment = position.avg_entry_price * total_shares_bought
                if original_investment > 0:
                    return_percent = round((position.total_realized_pnl / original_investment) * 100, 2)
        
        # Include events in response if requested
        events_list = None
        if include_events and hasattr(position, 'events'):
            events_list = [
                EventResponse(
                    id=event.id,
                    event_type=event.event_type.value,
                    event_date=event.event_date,
                    shares=event.shares,
                    price=event.price,
                    stop_loss=event.stop_loss,
                    take_profit=event.take_profit,
                    notes=event.notes,
                    source=event.source.value,
                    realized_pnl=event.realized_pnl,
                    position_shares_before=event.position_shares_before,
                    position_shares_after=event.position_shares_after
                )
                for event in position.events
            ]

        responses.append(PositionResponse(
            id=position.id,
            ticker=position.ticker,
            strategy=position.strategy,
            setup_type=position.setup_type,
            timeframe=position.timeframe,
            status=position.status.value,
            current_shares=position.current_shares,
            avg_entry_price=position.avg_entry_price,
            total_cost=position.total_cost,
            total_realized_pnl=position.total_realized_pnl,
            current_stop_loss=position.current_stop_loss,
            current_take_profit=position.current_take_profit,
            opened_at=position.opened_at,
            closed_at=position.closed_at,
            notes=position.notes,
            lessons=position.lessons,
            mistakes=position.mistakes,
            events_count=events_count,
            return_percent=return_percent,
            original_risk_percent=position.original_risk_percent,
            current_risk_percent=position.current_risk_percent,
            original_shares=position.original_shares,
            account_value_at_entry=position.account_value_at_entry,
            events=events_list
        ))
    
    return responses

@router.get("/{position_id}", response_model=PositionSummaryResponse)
def get_position_details(
    position_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed position information with event history"""
    position_service = PositionService(db)
    
    # Eager load events to avoid N+1 query
    position = position_service.get_position(position_id, include_events=True)
    if not position:
        raise NotFoundException("Position")
    
    if position.user_id != current_user.id:
        raise ForbiddenException("Not authorized to access this position")
    
    summary = position_service.get_position_summary(position_id)
    
    # Calculate return percentage for closed positions (same logic as in list endpoint)
    return_percent = None
    if position.status.value == 'closed' and position.total_realized_pnl is not None:
        # Calculate original investment from buy events
        buy_events = [e for e in position.events if e.event_type.value == 'buy']
        if buy_events and position.avg_entry_price:
            total_shares_bought = sum(event.shares for event in buy_events)
            original_investment = position.avg_entry_price * total_shares_bought
            if original_investment > 0:
                return_percent = round((position.total_realized_pnl / original_investment) * 100, 2)
    
    # Format response
    position_response = PositionResponse(
        id=position.id,
        ticker=position.ticker,
        strategy=position.strategy,
        setup_type=position.setup_type,
        timeframe=position.timeframe,
        status=position.status.value,
        current_shares=position.current_shares,
        avg_entry_price=position.avg_entry_price,
        total_cost=position.total_cost,
        total_realized_pnl=position.total_realized_pnl,
        current_stop_loss=position.current_stop_loss,
        current_take_profit=position.current_take_profit,
        opened_at=position.opened_at,
        closed_at=position.closed_at,
        notes=position.notes,
        lessons=position.lessons,
        mistakes=position.mistakes,
        events_count=len(summary['events']),
        return_percent=return_percent,
        original_risk_percent=position.original_risk_percent,
        current_risk_percent=position.current_risk_percent,
        original_shares=position.original_shares,
        account_value_at_entry=position.account_value_at_entry
    )
    
    events_response = []
    for event in summary['events']:
        events_response.append(EventResponse(
            id=event.id,
            event_type=event.event_type.value,
            event_date=event.event_date,
            shares=event.shares,
            price=event.price,
            stop_loss=event.stop_loss,
            take_profit=event.take_profit,
            notes=event.notes,
            source=event.source.value,
            realized_pnl=event.realized_pnl,
            position_shares_before=event.position_shares_before,
            position_shares_after=event.position_shares_after
        ))
    
    return PositionSummaryResponse(
        position=position_response,
        events=events_response,
        metrics=summary['metrics']
    )

@router.put("/{position_id}", response_model=PositionResponse)
def update_position(
    position_id: int,
    position_update: PositionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update position metadata"""
    position_service = PositionService(db)
    
    # Eager load events to avoid N+1 when calculating return percent
    position = position_service.get_position(position_id, include_events=True)
    if not position:
        raise NotFoundException("Position")

    if position.user_id != current_user.id:
        raise ForbiddenException("Not authorized to update this position")
    
    try:
        updated_position = position_service.update_position_metadata(
            position_id=position_id,
            **position_update.dict(exclude_unset=True)
        )
        
        events_count = len(position_service.get_position_events(position_id))
        
        # Calculate return percentage for closed positions (same logic as in other endpoints)
        return_percent = None
        if updated_position.status.value == 'closed' and updated_position.total_realized_pnl is not None:
            # Calculate original investment from buy events
            buy_events = [e for e in updated_position.events if e.event_type.value == 'buy']
            if buy_events and updated_position.avg_entry_price:
                total_shares_bought = sum(event.shares for event in buy_events)
                original_investment = updated_position.avg_entry_price * total_shares_bought
                if original_investment > 0:
                    return_percent = round((updated_position.total_realized_pnl / original_investment) * 100, 2)
        
        return PositionResponse(
            id=updated_position.id,
            ticker=updated_position.ticker,
            strategy=updated_position.strategy,
            setup_type=updated_position.setup_type,
            timeframe=updated_position.timeframe,
            status=updated_position.status.value,
            current_shares=updated_position.current_shares,
            avg_entry_price=updated_position.avg_entry_price,
            total_cost=updated_position.total_cost,
            total_realized_pnl=updated_position.total_realized_pnl,
            current_stop_loss=updated_position.current_stop_loss,
            current_take_profit=updated_position.current_take_profit,
            opened_at=updated_position.opened_at,
            closed_at=updated_position.closed_at,
            notes=updated_position.notes,
            lessons=updated_position.lessons,
            mistakes=updated_position.mistakes,
            events_count=events_count,
            return_percent=return_percent,
            original_risk_percent=updated_position.original_risk_percent,
            current_risk_percent=updated_position.current_risk_percent,
            original_shares=updated_position.original_shares,
            account_value_at_entry=updated_position.account_value_at_entry
        )
        
    except ValueError as e:
        db.rollback()
        raise ValidationException(str(e))
    except AppException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        import logging
        logging.exception("Failed to update position event")
        raise InternalServerException("Failed to update event")

@router.delete("/{position_id}")
def delete_position(
    position_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a position and all its related data (events, journal entries, charts, etc.)"""
    position_service = PositionService(db)
    
    position = position_service.get_position(position_id)
    if not position:
        raise NotFoundException("Position")
    
    if position.user_id != current_user.id:
        raise ForbiddenException("Not authorized to delete this position")
    
    try:
        success = position_service.delete_position(position_id)
        
        if success:
            return {"success": True, "message": "Position deleted successfully"}
        else:
            raise InternalServerException("Failed to delete position")
        
    except ValueError as e:
        raise BadRequestException(str(e))
    except Exception as e:
        raise InternalServerException(f"Failed to delete position: {str(e)}")


# === Event Management ===

@router.post("/{position_id}/events", response_model=EventResponse, status_code=status.HTTP_201_CREATED)
def add_position_event(
    position_id: int,
    event_data: EventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Add buy or sell event to position"""
    position_service = PositionService(db)
    
    position = position_service.get_position(position_id)
    if not position:
        raise NotFoundException("Position")
    
    if position.user_id != current_user.id:
        raise ForbiddenException("Not authorized to modify this position")
    

    if event_data.shares <= 0:
        raise ValidationException("Shares must be greater than 0")
    if event_data.price <= 0:
        raise ValidationException("Price must be greater than 0")
    
    event_type = event_data.event_type.lower()
    if event_type not in ("buy", "sell"):
        raise ValidationException(f"Invalid event type: {event_data.event_type}. Must be 'buy' or 'sell'")
    
    try:
        if event_data.event_type.lower() == 'buy':
            event = position_service.add_shares(
                position_id=position_id,
                shares=event_data.shares,
                price=event_data.price,
                event_date=event_data.event_date,
                stop_loss=event_data.stop_loss,
                take_profit=event_data.take_profit,
                notes=event_data.notes
            )
        else:
            event = position_service.sell_shares(
                position_id=position_id,
                shares=event_data.shares,
                price=event_data.price,
                event_date=event_data.event_date,
                stop_loss=event_data.stop_loss,
                take_profit=event_data.take_profit,
                notes=event_data.notes
            )
        
        db.commit()
        
        return EventResponse(
            id=event.id,
            event_type=event.event_type.value,
            event_date=event.event_date,
            shares=event.shares,
            price=event.price,
            stop_loss=event.stop_loss,
            take_profit=event.take_profit,
            notes=event.notes,
            source=event.source.value,
            realized_pnl=event.realized_pnl,
            position_shares_before=event.position_shares_before,
            position_shares_after=event.position_shares_after
        )
        
    except ValueError as e:
        db.rollback()
        raise ValidationException(str(e))
    except AppException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        import logging
        logging.exception("Failed to add position event")
        raise InternalServerException("Failed to add event")

@router.get("/{position_id}/events", response_model=List[EventResponse])
def get_position_events(
    position_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all events for a position"""
    position_service = PositionService(db)
    
    position = position_service.get_position(position_id)
    if not position:
        raise NotFoundException("Position")
    
    if position.user_id != current_user.id:
        raise ForbiddenException("Not authorized to access this position")
    
    events = position_service.get_position_events(position_id)
    
    return [
        EventResponse(
            id=event.id,
            event_type=event.event_type.value,
            event_date=event.event_date,
            shares=event.shares,
            price=event.price,
            stop_loss=event.stop_loss,
            take_profit=event.take_profit,
            notes=event.notes,
            source=event.source.value,
            realized_pnl=event.realized_pnl,
            position_shares_before=event.position_shares_before,
            position_shares_after=event.position_shares_after
        )
        for event in events
    ]


@router.get("/{position_id}/pending-orders", response_model=List[PendingOrderResponse])
def get_position_pending_orders(
    position_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get pending orders for a position"""
    position_service = PositionService(db)
    position = position_service.get_position(position_id)
    
    if not position:
        raise NotFoundException("Position")
    
    if position.user_id != current_user.id:
        raise ForbiddenException("Not authorized to access this position")
    
    # Get pending orders for this position
    pending_orders = db.query(ImportedPendingOrder).filter(
        ImportedPendingOrder.position_id == position_id
    ).order_by(ImportedPendingOrder.placed_time).all()
    
    return [
        PendingOrderResponse(
            id=order.id,
            symbol=order.symbol,
            side=order.side,
            status=order.status.value,
            shares=order.shares,
            price=order.price,
            order_type=order.order_type,
            placed_time=order.placed_time,
            stop_loss=order.stop_loss,
            take_profit=order.take_profit,
            notes=order.notes
        )
        for order in pending_orders
    ]


@router.put("/events/{event_id}", response_model=EventResponse)
def update_position_event(
    event_id: int,
    event_update: EventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update stop loss, take profit, or notes for a specific event"""
    position_service = PositionService(db)
    
    # Get the event to check permissions
    event = db.query(TradingPositionEvent).get(event_id)
    if not event:
        raise NotFoundException("Event")
    
    # Check that user owns the position
    position = position_service.get_position(event.position_id)
    if not position or position.user_id != current_user.id:
        raise ForbiddenException("Not authorized to access this position")
    
    try:
        updated_event = position_service.update_event(
            event_id=event_id,
            stop_loss=event_update.stop_loss,
            take_profit=event_update.take_profit,
            notes=event_update.notes
        )
        
        return EventResponse(
            id=updated_event.id,
            event_type=updated_event.event_type.value,
            event_date=updated_event.event_date,
            shares=updated_event.shares,
            price=updated_event.price,
            stop_loss=updated_event.stop_loss,
            take_profit=updated_event.take_profit,
            notes=updated_event.notes,
            source=updated_event.source.value,
            realized_pnl=updated_event.realized_pnl,
            position_shares_before=updated_event.position_shares_before,
            position_shares_after=updated_event.position_shares_after
        )
        
    except ValueError as e:
        db.rollback()
        raise ValidationException(str(e))
    except AppException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        import logging
        logging.exception("Failed to update position event")
        raise InternalServerException("Failed to update event")


@router.put("/events/{event_id}/comprehensive", response_model=EventResponse)
def update_position_event_comprehensive(
    event_id: int,
    event_update: EventUpdateComprehensive,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Comprehensive event update - modify shares, price, date, and risk management"""
    position_service = PositionService(db)
    
    # Get the event to check permissions
    event = db.query(TradingPositionEvent).get(event_id)
    if not event:
        raise NotFoundException("Event")

    # Check that user owns the position
    position = position_service.get_position(event.position_id)
    if not position or position.user_id != current_user.id:
        raise ForbiddenException("Not authorized to access this position")
    
    try:
        updated_event = position_service.update_event_comprehensive(
            event_id=event_id,
            shares=event_update.shares,
            price=event_update.price,
            event_date=event_update.event_date,
            stop_loss=event_update.stop_loss,
            take_profit=event_update.take_profit,
            notes=event_update.notes
        )
        
        return EventResponse(
            id=updated_event.id,
            event_type=updated_event.event_type.value,
            event_date=updated_event.event_date,
            shares=updated_event.shares,
            price=updated_event.price,
            stop_loss=updated_event.stop_loss,
            take_profit=updated_event.take_profit,
            notes=updated_event.notes,
            source=updated_event.source.value,
            realized_pnl=updated_event.realized_pnl,
            position_shares_before=updated_event.position_shares_before,
            position_shares_after=updated_event.position_shares_after
        )
        
    except ValueError as e:
        db.rollback()
        raise ValidationException(str(e))
    except AppException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        import logging
        logging.exception("Failed to update position event comprehensively")
        raise InternalServerException("Failed to update event comprehensively")


@router.delete("/events/{event_id}")
def delete_position_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a specific event"""
    position_service = PositionService(db)
    
    # Get the event to check permissions
    event = db.query(TradingPositionEvent).get(event_id)
    if not event:
        raise NotFoundException("Event")
    
    # Check that user owns the position
    position = position_service.get_position(event.position_id)
    if not position or position.user_id != current_user.id:
        raise ForbiddenException("Not authorized to access this position")
    
    try:
        position_service.delete_event(event_id)
        
        return {"success": True, "message": "Event deleted successfully"}
        
    except ValueError as e:
        raise BadRequestException(str(e))
        
    except Exception as e:
        raise InternalServerException(f"Failed to delete event: {str(e)}")


# === Import Functionality ===

from fastapi import UploadFile, File
from app.services.import_service import IndividualPositionImportService
from app.utils.datetime_utils import utc_now

class ImportResponse(BaseModel):
    success: bool
    imported_events: Optional[int] = None
    total_positions: Optional[int] = None
    open_positions: Optional[int] = None
    errors: Optional[List[Dict[str, Any]]] = None
    warnings: Optional[List[str]] = None
    error: Optional[str] = None

@router.post("/import/webull", response_model=ImportResponse)
async def import_webull_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Import Webull CSV using individual position lifecycle tracking"""
    try:
        # Validate file type
        if not file.filename.endswith('.csv'):
            raise BadRequestException("File must be a CSV file")
        
        # Read file content
        content = await file.read()
        csv_content = content.decode('utf-8')
        
        # Initialize import service
        import_service = IndividualPositionImportService(db)
        
        # Perform import
        result = import_service.import_webull_csv(csv_content, current_user.id)
        
        if result['success']:
            return ImportResponse(
                success=True,
                imported_events=result['imported_events'],
                total_positions=result['total_positions'],
                open_positions=result['open_positions'],
                warnings=result.get('warnings', [])
            )
        else:
            return ImportResponse(
                success=False,
                errors=result.get('errors', []),
                warnings=result.get('warnings', []),
                error=result.get('error')
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise InternalServerException(f"Import failed: {str(e)}")

@router.post("/import/validate", response_model=Dict[str, Any])
async def validate_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Validate CSV file without importing"""
    try:
        # Validate file type
        if not file.filename.endswith('.csv'):
            raise BadRequestException("File must be a CSV file")

            
        # Read file content
        content = await file.read()
        csv_content = content.decode('utf-8')
        
        # Initialize import service
        import_service = IndividualPositionImportService(db)
        
        # Parse and validate without importing
        try:
            events = import_service._parse_webull_csv(csv_content)
            
            # Sort events
            events.sort(key=import_service._sort_key)
            
            # Build summary
            summary = {
                'valid': len(import_service.validation_errors) == 0,
                'total_events': len(events),
                'filled_events': len([e for e in events if e['status'].upper() == 'FILLED']),
                'pending_events': len([e for e in events if e['status'].upper() == 'PENDING']),
                'unique_symbols': len(set(e['symbol'] for e in events)),
                'date_range': {
                    'earliest': min(e['filled_time'] for e in events if e['status'].upper() == 'FILLED').isoformat() if events else None,
                    'latest': max(e['filled_time'] for e in events if e['status'].upper() == 'FILLED').isoformat() if events else None
                },
                'errors': [import_service._format_error(e) for e in import_service.validation_errors],
                'warnings': import_service.warnings
            }
            
            return summary
            
        except Exception as e:
            return {
                'valid': False,
                'error': str(e),
                'total_events': 0
            }
            
    except HTTPException:
        raise
    except Exception as e:
        raise InternalServerException(f"Validation failed: {str(e)}")


# === Universal Import System - CSV Import Routes ===

from fastapi import UploadFile, File

@router.post("/import/universal", response_model=ImportResponse)
async def import_universal_csv(
    file: UploadFile = File(...),
    broker: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Universal CSV import supporting multiple broker formats.
    
    Optionally specify broker name to skip auto-detection.
    Supported brokers: webull_usa, webull_au, robinhood, td_ameritrade, 
    interactive_brokers, etrade, fidelity, charles_schwab
    """
    try:
        # Validate file type
        if not file.filename.endswith('.csv'):
            raise BadRequestException("File must be a CSV file")
        
        # Read file content
        content = await file.read()
        csv_content = content.decode('utf-8')
        
        # Initialize universal import service
        import_service = UniversalImportService(db)
        
        # Perform import
        result = import_service.import_csv(
            csv_content=csv_content,
            user_id=current_user.id,
            broker_name=broker
        )
        
        if result['success']:
            return ImportResponse(
                success=True,
                broker_detected=result.get('broker_detected'),
                broker_display_name=result.get('broker_display_name'),
                imported_events=result.get('imported_events'),
                total_positions=result.get('total_positions'),
                open_positions=result.get('open_positions'),
                warnings=result.get('warnings', [])
            )
        else:
            return ImportResponse(
                success=False,
                broker_detected=result.get('broker_detected'),
                errors=result.get('errors'),
                warnings=result.get('warnings', []),
                error=result.get('error'),
                available_columns=result.get('available_columns'),
                column_map=result.get('column_map')
            )
            
    except HTTPException:
        raise
    except Exception as e:
        raise InternalServerException(f"Universal import failed: {str(e)}")


@router.post("/import/universal/validate", response_model=ImportValidationResponse)
async def validate_universal_csv(
    file: UploadFile = File(...),
    broker: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Validate CSV file without importing (dry run).
    
    Returns detected broker, column mapping, and sample data preview.
    """
    try:
        # Validate file type
        if not file.filename.endswith('.csv'):
            raise BadRequestException("File must be a CSV file")
        
        # Read file content
        content = await file.read()
        csv_content = content.decode('utf-8')
        
        # Initialize universal import service
        import_service = UniversalImportService(db)
        
        # Validate CSV
        result = import_service.validate_csv(
            csv_content=csv_content,
            broker_name=broker
        )
        
        return ImportValidationResponse(**result)
            
    except HTTPException:
        raise
    except Exception as e:
        raise InternalServerException(f"Validation failed: {str(e)}")


# === Pending Orders Management ===

class PendingOrderUpdate(BaseModel):
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    price: Optional[float] = None
    notes: Optional[str] = None

@router.put("/pending-orders/{order_id}", response_model=PendingOrderResponse)
def update_pending_order(
    order_id: int,
    order_update: PendingOrderUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a pending order"""
    
    # Get the pending order
    pending_order = db.query(ImportedPendingOrder).filter(
        ImportedPendingOrder.id == order_id
    ).first()
    
    if not pending_order:
        raise NotFoundException("Pending order not found")
    
    # Check if user owns the position this order belongs to
    if pending_order.position:
        if pending_order.position.user_id != current_user.id:
            raise NotAuthorizedException("Not authorized to update this pending order")
    
    # Update the order fields
    if order_update.stop_loss is not None:
        pending_order.stop_loss = order_update.stop_loss
    if order_update.take_profit is not None:
        pending_order.take_profit = order_update.take_profit
    if order_update.price is not None:
        pending_order.price = order_update.price
    if order_update.notes is not None:
        pending_order.notes = order_update.notes
    
    try:
        db.commit()
        db.refresh(pending_order)
        
        return PendingOrderResponse(
            id=pending_order.id,
            symbol=pending_order.symbol,
            side=pending_order.side,
            status=pending_order.status.value,
            shares=pending_order.shares,
            price=pending_order.price,
            order_type=pending_order.order_type,
            placed_time=pending_order.placed_time,
            stop_loss=pending_order.stop_loss,
            take_profit=pending_order.take_profit,
            notes=pending_order.notes
        )
        
    except Exception as e:
        db.rollback()
        raise InternalServerException(f"Failed to update pending order: {str(e)}")

# === Journal Entry Endpoints ===

@router.get("/{position_id}/journal", response_model=List[JournalEntryResponse])
async def get_position_journal_entries(
    position_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all journal entries for a position - diary-style chronological entries"""
    
    # Verify position exists and user owns it
    position = db.query(TradingPosition).filter(
        TradingPosition.id == position_id,
        TradingPosition.user_id == current_user.id
    ).first()
    
    if not position:
        raise NotFoundException("Position not found")
    
    # Get journal entries (already ordered by entry_date desc in relationship)
    entries = db.query(TradingPositionJournalEntry).filter(
        TradingPositionJournalEntry.position_id == position_id
    ).order_by(TradingPositionJournalEntry.entry_date.desc()).all()
    
    return [
        JournalEntryResponse(
            id=entry.id,
            entry_type=entry.entry_type.value,
            content=entry.content,
            entry_date=entry.entry_date,
            created_at=entry.created_at,
            updated_at=entry.updated_at,
            attached_images=json.loads(entry.attached_images) if entry.attached_images else None,
            attached_charts=json.loads(entry.attached_charts) if entry.attached_charts else None
        )
        for entry in entries
    ]


@router.post("/{position_id}/journal", response_model=JournalEntryResponse)
async def create_journal_entry(
    position_id: int,
    entry_data: JournalEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new journal entry for a position"""
    
    # Verify position exists and user owns it
    position = db.query(TradingPosition).filter(
        TradingPosition.id == position_id,
        TradingPosition.user_id == current_user.id
    ).first()
    
    if not position:
        raise NotFoundException("Position not found")
    
    # Validate entry type
    try:
        entry_type = JournalEntryType(entry_data.entry_type)
    except ValueError:
        raise BadRequestException(f"Invalid entry type. Must be one of: {[e.value for e in JournalEntryType]}")
    
    # Create new journal entry
    journal_entry = TradingPositionJournalEntry(
        position_id=position_id,
        entry_type=entry_type,
        content=entry_data.content,
        entry_date=entry_data.entry_date or utc_now(),
        attached_images=json.dumps(entry_data.attached_images) if entry_data.attached_images else None,
        attached_charts=json.dumps(entry_data.attached_charts) if entry_data.attached_charts else None
    )
    
    try:
        db.add(journal_entry)
        db.commit()
        db.refresh(journal_entry)
        
        return JournalEntryResponse(
            id=journal_entry.id,
            entry_type=journal_entry.entry_type.value,
            content=journal_entry.content,
            entry_date=journal_entry.entry_date,
            created_at=journal_entry.created_at,
            updated_at=journal_entry.updated_at,
            attached_images=json.loads(journal_entry.attached_images) if journal_entry.attached_images else None,
            attached_charts=json.loads(journal_entry.attached_charts) if journal_entry.attached_charts else None
        )
        
    except Exception as e:
        db.rollback()
        raise InternalServerException(f"Failed to create journal entry: {str(e)}")


# Create separate router for journal endpoints that don't have position prefix
journal_router = APIRouter(prefix="/journal", tags=["journal"])

@journal_router.put("/{entry_id}", response_model=JournalEntryResponse)
async def update_journal_entry(
    entry_id: int,
    entry_update: JournalEntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a journal entry"""
    
    # Get journal entry and verify user owns the position
    journal_entry = db.query(TradingPositionJournalEntry).join(TradingPosition).filter(
        TradingPositionJournalEntry.id == entry_id,
        TradingPosition.user_id == current_user.id
    ).first()
    
    if not journal_entry:
        raise NotFoundException("Journal entry not found")
    
    # Update fields
    if entry_update.entry_type is not None:
        try:
            journal_entry.entry_type = JournalEntryType(entry_update.entry_type)
        except ValueError:
            raise BadRequestException(f"Invalid entry type. Must be one of: {[e.value for e in JournalEntryType]}")
    
    if entry_update.content is not None:
        journal_entry.content = entry_update.content
    
    if entry_update.entry_date is not None:
        journal_entry.entry_date = entry_update.entry_date
    
    if entry_update.attached_images is not None:
        journal_entry.attached_images = json.dumps(entry_update.attached_images)
    
    if entry_update.attached_charts is not None:
        journal_entry.attached_charts = json.dumps(entry_update.attached_charts)
    
    try:
        db.commit()
        db.refresh(journal_entry)
        
        return JournalEntryResponse(
            id=journal_entry.id,
            entry_type=journal_entry.entry_type.value,
            content=journal_entry.content,
            entry_date=journal_entry.entry_date,
            created_at=journal_entry.created_at,
            updated_at=journal_entry.updated_at,
            attached_images=json.loads(journal_entry.attached_images) if journal_entry.attached_images else None,
            attached_charts=json.loads(journal_entry.attached_charts) if journal_entry.attached_charts else None
        )
        
    except Exception as e:
        db.rollback()
        raise InternalServerException(f"Failed to update journal entry: {str(e)}")


@journal_router.delete("/{entry_id}")
async def delete_journal_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a journal entry"""
    
    # Get journal entry and verify user owns the position
    journal_entry = db.query(TradingPositionJournalEntry).join(TradingPosition).filter(
        TradingPositionJournalEntry.id == entry_id,
        TradingPosition.user_id == current_user.id
    ).first()
    
    if not journal_entry:
        raise NotFoundException("Journal entry not found")
    
    try:
        db.delete(journal_entry)
        db.commit()
        
        return {"message": "Journal entry deleted successfully"}
        
    except Exception as e:
        db.rollback()
        raise InternalServerException(f"Failed to delete journal entry: {str(e)}")


# === Chart Data Routes ===

@router.get("/{position_id}/chart-data")
async def get_position_chart_data(
    position_id: int,
    days_before: int = Query(7, ge=0, le=30, description="Days of data before entry"),
    days_after: int = Query(7, ge=0, le=30, description="Days of data after exit"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get historical price chart data for a position with context days before/after.
    Returns daily OHLCV data from 7 days before entry to 7 days after exit.
    """
    from app.services.market_data_service import MarketDataService
    
    # Get position and verify ownership
    position = db.query(TradingPosition).filter(
        TradingPosition.id == position_id,
        TradingPosition.user_id == current_user.id
    ).first()
    
    if not position:
        raise NotFoundException("Position not found")
    
    # Get entry and exit dates from events
    first_event = db.query(TradingPositionEvent).filter(
        TradingPositionEvent.position_id == position_id,
        TradingPositionEvent.event_type == EventType.BUY
    ).order_by(TradingPositionEvent.event_date.asc()).first()
    
    last_event = db.query(TradingPositionEvent).filter(
        TradingPositionEvent.position_id == position_id
    ).order_by(TradingPositionEvent.event_date.desc()).first()
    
    if not first_event:
        raise BadRequestException("Position has no entry event")
    
    try:
        market_service = MarketDataService()
        chart_data = market_service.get_position_chart_data(
            symbol=position.ticker,
            opened_at=first_event.event_date,
            closed_at=last_event.event_date if position.status == PositionStatus.CLOSED else None,
            days_before=days_before,
            days_after=days_after
        )
        
        # Log success for debugging
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"Chart data for {position.ticker} (ID {position_id}): {len(chart_data.get('price_data', []))} data points")
        
        return {
            "position_id": position_id,
            "ticker": position.ticker,
            **chart_data
        }
        
    except Exception as e:
        import logging
        import traceback
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to fetch chart data for position {position_id} ({position.ticker}): {str(e)}")
        logger.error(traceback.format_exc())
        raise InternalServerException(f"Failed to fetch chart data: {str(e)}")


@router.post("/chart-data/bulk")
async def get_bulk_position_chart_data(
    request: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get chart data for multiple positions at once.
    Request body: { "position_ids": [1, 2, 3], "days_before": 7, "days_after": 7 }
    """
    from app.services.market_data_service import MarketDataService
    
    position_ids = request.get("position_ids", [])
    days_before = request.get("days_before", 7)
    days_after = request.get("days_after", 7)
    
    if not position_ids or not isinstance(position_ids, list):
        raise BadRequestException("position_ids must be a non-empty list")
    
    if len(position_ids) > 10:
        raise BadRequestException("Cannot fetch chart data for more than 10 positions at once")
    
    # Verify all positions exist and user owns them - eager load events to avoid N+1
    from sqlalchemy.orm import joinedload
    
    positions = db.query(TradingPosition).options(
        joinedload(TradingPosition.events)
    ).filter(
        TradingPosition.id.in_(position_ids),
        TradingPosition.user_id == current_user.id
    ).all()
    
    if len(positions) != len(position_ids):
        raise NotFoundException("One or more positions not found")
    
    results = []
    market_service = MarketDataService()
    
    for position in positions:
        # Get entry and exit dates from preloaded events
        buy_events = [e for e in position.events if e.event_type == EventType.BUY]
        buy_events.sort(key=lambda e: e.event_date)
        
        if not buy_events:
            results.append({
                "position_id": position.id,
                "ticker": position.ticker,
                "error": "No entry event found"
            })
            continue
        
        first_event = buy_events[0]
        
        # Get last event (any type)
        all_events = sorted(position.events, key=lambda e: e.event_date, reverse=True)
        last_event = all_events[0] if all_events else None
        
        try:
            chart_data = market_service.get_position_chart_data(
                symbol=position.ticker,
                opened_at=first_event.event_date,
                closed_at=last_event.event_date if position.status == PositionStatus.CLOSED else None,
                days_before=days_before,
                days_after=days_after
            )
            
            results.append({
                "position_id": position.id,
                "ticker": position.ticker,
                **chart_data
            })
            
        except Exception as e:
            results.append({
                "position_id": position.id,
                "ticker": position.ticker,
                "error": str(e)
            })
    
    return {"charts": results}