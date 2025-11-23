import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import * as authService from '../services/authService';
import { clearAllCache } from '../services/positionsService';
import type { User } from '../services/authService';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://localhost:8000');

interface RegisterData {
  username: string;
  email: string;
  password: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  register: (data: RegisterData) => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(authService.getToken());
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is already logged in
  useEffect(() => {
    const checkAuth = async () => {
      if (token) {
        try {
          const userData = await authService.getCurrentUser();
          setUser(userData);
        } catch (error) {
          console.error('Failed to fetch user:', error);
          authService.removeToken();
          setToken(null);
          setUser(null);
          // Clear cache on auth failure
          clearAllCache();
        }
      }
      setIsLoading(false);
    };

    checkAuth();
  }, [token]);

  const login = async (username: string, password: string) => {
    try {
      // CRITICAL: Clear cache before login to prevent cross-user data leakage
      clearAllCache();
      
      const authResponse = await authService.login(username, password);
      authService.saveToken(authResponse.access_token);
      setToken(authResponse.access_token);
      
      // Small delay to ensure localStorage is properly set
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Get user data after successful login
      const userData = await authService.getCurrentUser();
      setUser(userData);
      
      console.log('Login successful, cache cleared for new user:', userData.username);
    } catch (error) {
      console.error('Login error:', error);
      // Clear cache on login failure too
      clearAllCache();
      throw error;
    }
  };

  const logout = () => {
    authService.removeToken();
    setToken(null);
    setUser(null);
    // CRITICAL: Clear cache on logout to prevent data leakage
    clearAllCache();
    console.log('Logout successful, all cache cleared');
  };

  const register = async (data: RegisterData) => {
    try {
      // Clear cache before registration
      clearAllCache();
      
      await authService.register(data);
      // After registration, automatically log in
      await login(data.username, data.password);
    } catch (error) {
      console.error('Registration error:', error);
      clearAllCache();
      throw error;
    }
  };

  const value = {
    user,
    token,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    register,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};