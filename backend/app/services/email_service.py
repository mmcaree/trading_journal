#!/usr/bin/env python3
"""
Email notification service for sending trading summaries and alerts
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import logging
from pathlib import Path
import os
from jinja2 import Template

from app.core.config import settings

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.smtp_server = getattr(settings, 'SMTP_SERVER', 'smtp.gmail.com')
        self.smtp_port = getattr(settings, 'SMTP_PORT', 587)
        self.smtp_username = getattr(settings, 'SMTP_USERNAME', '')
        self.smtp_password = getattr(settings, 'SMTP_PASSWORD', '')
        self.from_email = getattr(settings, 'FROM_EMAIL', self.smtp_username)
        
    def send_email(self, to_email: str, subject: str, body: str, is_html: bool = True) -> bool:
        """Send an email"""
        try:
            msg = MIMEMultipart('alternative')
            msg['From'] = self.from_email
            msg['To'] = to_email
            msg['Subject'] = subject
            
            if is_html:
                msg.attach(MIMEText(body, 'html'))
            else:
                msg.attach(MIMEText(body, 'plain'))
            
            # Connect to server and send email
            server = smtplib.SMTP(self.smtp_server, self.smtp_port)
            server.starttls()
            server.login(self.smtp_username, self.smtp_password)
            
            text = msg.as_string()
            server.sendmail(self.from_email, to_email, text)
            server.quit()
            
            logger.info(f"Email sent successfully to {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False
    
    def generate_daily_summary_html(self, user_data: Dict[str, Any], trades_data: Dict[str, Any]) -> str:
        """Generate HTML for daily trading summary"""
        template_str = """
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .header { background-color: #1976d2; color: white; padding: 20px; margin: -30px -30px 30px; border-radius: 10px 10px 0 0; }
                .stats { display: flex; justify-content: space-between; margin: 20px 0; }
                .stat-box { text-align: center; padding: 15px; background-color: #f8f9fa; border-radius: 8px; flex: 1; margin: 0 5px; }
                .stat-value { font-size: 24px; font-weight: bold; color: #1976d2; }
                .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
                .positive { color: #4caf50; }
                .negative { color: #f44336; }
                .trades-list { margin-top: 20px; }
                .trade-item { padding: 10px; border-left: 4px solid #1976d2; margin: 10px 0; background-color: #f8f9fa; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Daily Trading Summary</h1>
                    <p>{{ date }} - {{ user_name }}</p>
                </div>
                
                <div class="stats">
                    <div class="stat-box">
                        <div class="stat-value">{{ total_trades }}</div>
                        <div class="stat-label">Total Trades</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value {{ 'positive' if daily_pnl >= 0 else 'negative' }}">${{ "%.2f"|format(daily_pnl) }}</div>
                        <div class="stat-label">Daily P&L</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">{{ win_rate }}%</div>
                        <div class="stat-label">Win Rate</div>
                    </div>
                </div>
                
                {% if recent_trades %}
                <div class="trades-list">
                    <h3>Recent Trades</h3>
                    {% for trade in recent_trades %}
                    <div class="trade-item">
                        <strong>{{ trade.ticker }}</strong> - {{ trade.direction }}
                        <br>Entry: ${{ "%.2f"|format(trade.entry_price) }}
                        {% if trade.exit_price %}
                        | Exit: ${{ "%.2f"|format(trade.exit_price) }}
                        | P&L: <span class="{{ 'positive' if trade.profit_loss >= 0 else 'negative' }}">${{ "%.2f"|format(trade.profit_loss) }}</span>
                        {% endif %}
                    </div>
                    {% endfor %}
                </div>
                {% endif %}
                
                <div class="footer">
                    <p>This email was sent from your SwingTrader account. You can update your notification preferences in Settings.</p>
                    <p><a href="{{ app_url }}/settings">Manage Notifications</a> | <a href="{{ app_url }}">Open SwingTrader</a></p>
                </div>
            </div>
        </body>
        </html>
        """
        
        template = Template(template_str)
        return template.render(
            date=datetime.now().strftime("%B %d, %Y"),
            user_name=user_data.get('display_name') or user_data.get('username', 'Trader'),
            total_trades=trades_data.get('total_trades', 0),
            daily_pnl=trades_data.get('daily_pnl', 0),
            win_rate=trades_data.get('win_rate', 0),
            recent_trades=trades_data.get('recent_trades', []),
            app_url=getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
        )
    
    def generate_weekly_summary_html(self, user_data: Dict[str, Any], trades_data: Dict[str, Any]) -> str:
        """Generate HTML for weekly trading summary"""
        template_str = """
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                .header { background-color: #1976d2; color: white; padding: 20px; margin: -30px -30px 30px; border-radius: 10px 10px 0 0; }
                .stats { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
                .stat-box { text-align: center; padding: 15px; background-color: #f8f9fa; border-radius: 8px; }
                .stat-value { font-size: 20px; font-weight: bold; color: #1976d2; }
                .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
                .positive { color: #4caf50; }
                .negative { color: #f44336; }
                .insights { margin: 20px 0; padding: 15px; background-color: #e3f2fd; border-radius: 8px; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Weekly Trading Summary</h1>
                    <p>{{ week_range }} - {{ user_name }}</p>
                </div>
                
                <div class="stats">
                    <div class="stat-box">
                        <div class="stat-value">{{ total_trades }}</div>
                        <div class="stat-label">Total Trades</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value {{ 'positive' if weekly_pnl >= 0 else 'negative' }}">${{ "%.2f"|format(weekly_pnl) }}</div>
                        <div class="stat-label">Weekly P&L</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">{{ win_rate }}%</div>
                        <div class="stat-label">Win Rate</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">{{ avg_holding_time }}</div>
                        <div class="stat-label">Avg Hold Time</div>
                    </div>
                </div>
                
                {% if insights %}
                <div class="insights">
                    <h3>Weekly Insights</h3>
                    <ul>
                    {% for insight in insights %}
                        <li>{{ insight }}</li>
                    {% endfor %}
                    </ul>
                </div>
                {% endif %}
                
                <div class="footer">
                    <p>This email was sent from your SwingTrader account. You can update your notification preferences in Settings.</p>
                    <p><a href="{{ app_url }}/settings">Manage Notifications</a> | <a href="{{ app_url }}">Open SwingTrader</a></p>
                </div>
            </div>
        </body>
        </html>
        """
        
        template = Template(template_str)
        
        # Calculate week range
        now = datetime.now()
        week_start = now - timedelta(days=now.weekday())
        week_end = week_start + timedelta(days=6)
        week_range = f"{week_start.strftime('%b %d')} - {week_end.strftime('%b %d, %Y')}"
        
        return template.render(
            week_range=week_range,
            user_name=user_data.get('display_name') or user_data.get('username', 'Trader'),
            total_trades=trades_data.get('total_trades', 0),
            weekly_pnl=trades_data.get('weekly_pnl', 0),
            win_rate=trades_data.get('win_rate', 0),
            avg_holding_time=trades_data.get('avg_holding_time', 'N/A'),
            insights=trades_data.get('insights', []),
            app_url=getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
        )
    
    def send_daily_summary(self, user_email: str, user_data: Dict[str, Any], trades_data: Dict[str, Any]) -> bool:
        """Send daily trading summary email"""
        subject = f"Daily Trading Summary - {datetime.now().strftime('%B %d, %Y')}"
        html_body = self.generate_daily_summary_html(user_data, trades_data)
        
        return self.send_email(user_email, subject, html_body, is_html=True)
    
    def send_weekly_summary(self, user_email: str, user_data: Dict[str, Any], trades_data: Dict[str, Any]) -> bool:
        """Send weekly trading summary email"""
        subject = f"Weekly Trading Summary - Week of {datetime.now().strftime('%B %d, %Y')}"
        html_body = self.generate_weekly_summary_html(user_data, trades_data)
        
        return self.send_email(user_email, subject, html_body, is_html=True)

# Create global instance
email_service = EmailService()