#!/usr/bin/env python3
"""
Two-Factor Authentication service using TOTP (Time-based One-Time Password)
"""

import pyotp
import qrcode
import io
import base64
import json
import secrets
from typing import List, Tuple, Optional
from sqlalchemy.orm import Session

from app.models.models import User
from app.core.config import settings

class TwoFactorService:
    def __init__(self):
        self.app_name = getattr(settings, 'APP_NAME', 'SwingTrader')
        
    def generate_secret(self) -> str:
        """Generate a new TOTP secret"""
        return pyotp.random_base32()
    
    def generate_qr_code(self, user_email: str, secret: str) -> str:
        """Generate QR code for TOTP setup"""
        # Create TOTP URI
        totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
            name=user_email,
            issuer_name=self.app_name
        )
        
        # Generate QR code
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(totp_uri)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convert to base64 string
        img_buffer = io.BytesIO()
        img.save(img_buffer, format='PNG')
        img_str = base64.b64encode(img_buffer.getvalue()).decode()
        
        return img_str
    
    def generate_backup_codes(self, count: int = 10) -> List[str]:
        """Generate backup codes for 2FA recovery"""
        codes = []
        for _ in range(count):
            # Generate 8-character codes
            code = ''.join([secrets.choice('0123456789') for _ in range(8)])
            codes.append(f"{code[:4]}-{code[4:]}")
        return codes
    
    def verify_token(self, secret: str, token: str, window: int = 1) -> bool:
        """Verify a TOTP token"""
        try:
            totp = pyotp.TOTP(secret)
            return totp.verify(token, valid_window=window)
        except Exception:
            return False
    
    def verify_backup_code(self, user: User, code: str, db: Session) -> bool:
        """Verify and consume a backup code"""
        if not user.backup_codes:
            return False
        
        try:
            backup_codes = json.loads(user.backup_codes)
            code_clean = code.replace('-', '').replace(' ', '')
            
            for stored_code in backup_codes:
                stored_clean = stored_code.replace('-', '').replace(' ', '')
                if stored_clean == code_clean:
                    # Remove the used code
                    backup_codes.remove(stored_code)
                    user.backup_codes = json.dumps(backup_codes)
                    db.commit()
                    return True
            
            return False
        except (json.JSONDecodeError, ValueError):
            return False
    
    def setup_2fa(self, user: User, db: Session) -> Tuple[str, str, List[str]]:
        """Set up 2FA for a user and return secret, QR code, and backup codes"""
        # Generate new secret and backup codes
        secret = self.generate_secret()
        qr_code = self.generate_qr_code(user.email, secret)
        backup_codes = self.generate_backup_codes()
        
        # Store in database (but don't enable yet)
        user.two_factor_secret = secret
        user.backup_codes = json.dumps(backup_codes)
        # Note: two_factor_enabled remains False until verified
        
        db.commit()
        
        return secret, qr_code, backup_codes
    
    def enable_2fa(self, user: User, token: str, db: Session) -> bool:
        """Enable 2FA after verifying the setup token"""
        if not user.two_factor_secret:
            return False
        
        if self.verify_token(user.two_factor_secret, token):
            user.two_factor_enabled = True
            db.commit()
            return True
        
        return False
    
    def disable_2fa(self, user: User, db: Session) -> bool:
        """Disable 2FA for a user"""
        user.two_factor_enabled = False
        user.two_factor_secret = None
        user.backup_codes = None
        db.commit()
        return True
    
    def regenerate_backup_codes(self, user: User, db: Session) -> List[str]:
        """Regenerate backup codes for a user"""
        if not user.two_factor_enabled:
            return []
        
        backup_codes = self.generate_backup_codes()
        user.backup_codes = json.dumps(backup_codes)
        db.commit()
        
        return backup_codes

# Create global instance
two_factor_service = TwoFactorService()