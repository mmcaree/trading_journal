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
  Grid,
  InputAdornment,
  IconButton,
  Alert,
  Stepper,
  Step,
  StepLabel,
} from '@mui/material';
import {
  PersonAddOutlined as PersonAddOutlinedIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  ArrowBack as ArrowBackIcon,
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { useFormik } from 'formik';
import { personalInfoSchema, accountInfoSchema, HELPER_TEXT } from '../utils/validationSchemas';

const steps = ['Account Information', 'Password Setup', 'Finish'];

const Register: React.FC = () => {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [activeStep, setActiveStep] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formik = useFormik({
    initialValues: {
      username: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    validationSchema: 
      activeStep === 0 
        ? personalInfoSchema 
        : activeStep === 1 
          ? accountInfoSchema 
          : null,
    validateOnChange: true,
    validateOnBlur: true,
    onSubmit: async (values) => {
      // Only submit on final step
      if (activeStep === steps.length - 1) {
        try {
          setError(null);
          console.log('Attempting registration with:', values);
          
          await register({
            username: values.username,
            email: values.email,
            password: values.password,
          });
          
          console.log('Registration successful');
          // Show success message before navigating
          alert('Registration successful! You can now log in with your credentials.');
          navigate('/login');
        } catch (err) {
          console.error('Registration error:', err);
          setError('Registration failed. This username or email may already be in use.');
        }
      } else {
        handleNext();
      }
    },
  });

  const handleTogglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleNext = async () => {
    try {
      // Validate current step before proceeding
      if (activeStep === 0) {
        await personalInfoSchema.validate(formik.values, { abortEarly: false });
        console.log('Personal info validated successfully');
      } else if (activeStep === 1) {
        await accountInfoSchema.validate(formik.values, { abortEarly: false });
        console.log('Account info validated successfully');
      }
      
      // If validation passed, proceed to next step
      setActiveStep((prevStep) => prevStep + 1);
    } catch (validationError) {
      console.error('Validation error:', validationError);
      // Trigger form validation to display errors
      formik.validateForm();
    }
  };

  const handleBack = () => {
    setActiveStep((prevStep) => prevStep - 1);
  };

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          mb: 8,
        }}
      >
        <Paper
          elevation={3}
          sx={{
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <Avatar sx={{ m: 1, bgcolor: 'primary.main' }}>
            <PersonAddOutlinedIcon />
          </Avatar>
          <Typography component="h1" variant="h5" gutterBottom>
            Create Your SwingTrader Account
          </Typography>

          <Stepper activeStep={activeStep} sx={{ width: '100%', my: 3 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {error && (
            <Alert severity="error" sx={{ mt: 2, width: '100%' }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={formik.handleSubmit} sx={{ mt: 1, width: '100%' }}>
            {activeStep === 0 && (
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    id="username"
                    label="Username"
                    name="username"
                    autoComplete="username"
                    value={formik.values.username}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.username && Boolean(formik.errors.username)}
                    helperText={(formik.touched.username && formik.errors.username) || HELPER_TEXT.username}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    id="email"
                    label="Email Address"
                    name="email"
                    autoComplete="email"
                    value={formik.values.email}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.email && Boolean(formik.errors.email)}
                    helperText={(formik.touched.email && formik.errors.email) || HELPER_TEXT.email}
                  />
                </Grid>
              </Grid>
            )}

            {activeStep === 1 && (
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    name="password"
                    label="Password"
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    autoComplete="new-password"
                    value={formik.values.password}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.password && Boolean(formik.errors.password)}
                    helperText={(formik.touched.password && formik.errors.password) || HELPER_TEXT.password}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            aria-label="toggle password visibility"
                            onClick={handleTogglePasswordVisibility}
                            edge="end"
                          >
                            {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    name="confirmPassword"
                    label="Confirm Password"
                    type={showPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    autoComplete="new-password"
                    value={formik.values.confirmPassword}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={formik.touched.confirmPassword && Boolean(formik.errors.confirmPassword)}
                    helperText={(formik.touched.confirmPassword && formik.errors.confirmPassword) || HELPER_TEXT.confirmPassword}
                  />
                </Grid>
              </Grid>
            )}

            {activeStep === 2 && (
              <Box sx={{ my: 3, textAlign: 'center' }}>
                <Typography variant="h6" gutterBottom>
                  Registration Summary
                </Typography>
                <Typography variant="body1" gutterBottom>
                  Username: {formik.values.username}
                </Typography>
                <Typography variant="body1" gutterBottom>
                  Email: {formik.values.email}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  By clicking "Complete Registration" you agree to our Terms of Service and Privacy Policy.
                </Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 3 }}>
              <Button
                disabled={activeStep === 0}
                onClick={handleBack}
                startIcon={<ArrowBackIcon />}
                variant="outlined"
              >
                Back
              </Button>
              
              <Button
                type="submit"
                variant="contained"
                color="primary"
                endIcon={activeStep < steps.length - 1 ? <ArrowForwardIcon /> : undefined}
              >
                {activeStep === steps.length - 1 ? 'Complete Registration' : 'Next'}
              </Button>
            </Box>

            <Grid container justifyContent="center" sx={{ mt: 3 }}>
              <Grid item>
                <Link to="/login">
                  <Typography variant="body2" color="primary">
                    Already have an account? Sign in
                  </Typography>
                </Link>
              </Grid>
            </Grid>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default Register;
