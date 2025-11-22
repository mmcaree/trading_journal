/**
 * Validation utilities and Yup schemas for frontend forms.
 * Centralizes validation rules to ensure consistency.
 */

import * as Yup from 'yup';

// Validation constants
export const PASSWORD_MIN_LENGTH = 6;
export const PASSWORD_MAX_LENGTH = 128;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

// Helper text constants for form fields
export const HELPER_TEXT = {
  email: 'Enter a valid email address (e.g., user@example.com)',
  username: `${USERNAME_MIN_LENGTH}-${USERNAME_MAX_LENGTH} characters, letters/numbers/underscores only`,
  password: `Minimum ${PASSWORD_MIN_LENGTH} characters required`,
  confirmPassword: 'Re-enter your password to confirm',
  ticker: '1-10 characters, automatically converted to uppercase',
  shares: 'Must be a positive whole number',
  price: 'Must be a positive number',
  stopLoss: 'Price level to limit losses',
  takeProfit: 'Target price for profits',
  riskPercent: 'Percentage of account at risk (0-100)',
};

/**
 * Reusable Yup schema for email validation
 */
export const emailSchema = Yup.string()
  .email('Invalid email address')
  .required('Email is required');

/**
 * Reusable Yup schema for username validation
 */
export const usernameSchema = Yup.string()
  .min(USERNAME_MIN_LENGTH, `Username must be at least ${USERNAME_MIN_LENGTH} characters`)
  .max(USERNAME_MAX_LENGTH, `Username must be less than ${USERNAME_MAX_LENGTH} characters`)
  .matches(
    /^[a-zA-Z0-9_]+$/,
    'Username can only contain letters, numbers, and underscores'
  )
  .required('Username is required');

/**
 * Reusable Yup schema for password validation
 */
export const passwordSchema = Yup.string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, 'Password too long')
  .required('Password is required');

/**
 * Reusable Yup schema for confirm password validation
 */
export const confirmPasswordSchema = Yup.string()
  .oneOf([Yup.ref('password')], 'Passwords must match')
  .required('Confirm password is required');

/**
 * Reusable Yup schema for ticker validation
 */
export const tickerSchema = Yup.string()
  .min(1, 'Ticker is required')
  .max(10, 'Ticker must be 10 characters or less')
  .matches(/^[A-Z0-9]+$/, 'Invalid ticker format')
  .required('Ticker is required');

/**
 * Reusable Yup schema for positive number validation
 */
export const positiveNumberSchema = (fieldName: string = 'Value') =>
  Yup.number()
    .positive(`${fieldName} must be greater than 0`)
    .required(`${fieldName} is required`);

/**
 * Reusable Yup schema for non-negative number validation
 */
export const nonNegativeNumberSchema = (fieldName: string = 'Value') =>
  Yup.number()
    .min(0, `${fieldName} cannot be negative`)
    .required(`${fieldName} is required`);

/**
 * Reusable Yup schema for percentage validation (0-100)
 */
export const percentageSchema = (fieldName: string = 'Percentage') =>
  Yup.number()
    .min(0, `${fieldName} must be at least 0`)
    .max(100, `${fieldName} must be at most 100`)
    .required(`${fieldName} is required`);

/**
 * Login form validation schema
 */
export const loginFormSchema = Yup.object().shape({
  username: Yup.string().required('Username is required'),
  password: passwordSchema,
  rememberMe: Yup.boolean(),
});

/**
 * Registration form validation schema - Personal Info step
 */
export const personalInfoSchema = Yup.object().shape({
  username: usernameSchema,
  email: emailSchema,
});

/**
 * Registration form validation schema - Account Info step
 */
export const accountInfoSchema = Yup.object().shape({
  password: passwordSchema,
  confirmPassword: confirmPasswordSchema,
});

/**
 * Password reset form validation schema
 */
export const passwordResetSchema = Yup.object().shape({
  password: passwordSchema,
  confirmPassword: confirmPasswordSchema,
});

/**
 * Forgot password form validation schema
 */
export const forgotPasswordSchema = Yup.object().shape({
  email: emailSchema,
});

/**
 * Change password form validation schema
 */
export const changePasswordSchema = Yup.object().shape({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
  confirmPassword: Yup.string()
    .oneOf([Yup.ref('newPassword')], 'Passwords must match')
    .required('Confirm password is required'),
});

/**
 * Position creation validation schema
 */
export const createPositionSchema = Yup.object().shape({
  ticker: tickerSchema,
  shares: positiveNumberSchema('Shares'),
  entry_price: positiveNumberSchema('Entry price'),
  stop_loss: positiveNumberSchema('Stop loss'),
  take_profit: positiveNumberSchema('Take profit'),
});

/**
 * Helper function to validate email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

/**
 * Helper function to validate username format
 */
export const isValidUsername = (username: string): boolean => {
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return false;
  }
  return /^[a-zA-Z0-9_]+$/.test(username);
};

/**
 * Helper function to validate password strength
 */
export const isValidPassword = (password: string): boolean => {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
};

/**
 * Helper function to get password strength
 */
export const getPasswordStrength = (password: string): {
  strength: 'weak' | 'medium' | 'strong';
  score: number;
} => {
  let score = 0;
  
  if (password.length >= PASSWORD_MIN_LENGTH) score++;
  if (password.length >= 8) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  
  if (score <= 2) {
    return { strength: 'weak', score };
  } else if (score <= 3) {
    return { strength: 'medium', score };
  } else {
    return { strength: 'strong', score };
  }
};
