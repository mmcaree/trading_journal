// src/App.tsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { QueryClient, QueryClientProvider } from 'react-query';

// Layouts
import DashboardLayout from './layouts/DashboardLayout';

// Pages
import Dashboard from './pages/Dashboard';
import TradesList from './pages/TradesList';
import Positions from './pages/Positions';
import PositionsServiceTest from './pages/PositionsServiceTest';
import PositionComparison from './pages/PositionComparison';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import ImportData from './pages/ImportData';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import NotFound from './pages/NotFound';

// Admin Pages
import AdminDashboard from './pages/AdminDashboard';
import StudentDetailPage from './pages/StudentDetailPage';

// Components
import ApiDebugger from './components/ApiDebugger';
import DebugConsole from './components/DebugConsole';

// Auth
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';
import { CurrencyProvider } from './context/CurrencyContext';

// Create a client with performance optimizations
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,        // 30 seconds before data considered stale
      cacheTime: 300000,       // 5 minutes in cache after component unmounts
      refetchOnWindowFocus: false, // Don't refetch on window focus
      refetchOnMount: false,   // Don't always refetch on mount if data exists
      retry: 1,                // Only retry once on failure
    },
    mutations: {
      retry: 1,
    },
  },
});

// Create a theme
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#1da0f0', // Blue accent color
    },
    secondary: {
      main: '#f44336', // Red for loss
    },
    success: {
      main: '#4caf50', // Green for profit
    },
    background: {
      default: '#121212',
      paper: '#1e1e1e',
    },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontSize: '2.5rem',
      fontWeight: 500,
    },
    h2: {
      fontSize: '2rem',
      fontWeight: 500,
    },
    h3: {
      fontSize: '1.75rem',
      fontWeight: 500,
    },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        },
      },
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <CurrencyProvider>
            <Router>
              <Routes>              <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/debug" element={<ApiDebugger />} />
                <Route path="/debug-console" element={<DebugConsole />} />
                
                <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                  <Route index element={<Dashboard />} />
                  <Route path="positions" element={<Positions />} />
                  <Route path="compare" element={<PositionComparison />} />
                  <Route path="trades" element={<TradesList />} />
                  <Route path="positions-test" element={<PositionsServiceTest />} />
                  {/* Position details, creation, and editing routes removed */}
                  {/* These functionalities are now handled through modals in the Positions and Trades pages */}
                  <Route path="analytics" element={<Analytics />} />
                  <Route path="import" element={<ImportData />} />
                  <Route path="settings" element={<Settings />} />
                  
                  {/* Admin Routes - Only accessible to instructors */}
                  <Route path="admin" element={<AdminDashboard />} />
                  <Route path="admin/student/:studentId" element={<StudentDetailPage />} />
                </Route>
                
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Router>
          </CurrencyProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
