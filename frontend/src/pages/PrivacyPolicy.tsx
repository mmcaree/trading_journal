import React from 'react';
import { Box, Container, Typography, Paper, Link as MuiLink } from '@mui/material';
import { Link } from 'react-router-dom';

const PrivacyPolicy: React.FC = () => {
  return (
    <Box sx={{ minHeight: '100vh', py: 8, backgroundColor: 'background.default' }}>
      <Container maxWidth="md">
        <Paper sx={{ p: 4 }}>
          <Typography variant="h3" gutterBottom>
            Privacy Policy
          </Typography>
          
          <Typography variant="caption" color="text.secondary" paragraph>
            Last Updated: December 2, 2025
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
            Your Data is Yours
          </Typography>
          <Typography paragraph>
            At Trade Journal, we believe your trading data belongs to you and only you. This privacy policy 
            outlines our commitment to protecting your information and ensuring you maintain full control over your data.
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            1. Data Ownership
          </Typography>
          <Typography paragraph>
            <strong>You own your data.</strong> All trading information, journal entries, charts, notes, and personal 
            information you provide remain your property. We are simply the custodians of your data while you use our service.
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            2. What We Collect
          </Typography>
          <Typography component="div" paragraph>
            We collect only the information necessary to provide you with our trading journal service:
            <ul>
              <li><strong>Account Information:</strong> Email address, username, and encrypted password</li>
              <li><strong>Trading Data:</strong> Positions, trades, journal entries, charts, and notes you create</li>
              <li><strong>Usage Data:</strong> Basic analytics to improve the service (e.g., feature usage, error logs)</li>
            </ul>
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            3. What We Will NEVER Do With Your Data
          </Typography>
          <Typography component="div" paragraph>
            We make the following guarantees:
            <ul>
              <li><strong>We will NEVER sell your data</strong> to third parties, advertisers, or data brokers</li>
              <li><strong>We will NEVER share your trading data</strong> with anyone without your explicit permission</li>
              <li><strong>We will NEVER use your data</strong> for training AI models or any other purpose beyond providing you our service</li>
              <li><strong>We will NEVER distribute or monetize</strong> your personal information or trading records</li>
              <li><strong>We will NEVER contact you</strong> for unsolicited marketing or promotional purposes</li>
            </ul>
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            4. How We Protect Your Data
          </Typography>
          <Typography component="div" paragraph>
            Your data security is our priority:
            <ul>
              <li><strong>Encryption:</strong> All passwords are encrypted using industry-standard bcrypt hashing</li>
              <li><strong>Secure Storage:</strong> Data is stored in secure, encrypted databases</li>
              <li><strong>HTTPS:</strong> All connections use SSL/TLS encryption</li>
              <li><strong>Access Control:</strong> Only you and your mentor have access to your trading data</li>
              <li><strong>No Third-Party Access:</strong> We do not grant third parties access to our databases</li>
            </ul>
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            5. Data Retention and Deletion
          </Typography>
          <Typography paragraph>
            <strong>You control your data.</strong> You may export all of your data at any time from your account settings. 
            You may also permanently delete your account and all associated data at any time. Upon deletion, your data is 
            permanently removed from our systems IMMEDIATELY.
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            6. Cookies and Tracking
          </Typography>
          <Typography paragraph>
            We use essential cookies to maintain your login session. We do not use tracking cookies, advertising cookies, 
            or third-party analytics services that track your behavior across websites.
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            7. Third-Party Services
          </Typography>
          <Typography paragraph>
            We use minimal third-party services to operate our platform:
          </Typography>
          <Typography component="div" paragraph>
            <ul>
              <li><strong>Hosting:</strong> Railway (infrastructure provider) - bound by their privacy policy and security standards</li>
              <li><strong>Email:</strong> SendGrid (for essential account emails only: password resets, account notifications)</li>
              <li><strong>Image Storage:</strong> Cloudinary (optional - for chart uploads only if enabled)</li>
            </ul>
          </Typography>
          <Typography paragraph>
            These services are carefully selected and required only for core functionality. They do not have access to 
            your trading data beyond what is necessary to provide their specific service.
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            8. Your Rights
          </Typography>
          <Typography component="div" paragraph>
            You have the right to:
            <ul>
              <li><strong>Access:</strong> View all data we have about you</li>
              <li><strong>Export:</strong> Download your complete data at any time</li>
              <li><strong>Correct:</strong> Update or modify your information</li>
              <li><strong>Delete:</strong> Permanently remove your account and all data</li>
              <li><strong>Opt-out:</strong> Disable optional features or notifications</li>
            </ul>
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            9. Changes to Privacy Policy
          </Typography>
          <Typography paragraph>
            If we make material changes to this privacy policy, we will notify you via email at least 30 days before 
            the changes take effect. Continued use of the service after notification constitutes acceptance of the updated policy.
          </Typography>

          <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>
            10. Contact Us
          </Typography>
          <Typography paragraph>
            If you have questions about this privacy policy or how we handle your data, please contact us at:
          </Typography>
          <Typography paragraph>
            <strong>Email:</strong> memcaree@gmail.com
          </Typography>

          <Box sx={{ mt: 4, pt: 3, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">
              <MuiLink component={Link} to="/" sx={{ mr: 2 }}>
                Back to Home
              </MuiLink>
              <MuiLink component={Link} to="/register">
                Create Account
              </MuiLink>
            </Typography>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default PrivacyPolicy;
