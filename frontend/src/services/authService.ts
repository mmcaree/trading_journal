// src/services/authService.ts
import api from './apiConfig';
import { 
  User, 
  LoginData, 
  RegisterData, 
  AuthResponse,
  AxiosErrorResponse 
} from '../types/api';

// Re-export types for backward compatibility
export type { User, LoginData, RegisterData, AuthResponse };

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
  } catch (error) {
    const axiosError = error as AxiosErrorResponse;
    console.error('Login error:', axiosError);
    if (axiosError.response?.status === 401) {
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
  } catch (error) {
    const axiosError = error as AxiosErrorResponse;
    console.error('Registration error:', axiosError);
    if (axiosError.response?.status === 400) {
      throw new Error(axiosError.response.data.detail || 'Registration failed');
    }
    throw new Error('Registration failed. Please try again.');
  }
};

// Get current user profile
export const getCurrentUser = async (): Promise<User> => {
  try {
    const response = await api.get('/api/users/me');
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosErrorResponse;
    console.error('Get current user error:', axiosError);
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
