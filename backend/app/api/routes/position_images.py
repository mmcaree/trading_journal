from fastapi import APIRouter, Depends, UploadFile, File
from typing import List
from sqlalchemy.orm import Session
import os
import uuid
import shutil
from pathlib import Path
import cloudinary
import cloudinary.uploader
from cloudinary import CloudinaryImage
from pydantic import BaseModel

from app.api.deps import get_db, get_current_user
from app.models import User
from app.models.position_models import TradingPosition, TradingPositionChart
from app.core.config import settings
from app.utils.exceptions import (
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    InternalServerException
)

router = APIRouter()

# Pydantic models for request bodies
class AddChartRequest(BaseModel):
    image_url: str
    description: str = ""
    timeframe: str = ""

class UpdateNotesRequest(BaseModel):
    notes: str = ""
    lessons: str = ""
    mistakes: str = ""

# Configure Cloudinary (you'll need to set these environment variables)
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET")
)

# Fallback to local storage if Cloudinary is not configured
USE_CLOUDINARY = all([
    os.getenv("CLOUDINARY_CLOUD_NAME"),
    os.getenv("CLOUDINARY_API_KEY"),
    os.getenv("CLOUDINARY_API_SECRET")
])

if not USE_CLOUDINARY:
    # Ensure uploads directory exists for local fallback
    UPLOAD_DIR = Path("static/uploads")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB

@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload an image and return the URL"""
    
    # Validate file type
    if not file.filename:
        raise BadRequestException("No filename provided")
    
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise BadRequestException(
            f"File type {file_ext} not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Validate file size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise BadRequestException(f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB")
    
    try:
        if USE_CLOUDINARY:
            # Upload to Cloudinary
            result = cloudinary.uploader.upload(
                content,
                folder="trading_journal_v2",
                resource_type="image",
                public_id=f"user_{current_user.id}_{uuid.uuid4()}",
                transformation=[
                    {"width": 1200, "height": 800, "crop": "limit"},
                    {"quality": "auto:good"}
                ]
            )
            image_url = result["secure_url"]
            filename = result["public_id"]
        else:
            # Fallback to local storage
            unique_filename = f"{uuid.uuid4()}{file_ext}"
            file_path = UPLOAD_DIR / unique_filename
            
            with open(file_path, "wb") as buffer:
                buffer.write(content)
            
            image_url = f"/static/uploads/{unique_filename}"
            filename = unique_filename
            
    except Exception as e:
        raise InternalServerException(f"Failed to upload image: {str(e)}")
    
    return {
        "success": True,
        "image_url": image_url,
        "filename": filename
    }

@router.post("/position/{position_id}/charts")
async def add_position_chart(
    position_id: int,
    request: AddChartRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a chart to a position"""
    
    # Get the position and verify ownership
    position = db.query(TradingPosition).filter(TradingPosition.id == position_id).first()
    if not position:
        raise NotFoundException("Position")
    
    if position.user_id != current_user.id:
        raise ForbiddenException("Not authorized to modify this position")
    
    # Create new chart record
    chart = TradingPositionChart(
        position_id=position_id,
        image_url=request.image_url,
        description=request.description,
        timeframe=request.timeframe
    )
    
    db.add(chart)
    db.commit()
    db.refresh(chart)
    
    return {
        "success": True,
        "chart_id": chart.id,
        "message": "Chart added successfully"
    }

@router.get("/position/{position_id}/charts")
async def get_position_charts(
    position_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all charts for a position"""
    
    # Get the position and verify ownership
    position = db.query(TradingPosition).filter(TradingPosition.id == position_id).first()
    if not position:
        raise NotFoundException("Position")
    
    if position.user_id != current_user.id:
        raise ForbiddenException("Not authorized to view this position")
    
    charts = db.query(TradingPositionChart).filter(
        TradingPositionChart.position_id == position_id
    ).order_by(TradingPositionChart.created_at.desc()).all()
    
    return {
        "success": True,
        "charts": [
            {
                "id": chart.id,
                "image_url": chart.image_url,
                "description": chart.description,
                "timeframe": chart.timeframe,
                "created_at": chart.created_at.isoformat()
            }
            for chart in charts
        ]
    }

@router.put("/position/{position_id}/notes")
async def update_position_notes(
    position_id: int,
    request: UpdateNotesRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update position notes, lessons, and mistakes"""
    
    # Get the position and verify ownership
    position = db.query(TradingPosition).filter(TradingPosition.id == position_id).first()
    if not position:
        raise NotFoundException("Position")
    
    if position.user_id != current_user.id:
        raise ForbiddenException("Not authorized to modify this position")
    
    # Update notes fields
    position.notes = request.notes.strip() if request.notes else None
    position.lessons = request.lessons.strip() if request.lessons else None
    position.mistakes = request.mistakes.strip() if request.mistakes else None
    
    db.commit()
    db.refresh(position)
    
    return {
        "success": True,
        "message": "Position notes updated successfully",
        "notes": position.notes,
        "lessons": position.lessons,
        "mistakes": position.mistakes
    }

@router.delete("/chart/{chart_id}")
async def delete_chart(
    chart_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a chart"""
    
    # Get the chart and verify ownership through position
    chart = db.query(TradingPositionChart).filter(TradingPositionChart.id == chart_id).first()
    if not chart:
        raise NotFoundException("Chart")
    
    position = db.query(TradingPosition).filter(TradingPosition.id == chart.position_id).first()
    if not position or position.user_id != current_user.id:
        raise ForbiddenException("Not authorized to delete this chart")
    
    # Delete the chart
    db.delete(chart)
    db.commit()
    
    # TODO: Also delete from Cloudinary if using cloud storage
    # This would require storing the public_id from the upload response
    
    return {
        "success": True,
        "message": "Chart deleted successfully"
    }