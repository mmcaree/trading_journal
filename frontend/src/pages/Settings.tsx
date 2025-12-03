import React, { useState, useEffect } from 'react';
import { PASSWORD_MIN_LENGTH, HELPER_TEXT } from '../utils/validationSchemas';
import { 
  Box, 
  Typography, 
  Paper, 
  Grid, 
  TextField, 
  Button, 
  Switch, 
  FormControlLabel, 
  Divider,
  Avatar,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  SelectChangeEvent,
  InputAdornment
} from '@mui/material';
import { 
  ExpandMore, 
  Security, 
  Email, 
  Download, 
  VpnKey,
  AccountBalance,
  TrendingUp,
  Save,
  Add,
  Delete,
  Edit,
  ArrowUpward,
  ArrowDownward
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../services/apiConfig';
import api from '../services/apiConfig';
import { updateProfile, changePassword, UserUpdateData, ChangePasswordData, exportUserData, deleteUserAccount, clearAllUserData, clearTradeHistory, uploadProfilePicture, deleteProfilePicture } from '../services/userService';
import { AccountSettings } from '../services/types';
import { accountService } from '../services/accountService';
import { 
  updateNotificationSettings, 
  setup2FA, 
  verify2FA, 
  disable2FA, 
  regenerateBackupCodes,
  type NotificationSettings,
  type TwoFactorSetup
} from '../services/notificationService';
import {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getTransactionSummary,
  type AccountTransaction,
  type TransactionCreate
} from '../services/transactionService';

const Settings: React.FC = () => {
  const { user, setUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  
  // Profile form state
  const [profileData, setProfileData] = useState<UserUpdateData>({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    display_name: user?.display_name || '',
    bio: user?.bio || '',
    email: user?.email || '',
    timezone: user?.timezone || 'America/New_York',
  });

  // Password form state
  const [passwordData, setPasswordData] = useState<ChangePasswordData>({
    current_password: '',
    new_password: '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');

  // Notification settings state
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    email_notifications_enabled: user?.email_notifications_enabled || false,
    weekly_email_enabled: user?.weekly_email_enabled || false,
    weekly_email_time: user?.weekly_email_time || '09:00',
  });

  // 2FA state
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetup | null>(null);
  const [showTwoFactorDialog, setShowTwoFactorDialog] = useState(false);
  const [twoFactorToken, setTwoFactorToken] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);

  // Account Settings state
  const [accountSettings, setAccountSettings] = useState<AccountSettings>(accountService.getAccountSettings());
  const [tempAccountBalance, setTempAccountBalance] = useState<string>(accountService.getCurrentBalance().toString());
  const [tempStartingBalance, setTempStartingBalance] = useState<string>(accountService.getAccountSettings().starting_balance.toString());
  const [startingBalanceDate, setStartingBalanceDate] = useState<string>(
    new Date().toISOString().split('T')[0] // Default to today
  );

  // Transaction state
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<AccountTransaction | null>(null);
  const [transactionForm, setTransactionForm] = useState<TransactionCreate>({
    transaction_type: 'DEPOSIT',
    amount: 0,
    transaction_date: new Date().toISOString().split('T')[0],
    description: '',
  });
  const [transactionSummary, setTransactionSummary] = useState({ 
    total_deposits: 0, 
    total_withdrawals: 0, 
    net_flow: 0 
  });
  const [accountGrowth, setAccountGrowth] = useState({
    growth: 0,
    growthPercent: 0,
    startingBalance: 0,
    currentBalance: 0,
    totalDeposits: 0,
    totalWithdrawals: 0,
    netCashFlow: 0,
    rawGrowth: 0,
    rawGrowthPercent: 0
  });

  // Load account settings from service on component mount
  useEffect(() => {
    const settings = accountService.getAccountSettings();
    setAccountSettings(settings);
    setTempAccountBalance(settings.current_balance.toString());
    setTempStartingBalance(settings.starting_balance.toString());
    loadAccountGrowthFromAPI();
    loadUserStartingBalanceDate();
  }, []);

  const loadUserStartingBalanceDate = async () => {
    try {
      const response = await api.get('/api/users/me');
      if (response.data.starting_balance_date) {
        // Parse as UTC to avoid timezone offset issues
        const dateStr = response.data.starting_balance_date.split('T')[0];
        setStartingBalanceDate(dateStr);
      }
    } catch (error) {
      console.error('Failed to load starting balance date:', error);
    }
  };

  // Load transactions on mount
  useEffect(() => {
    loadTransactions();
  }, []);

  const loadAccountGrowthFromAPI = async () => {
    try {
      // Fetch from API instead of localStorage
      const response = await api.get('/api/analytics/account-growth-metrics');
      const data = response.data;
      
      setAccountGrowth({
        growth: data.trading_growth_percent >= 0 ? data.realized_pnl : data.realized_pnl,
        growthPercent: data.total_growth_percent,
        startingBalance: data.starting_balance,
        currentBalance: data.current_value,
        totalDeposits: data.total_deposits,
        totalWithdrawals: data.total_withdrawals,
        netCashFlow: data.net_deposits,
        rawGrowth: data.realized_pnl,
        rawGrowthPercent: data.trading_growth_percent
      });
    } catch (error) {
      console.error('Failed to load account growth:', error);
    }
  };

  const getDisplayName = () => {
    if (user?.display_name) return user.display_name;
    if (user?.first_name || user?.last_name) {
      return `${user?.first_name || ''} ${user?.last_name || ''}`.trim();
    }
    return user?.username || 'User';
  };

  const getAvatarInitials = () => {
    const displayName = getDisplayName();
    const words = displayName.split(' ');
    if (words.length >= 2) {
      return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }
    return displayName.substring(0, 2).toUpperCase();
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const updatedUser = await updateProfile(profileData);
      setUser(updatedUser);
      setAlert({ type: 'success', message: 'Profile updated successfully!' });
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (passwordData.new_password !== confirmPassword) {
      setAlert({ type: 'error', message: 'New passwords do not match' });
      return;
    }

    if (passwordData.new_password.length < PASSWORD_MIN_LENGTH) {
      setAlert({ type: 'error', message: `New password must be at least ${PASSWORD_MIN_LENGTH} characters long` });
      return;
    }

    setLoading(true);
    
    try {
      await changePassword(passwordData);
      setAlert({ type: 'success', message: 'Password changed successfully!' });
      setPasswordData({ current_password: '', new_password: '' });
      setConfirmPassword('');
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  // Starting balance handlers
  const handleStartingBalanceUpdate = async () => {
    const newStartingBalance = parseFloat(tempStartingBalance);
    
    if (isNaN(newStartingBalance) || newStartingBalance <= 0) {
      setAlert({ type: 'error', message: 'Please enter a valid starting balance greater than 0' });
      return;
    }

    setLoading(true);
    
    try {
      // Call backend API to update starting balance with date (query params)
      const params: any = {
        starting_balance: newStartingBalance
      };
      
      if (startingBalanceDate) {
        // Append time to ensure it's treated as start of day in UTC
        params.starting_date = startingBalanceDate + 'T00:00:00Z';
      }
      
      const response = await api.put('/api/users/me/starting-balance', null, { params });

      if (response.data.success) {
        accountService.updateStartingBalance(newStartingBalance);
        const updatedSettings = accountService.getAccountSettings();
        setAccountSettings(updatedSettings);
        
        setAlert({ type: 'success', message: 'Starting balance updated successfully!' });
      }
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return accountService.formatCurrency(amount);
  };

  // Notification handlers
  const handleNotificationToggle = (field: keyof NotificationSettings) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setNotificationSettings(prev => ({
      ...prev,
      [field]: event.target.checked
    }));
  };

  const handleTimeChange = (field: 'weekly_email_time') => (event: SelectChangeEvent) => {
    setNotificationSettings(prev => ({
      ...prev,
      [field]: event.target.value
    }));
  };

  const handleSaveNotifications = async () => {
    setLoading(true);
    try {
      await updateNotificationSettings(notificationSettings);
      setAlert({ type: 'success', message: 'Notification settings updated successfully!' });
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  // 2FA handlers
  const handleSetup2FA = async () => {
    setLoading(true);
    try {
      const setup = await setup2FA();
      setTwoFactorSetup(setup);
      setShowTwoFactorDialog(true);
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    if (!twoFactorToken) {
      setAlert({ type: 'error', message: 'Please enter the verification code' });
      return;
    }

    setLoading(true);
    try {
      await verify2FA(twoFactorToken);
      setAlert({ type: 'success', message: '2FA enabled successfully!' });
      setShowTwoFactorDialog(false);
      setTwoFactorToken('');
      if (twoFactorSetup) {
        setBackupCodes(twoFactorSetup.backup_codes);
        setShowBackupCodes(true);
      }
      // Refresh user data
      if (user) {
        setUser({ ...user, two_factor_enabled: true });
      }
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    setLoading(true);
    try {
      await disable2FA();
      setAlert({ type: 'success', message: '2FA disabled successfully!' });
      if (user) {
        setUser({ ...user, two_factor_enabled: false });
      }
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateBackupCodes = async () => {
    setLoading(true);
    try {
      const newCodes = await regenerateBackupCodes();
      setBackupCodes(newCodes);
      setShowBackupCodes(true);
      setAlert({ type: 'success', message: 'New backup codes generated!' });
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const downloadBackupCodes = () => {
    const codesText = backupCodes.join('\n');
    const blob = new Blob([codesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tradecademy-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportData = async () => {
    setLoading(true);
    try {
      const data = await exportUserData();
      
      // Create and download the JSON file
      const dataStr = JSON.stringify(data, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tradecademy-export-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      setAlert({ type: 'success', message: 'Data exported successfully!' });
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [showClearDataConfirmation, setShowClearDataConfirmation] = useState(false);
  const [showClearTradeHistoryConfirmation, setShowClearTradeHistoryConfirmation] = useState(false);

  // Transaction handlers
  const loadTransactions = async () => {
    try {
      const [txnData, summary] = await Promise.all([
        getTransactions(),
        getTransactionSummary()
      ]);
      setTransactions(txnData);
      setTransactionSummary(summary);
      await loadAccountGrowthFromAPI(); // Reload growth when transactions change
    } catch (error: any) {
      console.error('Failed to load transactions:', error);
    }
  };

  const handleOpenTransactionDialog = (transaction?: AccountTransaction) => {
    if (transaction) {
      setEditingTransaction(transaction);
      setTransactionForm({
        transaction_type: transaction.transaction_type,
        amount: transaction.amount,
        transaction_date: transaction.transaction_date.split('T')[0],
        description: transaction.description || '',
      });
    } else {
      setEditingTransaction(null);
      setTransactionForm({
        transaction_type: 'DEPOSIT',
        amount: 0,
        transaction_date: new Date().toISOString().split('T')[0],
        description: '',
      });
    }
    setShowTransactionDialog(true);
  };

  const handleSaveTransaction = async () => {
    if (transactionForm.amount <= 0) {
      setAlert({ type: 'error', message: 'Amount must be greater than 0' });
      return;
    }

    setLoading(true);
    try {
      const txnData = {
        ...transactionForm,
        transaction_date: `${transactionForm.transaction_date}T12:00:00`,
      };

      if (editingTransaction) {
        await updateTransaction(editingTransaction.id, txnData);
        setAlert({ type: 'success', message: 'Transaction updated successfully!' });
      } else {
        await createTransaction(txnData);
        setAlert({ type: 'success', message: 'Transaction created successfully!' });
      }

      await loadTransactions();
      setShowTransactionDialog(false);
    } catch (error: any) {
      setAlert({ type: 'error', message: error.response?.data?.detail || error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTransaction = async (transactionId: number) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) return;

    setLoading(true);
    try {
      await deleteTransaction(transactionId);
      setAlert({ type: 'success', message: 'Transaction deleted successfully!' });
      await loadTransactions();
    } catch (error: any) {
      setAlert({ type: 'error', message: error.response?.data?.detail || error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    setShowDeleteConfirmation(true);
  };

  const handleClearAllData = async () => {
    setShowClearDataConfirmation(true);
  };

  const handleClearTradeHistory = async () => {
    setShowClearTradeHistoryConfirmation(true);
  };

  const confirmClearTradeHistory = async () => {
    setLoading(true);
    try {
      // Call API to clear only trade history (not deposits/withdrawals or user settings)
      await clearTradeHistory();

      // Clear only trade-related cached data in localStorage (keep account settings)
      const keysToRemove = [
        'dashboardData',
        'analyticsData', 
        'tradesCache',
        'chartData',
        'positionsCache',
        'importCache',
        'portfolioCache',
        'tradingPositionsCache',
        'eventCache',
        'performanceCache',
        'cachedPositions',
        'cachedEvents'
      ];
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      // Clear any cached data with key patterns (but keep account settings)
      const allKeys = Object.keys(localStorage);
      allKeys.forEach(key => {
        if (key.includes('trade') || key.includes('position') || key.includes('import') || 
            key.includes('chart') || key.includes('portfolio') || key.includes('analytics')) {
          localStorage.removeItem(key);
        }
      });
      
      setAlert({ 
        type: 'success', 
        message: 'Trade history cleared successfully! Your deposits, withdrawals, and account settings have been preserved. You can now re-import your trades.' 
      });
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message || 'Failed to clear trade history' });
    } finally {
      setLoading(false);
      setShowClearTradeHistoryConfirmation(false);
    }
  };

  const confirmClearAllData = async () => {
    setLoading(true);
    try {
      // Call API to clear all trading data from database
      await clearAllUserData();
      
      // Clear account settings (reset to default)
      const defaultSettings: AccountSettings = {
        starting_balance: 10000,
        current_balance: 10000,
        last_updated: new Date().toISOString()
      };
      
      accountService.updateAccountSettings(defaultSettings);
      setAccountSettings(defaultSettings);
      setTempAccountBalance('10000');
      setTempStartingBalance('10000');
      
      // Clear ALL cached data in localStorage
      const keysToRemove = [
        'dashboardData',
        'analyticsData', 
        'tradesCache',
        'chartData',
        'positionsCache',
        'importCache',
        'portfolioCache',
        'tradingPositionsCache',
        'eventCache',
        'userSettings',
        'lastSync',
        'cachedPositions',
        'cachedEvents',
        'performanceCache'
      ];
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      // Clear any cached data with key patterns
      const allKeys = Object.keys(localStorage);
      allKeys.forEach(key => {
        if (key.includes('trade') || key.includes('position') || key.includes('import') || 
            key.includes('chart') || key.includes('portfolio') || key.includes('analytics')) {
          localStorage.removeItem(key);
        }
      });
      
      setAlert({ 
        type: 'success', 
        message: 'All trading data cleared successfully! This includes all positions, trades, imports, charts, and cached data. Your account balance has been reset to $10,000.' 
      });
      
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message || 'Failed to clear data' });
    } finally {
      setLoading(false);
      setShowClearDataConfirmation(false);
    }
  };

  const confirmDeleteAccount = async () => {
    setLoading(true);
    try {
      await deleteUserAccount();
      setAlert({ type: 'success', message: 'Account deleted successfully. You will be logged out.' });
      
      // Clear local storage and redirect after a short delay
      setTimeout(() => {
        localStorage.removeItem('token');
        window.location.href = '/login';
      }, 2000);
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
      setShowDeleteConfirmation(false);
    }
  };

  // Profile picture handlers
  const handleProfilePictureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setAlert({ type: 'error', message: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.' });
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setAlert({ type: 'error', message: 'File too large. Maximum size is 5MB.' });
      return;
    }

    setLoading(true);
    try {
      const result = await uploadProfilePicture(file);
      
      // Update user context with new profile picture URL
      if (user) {
        setUser({ ...user, profile_picture_url: result.profile_picture_url });
      }
      
      setAlert({ type: 'success', message: 'Profile picture updated successfully!' });
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
      // Reset file input
      event.target.value = '';
    }
  };

  const handleDeleteProfilePicture = async () => {
    if (!user?.profile_picture_url) return;

    setLoading(true);
    try {
      await deleteProfilePicture();
      
      // Update user context to remove profile picture URL
      if (user) {
        setUser({ ...user, profile_picture_url: null });
      }
      
      setAlert({ type: 'success', message: 'Profile picture deleted successfully!' });
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const timeOptions = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, '0');
    return `${hour}:00`;
  });

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>

      <Grid container spacing={3}>
        {/* Profile Section */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Profile Information
            </Typography>
            <Divider sx={{ mb: 3 }} />

            <Box component="form" onSubmit={handleProfileUpdate}>
              <Grid container spacing={3}>
                <Grid item xs={12} display="flex" alignItems="center" gap={2}>
                  <Avatar 
                    sx={{ width: 80, height: 80 }}
                    src={user?.profile_picture_url ? (user.profile_picture_url.startsWith('http') ? user.profile_picture_url : `${API_URL}${user.profile_picture_url}`) : undefined}
                  >
                    {!user?.profile_picture_url && getAvatarInitials()}
                  </Avatar>
                  <Box>
                    <Typography variant="h6">{getDisplayName()}</Typography>
                    <Typography variant="body2" color="text.secondary">@{user?.username}</Typography>
                    <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                      <Button 
                        variant="outlined" 
                        size="small" 
                        onClick={() => document.getElementById('profile-picture-input')?.click()}
                        disabled={loading}
                      >
                        {user?.profile_picture_url ? 'Change Photo' : 'Upload Photo'}
                      </Button>
                      {user?.profile_picture_url && (
                        <Button 
                          variant="outlined" 
                          size="small" 
                          color="error"
                          onClick={handleDeleteProfilePicture}
                          disabled={loading}
                        >
                          Remove
                        </Button>
                      )}
                    </Box>
                    <input
                      id="profile-picture-input"
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleProfilePictureUpload}
                    />
                  </Box>
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="First Name"
                    value={profileData.first_name}
                    onChange={(e) => setProfileData({ ...profileData, first_name: e.target.value })}
                    variant="outlined"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Last Name"
                    value={profileData.last_name}
                    onChange={(e) => setProfileData({ ...profileData, last_name: e.target.value })}
                    variant="outlined"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Display Name"
                    value={profileData.display_name}
                    onChange={(e) => setProfileData({ ...profileData, display_name: e.target.value })}
                    variant="outlined"
                    helperText="This will be shown in the sidebar and throughout the app"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Email Address"
                    value={profileData.email}
                    onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                    variant="outlined"
                    type="email"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Bio"
                    value={profileData.bio}
                    onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                    variant="outlined"
                    multiline
                    rows={3}
                    helperText="Tell us a bit about yourself and your trading style"
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth variant="outlined">
                    <InputLabel>Timezone</InputLabel>
                    <Select
                      value={profileData.timezone}
                      onChange={(e: SelectChangeEvent) => setProfileData({ ...profileData, timezone: e.target.value })}
                      label="Timezone"
                    >
                      <MenuItem value="America/New_York">Eastern Time (EST/EDT)</MenuItem>
                      <MenuItem value="America/Chicago">Central Time (CST/CDT)</MenuItem>
                      <MenuItem value="America/Denver">Mountain Time (MST/MDT)</MenuItem>
                      <MenuItem value="America/Phoenix">Mountain Standard Time (MST)</MenuItem>
                      <MenuItem value="America/Los_Angeles">Pacific Time (PST/PDT)</MenuItem>
                      <MenuItem value="America/Anchorage">Alaska Time (AKST/AKDT)</MenuItem>
                      <MenuItem value="Pacific/Honolulu">Hawaii Time (HST)</MenuItem>
                      <MenuItem value="Europe/London">GMT/BST</MenuItem>
                      <MenuItem value="Europe/Paris">Central European Time</MenuItem>
                      <MenuItem value="Asia/Tokyo">Japan Standard Time</MenuItem>
                      <MenuItem value="Asia/Shanghai">China Standard Time</MenuItem>
                      <MenuItem value="Asia/Kolkata">India Standard Time</MenuItem>
                      <MenuItem value="Australia/Sydney">Australian Eastern Time</MenuItem>
                    </Select>
                    <Typography variant="caption" sx={{ mt: 1, color: 'text.secondary' }}>
                      Used for scheduling weekly email reports
                    </Typography>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <Button 
                    variant="contained" 
                    color="primary" 
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? 'Updating...' : 'Update Profile'}
                  </Button>
                </Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* Password Change Section */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Change Password
            </Typography>
            <Divider sx={{ mb: 3 }} />

            <Box component="form" onSubmit={handlePasswordChange}>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Current Password"
                    type="password"
                    value={passwordData.current_password}
                    onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                    variant="outlined"
                    required
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="New Password"
                    type="password"
                    value={passwordData.new_password}
                    onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                    variant="outlined"
                    required
                    helperText={HELPER_TEXT.password}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Confirm New Password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    variant="outlined"
                    required
                    helperText={HELPER_TEXT.confirmPassword}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Button 
                    variant="contained" 
                    color="primary" 
                    type="submit"
                    fullWidth
                    disabled={loading}
                  >
                    {loading ? 'Changing...' : 'Change Password'}
                  </Button>
                </Grid>
              </Grid>
            </Box>
          </Paper>
        </Grid>

        {/* Account Management Section */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Account Management
            </Typography>
            <Divider sx={{ mb: 3 }} />
            <Grid container spacing={3}>
              
              {/* SECTION 1: Current Account Value (READ-ONLY/CALCULATED) - REPLACES manual input */}
              <Grid item xs={12} md={6}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <AccountBalance sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h6">Current Account Value (Calculated)</Typography>
                </Box>
                
                {/* Display current value */}
                <Paper sx={{ p: 3, bgcolor: 'primary.light', mb: 2 }}>
                  <Typography variant="h3" color="primary.contrastText" gutterBottom>
                    {formatCurrency(accountGrowth.currentBalance)}
                  </Typography>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Chip
                      icon={<TrendingUp />}
                      label={`${accountGrowth.growth >= 0 ? '+' : ''}${formatCurrency(accountGrowth.growth)} (${accountGrowth.growthPercent >= 0 ? '+' : ''}${accountGrowth.growthPercent.toFixed(1)}%)`}
                      color={accountGrowth.growth >= 0 ? 'success' : 'error'}
                      size="small"
                      sx={{ color: 'white' }}
                    />
                  </Box>
                </Paper>

                {/* Breakdown Display */}
                <Alert severity="info" icon={false} sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    <strong>How is this calculated?</strong>
                  </Typography>
                  <Box sx={{ pl: 2 }}>
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      • Starting Balance: {formatCurrency(accountGrowth.startingBalance)}
                    </Typography>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        mb: 0.5,
                        color: accountGrowth.rawGrowth >= 0 ? 'success.main' : 'error.main'
                      }}
                    >
                      • Trading P&L: {accountGrowth.rawGrowth >= 0 ? '+' : ''}{formatCurrency(accountGrowth.rawGrowth)} 
                      ({accountGrowth.rawGrowthPercent >= 0 ? '+' : ''}{accountGrowth.rawGrowthPercent.toFixed(1)}%)
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 0.5, color: 'success.main' }}>
                      • Deposits: +{formatCurrency(accountGrowth.totalDeposits)}
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 0.5, color: 'error.main' }}>
                      • Withdrawals: -{formatCurrency(accountGrowth.totalWithdrawals)}
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="body2" fontWeight="bold">
                      = {formatCurrency(accountGrowth.currentBalance)}
                    </Typography>
                  </Box>
                </Alert>

                <Alert severity="success">
                  <Typography variant="body2">
                    <strong>✓ Automatic Calculation</strong>
                    <br />
                    Your account value updates automatically as you:
                    <br />
                    • Close positions (P&L applied)
                    <br />
                    • Add deposits/withdrawals
                    <br />
                    <br />
                    No manual updates needed!
                  </Typography>
                </Alert>
              </Grid>

              {/* SECTION 2: Starting Balance Configuration - REPLACES manual balance input */}
              <Grid item xs={12} md={6}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <TrendingUp sx={{ mr: 1, color: 'warning.main' }} />
                  <Typography variant="h6">Starting Balance Configuration</Typography>
                </Box>
                
                <Alert severity="warning" sx={{ mb: 3 }}>
                  <Typography variant="body2">
                    <strong>⚠️ Important:</strong> Set your starting balance to the account value 
                    when you began tracking trades in this system. This enables accurate growth calculations.
                  </Typography>
                </Alert>

                {/* Starting Balance Input */}
                <TextField
                  fullWidth
                  label="Starting Balance"
                  value={tempStartingBalance}
                  onChange={(e) => setTempStartingBalance(e.target.value)}
                  type="number"
                  InputProps={{
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  }}
                  helperText="Your account balance when you started using this system"
                  sx={{ mb: 2 }}
                />

                {/* Starting Date Input */}
                <TextField
                  fullWidth
                  label="Starting Date"
                  value={startingBalanceDate}
                  onChange={(e) => setStartingBalanceDate(e.target.value)}
                  type="date"
                  InputLabelProps={{
                    shrink: true,
                  }}
                  helperText="When did you start with this balance? (Optional)"
                  sx={{ mb: 2 }}
                />

                {/* Update Button */}
                <Button
                  variant="contained"
                  color="warning"
                  onClick={handleStartingBalanceUpdate}
                  disabled={loading}
                  startIcon={<Save />}
                  fullWidth
                  sx={{ mb: 2 }}
                >
                  {loading ? 'Updating...' : 'Update Starting Balance'}
                </Button>

                {/* Info about what happens */}
                <Alert severity="info">
                  <Typography variant="body2">
                    <strong>What happens when you update?</strong>
                    <br />
                    • All growth percentages will be recalculated
                    <br />
                    • Historical data remains unchanged
                    <br />
                    • Current account value stays the same
                    <br />
                    • Only affects percentage calculations
                  </Typography>
                </Alert>

                {/* Show current starting balance info */}
                <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Current Configuration:
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Starting Balance: {formatCurrency(accountSettings.starting_balance)}
                  </Typography>
                  {startingBalanceDate && (
                    <Typography variant="body2" color="text.secondary">
                      Starting Date: {new Date(startingBalanceDate).toLocaleDateString()}
                    </Typography>
                  )}
                </Box>
              </Grid>

              {/* Account Statistics - Keep existing but update labels */}
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <TrendingUp sx={{ mr: 1, color: 'success.main' }} />
                  <Typography variant="h6">Performance Summary</Typography>
                </Box>
              
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'background.default' }}>
                      <Typography variant="body2" color="text.secondary">
                        Starting Balance
                      </Typography>
                      <Typography variant="h6">
                        {formatCurrency(accountSettings.starting_balance)}
                      </Typography>
                    </Paper>
                  </Grid>
                  
                  <Grid item xs={12} sm={6} md={3}>
                    <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'background.default' }}>
                      <Typography variant="body2" color="text.secondary">
                        Current Value
                      </Typography>
                      <Typography variant="h6">
                        {formatCurrency(accountGrowth.currentBalance)}
                      </Typography>
                    </Paper>
                  </Grid>
                  
                  <Grid item xs={12} sm={6} md={3}>
                    <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'background.default' }}>
                      <Typography variant="body2" color="text.secondary">
                        Trading Growth
                      </Typography>
                      <Typography
                        variant="h6"
                        color={accountGrowth.rawGrowth >= 0 ? 'success.main' : 'error.main'}
                      >
                        {`${accountGrowth.rawGrowth >= 0 ? '+' : ''}${formatCurrency(accountGrowth.rawGrowth)}`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {`${accountGrowth.rawGrowthPercent >= 0 ? '+' : ''}${accountGrowth.rawGrowthPercent.toFixed(1)}%`}
                      </Typography>
                    </Paper>
                  </Grid>
                  
                  <Grid item xs={12} sm={6} md={3}>
                    <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'background.default' }}>
                      <Typography variant="body2" color="text.secondary">
                        Net Cash Flow
                      </Typography>
                      <Typography variant="h6">
                        {accountGrowth.netCashFlow >= 0 ? '+' : ''}{formatCurrency(accountGrowth.netCashFlow)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Deposits - Withdrawals
                      </Typography>
                    </Paper>
                  </Grid>
                </Grid>
              
                <Alert severity="info" sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    <strong>📊 Understanding Your Metrics:</strong>
                    <br />
                    <strong>Trading Growth:</strong> Your actual trading performance excluding deposits/withdrawals. 
                    This is the true measure of your trading skill.
                    <br />
                    <strong>Total Growth:</strong> Overall account growth including all cash flows.
                  </Typography>
                </Alert>
              </Grid>
            </Grid>
          </Paper>
        </Grid>


        {/* Account Transactions (Deposits & Withdrawals) */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                Account Transactions
              </Typography>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => handleOpenTransactionDialog()}
                disabled={loading}
              >
                Add Transaction
              </Button>
            </Box>
            <Divider sx={{ mb: 3 }} />

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={4}>
                <Paper sx={{ p: 2, backgroundColor: 'success.light', color: 'success.contrastText' }}>
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <ArrowDownward fontSize="small" />
                    <Typography variant="body2">Total Deposits</Typography>
                  </Box>
                  <Typography variant="h5">
                    {formatCurrency(transactionSummary.total_deposits)}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Paper sx={{ p: 2, backgroundColor: 'error.light', color: 'error.contrastText' }}>
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <ArrowUpward fontSize="small" />
                    <Typography variant="body2">Total Withdrawals</Typography>
                  </Box>
                  <Typography variant="h5">
                    {formatCurrency(transactionSummary.total_withdrawals)}
                  </Typography>
                </Paper>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Paper sx={{ 
                  p: 2, 
                  backgroundColor: transactionSummary.net_flow >= 0 ? 'info.light' : 'warning.light',
                  color: transactionSummary.net_flow >= 0 ? 'info.contrastText' : 'warning.contrastText'
                }}>
                  <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <AccountBalance fontSize="small" />
                    <Typography variant="body2">Net Cash Flow</Typography>
                  </Box>
                  <Typography variant="h5">
                    {transactionSummary.net_flow >= 0 ? '+' : ''}{formatCurrency(transactionSummary.net_flow)}
                  </Typography>
                </Paper>
              </Grid>
            </Grid>

            <Alert severity="info" sx={{ mb: 3 }}>
              <Typography variant="body2">
                <strong>Track deposits and withdrawals</strong> to ensure accurate performance metrics. 
                Your returns will be calculated excluding these cash flows, matching professional broker standards.
              </Typography>
            </Alert>

            {/* Transactions Table */}
            {transactions.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body1" color="text.secondary" gutterBottom>
                  No transactions recorded yet
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Add deposits and withdrawals to track accurate account performance
                </Typography>
              </Box>
            ) : (
              <Box sx={{ overflowX: 'auto' }}>
                <List>
                  {transactions.map((txn) => (
                    <ListItem
                      key={txn.id}
                      sx={{
                        border: 1,
                        borderColor: 'divider',
                        borderRadius: 1,
                        mb: 1,
                        '&:hover': { backgroundColor: 'action.hover' }
                      }}
                      secondaryAction={
                        <Box>
                          <Button
                            size="small"
                            startIcon={<Edit />}
                            onClick={() => handleOpenTransactionDialog(txn)}
                            disabled={loading}
                          >
                            Edit
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            startIcon={<Delete />}
                            onClick={() => handleDeleteTransaction(txn.id)}
                            disabled={loading}
                          >
                            Delete
                          </Button>
                        </Box>
                      }
                    >
                      <ListItemIcon>
                        {txn.transaction_type === 'DEPOSIT' ? (
                          <ArrowDownward color="success" />
                        ) : (
                          <ArrowUpward color="error" />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box display="flex" alignItems="center" gap={2}>
                            <Chip
                              label={txn.transaction_type}
                              size="small"
                              color={txn.transaction_type === 'DEPOSIT' ? 'success' : 'error'}
                            />
                            <Typography variant="h6">
                              {formatCurrency(txn.amount)}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {new Date(txn.transaction_date).toLocaleDateString()}
                            </Typography>
                          </Box>
                        }
                        secondary={txn.description || 'No description'}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Application Settings */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Application Settings
            </Typography>
            <Divider sx={{ mb: 3 }} />

            {/* Email Notifications */}
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box display="flex" alignItems="center" gap={2}>
                  <Email />
                  <Typography variant="subtitle1">Email Notifications</Typography>
                  <Chip 
                    label={notificationSettings.email_notifications_enabled ? 'Enabled' : 'Disabled'} 
                    size="small" 
                    color={notificationSettings.email_notifications_enabled ? 'success' : 'default'}
                  />
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Switch 
                          checked={notificationSettings.email_notifications_enabled}
                          onChange={handleNotificationToggle('email_notifications_enabled')}
                        />
                      }
                      label="Enable Email Notifications"
                    />
                  </Grid>
                  
                  {notificationSettings.email_notifications_enabled && (
                    <>
                      <Grid item xs={12}>
                        <FormControlLabel
                          control={
                            <Switch 
                              checked={notificationSettings.weekly_email_enabled}
                              onChange={handleNotificationToggle('weekly_email_enabled')}
                            />
                          }
                          label="Weekly Summary Email (Fridays)"
                        />
                        {notificationSettings.weekly_email_enabled && (
                          <FormControl fullWidth sx={{ mt: 1 }}>
                            <InputLabel>Weekly Email Time</InputLabel>
                            <Select
                              value={notificationSettings.weekly_email_time}
                              onChange={handleTimeChange('weekly_email_time')}
                              label="Weekly Email Time"
                              size="small"
                            >
                              {timeOptions.map(time => (
                                <MenuItem key={time} value={time}>{time}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        )}
                      </Grid>

                      <Grid item xs={12}>
                        <Button 
                          variant="contained" 
                          onClick={handleSaveNotifications}
                          disabled={loading}
                        >
                          {loading ? 'Saving...' : 'Save Notification Settings'}
                        </Button>
                      </Grid>
                    </>
                  )}
                </Grid>
              </AccordionDetails>
            </Accordion>

            {/* Two-Factor Authentication */}
            <Accordion sx={{ mt: 2 }}>
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box display="flex" alignItems="center" gap={2}>
                  <Security />
                  <Typography variant="subtitle1">Two-Factor Authentication</Typography>
                  <Chip 
                    label={user?.two_factor_enabled ? 'Enabled' : 'Disabled'} 
                    size="small" 
                    color={user?.two_factor_enabled ? 'success' : 'default'}
                  />
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary" paragraph>
                      Two-factor authentication adds an extra layer of security to your account. 
                      You'll need an authenticator app like Google Authenticator or Authy.
                    </Typography>
                  </Grid>
                  
                  {!user?.two_factor_enabled ? (
                    <Grid item xs={12}>
                      <Button 
                        variant="contained" 
                        color="primary"
                        onClick={handleSetup2FA}
                        disabled={loading}
                        startIcon={<VpnKey />}
                      >
                        {loading ? 'Setting up...' : 'Setup Two-Factor Authentication'}
                      </Button>
                    </Grid>
                  ) : (
                    <>
                      <Grid item xs={12}>
                        <Typography variant="body1" color="success.main" gutterBottom>
                          ✓ Two-Factor Authentication is enabled
                        </Typography>
                        <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                          <Button 
                            variant="outlined" 
                            onClick={handleRegenerateBackupCodes}
                            disabled={loading}
                            startIcon={<Download />}
                          >
                            Generate New Backup Codes
                          </Button>
                          <Button 
                            variant="outlined" 
                            color="error"
                            onClick={handleDisable2FA}
                            disabled={loading}
                          >
                            Disable 2FA
                          </Button>
                        </Box>
                      </Grid>
                    </>
                  )}
                </Grid>
              </AccordionDetails>
            </Accordion>
          </Paper>
        </Grid>

        {/* Data Management */}
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Data Management
            </Typography>
            <Divider sx={{ mb: 3 }} />

            <Grid container spacing={2}>

              <Grid item xs={12} sx={{ mt: 2 }}>
                <Typography variant="subtitle2" color="error" gutterBottom>
                  Danger Zone
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Button 
                    variant="outlined" 
                    color="info"
                    onClick={handleClearTradeHistory}
                    disabled={loading}
                  >
                    Clear Trade History
                  </Button>
                  <Button 
                    variant="outlined" 
                    color="warning"
                    onClick={handleClearAllData}
                    disabled={loading}
                  >
                    Clear All Data
                  </Button>
                  <Button 
                    variant="outlined" 
                    color="error"
                    onClick={handleDeleteAccount}
                    disabled={loading}
                  >
                    Delete Account
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Clear Trade History: Deletes only positions and trades. Keeps your deposits, withdrawals, and account settings.
                  <br />
                  Clear All Data: Permanently deletes ALL trading data including positions, trades, imports, charts, events, deposits, and withdrawals. Resets account balance to $10,000.
                  <br />
                  Delete Account: Permanently removes your account and all data
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {/* Alert Snackbar */}
      <Snackbar
        open={!!alert}
        autoHideDuration={6000}
        onClose={() => setAlert(null)}
      >
        <Alert 
          onClose={() => setAlert(null)} 
          severity={alert?.type} 
          sx={{ width: '100%' }}
        >
          {alert?.message}
        </Alert>
      </Snackbar>

      {/* 2FA Setup Dialog */}
      <Dialog open={showTwoFactorDialog} onClose={() => setShowTwoFactorDialog(false)} maxWidth="md">
        <DialogTitle>Setup Two-Factor Authentication</DialogTitle>
        <DialogContent>
          {twoFactorSetup && (
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  1. Scan QR Code
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Use your authenticator app to scan this QR code:
                </Typography>
                <Box display="flex" justifyContent="center" mb={2}>
                  <img 
                    src={`data:image/png;base64,${twoFactorSetup.qr_code}`} 
                    alt="2FA QR Code"
                    style={{ maxWidth: '200px', height: 'auto' }}
                  />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Or manually enter this secret: <code>{twoFactorSetup.secret}</code>
                </Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Typography variant="h6" gutterBottom>
                  2. Enter Verification Code
                </Typography>
                <Typography variant="body2" color="text.secondary" paragraph>
                  Enter the 6-digit code from your authenticator app:
                </Typography>
                <TextField
                  fullWidth
                  label="Verification Code"
                  value={twoFactorToken}
                  onChange={(e) => setTwoFactorToken(e.target.value)}
                  placeholder="123456"
                  inputProps={{ maxLength: 6 }}
                  sx={{ mb: 2 }}
                />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowTwoFactorDialog(false)}>Cancel</Button>
          <Button 
            onClick={handleVerify2FA} 
            variant="contained"
            disabled={loading || !twoFactorToken}
          >
            {loading ? 'Verifying...' : 'Verify & Enable'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Backup Codes Dialog */}
      <Dialog open={showBackupCodes} onClose={() => setShowBackupCodes(false)} maxWidth="sm">
        <DialogTitle>Backup Codes</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" paragraph>
            Save these backup codes in a safe place. You can use them to access your account if you lose your phone.
            Each code can only be used once.
          </Typography>
          <Paper sx={{ p: 2, backgroundColor: 'grey.100' }}>
            <List dense>
              {backupCodes.map((code, index) => (
                <ListItem key={index}>
                  <ListItemIcon>
                    <Typography variant="body2" color="text.secondary">
                      {(index + 1).toString().padStart(2, '0')}.
                    </Typography>
                  </ListItemIcon>
                  <ListItemText>
                    <Typography variant="body1" fontFamily="monospace">
                      {code}
                    </Typography>
                  </ListItemText>
                </ListItem>
              ))}
            </List>
          </Paper>
        </DialogContent>
        <DialogActions>
          <Button onClick={downloadBackupCodes} startIcon={<Download />}>
            Download
          </Button>
          <Button onClick={() => setShowBackupCodes(false)} variant="contained">
            I've Saved These Codes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={showDeleteConfirmation} onClose={() => setShowDeleteConfirmation(false)} maxWidth="sm">
        <DialogTitle color="error">Delete Account</DialogTitle>
        <DialogContent>
          <Typography variant="body1" paragraph>
            Are you sure you want to delete your account? This action cannot be undone.
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            This will permanently delete:
          </Typography>
          <Typography variant="body2" color="text.secondary" component="div">
            • Your profile and all personal information
            <br />
            • All your trades and trading data
            <br />
            • All your settings and preferences
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteConfirmation(false)}>
            Cancel
          </Button>
          <Button 
            onClick={confirmDeleteAccount} 
            color="error" 
            variant="contained"
            disabled={loading}
          >
            {loading ? 'Deleting...' : 'Delete Account'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add/Edit Transaction Dialog */}
      <Dialog open={showTransactionDialog} onClose={() => setShowTransactionDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Transaction Type</InputLabel>
                <Select
                  value={transactionForm.transaction_type}
                  onChange={(e: SelectChangeEvent) => 
                    setTransactionForm({ ...transactionForm, transaction_type: e.target.value as 'DEPOSIT' | 'WITHDRAWAL' })
                  }
                  label="Transaction Type"
                >
                  <MenuItem value="DEPOSIT">
                    <Box display="flex" alignItems="center" gap={1}>
                      <ArrowDownward color="success" fontSize="small" />
                      Deposit
                    </Box>
                  </MenuItem>
                  <MenuItem value="WITHDRAWAL">
                    <Box display="flex" alignItems="center" gap={1}>
                      <ArrowUpward color="error" fontSize="small" />
                      Withdrawal
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Amount"
                type="number"
                value={transactionForm.amount || ''}
                onChange={(e) => setTransactionForm({ ...transactionForm, amount: parseFloat(e.target.value) || 0 })}
                InputProps={{
                  startAdornment: <InputAdornment position="start">$</InputAdornment>,
                }}
                helperText="Enter the amount (always positive)"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Date"
                type="date"
                value={transactionForm.transaction_date}
                onChange={(e) => setTransactionForm({ ...transactionForm, transaction_date: e.target.value })}
                InputLabelProps={{
                  shrink: true,
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Description (Optional)"
                value={transactionForm.description}
                onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
                multiline
                rows={2}
                helperText="e.g., Initial funding, Profit withdrawal, etc."
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowTransactionDialog(false)}>Cancel</Button>
          <Button 
            onClick={handleSaveTransaction} 
            variant="contained"
            disabled={loading || transactionForm.amount <= 0}
          >
            {loading ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear All Data Confirmation Dialog */}
      <Dialog open={showClearDataConfirmation} onClose={() => setShowClearDataConfirmation(false)} maxWidth="sm">
        <DialogTitle color="warning">Clear All Data</DialogTitle>
        <DialogContent>
          <Typography variant="body1" paragraph>
            Are you sure you want to clear ALL your trading data? This action cannot be undone and will give you a completely fresh start.
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            This will permanently delete:
          </Typography>
          <Typography variant="body2" color="text.secondary" component="div">
            • All trading positions (both old and new system)
            <br />
            • All trades and trade entries  
            <br />
            • All imported data and import batches
            <br />
            • All position events and transaction history
            <br />
            • All charts and technical analysis data
            <br />
            • All cached data and performance metrics
            <br />
            • Reset account balance to $10,000
          </Typography>
          <Typography variant="body2" color="warning.main" sx={{ mt: 2, fontWeight: 'bold' }}>
            Your account, login, and profile settings will remain intact.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowClearDataConfirmation(false)}>
            Cancel
          </Button>
          <Button 
            onClick={confirmClearAllData} 
            color="warning" 
            variant="contained"
            disabled={loading}
          >
            {loading ? 'Clearing...' : 'Clear All Data'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Clear Trade History Confirmation Dialog */}
      <Dialog open={showClearTradeHistoryConfirmation} onClose={() => setShowClearTradeHistoryConfirmation(false)} maxWidth="sm">
        <DialogTitle color="info">Clear Trade History</DialogTitle>
        <DialogContent>
          <Typography variant="body1" paragraph>
            This will delete all positions and trades, but keep your account settings intact.
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            This will delete:
          </Typography>
          <Typography variant="body2" color="text.secondary" component="div">
            • All positions and trades
            <br />
            • All charts and journal entries
            <br />
            • All imports and cached data
          </Typography>
          <Typography variant="body2" color="success.main" sx={{ mt: 2, fontWeight: 'bold' }} paragraph>
            This will preserve:
          </Typography>
          <Typography variant="body2" color="text.secondary" component="div">
            • Your deposits and withdrawals
            <br />
            • Your starting balance settings
            <br />
            • Your account configuration
            <br />
            • Your custom tags
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowClearTradeHistoryConfirmation(false)}>
            Cancel
          </Button>
          <Button 
            onClick={confirmClearTradeHistory}
            color="info" 
            variant="contained"
            disabled={loading}
          >
            {loading ? 'Clearing...' : 'Clear Trade History'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Settings;
