# SAR Trading Journal

Professional trading journal for tracking both stock and options trades. Built with React/TypeScript and FastAPI.

## ✨ Features

### 📊 **Trading**
- **Stock Trading**: Full position lifecycle tracking with P&L calculations
- **Options Trading**: Complete options support with contract-based pricing
- **Risk Management**: Stop loss tracking and risk percentage calculations
- **Position Events**: Detailed event history for all trading activities

### 📈 **Analytics**
- Real-time P&L calculations with currency formatting
- Position performance metrics and return percentages
- Risk analysis with original and current risk percentages
- Historical trade analysis and patterns

### 🔄 **Import System**
- **CSV Import**: Automated Webull CSV import with options auto-detection
- **Smart Parsing**: Automatic options symbol parsing and price conversion
- **Stop Loss Detection**: Intelligent stop loss matching from cancelled orders
- **Data Validation**: Comprehensive import validation and error reporting

### 🎯 **Options Trading Support**
- **Manual Creation**: Create options positions via dropdown selection
- **Contract Pricing**: Automatic 100x multiplier for options contracts
- **Strike & Expiration**: Track strike prices and expiration dates
- **Call/Put Support**: Full support for both call and put options
- **Contract Management**: Add and sell contracts with proper pricing

### 🖼️ **Media & Notes**
- Chart upload and management
- Position notes and trade lessons
- Mistake tracking for continuous improvement

## 🚀 Recent Updates (v2.0)

### ✅ **Options Trading System**
- Complete manual options trading through UI
- Dropdown-based instrument type selection (Stock/Options)
- Automatic contract price calculations (×100 multiplier)
- Options details display (strike, expiration, type)
- Enhanced import service with options auto-detection

### ✅ **Production Ready**
- Cleaned codebase with removed debug files
- Railway deployment optimization
- Security vulnerability fixes
- Comprehensive error handling

## 🛠️ To Do

- Fix chart formatting issues  
- Better historical data integration
- Performance optimization
- Mobile responsive design
- Advanced analytics dashboard

## 💻 Tech Stack

### Backend
- **FastAPI** - High-performance Python web framework
- **SQLAlchemy** - Database ORM with PostgreSQL
- **Pydantic** - Data validation and settings management
- **JWT Authentication** - Secure user authentication
- **Alembic** - Database migrations

### Frontend
- **React 18** - Modern React with hooks
- **TypeScript** - Type-safe JavaScript
- **Material-UI v5** - Modern React component library
- **React Hook Form** - Performant form handling
- **Axios** - HTTP client for API communication
- **Vite** - Fast build tool and dev server

### Deployment
- **Railway** - Cloud hosting platform
- **PostgreSQL** - Production database
- **Docker** - Containerized deployment

## 🚀 Local Development

```bash
# Backend Setup
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend Setup
cd frontend
npm install
npm run dev
```

## 📦 Deployment

The application is configured for automatic deployment on Railway:

1. **Push to main branch** - Triggers automatic deployment
2. **Database migrations** - Run automatically on deployment
3. **Environment variables** - Configured in Railway dashboard
4. **Static files** - Frontend built and served by FastAPI

### Environment Variables
```bash
DATABASE_URL=postgresql://...
SECRET_KEY=your_secret_key
CORS_ORIGINS=["https://your-domain.com"]
ENVIRONMENT=production
```

## 🔗 Links
- [Live App](https://tradejournal.trade)
- [API Documentation](https://tradingjournal.up.railway.app/docs)

## 📊 Options Trading Guide

### Creating Options Positions
1. Select "Options" from instrument type dropdown
2. Enter strike price, expiration date, and option type (Call/Put)
3. Enter contract price (will be automatically multiplied by 100)
4. System handles all contract-based calculations

### CSV Import
- Supports Webull CSV format with automatic options detection
- Parses complex options symbols (e.g., AAPL250926C00150000)
- Links stop losses to positions automatically

## License

**All Rights Reserved** - Don't use my code without explicit permission. Please just ask first.
