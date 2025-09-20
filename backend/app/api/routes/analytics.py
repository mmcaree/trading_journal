from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from typing import List, Optional
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.schemas import PerformanceMetrics, SetupPerformance
from app.services.analytics_service import get_performance_metrics, get_setup_performance
from app.services.weekly_analytics_service import get_weekly_analytics_service
from app.services.email_service import email_service
from app.models.models import User, PartialExit, Trade

router = APIRouter()

@router.get("/partial-exits-summary")
def get_partial_exits_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get total realized P&L from all partial exits"""
    # Get all partial exits for trades belonging to this user
    partial_exits = db.query(PartialExit).join(Trade).filter(
        Trade.user_id == current_user.id
    ).all()
    
    total_realized_pnl = sum(exit.profit_loss for exit in partial_exits if exit.profit_loss)
    
    return {
        "total_realized_pnl": round(total_realized_pnl, 2),
        "total_exits": len(partial_exits)
    }

@router.get("/partial-exits-detail")
def get_partial_exits_detail(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get detailed partial exits data for performance charts"""
    # Get all partial exits for trades belonging to this user with details
    partial_exits = db.query(PartialExit).join(Trade).filter(
        Trade.user_id == current_user.id
    ).all()
    
    exits_data = []
    for exit in partial_exits:
        if exit.profit_loss and exit.exit_date:
            exits_data.append({
                "exit_date": exit.exit_date.isoformat(),
                "profit_loss": exit.profit_loss,
                "shares_sold": exit.shares_sold,
                "exit_price": exit.exit_price
            })
    
    return exits_data

@router.get("/performance", response_model=PerformanceMetrics)
def read_performance_metrics(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get overall performance metrics"""
    return get_performance_metrics(
        db=db, 
        user_id=current_user.id,
        start_date=start_date,
        end_date=end_date
    )

@router.get("/performance-debug", response_model=PerformanceMetrics)
def read_performance_metrics_debug(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get overall performance metrics (debugging endpoint without auth)"""
    # Get the first user in the database
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No users found in database")
    
    return get_performance_metrics(
        db=db, 
        user_id=user.id,
        start_date=start_date,
        end_date=end_date
    )

@router.get("/setups", response_model=List[SetupPerformance])
def read_setup_performance(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get performance metrics by setup type"""
    return get_setup_performance(db=db, user_id=current_user.id)

@router.get("/setups-debug", response_model=List[SetupPerformance])
def read_setup_performance_debug(
    db: Session = Depends(get_db)
):
    """Get performance metrics by setup type (debugging endpoint without auth)"""
    # Get the first user in the database
    user = db.query(User).first()
    if not user:
        raise HTTPException(status_code=404, detail="No users found in database")
    
    return get_setup_performance(db=db, user_id=user.id)

@router.get("/weekly-stats")
def get_weekly_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get weekly trading statistics for the current user"""
    analytics_service = get_weekly_analytics_service(db)
    user_timezone = current_user.timezone or 'America/New_York'
    
    weekly_stats = analytics_service.calculate_weekly_stats(
        user_id=current_user.id,
        user_timezone=user_timezone
    )
    
    return weekly_stats

@router.post("/send-weekly-email")
def send_weekly_email_test(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send a test weekly email to the current user"""
    def send_email():
        try:
            # Get weekly analytics
            analytics_service = get_weekly_analytics_service(db)
            user_timezone = current_user.timezone or 'America/New_York'
            
            weekly_stats = analytics_service.calculate_weekly_stats(
                user_id=current_user.id,
                user_timezone=user_timezone
            )
            
            # Prepare user data
            user_data = {
                'username': current_user.username,
                'display_name': current_user.display_name,
                'email': current_user.email
            }
            
            # Send the email
            success = email_service.send_weekly_summary(
                user_email=current_user.email,
                user_data=user_data,
                trades_data=weekly_stats
            )
            
            return success
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to send weekly email: {str(e)}")
    
    # Run in background
    background_tasks.add_task(send_email)
    
    return {"message": "Weekly email is being sent", "email": current_user.email}
