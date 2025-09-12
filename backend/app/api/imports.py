#!/usr/bin/env python3
"""
API routes for trade data import
"""

import os
import tempfile
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_current_user
from app.services.import_service import TradeImportService
from app.models.models import User
from app.models.import_models import ImportBatch, ImportedOrder

router = APIRouter(prefix="/api/import", tags=["import"])

@router.post("/csv")
async def import_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Import trade data from CSV file
    """
    
    # Validate file type
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are supported"
        )
    
    # Check file size (10MB limit)
    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size too large. Maximum 10MB allowed."
        )
    
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.csv') as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name
        
        # Import the CSV
        import_service = TradeImportService(db)
        import_batch = import_service.import_csv_file(
            user_id=current_user.id,
            file_path=temp_file_path,
            filename=file.filename
        )
        
        # Clean up temp file
        os.unlink(temp_file_path)
        
        return {
            "success": True,
            "batch_id": import_batch.batch_id,
            "filename": import_batch.filename,
            "total_orders": import_batch.total_orders,
            "filled_orders": import_batch.filled_orders,
            "pending_orders": import_batch.pending_orders,
            "cancelled_orders": import_batch.cancelled_orders,
            "failed_orders": import_batch.failed_orders,
            "message": f"Successfully imported {import_batch.total_orders} orders"
        }
        
    except Exception as e:
        # Clean up temp file on error
        if 'temp_file_path' in locals():
            try:
                os.unlink(temp_file_path)
            except:
                pass
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to import CSV: {str(e)}"
        )

@router.post("/process/{batch_id}")
async def process_import_batch(
    batch_id: str,
    account_size: Optional[float] = 10000,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Process imported orders into positions and trades
    account_size: Account size for risk calculations (default: 10000)
    """
    
    # Verify batch belongs to user
    import_batch = db.query(ImportBatch).filter(
        ImportBatch.batch_id == batch_id,
        ImportBatch.user_id == current_user.id
    ).first()
    
    if not import_batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Import batch not found"
        )
    
    try:
        import_service = TradeImportService(db)
        results = import_service.process_orders_to_positions(
            user_id=current_user.id,
            batch_id=batch_id,
            account_size=account_size or 10000
        )
        
        # Mark batch as completed
        import_batch.completed_at = import_service.db.query(ImportBatch).filter(
            ImportBatch.batch_id == batch_id
        ).first().created_at  # This should be datetime.utcnow()
        
        from datetime import datetime
        import_batch.completed_at = datetime.utcnow()
        db.commit()
        
        return {
            "success": True,
            "batch_id": batch_id,
            "results": results,
            "message": f"Processed {results['orders_processed']} orders into {results['positions_created']} new positions and {results['trades_created']} trades"
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process import batch: {str(e)}"
        )

@router.get("/batches")
async def get_import_batches(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get all import batches for current user
    """
    
    try:
        import_service = TradeImportService(db)
        summary = import_service.get_import_summary(user_id=current_user.id)
        
        return {
            "success": True,
            "data": summary
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve import batches: {str(e)}"
        )

@router.get("/batches/{batch_id}")
async def get_import_batch_details(
    batch_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get detailed information about a specific import batch
    """
    
    # Verify batch belongs to user
    import_batch = db.query(ImportBatch).filter(
        ImportBatch.batch_id == batch_id,
        ImportBatch.user_id == current_user.id
    ).first()
    
    if not import_batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Import batch not found"
        )
    
    try:
        import_service = TradeImportService(db)
        summary = import_service.get_import_summary(
            user_id=current_user.id,
            batch_id=batch_id
        )
        
        # Get sample of orders from this batch
        orders = db.query(ImportedOrder).filter(
            ImportedOrder.import_batch_id == batch_id
        ).limit(10).all()
        
        summary["sample_orders"] = [
            {
                "symbol": order.symbol,
                "side": order.side,
                "status": order.status,
                "filled_qty": order.filled_qty,
                "avg_price": order.avg_price,
                "placed_time": order.placed_time.isoformat() if order.placed_time else None,
                "processed": order.processed
            }
            for order in orders
        ]
        
        return {
            "success": True,
            "data": summary
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve batch details: {str(e)}"
        )

@router.delete("/batches/{batch_id}")
async def delete_import_batch(
    batch_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Delete an import batch and all related data
    """
    
    # Verify batch belongs to user
    import_batch = db.query(ImportBatch).filter(
        ImportBatch.batch_id == batch_id,
        ImportBatch.user_id == current_user.id
    ).first()
    
    if not import_batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Import batch not found"
        )
    
    try:
        # Delete all orders in this batch
        db.query(ImportedOrder).filter(
            ImportedOrder.import_batch_id == batch_id
        ).delete()
        
        # Delete the batch
        db.delete(import_batch)
        db.commit()
        
        return {
            "success": True,
            "message": f"Import batch {batch_id} deleted successfully"
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete import batch: {str(e)}"
        )

@router.get("/orders/{batch_id}")
async def get_batch_orders(
    batch_id: str,
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Get orders from a specific import batch with pagination
    """
    
    # Verify batch belongs to user
    import_batch = db.query(ImportBatch).filter(
        ImportBatch.batch_id == batch_id,
        ImportBatch.user_id == current_user.id
    ).first()
    
    if not import_batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Import batch not found"
        )
    
    try:
        # Get total count
        total = db.query(ImportedOrder).filter(
            ImportedOrder.import_batch_id == batch_id
        ).count()
        
        # Get paginated orders
        orders = db.query(ImportedOrder).filter(
            ImportedOrder.import_batch_id == batch_id
        ).offset(skip).limit(limit).all()
        
        return {
            "success": True,
            "data": {
                "total": total,
                "skip": skip,
                "limit": limit,
                "orders": [
                    {
                        "id": order.id,
                        "symbol": order.symbol,
                        "company_name": order.company_name,
                        "side": order.side,
                        "status": order.status,
                        "filled_qty": order.filled_qty,
                        "total_qty": order.total_qty,
                        "price": order.price,
                        "avg_price": order.avg_price,
                        "time_in_force": order.time_in_force,
                        "placed_time": order.placed_time.isoformat() if order.placed_time else None,
                        "filled_time": order.filled_time.isoformat() if order.filled_time else None,
                        "processed": order.processed
                    }
                    for order in orders
                ]
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve orders: {str(e)}"
        )

@router.post("/detect-stop-losses")
async def detect_stop_losses(
    batch_id: Optional[str] = None,
    account_size: Optional[float] = 10000,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Detect and update stop losses for imported trades.
    Can analyze all trades or trades from a specific batch.
    account_size: Account size for risk calculations (default: 10000)
    """
    try:
        import_service = TradeImportService(db)
        results = import_service.detect_stop_losses_for_all_trades(
            user_id=current_user.id,
            batch_id=batch_id,
            account_size=account_size or 10000
        )
        
        return {
            "success": True,
            "data": {
                "stop_losses_detected": results["stop_losses_detected"],
                "trades_updated": results["trades_updated"],
                "total_trades_analyzed": results["total_trades_analyzed"],
                "message": f"Detected {results['stop_losses_detected']} stop losses and updated {results['trades_updated']} trades"
            }
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to detect stop losses: {str(e)}"
        )