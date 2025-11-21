# TradeJournal Architecture - Visual Diagram

## Complete System Overview

```mermaid
flowchart TB
    subgraph Client["🌐 Client Layer"]
        Browser["Web Browser<br/>Chrome, Firefox, Safari"]
    end
    
    subgraph Frontend["⚛️ Frontend Application"]
        direction TB
        Router["React Router<br/>SPA Navigation"]
        
        subgraph Auth["🔐 Authentication"]
            AuthContext["Auth Context<br/>JWT Management"]
            Login["Login/Register Pages"]
        end
        
        subgraph Core["Core Pages"]
            Dashboard["📊 Dashboard<br/>Overview & Metrics"]
            Positions["📈 Positions<br/>Open Positions Table"]
            Trades["📋 Trades List<br/>Closed Positions"]
            Analytics["📉 Analytics<br/>Performance Charts"]
        end
        
        subgraph Support["Support Features"]
            Import["📥 Import Data<br/>CSV Upload"]
            Settings["⚙️ Settings<br/>User Preferences"]
            Admin["👨‍🏫 Admin<br/>Instructor Dashboard"]
        end
        
        subgraph Services["Frontend Services"]
            PosService["positionsService.ts<br/>Position CRUD & Analytics"]
            AuthService["authService.ts<br/>Authentication"]
            ImportService["importService.ts<br/>CSV Processing"]
        end
    end
    
    subgraph Backend["🐍 Backend API"]
        direction TB
        FastAPI["FastAPI Application<br/>Python Web Framework"]
        
        subgraph Routes["API Routes"]
            AuthAPI["🔑 /api/auth<br/>Login, Register, Token"]
            PosAPI["📦 /api/v2/positions<br/>CRUD Operations"]
            EventAPI["📝 /api/v2/positions/events<br/>Buy/Sell Events"]
            AnalyticsAPI["📊 /api/analytics<br/>Performance Stats"]
            AdminAPI["👨‍🏫 /api/admin<br/>Instructor Tools"]
        end
        
        subgraph BizLogic["Business Logic"]
            PosSvc["PositionService<br/>Core Logic"]
            
            subgraph EventSourcing["Event Sourcing"]
                CreateEvent["Create Events<br/>(Buy/Sell)"]
                FIFO["FIFO Calculator<br/>(Cost Basis)"]
                Recalc["Recalculate Position<br/>(Aggregate State)"]
            end
            
            ImportSvc["ImportService<br/>CSV Processing"]
            AnalyticsSvc["AnalyticsService<br/>Metrics Calculation"]
        end
        
        subgraph Models["Data Models"]
            Position["TradingPosition<br/>(Aggregated View)"]
            Event["TradingPositionEvent<br/>(Immutable History)"]
            User["User<br/>(Authentication)"]
        end
    end
    
    subgraph DataLayer["💾 Data Layer"]
        direction TB
        Postgres[("PostgreSQL<br/>Relational Database<br/>10+ Tables")]
        Redis[("Redis<br/>Cache & Sessions<br/>30s TTL")]
        Files[("Static Files<br/>Charts & Images<br/>S3/Local Storage")]
    end
    
    Browser --> Router
    Router --> Auth
    Router --> Core
    Router --> Support
    Core --> Services
    Support --> Services
    Auth --> Services
    
    Services -->|"HTTP/REST"| FastAPI
    FastAPI --> Routes
    Routes --> BizLogic
    BizLogic --> EventSourcing
    EventSourcing --> Models
    Models --> Postgres
    BizLogic --> Redis
    Routes --> Files
    
    style Client fill:#e8f5e9,stroke:#2e7d32,stroke-width:3px
    style Frontend fill:#e3f2fd,stroke:#1976d2,stroke-width:3px
    style Backend fill:#fff3e0,stroke:#f57c00,stroke-width:3px
    style DataLayer fill:#f3e5f5,stroke:#7b1fa2,stroke-width:3px
    style EventSourcing fill:#ffccbc,stroke:#d84315,stroke-width:2px
```

## Position Lifecycle - Event Sourcing Pattern

```mermaid
flowchart LR
    subgraph User["👤 User Actions"]
        direction TB
        Create["Create Position<br/>Initial Buy Event"]
        Add["Add Shares<br/>Buy Event"]
        Sell["Sell Shares<br/>Sell Event"]
        Update["Update Metadata<br/>Notes/Strategy"]
    end
    
    subgraph EventLog["📚 Event Log (Immutable)"]
        direction TB
        E1["Event 1: BUY<br/>100 @ $50.00<br/>2024-01-01"]
        E2["Event 2: BUY<br/>50 @ $52.00<br/>2024-01-15"]
        E3["Event 3: SELL<br/>75 @ $55.00<br/>2024-02-01"]
        E4["Event 4: SELL<br/>75 @ $48.00<br/>2024-02-15"]
    end
    
    subgraph Processing["⚙️ Event Processing"]
        direction TB
        FIFO["FIFO Cost Basis<br/>First In, First Out"]
        CalcShares["Calculate Shares<br/>Σ buys - Σ sells"]
        CalcPnL["Calculate P&L<br/>(sell price - cost) × shares"]
        CalcAvg["Calculate Avg Entry<br/>Total cost ÷ shares"]
    end
    
    subgraph Aggregate["📊 Aggregated Position"]
        direction TB
        Current["Current State<br/>━━━━━━━━━━<br/>Shares: 0<br/>Avg Entry: $50.67<br/>Total Cost: $0<br/>Realized P&L: -$225<br/>Status: CLOSED"]
    end
    
    Create --> E1
    Add --> E2
    Sell --> E3 & E4
    Update -.->|"Metadata Only"| Current
    
    E1 & E2 & E3 & E4 --> FIFO
    FIFO --> CalcShares & CalcPnL & CalcAvg
    CalcShares & CalcPnL & CalcAvg --> Current
    
    style User fill:#c8e6c9,stroke:#2e7d32
    style EventLog fill:#b3e5fc,stroke:#1976d2
    style Processing fill:#ffccbc,stroke:#d84315
    style Aggregate fill:#fff9c4,stroke:#f57c00
```

## Database Schema - Entity Relationships

```mermaid
erDiagram
    User ||--o{ TradingPosition : "owns"
    User ||--o{ InstructorNote : "creates/receives"
    User {
        int id PK
        string username UK
        string email UK
        string hashed_password
        string role "STUDENT/INSTRUCTOR"
        float current_account_balance
        boolean two_factor_enabled
    }
    
    TradingPosition ||--o{ TradingPositionEvent : "has"
    TradingPosition ||--o{ TradingPositionChart : "has"
    TradingPosition ||--o{ TradingPositionJournalEntry : "has"
    TradingPosition {
        int id PK
        int user_id FK
        string ticker
        string status "OPEN/CLOSED"
        int current_shares
        float avg_entry_price
        float total_cost
        float total_realized_pnl
        float current_stop_loss
        datetime opened_at
        datetime closed_at
    }
    
    TradingPositionEvent {
        int id PK
        int position_id FK
        string event_type "BUY/SELL"
        datetime event_date
        int shares
        float price
        float stop_loss
        float realized_pnl
        string source "MANUAL/IMPORT"
    }
    
    TradingPositionJournalEntry {
        int id PK
        int position_id FK
        string entry_type "NOTE/LESSON/MISTAKE"
        text content
        datetime entry_date
    }
    
    TradingPositionChart {
        int id PK
        int position_id FK
        string image_url
        text description
    }
    
    InstructorNote {
        int id PK
        int instructor_id FK
        int student_id FK
        text note_text
        boolean is_flagged
    }
```

## Request Flow - From Click to Database

```mermaid
sequenceDiagram
    participant U as 👤 User
    participant UI as 🎨 React UI
    participant S as 🔧 Service Layer
    participant API as 🌐 FastAPI
    participant Auth as 🔐 JWT Auth
    participant BL as 💼 Business Logic
    participant DB as 💾 PostgreSQL
    
    U->>UI: Click "Add to Position"
    UI->>UI: Open Modal
    U->>UI: Enter shares & price
    UI->>UI: Validate Input
    UI->>S: positionsService.addToPosition()
    S->>API: POST /api/v2/positions/{id}/events
    
    API->>Auth: Verify JWT Token
    Auth->>Auth: Extract user_id
    Auth-->>API: Current User
    
    API->>BL: position_service.add_shares()
    BL->>DB: Create TradingPositionEvent
    BL->>BL: Recalculate Position (FIFO)
    BL->>DB: Update TradingPosition
    DB-->>BL: Success
    BL-->>API: Event + Position
    API-->>S: 201 Created
    S->>S: Clear Cache
    S-->>UI: Update State
    UI->>UI: Close Modal
    UI->>UI: Refresh Position List
    UI-->>U: Show Success Message
```

## CSV Import Pipeline

```mermaid
flowchart TD
    Upload["User Uploads CSV<br/>Webull Format"]
    
    subgraph Frontend4["Frontend Processing"]
        Select["Select File"]
        Preview["Preview Data"]
        Confirm["Confirm Import"]
    end
    
    subgraph Backend4["Backend Processing"]
        Parse["Parse CSV<br/>Extract rows"]
        
        subgraph Validate["Validation"]
            CheckFormat["Check Format<br/>Required columns"]
            CheckDates["Validate Dates<br/>Parse timestamps"]
            CheckPrices["Validate Prices<br/>Positive numbers"]
        end
        
        subgraph Transform["Transformation"]
            DetectOptions["Detect Options<br/>Parse symbol format"]
            GroupSymbol["Group by Symbol<br/>Track position lifecycle"]
            MatchStop["Match Stop Loss<br/>Link cancelled orders"]
        end
        
        subgraph Create["Position Creation"]
            CreatePos2["Create/Find Position"]
            CreateEvents["Create Events<br/>Buy/Sell"]
            LinkEvents["Link to Position"]
        end
    end
    
    Result2["Import Result<br/>Success/Errors Report"]
    
    Upload --> Select
    Select --> Preview
    Preview --> Confirm
    Confirm --> Parse
    Parse --> Validate
    Validate --> Transform
    Transform --> Create
    Create --> Result2
    
    style Frontend4 fill:#e3f2fd
    style Backend4 fill:#fff3e0
    style Validate fill:#c5e1a5
    style Transform fill:#ffe0b2
    style Create fill:#b3e5fc
```

## Analytics Calculation Flow

```mermaid
flowchart TB
    Load["Load Analytics Page"]
    
    subgraph Fetch["Data Fetching"]
        GetPositions["Get All Positions<br/>(with events)"]
        GetAccount2["Get Account Info"]
    end
    
    subgraph Metrics["Metrics Calculation"]
        direction TB
        
        subgraph Basic["Basic Metrics"]
            CountOpen["Count Open Positions"]
            CountClosed["Count Closed Positions"]
            SumRealized["Sum Realized P&L<br/>(from closed)"]
        end
        
        subgraph Advanced["Advanced Metrics"]
            CalcWinRate["Calculate Win Rate<br/>Winners ÷ Total"]
            CalcUnrealized["Calculate Unrealized P&L<br/>(current_price - avg_entry)"]
            BuildEquity["Build Equity Curve<br/>Cumulative P&L over time"]
        end
        
        subgraph Strategy["Strategy Analysis"]
            GroupStrategy["Group by Strategy"]
            CalcStrategyWR["Calculate Win Rate per Strategy"]
            BestWorst["Find Best/Worst Performers"]
        end
    end
    
    Render["Render Charts & Tables"]
    
    Load --> Fetch
    Fetch --> Metrics
    Metrics --> Render
    
    style Fetch fill:#b3e5fc
    style Basic fill:#c5e1a5
    style Advanced fill:#ffe0b2
    style Strategy fill:#ffccbc
```

## Component Hierarchy

```mermaid
flowchart TB
    App["App.tsx<br/>Main Router"]
    
    subgraph Layout["Dashboard Layout"]
        Sidebar["Sidebar<br/>Navigation Menu"]
        Topbar["Topbar<br/>User Menu + Currency"]
        Content["Content Area"]
    end
    
    subgraph PositionsPage["Positions Page"]
        PosTable["Positions Table<br/>MUI DataGrid"]
        SearchBar["Search & Filter"]
        ActionButtons["Action Buttons"]
        
        subgraph Modals2["Modals"]
            CreateModal["Create Position Modal"]
            AddModal["Add Shares Modal"]
            SellModal["Sell Shares Modal"]
            DetailsModal["Position Details Modal"]
            
            subgraph DetailsContent["Details Modal Content"]
                EventTable["Event Breakdown Table"]
                JournalList2["Journal Entry List"]
                ChartGallery["Chart Gallery"]
            end
        end
    end
    
    App --> Layout
    Layout --> Content
    Content --> PositionsPage
    PositionsPage --> PosTable & SearchBar & ActionButtons
    ActionButtons --> Modals2
    DetailsModal --> DetailsContent
    
    style Layout fill:#e3f2fd
    style PositionsPage fill:#c5e1a5
    style Modals2 fill:#fff9c4
    style DetailsContent fill:#ffe0b2
```

## Authentication & Authorization Flow

```mermaid
flowchart TD
    LoginForm2["Login Form<br/>Username + Password"]
    
    subgraph Backend5["Backend"]
        Validate3["Validate Credentials<br/>bcrypt.checkpw()"]
        Generate2["Generate JWT Token<br/>HS256 + 7d expiry"]
    end
    
    subgraph Frontend5["Frontend"]
        SaveToken2["Save to localStorage"]
        SetContext2["Update Auth Context"]
        Redirect2["Redirect to Dashboard"]
    end
    
    subgraph ProtectedReq["Protected API Request"]
        AddHeader2["Add Header<br/>Authorization: Bearer {token}"]
        BackendVerify["Backend Verifies Token"]
        ExtractUser["Extract user_id from token"]
        CheckPerms["Check Permissions<br/>Role + Resource ownership"]
    end
    
    Process2["Process Request"]
    
    LoginForm2 --> Validate3
    Validate3 --> Generate2
    Generate2 --> SaveToken2
    SaveToken2 --> SetContext2
    SetContext2 --> Redirect2
    
    Redirect2 -.-> AddHeader2
    AddHeader2 --> BackendVerify
    BackendVerify --> ExtractUser
    ExtractUser --> CheckPerms
    CheckPerms --> Process2
    
    style Backend5 fill:#ffccbc
    style Frontend5 fill:#c5cae9
    style ProtectedReq fill:#b2dfdb
```

## Technology Stack

```mermaid
flowchart LR
    subgraph FE["Frontend Stack"]
        direction TB
        React["React 18<br/>UI Library"]
        TS["TypeScript<br/>Type Safety"]
        MUI["Material-UI v5<br/>Components"]
        Router2["React Router v6<br/>Navigation"]
        Axios2["Axios<br/>HTTP Client"]
        Vite2["Vite<br/>Build Tool"]
    end
    
    subgraph BE["Backend Stack"]
        direction TB
        FastAPI2["FastAPI<br/>Web Framework"]
        Python["Python 3.11+<br/>Language"]
        SQLAlchemy["SQLAlchemy<br/>ORM"]
        Pydantic["Pydantic<br/>Validation"]
        JWT2["JWT<br/>Authentication"]
        Bcrypt["Bcrypt<br/>Password Hashing"]
    end
    
    subgraph Data2["Data Stack"]
        direction TB
        PostgreSQL["PostgreSQL<br/>Primary DB"]
        Redis3["Redis<br/>Cache"]
        Docker2["Docker<br/>Containerization"]
        Railway2["Railway<br/>Hosting"]
    end
    
    FE <-->|"REST API"| BE
    BE <--> Data2
    
    style FE fill:#e3f2fd
    style BE fill:#fff3e0
    style Data2 fill:#f3e5f5
```

---

**Generated:** November 21, 2025  
**For:** TradeJournal Project Architecture Documentation
