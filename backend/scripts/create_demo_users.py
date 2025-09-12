#!/usr/bin/env python3
"""
Script to create demo users and prepare the app for production
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal, engine
from app.services.user_service import create_user, get_user_by_username
from app.models.schemas import UserCreate
from app.models.models import Base

def create_demo_users():
    """Create demo users for the application"""
    # First, create all tables
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)
    print("✓ Database tables created successfully")
    
    db = SessionLocal()
    
    demo_users = [
        {
            "username": "demo",
            "email": "demo@example.com",
            "password": "demo123"
        },
        {
            "username": "testuser",
            "email": "test@example.com", 
            "password": "test123"
        },
        {
            "username": "admin",
            "email": "admin@swingtrader.com",
            "password": "admin123"
        }
    ]
    
    created_users = []
    
    try:
        for user_data in demo_users:
            # Check if user already exists
            existing_user = get_user_by_username(db, user_data["username"])
            if existing_user:
                print(f"User '{user_data['username']}' already exists, skipping...")
                continue
                
            # Create the user
            try:
                new_user_data = UserCreate(**user_data)
                new_user = create_user(db, new_user_data)
                created_users.append(new_user)
                print(f"✓ Created user: {new_user.username} (ID: {new_user.id})")
            except Exception as e:
                print(f"✗ Failed to create user '{user_data['username']}': {str(e)}")
                
    except Exception as e:
        print(f"Database error: {str(e)}")
        db.rollback()
    finally:
        db.close()
    
    return created_users

def verify_demo_users():
    """Verify that demo users were created successfully"""
    db = SessionLocal()
    
    demo_usernames = ["demo", "testuser", "admin"]
    
    try:
        for username in demo_usernames:
            user = get_user_by_username(db, username)
            if user:
                print(f"✓ Verified user: {user.username} (ID: {user.id}, Email: {user.email})")
            else:
                print(f"✗ User not found: {username}")
    finally:
        db.close()

if __name__ == "__main__":
    print("Setting up demo users for SwingTrader...")
    print("=" * 50)
    
    # Create demo users
    created_users = create_demo_users()
    
    print("\nVerifying created users...")
    print("-" * 30)
    verify_demo_users()
    
    print(f"\nSetup complete! Created {len(created_users)} new users.")
    print("\nDemo login credentials:")
    print("Username: demo")
    print("Password: demo123")
    print("\nAdmin login credentials:")
    print("Username: admin") 
    print("Password: admin123")
