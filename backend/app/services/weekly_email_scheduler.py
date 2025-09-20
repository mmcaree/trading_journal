#!/usr/bin/env python3
"""
Weekly Email Scheduler for TradeJournal
Sends weekly trading summaries every Monday morning in user's local timezone
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session
import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.db.session import get_db
from app.models.models import User
from app.services.email_service import email_service
from app.services.weekly_analytics_service import get_weekly_analytics_service

logger = logging.getLogger(__name__)


class WeeklyEmailScheduler:
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self.db = None
        
    async def start(self):
        """Start the weekly email scheduler"""
        # Schedule weekly emails to run every Monday at different times for different timezones
        # This spreads the load and ensures emails are sent in the morning of each timezone
        
        # Schedule for major US timezones
        timezones = [
            ('America/New_York', 9),      # EST/EDT - 9 AM
            ('America/Chicago', 9),       # CST/CDT - 9 AM  
            ('America/Denver', 9),        # MST/MDT - 9 AM
            ('America/Los_Angeles', 9),   # PST/PDT - 9 AM
            ('America/Phoenix', 9),       # MST (no DST) - 9 AM
        ]
        
        for timezone, hour in timezones:
            self.scheduler.add_job(
                func=self.send_weekly_emails_for_timezone,
                trigger=CronTrigger(
                    day_of_week='mon',
                    hour=hour,
                    minute=0,
                    timezone=timezone
                ),
                args=[timezone],
                id=f'weekly_email_{timezone.replace("/", "_")}',
                replace_existing=True,
                misfire_grace_time=3600  # Allow 1 hour grace period
            )
        
        # Start the scheduler
        self.scheduler.start()
        logger.info("Weekly email scheduler started")
        
    async def stop(self):
        """Stop the weekly email scheduler"""
        if self.scheduler.running:
            self.scheduler.shutdown()
            logger.info("Weekly email scheduler stopped")
    
    async def send_weekly_emails_for_timezone(self, timezone: str):
        """Send weekly emails for all users in a specific timezone"""
        logger.info(f"Starting weekly email send for timezone: {timezone}")
        
        try:
            # Get database session
            db = next(get_db())
            
            # Get all users who have weekly emails enabled and are in this timezone
            users = db.query(User).filter(
                User.weekly_email_enabled == True,
                User.is_active == True,
                User.timezone == timezone
            ).all()
            
            logger.info(f"Found {len(users)} users for weekly emails in {timezone}")
            
            # Send emails for each user
            for user in users:
                try:
                    await self.send_weekly_email_for_user(db, user)
                    logger.info(f"Weekly email sent successfully for user {user.username}")
                    
                    # Small delay to avoid overwhelming the email service
                    await asyncio.sleep(1)
                    
                except Exception as e:
                    logger.error(f"Failed to send weekly email for user {user.username}: {str(e)}")
                    continue
            
            db.close()
            logger.info(f"Completed weekly email send for timezone: {timezone}")
            
        except Exception as e:
            logger.error(f"Error in weekly email scheduler for {timezone}: {str(e)}")
    
    async def send_weekly_email_for_user(self, db: Session, user: User):
        """Send weekly email for a specific user"""
        try:
            # Get weekly analytics
            analytics_service = get_weekly_analytics_service(db)
            weekly_stats = analytics_service.calculate_weekly_stats(
                user_id=user.id,
                user_timezone=user.timezone or 'America/New_York'
            )
            
            # Prepare user data
            user_data = {
                'username': user.username,
                'display_name': user.display_name,
                'email': user.email
            }
            
            # Send the email
            success = email_service.send_weekly_summary(
                user_email=user.email,
                user_data=user_data,
                trades_data=weekly_stats
            )
            
            if not success:
                raise Exception("Email service returned failure")
            
        except Exception as e:
            logger.error(f"Error sending weekly email for user {user.username}: {str(e)}")
            raise
    
    async def send_test_weekly_email(self, user_email: str, user_timezone: str = 'America/New_York'):
        """Send a test weekly email immediately"""
        try:
            db = next(get_db())
            
            # Find user by email
            user = db.query(User).filter(User.email == user_email).first()
            if not user:
                raise Exception(f"User not found with email: {user_email}")
            
            await self.send_weekly_email_for_user(db, user)
            db.close()
            
            return True
            
        except Exception as e:
            logger.error(f"Error sending test weekly email: {str(e)}")
            raise


# Global scheduler instance
weekly_email_scheduler = WeeklyEmailScheduler()


async def start_weekly_email_scheduler():
    """Start the weekly email scheduler"""
    await weekly_email_scheduler.start()


async def stop_weekly_email_scheduler():
    """Stop the weekly email scheduler"""
    await weekly_email_scheduler.stop()


async def send_test_weekly_email(user_email: str, user_timezone: str = 'America/New_York'):
    """Send a test weekly email"""
    return await weekly_email_scheduler.send_test_weekly_email(user_email, user_timezone)


# Manual trigger function for testing or running manually
async def trigger_weekly_emails_now(timezone: str = 'America/New_York'):
    """Manually trigger weekly emails for testing purposes"""
    await weekly_email_scheduler.send_weekly_emails_for_timezone(timezone)