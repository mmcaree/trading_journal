#!/usr/bin/env python3
"""
Email notification service for sending trading summaries and alerts
Supports multiple email providers: SMTP, SendGrid, Resend, Mailgun
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
import requests
import json

from app.core.config import settings

logger = logging.getLogger(__name__)

class EmailService:
    def __init__(self):
        self.provider = getattr(settings, 'EMAIL_PROVIDER', 'smtp').lower()
        self.from_email = getattr(settings, 'FROM_EMAIL', 'noreply@tradejournal.trade')
        self.from_name = getattr(settings, 'FROM_NAME', 'TradeJournal')
        
        # SMTP settings
        self.smtp_server = getattr(settings, 'SMTP_SERVER', 'smtp.gmail.com')
        self.smtp_port = getattr(settings, 'SMTP_PORT', 587)
        self.smtp_username = getattr(settings, 'SMTP_USERNAME', '')
        self.smtp_password = getattr(settings, 'SMTP_PASSWORD', '')
        
        # API keys for transactional services
        self.sendgrid_api_key = getattr(settings, 'SENDGRID_API_KEY', '')
        self.resend_api_key = getattr(settings, 'RESEND_API_KEY', '')
        self.mailgun_api_key = getattr(settings, 'MAILGUN_API_KEY', '')
        self.mailgun_domain = getattr(settings, 'MAILGUN_DOMAIN', '')
        
    def send_email(self, to_email: str, subject: str, body: str, is_html: bool = True) -> bool:
        """Send an email using the configured provider"""
        try:
            if self.provider == 'sendgrid':
                return self._send_sendgrid(to_email, subject, body, is_html)
            elif self.provider == 'resend':
                return self._send_resend(to_email, subject, body, is_html)
            elif self.provider == 'mailgun':
                return self._send_mailgun(to_email, subject, body, is_html)
            else:
                return self._send_smtp(to_email, subject, body, is_html)
        except Exception as e:
            logger.error(f"Failed to send email via {self.provider}: {str(e)}")
            return False
    
    def _send_smtp(self, to_email: str, subject: str, body: str, is_html: bool = True) -> bool:
        """Send email via SMTP"""
        msg = MIMEMultipart('alternative')
        msg['From'] = f"{self.from_name} <{self.from_email}>"
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
        
        logger.info(f"Email sent successfully via SMTP to {to_email}")
        return True
    
    def _send_sendgrid(self, to_email: str, subject: str, body: str, is_html: bool = True) -> bool:
        """Send email via SendGrid API"""
        url = "https://api.sendgrid.com/v3/mail/send"
        
        payload = {
            "personalizations": [{
                "to": [{"email": to_email}],
                "subject": subject
            }],
            "from": {
                "email": self.from_email,
                "name": self.from_name
            },
            "content": [{
                "type": "text/html" if is_html else "text/plain",
                "value": body
            }]
        }
        
        headers = {
            "Authorization": f"Bearer {self.sendgrid_api_key}",
            "Content-Type": "application/json"
        }
        
        response = requests.post(url, headers=headers, json=payload)
        
        if response.status_code == 202:
            logger.info(f"Email sent successfully via SendGrid to {to_email}")
            return True
        else:
            logger.error(f"SendGrid API error: {response.status_code} - {response.text}")
            return False
    
    def _send_resend(self, to_email: str, subject: str, body: str, is_html: bool = True) -> bool:
        """Send email via Resend API"""
        url = "https://api.resend.com/emails"
        
        payload = {
            "from": f"{self.from_name} <{self.from_email}>",
            "to": [to_email],
            "subject": subject,
            "html" if is_html else "text": body
        }
        
        headers = {
            "Authorization": f"Bearer {self.resend_api_key}",
            "Content-Type": "application/json"
        }
        
        response = requests.post(url, headers=headers, json=payload)
        
        if response.status_code == 200:
            logger.info(f"Email sent successfully via Resend to {to_email}")
            return True
        else:
            logger.error(f"Resend API error: {response.status_code} - {response.text}")
            return False
    
    def _send_mailgun(self, to_email: str, subject: str, body: str, is_html: bool = True) -> bool:
        """Send email via Mailgun API"""
        url = f"https://api.mailgun.net/v3/{self.mailgun_domain}/messages"
        
        data = {
            "from": f"{self.from_name} <{self.from_email}>",
            "to": [to_email],
            "subject": subject,
        }
        
        if is_html:
            data["html"] = body
        else:
            data["text"] = body
        
        response = requests.post(
            url,
            auth=("api", self.mailgun_api_key),
            data=data
        )
        
        if response.status_code == 200:
            logger.info(f"Email sent successfully via Mailgun to {to_email}")
            return True
        else:
            logger.error(f"Mailgun API error: {response.status_code} - {response.text}")
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
                    <p>This email was sent from your TradeJournal account. You can update your notification preferences in Settings.</p>
                    <p><a href="{{ app_url }}/settings">Manage Notifications</a> | <a href="{{ app_url }}">Open TradeJournal</a></p>
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
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f7fa; }
                .container { max-width: 650px; margin: 0 auto; background-color: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden; }
                .header { background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%); color: white; padding: 30px; text-align: center; }
                .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
                .header p { margin: 10px 0 0; opacity: 0.9; font-size: 16px; }
                
                .overview { padding: 30px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); }
                .overview h2 { margin: 0 0 20px; color: #1976d2; font-size: 20px; }
                .main-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
                .stat-card { background: white; padding: 20px; border-radius: 10px; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.05); }
                .stat-value { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
                .stat-label { font-size: 13px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
                .positive { color: #4caf50; }
                .negative { color: #f44336; }
                .neutral { color: #1976d2; }
                
                .secondary-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; }
                .secondary-stat { background: white; padding: 15px; border-radius: 8px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
                .secondary-stat .value { font-size: 18px; font-weight: 600; color: #1976d2; }
                .secondary-stat .label { font-size: 11px; color: #666; text-transform: uppercase; margin-top: 3px; }
                
                .section { padding: 25px 30px; border-bottom: 1px solid #e9ecef; }
                .section:last-child { border-bottom: none; }
                .section h3 { margin: 0 0 15px; color: #1976d2; font-size: 18px; }
                
                .performance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                .performance-item { background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #1976d2; }
                .performance-item h4 { margin: 0 0 8px; font-size: 14px; color: #333; }
                .performance-item .metric { display: flex; justify-content: space-between; margin: 5px 0; }
                .performance-item .metric span:first-child { color: #666; font-size: 12px; }
                .performance-item .metric span:last-child { font-weight: 600; }
                
                .top-trades { margin-top: 15px; }
                .trade-item { background: #f8f9fa; padding: 12px 15px; margin: 8px 0; border-radius: 6px; display: flex; justify-content: space-between; align-items: center; }
                .trade-info { flex: 1; }
                .trade-ticker { font-weight: bold; color: #1976d2; }
                .trade-details { font-size: 12px; color: #666; margin-top: 2px; }
                .trade-pnl { font-weight: bold; font-size: 14px; }
                
                .insights { background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); padding: 20px; border-radius: 10px; margin: 15px 0; }
                .insights h3 { margin: 0 0 12px; color: #1976d2; }
                .insights ul { margin: 0; padding-left: 18px; }
                .insights li { margin: 6px 0; color: #333; line-height: 1.4; }
                
                .motivational { background: linear-gradient(135deg, #4caf50 0%, #66bb6a 100%); color: white; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0; }
                .motivational h3 { margin: 0 0 8px; }
                .motivational p { margin: 0; opacity: 0.95; }
                
                .footer { background: #f8f9fa; padding: 25px 30px; text-align: center; color: #666; }
                .footer a { color: #1976d2; text-decoration: none; margin: 0 10px; }
                .footer a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>📊 Weekly Trading Report</h1>
                    <p>{{ week_range }} • {{ user_name }}</p>
                </div>
                
                <div class="overview">
                    <h2>Week Overview</h2>
                    <div class="main-stats">
                        <div class="stat-card">
                            <div class="stat-value neutral">{{ total_trades }}</div>
                            <div class="stat-label">Total Trades</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value {{ 'positive' if weekly_pnl >= 0 else 'negative' }}">${{ "%.2f"|format(weekly_pnl) }}</div>
                            <div class="stat-label">Weekly P&L</div>
                        </div>
                    </div>
                    
                    <div class="secondary-stats">
                        <div class="secondary-stat">
                            <div class="value">{{ win_rate }}%</div>
                            <div class="label">Win Rate</div>
                        </div>
                        <div class="secondary-stat">
                            <div class="value">${{ "%.2f"|format(largest_win) }}</div>
                            <div class="label">Best Trade</div>
                        </div>
                        <div class="secondary-stat">
                            <div class="value">${{ "%.2f"|format(largest_loss) }}</div>
                            <div class="label">Worst Loss</div>
                        </div>
                    </div>
                </div>
                
                {% if total_trades > 0 %}
                <div class="section">
                    <h3>📈 Performance Analysis</h3>
                    <div class="performance-grid">
                        <div class="performance-item">
                            <h4>Risk Management</h4>
                            <div class="metric">
                                <span>Avg Risk per Trade</span>
                                <span>${{ "%.2f"|format(avg_risk) }}</span>
                            </div>
                            <div class="metric">
                                <span>Total Risk Taken</span>
                                <span>${{ "%.2f"|format(total_risk_taken) }}</span>
                            </div>
                            <div class="metric">
                                <span>Profit Factor</span>
                                <span>{{ "%.2f"|format(profit_factor) if profit_factor != "inf" else "∞" }}</span>
                            </div>
                        </div>
                        
                        <div class="performance-item">
                            <h4>Trade Metrics</h4>
                            <div class="metric">
                                <span>Avg Holding Time</span>
                                <span>{{ avg_holding_time }}</span>
                            </div>
                            <div class="metric">
                                <span>Avg Win</span>
                                <span class="positive">${{ "%.2f"|format(avg_win) }}</span>
                            </div>
                            <div class="metric">
                                <span>Avg Loss</span>
                                <span class="negative">${{ "%.2f"|format(avg_loss) }}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                {% if strategy_performance %}
                <div class="section">
                    <h3>🎯 Strategy Performance</h3>
                    {% for strategy in strategy_performance[:3] %}
                    <div class="performance-item" style="margin-bottom: 10px;">
                        <h4>{{ strategy.strategy }}</h4>
                        <div class="metric">
                            <span>Trades: {{ strategy.trades }}</span>
                            <span class="{{ 'positive' if strategy.pnl >= 0 else 'negative' }}">${{ "%.2f"|format(strategy.pnl) }}</span>
                        </div>
                        <div class="metric">
                            <span>Win Rate</span>
                            <span>{{ strategy.win_rate }}%</span>
                        </div>
                    </div>
                    {% endfor %}
                </div>
                {% endif %}
                
                {% if trades_data %}
                <div class="section">
                    <h3>🏆 Top Trades</h3>
                    <div class="top-trades">
                        {% for trade in trades_data[:5] %}
                        <div class="trade-item">
                            <div class="trade-info">
                                <div class="trade-ticker">${{ trade.ticker }} • {{ trade.direction }}</div>
                                <div class="trade-details">
                                    {{ trade.entry_date }} → {{ trade.exit_date }} • {{ trade.strategy or 'No Strategy' }}
                                </div>
                            </div>
                            <div class="trade-pnl {{ 'positive' if trade.profit_loss >= 0 else 'negative' }}">
                                ${{ "%.2f"|format(trade.profit_loss) }}
                                {% if trade.profit_loss_percent %}
                                <br><small>({{ "%.1f"|format(trade.profit_loss_percent) }}%)</small>
                                {% endif %}
                            </div>
                        </div>
                        {% endfor %}
                    </div>
                </div>
                {% endif %}
                {% endif %}
                
                {% if insights %}
                <div class="section">
                    <div class="insights">
                        <h3>💡 Weekly Insights</h3>
                        <ul>
                        {% for insight in insights %}
                            <li>{{ insight }}</li>
                        {% endfor %}
                        </ul>
                    </div>
                </div>
                {% endif %}
                
                <div class="section">
                    {% if weekly_pnl >= 0 %}
                    <div class="motivational">
                        <h3>🎉 Great Week!</h3>
                        <p>You finished {{ "%.2f"|format(weekly_pnl) }}% ahead this week. Keep up the excellent work and maintain your discipline!</p>
                    </div>
                    {% else %}
                    <div class="motivational" style="background: linear-gradient(135deg, #ff9800 0%, #ffb74d 100%);">
                        <h3>📚 Learning Week</h3>
                        <p>Every setback is a setup for a comeback. Review your trades, learn from the losses, and come back stronger!</p>
                    </div>
                    {% endif %}
                </div>
                
                <div class="footer">
                    <p>This weekly summary was generated by your TradeJournal account.</p>
                    <p>
                        <a href="{{ app_url }}/analytics">View Full Analytics</a> | 
                        <a href="{{ app_url }}/settings">Manage Notifications</a> | 
                        <a href="{{ app_url }}">Open TradeJournal</a>
                    </p>
                </div>
            </div>
        </body>
        </html>
        """
        
        template = Template(template_str)
        
        return template.render(
            week_range=self._format_week_range(trades_data.get('week_start'), trades_data.get('week_end')),
            user_name=user_data.get('display_name') or user_data.get('username', 'Trader'),
            total_trades=trades_data.get('total_trades', 0),
            weekly_pnl=trades_data.get('weekly_pnl', 0),
            win_rate=trades_data.get('win_rate', 0),
            largest_win=trades_data.get('largest_win', 0),
            largest_loss=trades_data.get('largest_loss', 0),
            avg_win=trades_data.get('avg_win', 0),
            avg_loss=trades_data.get('avg_loss', 0),
            avg_risk=trades_data.get('avg_risk', 0),
            total_risk_taken=trades_data.get('total_risk_taken', 0),
            profit_factor=trades_data.get('profit_factor', 0),
            avg_holding_time=trades_data.get('avg_holding_time', 'N/A'),
            strategy_performance=trades_data.get('strategy_performance', []),
            setup_performance=trades_data.get('setup_performance', []),
            trades_data=trades_data.get('trades_data', []),
            insights=trades_data.get('insights', []),
            app_url=getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
        )
    
    def _format_week_range(self, week_start, week_end):
        """Format week range for display"""
        if not week_start or not week_end:
            return "Week Summary"
        
        start_str = week_start.strftime('%b %d')
        end_str = week_end.strftime('%b %d, %Y')
        return f"{start_str} - {end_str}"
    
    def send_daily_summary(self, user_email: str, user_data: Dict[str, Any], trades_data: Dict[str, Any]) -> bool:
        """Send daily trading summary email"""
        subject = f"Daily Trading Summary - {datetime.now().strftime('%B %d, %Y')}"
        html_body = self.generate_daily_summary_html(user_data, trades_data)
        
        return self.send_email(user_email, subject, html_body, is_html=True)
    
    def send_weekly_summary(self, user_email: str, user_data: Dict[str, Any], trades_data: Dict[str, Any]) -> bool:
        """Send weekly trading summary email"""
        # Format the week range for the subject
        week_start = trades_data.get('week_start')
        week_end = trades_data.get('week_end')
        
        if week_start and week_end:
            week_str = f"Week of {week_start.strftime('%B %d, %Y')}"
        else:
            week_str = f"Week of {datetime.now().strftime('%B %d, %Y')}"
        
        subject = f"Weekly Trading Summary - {week_str}"
        html_body = self.generate_weekly_summary_html(user_data, trades_data)
        
        return self.send_email(user_email, subject, html_body, is_html=True)
    
    def send_password_reset_email(self, user_email: str, user_name: str, reset_token: str) -> bool:
        """Send password reset email"""
        subject = "Reset Your TradeJournal Password"
        
        # Generate the reset URL
        frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:5173')
        reset_url = f"{frontend_url}/reset-password?token={reset_token}"
        
        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }}
                .container {{ max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
                .header {{ background-color: #1976d2; color: white; padding: 20px; margin: -30px -30px 30px; border-radius: 10px 10px 0 0; text-align: center; }}
                .content {{ line-height: 1.6; color: #333; }}
                .button {{ display: inline-block; padding: 12px 30px; background-color: #1976d2; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
                .button:hover {{ background-color: #1565c0; }}
                .warning {{ background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0; }}
                .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; text-align: center; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Password Reset Request</h1>
                </div>
                
                <div class="content">
                    <p>Hi {user_name},</p>
                    
                    <p>We received a request to reset your password for your TradeJournal account. If you made this request, click the button below to reset your password:</p>
                    
                    <div style="text-align: center;">
                        <a href="{reset_url}" class="button">Reset My Password</a>
                    </div>
                    
                    <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace;">{reset_url}</p>
                    
                    <div class="warning">
                        <strong>Important:</strong> This link will expire in 1 hour for security reasons. If you didn't request this password reset, you can safely ignore this email.
                    </div>
                    
                    <p>If you're having trouble resetting your password, please contact our support team.</p>
                    
                    <p>Best regards,<br>The TradeJournal Team</p>
                </div>
                
                <div class="footer">
                    <p>This email was sent from TradeJournal. If you didn't request this password reset, please ignore this email.</p>
                    <p><a href="{frontend_url}">Visit TradeJournal</a></p>
                </div>
            </div>
        </body>
        </html>
        """
        
        return self.send_email(user_email, subject, html_body, is_html=True)

# Create global instance
email_service = EmailService()
