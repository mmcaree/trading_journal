// src/services/userService.ts
import api from './apiConfig';
import { 
  User, 
  UserUpdateData, 
  ChangePasswordData, 
  UserExportData,
  ProfilePictureUploadResponse,
  AxiosErrorResponse 
} from '../types/api';

// Re-export types for backward compatibility
export type { UserUpdateData, ChangePasswordData };

// Get current user profile
export const getCurrentUser = async (): Promise<User> => {
  try {
    const response = await api.get('/api/users/me');
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosErrorResponse;
    console.error('Get current user error:', axiosError);
    throw new Error('Failed to get user profile. Please try again.');
  }
};

// Update user profile
export const updateProfile = async (userData: UserUpdateData): Promise<User> => {
  try {
    const response = await api.put('/api/users/me', userData);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosErrorResponse;
    console.error('Update profile error:', axiosError);
    if (axiosError.response?.status === 400) {
      throw new Error(axiosError.response.data.detail || 'Failed to update profile');
    }
    throw new Error('Failed to update profile. Please try again.');
  }
};

// Change password
export const changePassword = async (passwordData: ChangePasswordData): Promise<void> => {
  try {
    await api.put('/api/users/me/password', passwordData);
  } catch (error) {
    const axiosError = error as AxiosErrorResponse;
    console.error('Change password error:', axiosError);
    if (axiosError.response?.status === 400) {
      throw new Error(axiosError.response.data.detail || 'Failed to change password');
    }
    throw new Error('Failed to change password. Please try again.');
  }
};

// Export user data
export const exportUserData = async (): Promise<UserExportData> => {
  try {
    const response = await api.get('/api/users/me/export');
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosErrorResponse;
    console.error('Export user data error:', axiosError);
    throw new Error('Failed to export user data. Please try again.');
  }
};

// Delete user account
export const deleteUserAccount = async (): Promise<void> => {
  try {
    await api.delete('/api/users/me');
  } catch (error) {
    const axiosError = error as AxiosErrorResponse;
    console.error('Delete account error:', axiosError);
    throw new Error('Failed to delete account. Please try again.');
  }
};

// Clear all user data (but keep account)
export const clearAllUserData = async (): Promise<void> => {
  try {
    await api.delete('/api/users/me/data');
  } catch (error) {
    const axiosError = error as AxiosErrorResponse;
    console.error('Clear all data error:', axiosError);
    throw new Error('Failed to clear user data. Please try again.');
  }
};

// Clear only trade history (keep deposits/withdrawals and settings)
export const clearTradeHistory = async (): Promise<void> => {
  try {
    await api.delete('/api/users/me/trade-history');
  } catch (error) {
    const axiosError = error as AxiosErrorResponse;
    console.error('Clear trade history error:', axiosError);
    throw new Error('Failed to clear trade history. Please try again.');
  }
};

// Upload profile picture
export const uploadProfilePicture = async (file: File): Promise<ProfilePictureUploadResponse> => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post('/api/users/me/profile-picture', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosErrorResponse;
    console.error('Upload profile picture error:', axiosError);
    if (axiosError.response?.status === 400) {
      throw new Error(axiosError.response.data.detail || 'Failed to upload profile picture');
    }
    throw new Error('Failed to upload profile picture. Please try again.');
  }
};

// Delete profile picture
export const deleteProfilePicture = async (): Promise<void> => {
  try {
    await api.delete('/api/users/me/profile-picture');
  } catch (error) {
    const axiosError = error as AxiosErrorResponse;
    console.error('Delete profile picture error:', axiosError);
    if (axiosError.response?.status === 404) {
      throw new Error('No profile picture to delete');
    }
    throw new Error('Failed to delete profile picture. Please try again.');
  }
};