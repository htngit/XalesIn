# Architecture Diagram - Xender-In Next.js Website

## System Architecture Overview

```mermaid
graph TB
    subgraph "User Access Layer"
        A[Browser/Device] --> B[Next.js Web Application]
        C[Mobile Device] --> B
        D[Tablet] --> B
    end

    subgraph "Next.js Web Application"
        B --> E[Authentication Layer]
        B --> F[API Routes]
        B --> G[Server Components]
        B --> H[Client Components]
        B --> I[Service Workers]
    end

    subgraph "Browser Storage Layer"
        J[IndexedDB] --> K[Dexie.js]
        L[Local Storage] --> M[JWT Tokens]
        N[Cache Storage] --> O[Assets Cache]
    end

    subgraph "Supabase Backend Services"
        P[Supabase Auth] --> Q[User Management]
        R[Supabase Database] --> S[PostgreSQL]
        T[Supabase Storage] --> U[Asset Backup]
        V[Supabase Edge Functions] --> W[Payment Processing]
        X[Supabase RLS] --> Y[Tenant Isolation]
    end

    subgraph "Local Execution Environment"
        Z[Companion Desktop App] --> AA[WhatsApp Runtime]
        BB[Browser Extension] --> AA
        CC[Service Worker] --> DD[Background Sync]
    end

    subgraph "External Services"
        EE[WhatsApp Business API] --> FF[WhatsApp Cloud API]
        GG[Payment Gateway] --> HH[Duitku API]
    end

    %% Connections
    E --> P
    F --> R
    F --> T
    F --> V
    K --> J
    M --> L
    O --> N
    Q --> Y
    S --> Y
    U --> Y
    W --> GG
    AA --> EE
    DD --> R
    CC --> K
    BB --> Z
    Z --> B
    I --> CC
    I --> DD
    AA --> FF
    HH --> W
    FF --> AA
    GG --> HH

    %% Styling
    classDef frontend fill:#e1f5fe
    classDef storage fill:#f3e5f5
    classDef backend fill:#e8f5e8
    classDef local fill:#fff3e0
    classDef external fill:#ffebee

    class B,E,F,G,H,I,CC frontend
    class J,K,L,M,N,O storage
    class P,Q,R,S,T,U,V,W,X,Y backend
    class Z,AA,BB,DD local
    class EE,FF,GG,HH external
```

## Component Interaction Flow

### Authentication Flow
```mermaid
sequenceDiagram
    participant U as User
    participant B as Browser
    participant N as Next.js App
    participant S as Supabase Auth
    participant C as Companion App
    participant W as WhatsApp Runtime

    U->>B: Access Web Application
    B->>N: Load Application
    N->>S: Request Authentication
    S-->>N: Authentication Options
    U->>N: Enter Credentials
    N->>S: Validate Credentials
    S-->>N: Auth Token
    N->>B: Store Token Securely
    N->>C: Establish Connection
    C-->>N: Connection Status
    N-->>U: Dashboard Access
    N->>W: WhatsApp Status Check
    W-->>N: Ready Status
```

### Data Synchronization Flow
```mermaid
sequenceDiagram
    participant B as Browser
    participant N as Next.js App
    participant I as IndexedDB
    participant S as Supabase DB
    participant C as Companion App
    participant F as Sync Service

    B->>N: Request Data Sync
    N->>I: Check Local Data
    I-->>N: Local Data Status
    N->>S: Fetch Remote Metadata
    S-->>N: Metadata Updates
    N->>F: Initiate Sync Process
    F->>I: Process Local Changes
    F->>S: Apply Remote Changes
    F->>C: Sync WhatsApp Data
    C-->>F: Sync Confirmation
    F-->>N: Sync Complete
    N-->>B: Updated UI
```

### WhatsApp Message Processing Flow
```mermaid
sequenceDiagram
    participant U as User
    participant B as Browser
    participant N as Next.js App
    participant C as Companion App
    participant W as WhatsApp Runtime
    participant S as Supabase
    participant E as External WhatsApp

    U->>B: Configure Campaign
    B->>N: Submit Campaign Config
    N->>S: Reserve Quota
    S-->>N: Quota Reserved
    N->>C: Send Campaign to Runtime
    C->>W: Process Campaign
    W->>E: Send WhatsApp Messages
    E-->>W: Delivery Status
    W-->>C: Status Updates
    C-->>N: Campaign Progress
    N-->>B: Progress Updates
    B-->>U: Real-time Status
    N->>S: Commit Usage
    S-->>N: Usage Committed
```

## Architecture Layers

### Presentation Layer
- **Next.js Application**: Main web interface with SSR/SSG capabilities
- **React Components**: UI elements using shadcn/ui and Tailwind CSS
- **PWA Features**: Offline capability and mobile experience

### Application Layer
- **API Routes**: Server-side functionality in Next.js
- **Server Components**: Data fetching and rendering
- **Client Components**: Interactive UI elements
- **Service Workers**: Background sync and offline support

### Data Layer
- **IndexedDB**: Local data storage via Dexie.js
- **Supabase Database**: Remote metadata and quota management
- **Supabase Storage**: Asset backup and synchronization
- **Cache Management**: Asset and data caching strategies

### Integration Layer
- **Supabase Services**: Authentication, database, storage, edge functions
- **Companion Application**: Local WhatsApp automation
- **Browser Extension**: Enhanced browser capabilities
- **External APIs**: WhatsApp Business API, payment gateways

### Security Layer
- **JWT Token Management**: Secure authentication
- **Row Level Security**: Per-user data isolation
- **End-to-End Encryption**: Data transmission security
- **Local Data Protection**: Browser storage security