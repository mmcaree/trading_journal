# Changelog

All notable changes to TradeJournal will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-09-19

### Major Features Added

#### Weekly Email Analytics System
- **Comprehensive Weekly Reports**: Automated weekly trading performance summaries sent every Friday
- **14+ Analytics Metrics**: Including P&L, win rate, largest win/loss, strategy performance, and more
- **Timezone-Aware Delivery**: Users can set their preferred timezone for accurate email scheduling
- **Beautiful HTML Templates**: Professional email design with TradeJournal branding and responsive layout
- **Multi-Provider Email Support**: SMTP, SendGrid, Resend, and Mailgun integration for reliable delivery
- **APScheduler Integration**: Robust background job scheduling for automated email delivery

#### CSV Trade Import System
- **Broker Integration**: Support for importing trades from popular brokers via CSV
- **Data Validation**: Comprehensive validation and error handling for imported data
- **Batch Processing**: Efficient handling of large trade datasets with progress tracking
- **Duplicate Detection**: Smart duplicate prevention to avoid data conflicts
- **Position Tracking**: Automatic position calculation and P&L tracking from imported data

#### Enhanced Authentication & Security
- **Forgot Password Flow**: Complete password reset system with secure token-based authentication
- **Email Verification**: Secure email-based password reset with time-limited tokens
- **Two-Factor Authentication**: TOTP-based 2FA with QR codes and backup codes
- **Session Management**: Improved user session handling and security

### User Interface Improvements

#### Settings Page Overhaul
- **Account Management**: Current balance tracking with growth calculations and visual indicators
- **Timezone Configuration**: Full timezone support for accurate scheduling across regions
- **Email Preferences**: Simplified weekly email notification settings
- **Profile Management**: Enhanced user profile editing with avatar display
- **Security Settings**: Integrated 2FA setup and backup code management

#### Dashboard Enhancements
- **Real-time Analytics**: Updated dashboard with comprehensive trading metrics
- **Performance Tracking**: Visual representations of account growth and trading performance
- **Trade Management**: Improved trade entry and editing interfaces

### Technical Improvements

#### Database Schema Updates
- **Timezone Support**: Added timezone column to users table for personalized scheduling
- **Import Tracking**: New tables for tracking CSV imports and batch processing
- **Account Balance Snapshots**: Historical balance tracking for accurate P&L calculations
- **Password Reset Fields**: Secure token storage for password reset functionality

#### Backend Architecture
- **Model Reorganization**: Cleaner separation of concerns with organized model structure
- **Service Layer Enhancement**: Improved service layer with analytics, email, and import services
- **Error Handling**: Comprehensive error handling and logging throughout the application
- **Configuration Management**: Environment-based configuration for production deployment

#### Email Service Architecture
- **Multi-Provider Support**: Flexible email provider switching (SMTP, SendGrid, Resend, Mailgun)
- **Template Engine**: Jinja2-based email templating for dynamic content
- **Professional Branding**: Consistent TradeJournal branding across all communications
- **Delivery Reliability**: Fallback mechanisms and error handling for email delivery

### Production Readiness

#### Domain & Branding
- **Custom Domain**: Full migration from SwingTrader to TradeJournal with tradejournal.trade domain
- **Professional Branding**: Consistent branding across frontend, backend, and email communications
- **DNS Configuration**: Complete DNS setup with proper routing and SSL certificates

#### Deployment Optimization
- **Railway Integration**: Optimized for Railway deployment with proper database migrations
- **Environment Configuration**: Production-ready environment variable management
- **CORS Configuration**: Proper CORS setup for production domain
- **Repository Cleanup**: Cleaned codebase with proper .gitignore patterns

### Bug Fixes

#### Frontend Fixes
- **JSX Syntax Errors**: Resolved React component structure issues in Settings page
- **Form Validation**: Improved form validation and error messaging
- **State Management**: Fixed state synchronization issues across components

#### Backend Fixes
- **Model Conflicts**: Resolved SQLAlchemy table duplication issues
- **Import Dependencies**: Fixed circular import issues with model organization
- **Database Migrations**: Ensured all migrations are compatible with production database

### Documentation

#### Comprehensive Guides
- **Weekly Email System Documentation**: Complete setup and configuration guide
- **DNS Setup Guide**: Step-by-step domain configuration instructions
- **Production Email Setup**: Multi-provider email configuration guide
- **Database Migration Guide**: Railway-specific migration procedures

#### Code Documentation
- **API Documentation**: Improved inline documentation for all API endpoints
- **Service Documentation**: Comprehensive documentation for all service layers
- **Configuration Documentation**: Clear documentation for environment variables and settings

### Database Migrations

#### Schema Updates
- **Users Table**: Added timezone, password reset fields, and email preferences
- **Trades Table**: Enhanced with account balance snapshots for accurate tracking
- **Import Tables**: New import_batches and imported_orders tables for CSV import functionality
- **Indexes**: Optimized database indexes for improved query performance

### Configuration Changes

#### Environment Variables
- **FRONTEND_URL**: Updated default from localhost to production domain (https://tradejournal.trade)
- **CORS_ORIGINS**: Production-ready CORS configuration
- **EMAIL_PROVIDER**: Configurable email provider support
- **TIMEZONE**: User-specific timezone configuration support

#### Application Settings
- **Email Scheduling**: Weekly email delivery on Fridays with timezone awareness
- **Security Settings**: Enhanced security with token-based authentication
- **Performance Settings**: Optimized database queries and background job processing

### Removed Features

#### Deprecated Functionality
- **Daily Email Notifications**: Removed in favor of focused weekly summaries
- **Legacy Import System**: Replaced with new CSV import system
- **Old Branding**: Completely migrated from SwingTrader to TradeJournal

### Future Enhancements

#### Planned Features
- **Mobile App**: React Native mobile application development
- **Advanced Analytics**: Machine learning-based trading insights
- **Social Features**: Trade sharing and community features
- **Broker API Integration**: Direct broker API connections for real-time data

---

## Migration Notes

### From Previous Version
1. **Database**: Run all pending migrations before deployment
2. **Environment Variables**: Update FRONTEND_URL and email provider settings
3. **DNS**: Configure tradejournal.trade domain with proper SSL
4. **Email Setup**: Configure preferred email provider (Resend recommended)

### Breaking Changes
- **Frontend URL**: Changed from localhost to production domain
- **Email Templates**: New HTML templates require email provider configuration
- **Database Schema**: New tables and columns require migration
- **API Endpoints**: Some endpoint responses have been enhanced

---

## Support

For support and questions about this release:
- **Documentation**: Check the comprehensive guides in the repository (lol jk no documentation for you)
- **Issues**: Report bugs and feature requests via GitHub issues

---

**Full Changelog**: https://github.com/mmcaree/qualla_roadmap/compare/v1.0.0...v2.0.0