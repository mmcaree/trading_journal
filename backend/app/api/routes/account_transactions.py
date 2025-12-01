"""
Account Transactions API Routes
Manages deposits and withdrawals for accurate performance calculation
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app.db.session import get_db
from app.models.position_models import User, AccountTransaction
from app.models.schemas import (
    AccountTransactionCreate,
    AccountTransactionUpdate,
    AccountTransactionResponse
)
from app.api.deps import get_current_user

router = APIRouter()


@router.get("/", response_model=List[AccountTransactionResponse])
def get_account_transactions(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all account transactions for the current user"""
    query = db.query(AccountTransaction).filter(
        AccountTransaction.user_id == current_user.id
    )
    
    # Apply date filters if provided
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query = query.filter(AccountTransaction.transaction_date >= start_dt)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid start_date format"
            )
    
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query = query.filter(AccountTransaction.transaction_date <= end_dt)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid end_date format"
            )
    
    transactions = query.order_by(AccountTransaction.transaction_date.desc()).all()
    return transactions


@router.post("/", response_model=AccountTransactionResponse, status_code=status.HTTP_201_CREATED)
def create_account_transaction(
    transaction: AccountTransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new account transaction (deposit or withdrawal)"""
    
    # Validate amount is positive
    if transaction.amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Amount must be positive"
        )
    
    # Create transaction
    db_transaction = AccountTransaction(
        user_id=current_user.id,
        transaction_type=transaction.transaction_type,
        amount=transaction.amount,
        transaction_date=transaction.transaction_date,
        description=transaction.description
    )
    
    db.add(db_transaction)
    
    # Update user's current account balance
    if transaction.transaction_type == "DEPOSIT":
        if current_user.current_account_balance:
            current_user.current_account_balance += transaction.amount
        else:
            current_user.current_account_balance = transaction.amount
    else:  # WITHDRAWAL
        if current_user.current_account_balance:
            current_user.current_account_balance -= transaction.amount
        else:
            current_user.current_account_balance = -transaction.amount
    
    db.commit()
    db.refresh(db_transaction)
    
    return db_transaction


@router.get("/{transaction_id}", response_model=AccountTransactionResponse)
def get_account_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific account transaction"""
    transaction = db.query(AccountTransaction).filter(
        AccountTransaction.id == transaction_id,
        AccountTransaction.user_id == current_user.id
    ).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    return transaction


@router.put("/{transaction_id}", response_model=AccountTransactionResponse)
def update_account_transaction(
    transaction_id: int,
    transaction_update: AccountTransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update an account transaction"""
    transaction = db.query(AccountTransaction).filter(
        AccountTransaction.id == transaction_id,
        AccountTransaction.user_id == current_user.id
    ).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    # Store old values for balance adjustment
    old_type = transaction.transaction_type
    old_amount = transaction.amount
    
    # Update fields
    update_data = transaction_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(transaction, field, value)
    
    # Recalculate balance if amount or type changed
    if transaction_update.amount is not None or transaction_update.transaction_type is not None:
        # Reverse old transaction effect
        if old_type == "DEPOSIT":
            current_user.current_account_balance -= old_amount
        else:
            current_user.current_account_balance += old_amount
        
        # Apply new transaction effect
        if transaction.transaction_type == "DEPOSIT":
            current_user.current_account_balance += transaction.amount
        else:
            current_user.current_account_balance -= transaction.amount
    
    db.commit()
    db.refresh(transaction)
    
    return transaction


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete an account transaction"""
    transaction = db.query(AccountTransaction).filter(
        AccountTransaction.id == transaction_id,
        AccountTransaction.user_id == current_user.id
    ).first()
    
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    # Reverse transaction effect on balance
    if transaction.transaction_type == "DEPOSIT":
        current_user.current_account_balance -= transaction.amount
    else:
        current_user.current_account_balance += transaction.amount
    
    db.delete(transaction)
    db.commit()
    
    return None


@router.get("/summary/totals")
def get_transaction_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get summary of deposits and withdrawals"""
    query = db.query(AccountTransaction).filter(
        AccountTransaction.user_id == current_user.id
    )
    
    # Apply date filters
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query = query.filter(AccountTransaction.transaction_date >= start_dt)
        except ValueError:
            pass
    
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query = query.filter(AccountTransaction.transaction_date <= end_dt)
        except ValueError:
            pass
    
    transactions = query.all()
    
    total_deposits = sum(t.amount for t in transactions if t.transaction_type == "DEPOSIT")
    total_withdrawals = sum(t.amount for t in transactions if t.transaction_type == "WITHDRAWAL")
    net_flow = total_deposits - total_withdrawals
    
    return {
        "total_deposits": round(total_deposits, 2),
        "total_withdrawals": round(total_withdrawals, 2),
        "net_flow": round(net_flow, 2),
        "transaction_count": len(transactions)
    }
