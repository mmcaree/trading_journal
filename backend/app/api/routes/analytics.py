from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user
from app.models.schemas import PerformanceMetrics, SetupPerformance
from app.services.analytics_service import get_performance_metrics, get_setup_performance
from app.models.models import User

router = APIRouter()

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
