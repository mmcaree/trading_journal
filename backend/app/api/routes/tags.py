from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.api.deps import get_db, get_current_user
from app.models.position_models import PositionTag, TradingPosition
from app.models import User

router = APIRouter(prefix="/tags", tags=["tags"])


from pydantic import BaseModel

class TagCreate(BaseModel):
    name: str
    color: str = "#1976d2"

class TagUpdate(BaseModel):
    name: str | None = None
    color: str | None = None

class TagResponse(BaseModel):
    id: int
    name: str
    color: str

    class Config:
        from_attributes = True


@router.get("/", response_model=List[TagResponse])
def get_my_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(PositionTag).filter(PositionTag.user_id == current_user.id).all()


@router.post("/", response_model=TagResponse, status_code=201)
def create_tag(
    tag_in: TagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exists = db.query(PositionTag).filter(
        PositionTag.user_id == current_user.id,
        PositionTag.name.ilike(tag_in.name.strip())
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="You already have a tag with this name")

    tag = PositionTag(
        name=tag_in.name.strip(),
        color=tag_in.color,
        user_id=current_user.id
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag


@router.put("/{tag_id}", response_model=TagResponse)
def update_tag(
    tag_id: int,
    tag_in: TagUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tag = db.query(PositionTag).filter(
        PositionTag.id == tag_id,
        PositionTag.user_id == current_user.id
    ).first()

    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    if tag_in.name is not None:
        tag.name = tag_in.name.strip()
    if tag_in.color is not None:
        tag.color = tag_in.color

    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=204)
def delete_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tag = db.query(PositionTag).filter(
        PositionTag.id == tag_id,
        PositionTag.user_id == current_user.id
    ).first()

    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    db.delete(tag)
    db.commit()
    return None


@router.post("/positions/{position_id}/assign/{tag_id}")
def assign_tag(
    position_id: int,
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    position = db.query(TradingPosition).filter(
        TradingPosition.id == position_id,
        TradingPosition.user_id == current_user.id
    ).first()

    if not position:
        raise HTTPException(status_code=404, detail="Position not found")

    tag = db.query(PositionTag).filter(
        PositionTag.id == tag_id,
        PositionTag.user_id == current_user.id
    ).first()

    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    if tag not in position.tags:
        position.tags.append(tag)
        db.commit()

    return {"status": "assigned", "tag_id": tag.id, "position_id": position.id}


@router.delete("/positions/{position_id}/remove/{tag_id}")
def remove_tag(
    position_id: int,
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    position = db.query(TradingPosition).filter(
        TradingPosition.id == position_id,
        TradingPosition.user_id == current_user.id
    ).first()

    if not position:
        raise HTTPException(status_code=404, detail="Position not found")

    tag = db.query(PositionTag).filter(
        PositionTag.id == tag_id,
        PositionTag.user_id == current_user.id
    ).first()

    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    if tag in position.tags:
        position.tags.remove(tag)
        db.commit()

    return {"status": "removed"}