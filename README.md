# Trading Journal (SwingTrader?)

Trade journal app for tracking swing trades. Built with React/FastAPI.

## Features

- Trade tracking
- Basic analytics
- Chart uploads
- CSV import

## To Do

- ~~- Add options support~~
- Fix chart formatting issues  
- Better historical data (yfinance sucks)
- Performance optimization
- Mobile responsive design
- ~~- Actually implement email summaries, too lazy right now lmao~~
- ~~- Discord alert copy-paste functionality~~
- Correct Trade Results logic for options trades

## Setup

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload (should also prob specify port)

# Frontend  
cd frontend
npm install
npm run dev
```

## Links
- [Live App](https://tradejournal.trade)
- [API Docs](https://tradingjournal.up.railway.app/docs)

## License

**All Rights Reserved** - Don't use my code without explicit permission. Please just ask first.
