import React, { useState, useEffect } from 'react';
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
  Save
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { updateProfile, changePassword, UserUpdateData, ChangePasswordData, exportUserData, deleteUserAccount, clearAllUserData } from '../services/userService';
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

  // Load account settings from service on component mount
  useEffect(() => {
    const settings = accountService.getAccountSettings();
    setAccountSettings(settings);
    setTempAccountBalance(settings.current_balance.toString());
    setTempStartingBalance(settings.starting_balance.toString());
  }, []);

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

    if (passwordData.new_password.length < 6) {
      setAlert({ type: 'error', message: 'New password must be at least 6 characters long' });
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

  // Account balance handlers
  const handleAccountBalanceUpdate = async () => {
    const newBalance = parseFloat(tempAccountBalance);
    
    if (isNaN(newBalance) || newBalance <= 0) {
      setAlert({ type: 'error', message: 'Please enter a valid account balance greater than 0' });
      return;
    }

    setLoading(true);
    
    try {
      accountService.updateCurrentBalance(newBalance);
      const updatedSettings = accountService.getAccountSettings();
      setAccountSettings(updatedSettings);
      
      setAlert({ type: 'success', message: 'Account balance updated successfully!' });
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const resetToStartingBalance = () => {
    setTempAccountBalance(accountSettings.starting_balance.toString());
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
      accountService.updateStartingBalance(newStartingBalance);
      const updatedSettings = accountService.getAccountSettings();
      setAccountSettings(updatedSettings);
      
      setAlert({ type: 'success', message: 'Starting balance updated successfully!' });
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return accountService.formatCurrency(amount);
  };

  const calculateAccountGrowth = () => {
    return accountService.getAccountGrowth();
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

  const handleDeleteAccount = async () => {
    setShowDeleteConfirmation(true);
  };

  const handleClearAllData = async () => {
    setShowClearDataConfirmation(true);
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
      
      // Clear any cached data in localStorage related to trading
      const keysToRemove = [
        'dashboardData',
        'analyticsData', 
        'tradesCache',
        'chartData'
      ];
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      setAlert({ 
        type: 'success', 
        message: 'All trading data cleared successfully! Your account balance has been reset to $10,000 and all trades/positions have been deleted.' 
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
                  <Avatar sx={{ width: 80, height: 80 }}>
                    {getAvatarInitials()}
                  </Avatar>
                  <Box>
                    <Typography variant="h6">{getDisplayName()}</Typography>
                    <Typography variant="body2" color="text.secondary">@{user?.username}</Typography>
                    <Button variant="outlined" size="small" sx={{ mt: 1 }}>
                      Change Photo
                    </Button>
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
              {/* Current Account Balance */}
              <Grid item xs={12} md={6}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <AccountBalance sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h6">Current Account Balance</Typography>
                </Box>
                
                <Typography variant="h4" color="primary" gutterBottom>
                  {formatCurrency(accountSettings.current_balance)}
                </Typography>
                
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
                    Starting Balance: {formatCurrency(accountSettings.starting_balance)}
                  </Typography>
                  {(() => {
                    const { growth, growthPercent } = calculateAccountGrowth();
                    return (
                      <Chip 
                        icon={<TrendingUp />}
                        label={`${growth >= 0 ? '+' : ''}${formatCurrency(growth)} (${growthPercent >= 0 ? '+' : ''}${growthPercent.toFixed(1)}%)`}
                        color={growth >= 0 ? 'success' : 'error'}
                        size="small"
                      />
                    );
                  })()}
                </Box>

                <TextField
                  fullWidth
                  label="Update Account Balance"
                  value={tempAccountBalance}
                  onChange={(e) => setTempAccountBalance(e.target.value)}
                  type="number"
                  InputProps={{
                    startAdornment: <InputAdornment position="start">$</InputAdornment>,
                  }}
                  helperText="Enter your current account balance to help with position sizing calculations"
                  sx={{ mb: 2 }}
                />
                
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Button 
                    variant="contained" 
                    color="primary" 
                    onClick={handleAccountBalanceUpdate}
                    disabled={loading}
                    startIcon={<Save />}
                  >
                    {loading ? 'Updating...' : 'Update Balance'}
                  </Button>
                  <Button 
                    variant="outlined" 
                    onClick={resetToStartingBalance}
                    disabled={loading}
                  >
                    Reset to Starting
                  </Button>
                </Box>
              </Grid>

              {/* Starting Balance Configuration */}
              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <TrendingUp sx={{ mr: 1, color: 'warning.main' }} />
                  <Typography variant="h6">Starting Balance Configuration</Typography>
                </Box>
                
                <Grid container spacing={3} alignItems="center">
                  <Grid item xs={12} md={8}>
                    <TextField
                      fullWidth
                      label="Set Starting Balance"
                      value={tempStartingBalance}
                      onChange={(e) => setTempStartingBalance(e.target.value)}
                      type="number"
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      }}
                      helperText="Set your account's starting balance for accurate growth calculations"
                      sx={{ mb: 2 }}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Button 
                      variant="contained" 
                      color="warning"
                      onClick={handleStartingBalanceUpdate}
                      disabled={loading}
                      startIcon={<Save />}
                      fullWidth
                    >
                      {loading ? 'Updating...' : 'Update Starting Balance'}
                    </Button>
                  </Grid>
                </Grid>
                
                <Alert severity="warning" sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    <strong>Important:</strong> Changing your starting balance will affect all growth calculations and percentages. 
                    This should represent your initial account value when you started tracking trades.
                  </Typography>
                </Alert>
              </Grid>

              {/* Account Stats */}
              <Grid item xs={12} md={6}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <TrendingUp sx={{ mr: 1, color: 'success.main' }} />
                  <Typography variant="h6">Account Statistics</Typography>
                </Box>
                
                <Grid container spacing={2}>
                  <Grid item xs={6}>
                    <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: 'background.default' }}>
                      <Typography variant="body2" color="text.secondary">
                        Starting Balance
                      </Typography>
                      <Typography variant="h6">
                        {formatCurrency(accountSettings.starting_balance)}
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={6}>
                    <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: 'background.default' }}>
                      <Typography variant="body2" color="text.secondary">
                        Last Updated
                      </Typography>
                      <Typography variant="h6">
                        {new Date(accountSettings.last_updated).toLocaleDateString()}
                      </Typography>
                    </Paper>
                  </Grid>
                  <Grid item xs={12}>
                    <Paper sx={{ p: 2, textAlign: 'center', backgroundColor: 'background.default' }}>
                      <Typography variant="body2" color="text.secondary">
                        Account Growth
                      </Typography>
                      <Typography 
                        variant="h6" 
                        color={calculateAccountGrowth().growth >= 0 ? 'success.main' : 'error.main'}
                      >
                        {(() => {
                          const { growth, growthPercent } = calculateAccountGrowth();
                          return `${growth >= 0 ? '+' : ''}${formatCurrency(growth)} (${growthPercent >= 0 ? '+' : ''}${growthPercent.toFixed(1)}%)`;
                        })()}
                      </Typography>
                    </Paper>
                  </Grid>
                </Grid>
                
                <Alert severity="info" sx={{ mt: 2 }}>
                  <Typography variant="body2">
                    <strong>Why track account size?</strong>
                    <br />
                    Your account balance helps calculate proper position sizes and risk percentages. 
                    Update it regularly as your account grows to maintain optimal risk management.
                  </Typography>
                </Alert>
              </Grid>
            </Grid>
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
              <Grid item xs={12}>
                <Button 
                  variant="outlined" 
                  color="primary" 
                  sx={{ mr: 2 }}
                  onClick={handleExportData}
                  disabled={loading}
                >
                  {loading ? 'Exporting...' : 'Export All Data'}
                </Button>
              </Grid>
              <Grid item xs={12} sx={{ mt: 2 }}>
                <Typography variant="subtitle2" color="error" gutterBottom>
                  Danger Zone
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
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
                  Clear All Data: Resets account balance and clears cached data (keeps your account)
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

      {/* Clear All Data Confirmation Dialog */}
      <Dialog open={showClearDataConfirmation} onClose={() => setShowClearDataConfirmation(false)} maxWidth="sm">
        <DialogTitle color="warning">Clear All Data</DialogTitle>
        <DialogContent>
          <Typography variant="body1" paragraph>
            Are you sure you want to clear all your trading data? This will give you a fresh start.
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            This will permanently delete:
          </Typography>
          <Typography variant="body2" color="text.secondary" component="div">
            • All your trades and positions
            <br />
            • All imported trading data and history
            <br />
            • All charts and trade analysis
            <br />
            • Account balance will be reset to $10,000
          </Typography>
          <Typography variant="body2" color="error.main" sx={{ mt: 2 }}>
            <strong>Warning:</strong> This action cannot be undone! All your trading data will be permanently deleted from the database.
            Your profile and login credentials will remain intact.
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
    </Box>
  );
};

export default Settings;
