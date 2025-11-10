from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta

from app.db.session import get_db
from app.models.position_models import User, TradingPosition, TradingPositionEvent, InstructorNote, TradingPositionJournalEntry, TradingPositionChart
from app.models.schemas import UserResponse
from app.api.deps import get_current_user
from pydantic import BaseModel

router = APIRouter()

# Pydantic models for admin API
class StudentSummary(BaseModel):
    id: int
    username: str
    email: str
    first_name: Optional[str]
    last_name: Optional[str]
    display_name: Optional[str]
    created_at: datetime
    
    # Trading stats
    total_positions: int
    open_positions: int
    total_pnl: float
    total_trades: int
    last_trade_date: Optional[datetime]
    
    # Flags and notes
    has_instructor_notes: bool
    is_flagged: bool
    
    class Config:
        from_attributes = True

class StudentDetail(BaseModel):
    id: int
    username: str
    email: str
    first_name: Optional[str]
    last_name: Optional[str]
    display_name: Optional[str]
    created_at: datetime
    current_account_balance: Optional[float]
    initial_account_balance: Optional[float]
    
    # Complete trading data will be fetched separately
    class Config:
        from_attributes = True

class InstructorNoteCreate(BaseModel):
    note_text: str
    is_flagged: bool = False

class InstructorNoteResponse(BaseModel):
    id: int
    instructor_id: int
    student_id: int
    note_text: str
    is_flagged: bool
    created_at: datetime
    updated_at: datetime
    instructor_username: str
    
    class Config:
        from_attributes = True

# Middleware to check if user is instructor
def get_current_instructor(current_user: User = Depends(get_current_user)):
    if current_user.role != 'INSTRUCTOR':
        raise HTTPException(status_code=403, detail=f"Instructor access required. Current role: {current_user.role}")
    return current_user

@router.get("/admin-debug/current-user")
async def debug_current_user(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Debug endpoint to see current user info (no role restriction)"""
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "role": current_user.role,
        "created_at": current_user.created_at
    }

@router.get("/admin-debug/users")
async def debug_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_instructor)
):
    """Debug endpoint to see all users and their roles"""
    all_users = db.query(User).all()
    return [
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "created_at": user.created_at
        }
        for user in all_users
    ]

@router.get("/students", response_model=List[StudentSummary])
async def get_all_students(
    search: Optional[str] = Query(None, description="Search by username or email"),
    limit: int = Query(100, le=1000),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_instructor)
):
    """Get all students with summary statistics - INSTRUCTOR ONLY"""
    
    # Base query for students only (including NULL roles as they default to STUDENT)
    query = db.query(User).filter(
        (User.role == 'STUDENT') | (User.role.is_(None))
    )
    
    # Add search filter
    if search:
        search_filter = f"%{search.lower()}%"
        query = query.filter(
            (User.username.ilike(search_filter)) |
            (User.email.ilike(search_filter)) |
            (User.first_name.ilike(search_filter)) |
            (User.last_name.ilike(search_filter)) |
            (User.display_name.ilike(search_filter))
        )
    
    # Get students with pagination
    students = query.offset(offset).limit(limit).all()
    
    # Build response with trading stats
    student_summaries = []
    for student in students:
        # Get position statistics
        positions = db.query(TradingPosition).filter(TradingPosition.user_id == student.id).all()
        
        total_positions = len(positions)
        open_positions = len([p for p in positions if p.status == 'OPEN'])
        total_pnl = sum(p.total_realized_pnl or 0 for p in positions)
        
        # Get total trades (events)
        total_trades = db.query(TradingPositionEvent).filter(
            TradingPositionEvent.position_id.in_([p.id for p in positions])
        ).count()
        
        # Get last trade date
        last_trade = db.query(TradingPositionEvent).filter(
            TradingPositionEvent.position_id.in_([p.id for p in positions])
        ).order_by(TradingPositionEvent.event_date.desc()).first()
        
        last_trade_date = last_trade.event_date if last_trade else None
        
        # Check for instructor notes and flags
        instructor_notes = db.query(InstructorNote).filter(InstructorNote.student_id == student.id).all()
        has_instructor_notes = len(instructor_notes) > 0
        is_flagged = any(note.is_flagged for note in instructor_notes)
        
        student_summaries.append(StudentSummary(
            id=student.id,
            username=student.username,
            email=student.email,
            first_name=student.first_name,
            last_name=student.last_name,
            display_name=student.display_name,
            created_at=student.created_at,
            total_positions=total_positions,
            open_positions=open_positions,
            total_pnl=total_pnl,
            total_trades=total_trades,
            last_trade_date=last_trade_date,
            has_instructor_notes=has_instructor_notes,
            is_flagged=is_flagged
        ))
    
    return student_summaries

@router.get("/student/{student_id}", response_model=StudentDetail)
async def get_student_detail(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_instructor)
):
    """Get detailed student information - INSTRUCTOR ONLY"""
    
    student = db.query(User).filter(User.id == student_id, User.role == 'STUDENT').first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    return StudentDetail.from_orm(student)

@router.get("/student/{student_id}/positions")
async def get_student_positions(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_instructor)
):
    """Get all positions for a student - INSTRUCTOR ONLY"""
    
    # Verify student exists
    student = db.query(User).filter(User.id == student_id, User.role == 'STUDENT').first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    positions = db.query(TradingPosition).filter(TradingPosition.user_id == student_id).all()
    return positions

@router.get("/student/{student_id}/events")
async def get_student_events(
    student_id: int,
    limit: int = Query(100, le=1000),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_instructor)
):
    """Get all trading events for a student - INSTRUCTOR ONLY"""
    
    # Verify student exists
    student = db.query(User).filter(User.id == student_id, User.role == 'STUDENT').first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Get all position IDs for this student
    position_ids = db.query(TradingPosition.id).filter(TradingPosition.user_id == student_id).all()
    position_ids = [pid[0] for pid in position_ids]
    
    # Get events for those positions
    events = db.query(TradingPositionEvent).filter(
        TradingPositionEvent.position_id.in_(position_ids)
    ).order_by(TradingPositionEvent.event_date.desc()).offset(offset).limit(limit).all()
    
    return events

@router.get("/student/{student_id}/notes", response_model=List[InstructorNoteResponse])
async def get_student_notes(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_instructor)
):
    """Get all instructor notes for a student - INSTRUCTOR ONLY"""
    
    # Verify student exists
    student = db.query(User).filter(User.id == student_id, User.role == 'STUDENT').first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    notes = db.query(InstructorNote).filter(InstructorNote.student_id == student_id).order_by(InstructorNote.created_at.desc()).all()
    
    # Add instructor username to response
    response_notes = []
    for note in notes:
        instructor = db.query(User).filter(User.id == note.instructor_id).first()
        response_notes.append(InstructorNoteResponse(
            id=note.id,
            instructor_id=note.instructor_id,
            student_id=note.student_id,
            note_text=note.note_text,
            is_flagged=note.is_flagged,
            created_at=note.created_at,
            updated_at=note.updated_at,
            instructor_username=instructor.username if instructor else "Unknown"
        ))
    
    return response_notes

@router.post("/student/{student_id}/notes", response_model=InstructorNoteResponse)
async def add_student_note(
    student_id: int,
    note_data: InstructorNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_instructor)
):
    """Add instructor note for a student - INSTRUCTOR ONLY"""
    
    # Verify student exists
    student = db.query(User).filter(User.id == student_id, User.role == 'STUDENT').first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Create new note
    new_note = InstructorNote(
        instructor_id=current_user.id,
        student_id=student_id,
        note_text=note_data.note_text,
        is_flagged=note_data.is_flagged
    )
    
    db.add(new_note)
    db.commit()
    db.refresh(new_note)
    
    return InstructorNoteResponse(
        id=new_note.id,
        instructor_id=new_note.instructor_id,
        student_id=new_note.student_id,
        note_text=new_note.note_text,
        is_flagged=new_note.is_flagged,
        created_at=new_note.created_at,
        updated_at=new_note.updated_at,
        instructor_username=current_user.username
    )

@router.get("/student/{student_id}/journal")
async def get_student_journal_entries(
    student_id: int,
    limit: int = Query(100, le=1000),
    offset: int = Query(0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_instructor)
):
    """Get all journal entries for a student - INSTRUCTOR ONLY"""
    
    # Verify student exists
    student = db.query(User).filter(User.id == student_id, User.role == 'STUDENT').first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    
    # Get all position IDs for this student
    position_ids = db.query(TradingPosition.id).filter(TradingPosition.user_id == student_id).all()
    position_ids = [pid[0] for pid in position_ids]
    
    # Get journal entries for those positions
    journal_entries = db.query(TradingPositionJournalEntry).filter(
        TradingPositionJournalEntry.position_id.in_(position_ids)
    ).order_by(TradingPositionJournalEntry.entry_date.desc()).offset(offset).limit(limit).all()
    
    # Add position ticker to each entry for context
    entries_with_context = []
    for entry in journal_entries:
        position = db.query(TradingPosition).filter(TradingPosition.id == entry.position_id).first()
        entry_dict = {
            "id": entry.id,
            "position_id": entry.position_id,
            "ticker": position.ticker if position else "Unknown",
            "entry_date": entry.entry_date,
            "entry_type": entry.entry_type,
            "content": entry.content,
            "attached_images": entry.attached_images,
            "attached_charts": entry.attached_charts,
            "created_at": entry.created_at,
            "updated_at": entry.updated_at
        }
        entries_with_context.append(entry_dict)
    
    return entries_with_context

@router.get("/student/{student_id}/position/{position_id}/journal")
async def get_student_position_journal(
    student_id: int,
    position_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_instructor)
):
    """Get journal entries for a specific position - INSTRUCTOR ONLY"""
    
    # Verify student exists and owns the position
    position = db.query(TradingPosition).filter(
        TradingPosition.id == position_id,
        TradingPosition.user_id == student_id
    ).first()
    
    if not position:
        raise HTTPException(status_code=404, detail="Position not found for this student")
    
    # Get journal entries for this position
    journal_entries = db.query(TradingPositionJournalEntry).filter(
        TradingPositionJournalEntry.position_id == position_id
    ).order_by(TradingPositionJournalEntry.entry_date.desc()).all()
    
    return journal_entries

@router.get("/student/{student_id}/position/{position_id}/details")
async def get_student_position_details(
    student_id: int,
    position_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_instructor)
):
    """Get complete position details including events and journal entries - INSTRUCTOR ONLY"""
    
    # Verify student exists and owns the position
    position = db.query(TradingPosition).filter(
        TradingPosition.id == position_id,
        TradingPosition.user_id == student_id
    ).first()
    
    if not position:
        raise HTTPException(status_code=404, detail="Position not found for this student")
    
    # Get all events for this position
    events = db.query(TradingPositionEvent).filter(
        TradingPositionEvent.position_id == position_id
    ).order_by(TradingPositionEvent.event_date.desc()).all()
    
    # Get journal entries for this position
    journal_entries = db.query(TradingPositionJournalEntry).filter(
        TradingPositionJournalEntry.position_id == position_id
    ).order_by(TradingPositionJournalEntry.entry_date.desc()).all()
    
    # Get charts for this position
    charts = db.query(TradingPositionChart).filter(
        TradingPositionChart.position_id == position_id
    ).all()
    
    return {
        "position": position,
        "events": events,
        "journal_entries": journal_entries,
        "charts": charts
    }

@router.get("/analytics/class-overview")
async def get_class_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_instructor)
):
    """Get class-wide analytics - INSTRUCTOR ONLY"""
    
    # Get all students (including NULL roles as they default to STUDENT)
    students = db.query(User).filter(
        (User.role == 'STUDENT') | (User.role.is_(None))
    ).all()
    total_students = len(students)
    
    # Get all student positions
    all_positions = db.query(TradingPosition).filter(
        TradingPosition.user_id.in_([s.id for s in students])
    ).all()
    
    # Calculate class metrics
    total_positions = len(all_positions)
    open_positions = len([p for p in all_positions if p.status == 'OPEN'])
    total_pnl = sum(p.total_realized_pnl or 0 for p in all_positions)
    
    # Active students (traded in last 30 days)
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    active_student_ids = set()
    
    for position in all_positions:
        recent_events = db.query(TradingPositionEvent).filter(
            TradingPositionEvent.position_id == position.id,
            TradingPositionEvent.event_date >= thirty_days_ago
        ).first()
        if recent_events:
            active_student_ids.add(position.user_id)
    
    active_students = len(active_student_ids)
    
    # Students with flags
    flagged_students = db.query(InstructorNote).filter(InstructorNote.is_flagged == True).distinct(InstructorNote.student_id).count()
    
    return {
        "total_students": total_students,
        "active_students": active_students,
        "total_positions": total_positions,
        "open_positions": open_positions,
        "total_class_pnl": total_pnl,
        "flagged_students": flagged_students,
        "average_pnl_per_student": total_pnl / total_students if total_students > 0 else 0
    }

# Test endpoint at the end to see if it gets registered
@router.get("/test")
async def test_endpoint():
    """Simple test endpoint"""
    return {"status": "Admin routes working", "message": "This is a test"}