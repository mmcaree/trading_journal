// src/services/authService.ts
import api, { API_URL } from './apiConfig';

export interface User {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  created_at: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  bio?: string;
  profile_picture_url?: string;
  updated_at?: string;
  timezone?: string;
  
  // Notification settings
  email_notifications_enabled?: boolean;
  daily_email_enabled?: boolean;
  daily_email_time?: string;
  weekly_email_enabled?: boolean;
  weekly_email_time?: string;
  
  // 2FA status
  two_factor_enabled?: boolean;
  
  // Trading settings
  default_account_size?: number;
}

export interface LoginData {
  username: string;
  password: string;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

// Login user and return token
export const login = async (username: string, password: string): Promise<AuthResponse> => {
  try {
    // FastAPI expects URL-encoded form data for OAuth2PasswordRequestForm
    const params = new URLSearchParams();
    params.append('username', username);
    params.append('password', password);
    
    const response = await api.post('/api/auth/login', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    
    return response.data;
  } catch (error: any) {
    console.error('Login error:', error);
    if (error.response?.status === 401) {
      throw new Error('Invalid username or password');
    }
    throw new Error('Login failed. Please try again.');
  }
};

// Register new user
export const register = async (userData: RegisterData): Promise<User> => {
  try {
    const response = await api.post('/api/auth/register', userData);
    return response.data;
  } catch (error: any) {
    console.error('Registration error:', error);
    if (error.response?.status === 400) {
      throw new Error(error.response.data.detail || 'Registration failed');
    }
    throw new Error('Registration failed. Please try again.');
  }
};

// Get current user profile
export const getCurrentUser = async (): Promise<User> => {
  try {
    const response = await api.get('/api/users/me');
    return response.data;
  } catch (error: any) {
    console.error('Get current user error:', error);
    throw new Error('Failed to get user profile');
  }
};

// Token management
export const saveToken = (token: string): void => {
  localStorage.setItem('token', token);
};

export const getToken = (): string | null => {
  return localStorage.getItem('token');
};

export const removeToken = (): void => {
  localStorage.removeItem('token');
};

// Check if user is authenticated
export const isAuthenticated = (): boolean => {
  const token = getToken();
  return !!token;
};
