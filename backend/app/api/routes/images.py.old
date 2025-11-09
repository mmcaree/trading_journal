from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from typing import List
from sqlalchemy.orm import Session
import os
import uuid
import shutil
from pathlib import Path
import cloudinary
import cloudinary.uploader
from cloudinary import CloudinaryImage

from app.api.deps import get_db, get_current_user
from app.models.models import User, Trade
from app.services.trade_service import get_trade
from app.core.config import settings

router = APIRouter()

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
        raise HTTPException(status_code=400, detail="No filename provided")
    
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"File type {file_ext} not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Validate file size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413, 
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024*1024)}MB"
        )
    
    try:
        if USE_CLOUDINARY:
            # Upload to Cloudinary
            result = cloudinary.uploader.upload(
                content,
                folder="trading_journal",
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
        raise HTTPException(status_code=500, detail=f"Failed to upload image: {str(e)}")
    
    return {
        "success": True,
        "image_url": image_url,
        "filename": filename
    }

@router.post("/trade/{trade_id}/images")
async def update_trade_images(
    trade_id: int,
    image_urls: List[str],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update the image URLs for a trade"""
    
    # Get the trade and verify ownership
    trade = get_trade(db, trade_id, current_user.id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    # For now, store as comma-separated string in entry_notes field
    # TODO: Add proper imageUrls field to Trade model or use Chart relationships
    trade.entry_notes = trade.entry_notes or ""
    
    # Simple approach: store image URLs in a special format in entry_notes
    # Remove any existing image URLs first
    notes_lines = trade.entry_notes.split('\n')
    filtered_lines = [line for line in notes_lines if not line.startswith('IMAGE_URL:')]
    
    # Add new image URLs
    for url in image_urls:
        filtered_lines.append(f"IMAGE_URL:{url}")
    
    trade.entry_notes = '\n'.join(filtered_lines)
    
    db.commit()
    db.refresh(trade)
    
    return {
        "success": True,
        "message": f"Updated {len(image_urls)} image URLs for trade {trade_id}"
    }

@router.delete("/trade/{trade_id}/images")
async def clear_trade_images(
    trade_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Clear all image URLs from a trade"""
    
    # Get the trade and verify ownership
    trade = get_trade(db, trade_id, current_user.id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    # Remove image URLs from entry_notes
    if trade.entry_notes:
        notes_lines = trade.entry_notes.split('\n')
        filtered_lines = [line for line in notes_lines if not line.startswith('IMAGE_URL:')]
        trade.entry_notes = '\n'.join(filtered_lines)
        
        db.commit()
    
    return {
        "success": True,
        "message": f"Cleared all images from trade {trade_id}"
    }