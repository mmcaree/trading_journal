import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Avatar,
  Alert,
  InputAdornment,
  IconButton
} from '@mui/material';
import {
  LockOutlined as LockOutlinedIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import { useFormik } from 'formik';
import api from '../services/apiConfig';
import { passwordResetSchema, HELPER_TEXT } from '../utils/validationSchemas';

const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const tokenParam = searchParams.get('token');
    if (!tokenParam) {
      setError('Invalid reset link. Please request a new password reset.');
    } else {
      setToken(tokenParam);
    }
  }, [searchParams]);

  const formik = useFormik({
    initialValues: {
      password: '',
      confirmPassword: ''
    },
    validationSchema: passwordResetSchema,
    onSubmit: async (values) => {
      try {
        setError(null);
        
        if (!token) {
          setError('Invalid reset token. Please request a new password reset.');
          return;
        }

        await api.post('/api/auth/reset-password', {
          token: token,
          new_password: values.password
        });
        
        setSuccess(true);
      } catch (err: any) {
        setError(err.response?.data?.detail || 'An error occurred. Please try again.');
      }
    },
  });

  if (success) {
    return (
      <Container component="main" maxWidth="sm">
        <Box
          sx={{
            marginTop: 8,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Paper elevation={3} sx={{ padding: 4, width: '100%' }}>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <Avatar sx={{ m: 1, bgcolor: 'success.main' }}>
                <CheckCircleIcon />
              </Avatar>
              <Typography component="h1" variant="h5" gutterBottom>
                Password Reset Successful
              </Typography>
              <Alert severity="success" sx={{ mb: 3, width: '100%' }}>
                Your password has been reset successfully!
              </Alert>
              <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
                You can now sign in with your new password.
              </Typography>
              <Button
                component={Link}
                to="/login"
                fullWidth
                variant="contained"
              >
                Sign In
              </Button>
            </Box>
          </Paper>
        </Box>
      </Container>
    );
  }

  if (!token) {
    return (
      <Container component="main" maxWidth="sm">
        <Box
          sx={{
            marginTop: 8,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Paper elevation={3} sx={{ padding: 4, width: '100%' }}>
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <Avatar sx={{ m: 1, bgcolor: 'error.main' }}>
                <LockOutlinedIcon />
              </Avatar>
              <Typography component="h1" variant="h5" gutterBottom>
                Invalid Reset Link
              </Typography>
              <Alert severity="error" sx={{ mb: 3, width: '100%' }}>
                This password reset link is invalid or has expired.
              </Alert>
              <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
                Please request a new password reset link.
              </Typography>
              <Button
                component={Link}
                to="/forgot-password"
                fullWidth
                variant="contained"
                sx={{ mb: 2 }}
              >
                Request New Reset Link
              </Button>
              <Button
                component={Link}
                to="/login"
                fullWidth
                variant="outlined"
              >
                Back to Sign In
              </Button>
            </Box>
          </Paper>
        </Box>
      </Container>
    );
  }

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper elevation={3} sx={{ padding: 4, width: '100%' }}>
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
            component="form"
            onSubmit={formik.handleSubmit}
          >
            <Avatar sx={{ m: 1, bgcolor: 'secondary.main' }}>
              <LockOutlinedIcon />
            </Avatar>
            <Typography component="h1" variant="h5" gutterBottom>
              Reset Password
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
              Enter your new password below.
            </Typography>
            
            {error && (
              <Alert severity="error" sx={{ mb: 2, width: '100%' }}>
                {error}
              </Alert>
            )}

            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="New Password"
              type={showPassword ? 'text' : 'password'}
              id="password"
              autoComplete="new-password"
              value={formik.values.password}
              onChange={formik.handleChange}
              error={formik.touched.password && Boolean(formik.errors.password)}
              helperText={(formik.touched.password && formik.errors.password) || HELPER_TEXT.password}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              margin="normal"
              required
              fullWidth
              name="confirmPassword"
              label="Confirm New Password"
              type={showConfirmPassword ? 'text' : 'password'}
              id="confirmPassword"
              autoComplete="new-password"
              value={formik.values.confirmPassword}
              onChange={formik.handleChange}
              error={formik.touched.confirmPassword && Boolean(formik.errors.confirmPassword)}
              helperText={(formik.touched.confirmPassword && formik.errors.confirmPassword) || HELPER_TEXT.confirmPassword}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle confirm password visibility"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      edge="end"
                    >
                      {showConfirmPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={formik.isSubmitting}
            >
              {formik.isSubmitting ? 'Resetting...' : 'Reset Password'}
            </Button>
            
            <Button
              component={Link}
              to="/login"
              fullWidth
              variant="outlined"
            >
              Back to Sign In
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default ResetPassword;