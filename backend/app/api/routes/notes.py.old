from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.api.deps import get_db, get_current_user
from app.models.models import User, Trade
from app.services.trade_service import get_trade, extract_image_urls_from_notes, clean_notes_of_image_urls

router = APIRouter()

class NotesUpdateRequest(BaseModel):
    notes: str

@router.put("/trade/{trade_id}/notes")
async def update_trade_notes(
    trade_id: int,
    request: NotesUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update only the notes for a trade, preserving image URLs"""
    
    # Get the trade and verify ownership
    trade = get_trade(db, trade_id, current_user.id)
    if not trade:
        raise HTTPException(status_code=404, detail="Trade not found")
    
    # Extract existing image URLs
    existing_image_urls = extract_image_urls_from_notes(trade.entry_notes or "")
    
    # Combine new notes with existing image URLs
    new_notes_lines = [request.notes] if request.notes.strip() else []
    for url in existing_image_urls:
        new_notes_lines.append(f"IMAGE_URL:{url}")
    
    trade.entry_notes = '\n'.join(new_notes_lines)
    
    db.commit()
    db.refresh(trade)
    
    return {
        "success": True,
        "message": "Notes updated successfully"
    }