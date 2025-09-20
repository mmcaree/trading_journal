// src/services/userService.ts
import api from './apiConfig';
import { User } from './authService';

export interface UserUpdateData {
  first_name?: string;
  last_name?: string;
  display_name?: string;
  bio?: string;
  email?: string;
  timezone?: string;
  default_account_size?: number;
}

export interface ChangePasswordData {
  current_password: string;
  new_password: string;
}

// Get current user profile
export const getCurrentUser = async (): Promise<User> => {
  try {
    const response = await api.get('/api/users/me');
    return response.data;
  } catch (error: any) {
    console.error('Get current user error:', error);
    throw new Error('Failed to get user profile. Please try again.');
  }
};

// Update user profile
export const updateProfile = async (userData: UserUpdateData): Promise<User> => {
  try {
    const response = await api.put('/api/users/me', userData);
    return response.data;
  } catch (error: any) {
    console.error('Update profile error:', error);
    if (error.response?.status === 400) {
      throw new Error(error.response.data.detail || 'Failed to update profile');
    }
    throw new Error('Failed to update profile. Please try again.');
  }
};

// Change password
export const changePassword = async (passwordData: ChangePasswordData): Promise<void> => {
  try {
    await api.put('/api/users/me/password', passwordData);
  } catch (error: any) {
    console.error('Change password error:', error);
    if (error.response?.status === 400) {
      throw new Error(error.response.data.detail || 'Failed to change password');
    }
    throw new Error('Failed to change password. Please try again.');
  }
};

// Export user data
export const exportUserData = async (): Promise<any> => {
  try {
    const response = await api.get('/api/users/me/export');
    return response.data;
  } catch (error: any) {
    console.error('Export user data error:', error);
    throw new Error('Failed to export user data. Please try again.');
  }
};

// Delete user account
export const deleteUserAccount = async (): Promise<void> => {
  try {
    await api.delete('/api/users/me');
  } catch (error: any) {
    console.error('Delete account error:', error);
    throw new Error('Failed to delete account. Please try again.');
  }
};

// Clear all user data (but keep account)
export const clearAllUserData = async (): Promise<void> => {
  try {
    await api.delete('/api/users/me/data');
  } catch (error: any) {
    console.error('Clear all data error:', error);
    throw new Error('Failed to clear user data. Please try again.');
  }
};