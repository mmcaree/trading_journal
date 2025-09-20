import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Avatar,
  Alert
} from '@mui/material';
import {
  LockOutlined as LockOutlinedIcon,
  ArrowBack as ArrowBackIcon
} from '@mui/icons-material';
import * as Yup from 'yup';
import { useFormik } from 'formik';
import api from '../services/apiConfig';

const forgotPasswordSchema = Yup.object().shape({
  email: Yup.string()
    .email('Invalid email address')
    .required('Email is required'),
});

const ForgotPassword: React.FC = () => {
  const navigate = useNavigate();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formik = useFormik({
    initialValues: {
      email: ''
    },
    validationSchema: forgotPasswordSchema,
    onSubmit: async (values) => {
      try {
        setError(null);
        
        await api.post('/api/auth/forgot-password', {
          email: values.email
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
                <LockOutlinedIcon />
              </Avatar>
              <Typography component="h1" variant="h5" gutterBottom>
                Check Your Email
              </Typography>
              <Alert severity="success" sx={{ mb: 3, width: '100%' }}>
                If an account with that email address exists, we've sent you a password reset link.
              </Alert>
              <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
                Please check your email and click the link to reset your password. 
                The link will expire in 1 hour for security reasons.
              </Typography>
              <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
                Didn't receive the email? Check your spam folder or try again.
              </Typography>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => setSuccess(false)}
                sx={{ mb: 2 }}
              >
                Try Another Email
              </Button>
              <Button
                component={Link}
                to="/login"
                startIcon={<ArrowBackIcon />}
                fullWidth
                variant="contained"
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
              Forgot Password
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
              Enter your email address and we'll send you a link to reset your password.
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
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={formik.values.email}
              onChange={formik.handleChange}
              error={formik.touched.email && Boolean(formik.errors.email)}
              helperText={formik.touched.email && formik.errors.email}
            />
            
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={formik.isSubmitting}
            >
              {formik.isSubmitting ? 'Sending...' : 'Send Reset Link'}
            </Button>
            
            <Button
              component={Link}
              to="/login"
              startIcon={<ArrowBackIcon />}
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

export default ForgotPassword;