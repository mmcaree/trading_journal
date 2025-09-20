// src/services/notificationService.ts
import api from './apiConfig';

export interface NotificationSettings {
  email_notifications_enabled: boolean;
  weekly_email_enabled: boolean;
  weekly_email_time?: string;
}

export interface TwoFactorSetup {
  secret: string;
  qr_code: string;
  backup_codes: string[];
}

// Update notification settings
export const updateNotificationSettings = async (settings: NotificationSettings) => {
  try {
    const response = await api.put('/api/users/me/notifications', settings);
    return response.data;
  } catch (error: any) {
    console.error('Update notification settings error:', error);
    if (error.response?.status === 400) {
      throw new Error(error.response.data.detail || 'Failed to update notification settings');
    }
    throw new Error('Failed to update notification settings. Please try again.');
  }
};

// 2FA Setup
export const setup2FA = async (): Promise<TwoFactorSetup> => {
  try {
    const response = await api.post('/api/users/me/2fa/setup');
    return response.data;
  } catch (error: any) {
    console.error('2FA setup error:', error);
    throw new Error('Failed to set up 2FA. Please try again.');
  }
};

// Verify 2FA setup
export const verify2FA = async (token: string): Promise<void> => {
  try {
    await api.post('/api/users/me/2fa/verify', { token });
  } catch (error: any) {
    console.error('2FA verification error:', error);
    if (error.response?.status === 400) {
      throw new Error(error.response.data.detail || 'Invalid verification code');
    }
    throw new Error('Failed to verify 2FA. Please try again.');
  }
};

// Disable 2FA
export const disable2FA = async (): Promise<void> => {
  try {
    await api.delete('/api/users/me/2fa');
  } catch (error: any) {
    console.error('2FA disable error:', error);
    throw new Error('Failed to disable 2FA. Please try again.');
  }
};

// Regenerate backup codes
export const regenerateBackupCodes = async (): Promise<string[]> => {
  try {
    const response = await api.post('/api/users/me/2fa/backup-codes');
    return response.data.backup_codes;
  } catch (error: any) {
    console.error('Regenerate backup codes error:', error);
    throw new Error('Failed to regenerate backup codes. Please try again.');
  }
};