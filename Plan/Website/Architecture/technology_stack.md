# Technology Stack - Xender-In Next.js Website

## Frontend Technologies

### Core Framework
- **Next.js 14+**: React framework with App Router for server-side rendering, static generation, and API routes
- **React 18**: Component-based UI library with hooks and concurrent features
- **TypeScript**: Type-safe development with strict mode enabled
- **Vite**: Build tool for fast development server and optimized builds

### Styling and UI
- **Tailwind CSS**: Utility-first CSS framework for rapid UI development
- **shadcn/ui**: Accessible UI components with headless implementation
- **Framer Motion**: Animation library for smooth micro-interactions
- **Lucide React**: Consistent iconography system
- **Recharts**: Data visualization library for analytics and reporting

### State Management and Data Fetching
- **React Query (TanStack Query)**: Server state management and caching
- **Zustand**: Lightweight client state management
- **React Hook Form + Zod**: Form handling with validation
- **Dexie.js**: IndexedDB wrapper for local data storage

### Internationalization
- **React Intl**: Internationalization framework for multi-language support
- **Next.js i18n**: Built-in internationalization routing and detection

## Backend Integration

### Supabase Services
- **Supabase Auth**: Email/password authentication with session management
- **Supabase Database**: PostgreSQL database with Row Level Security (RLS)
- **Supabase Storage**: File storage for assets and media
- **Supabase Edge Functions**: Serverless functions for payment processing and webhooks
- **Supabase Realtime**: WebSocket connections for real-time updates

### Database Schema
- **PostgreSQL**: Primary database with custom functions and RLS policies
- **Custom RPC Functions**: For quota management and business logic
- **JSONB Fields**: For flexible metadata storage
- **UUID Primary Keys**: For secure and scalable identifiers

## Local Execution Environment

### Browser Technologies
- **Service Workers**: Background sync and offline functionality
- **IndexedDB**: Persistent local data storage
- **Cache API**: Asset and resource caching
- **WebSockets**: Real-time communication with companion app
- **WebRTC**: Direct communication (if needed for specific features)

### Companion Application Technologies
- **Electron**: Desktop application framework for local WhatsApp automation
- **whatsapp-web.js**: WhatsApp Web automation library
- **Puppeteer**: Browser automation for WhatsApp interaction
- **Node.js**: Runtime environment for local execution

## Security Technologies

### Authentication and Authorization
- **JWT Tokens**: Secure session management
- **PKCE Flow**: Secure authentication for public clients
- **OAuth 2.0**: Industry-standard authorization framework
- **CORS Configuration**: Secure cross-origin resource sharing

### Data Protection
- **AES-256 Encryption**: For sensitive data at rest
- **TLS 1.3**: Secure data transmission
- **Helmet.js**: HTTP header security for API routes
- **Rate Limiting**: Protection against abuse and DDoS

## Payment and Business Logic

### Payment Processing
- **Duitku API**: Indonesian payment gateway integration
- **Stripe** (Alternative): International payment processing
- **Secure Tokenization**: For payment method storage
- **Webhook Handling**: For payment status updates

### Business Logic Components
- **Quota Management System**: RPC-based quota reservation and commitment
- **Campaign Scheduler**: Job queue for scheduled message sending
- **Rate Limiting**: Configurable delays to avoid WhatsApp detection
- **Template Engine**: Dynamic message personalization

## Development and Build Tools

### Code Quality
- **ESLint**: Code linting with custom rules
- **Prettier**: Code formatting consistency
- **Husky**: Git hooks for code quality enforcement
- **TypeScript Strict Mode**: Maximum type safety

### Testing
- **Jest**: Unit testing framework
- **React Testing Library**: Component testing
- **Cypress**: End-to-end testing
- **Vitest**: Fast testing framework (alternative to Jest)

## Performance and Optimization

### Image and Asset Optimization
- **Next.js Image Component**: Automatic image optimization
- **Image Optimization API**: Server-side image processing
- **Lazy Loading**: For images and components
- **CDN Integration**: For static asset delivery

### Caching Strategies
- **HTTP Caching**: Proper cache headers for API responses
- **Browser Caching**: For static assets
- **Service Worker Caching**: For offline functionality
- **CDN Caching**: For global content delivery

## Deployment and Infrastructure

### Hosting
- **Vercel**: Primary deployment platform for Next.js applications
- **Netlify**: Alternative static hosting option
- **AWS/Google Cloud**: Self-hosted deployment option
- **Docker**: Containerized deployment option

### Monitoring and Analytics
- **Sentry**: Error tracking and monitoring
- **Google Analytics**: User behavior analytics
- **LogRocket**: Session replay and user experience monitoring
- **Custom Analytics**: Business-specific metrics tracking

## Browser Compatibility and Support

### Target Browsers
- **Chrome 90+**: Primary target with full feature support
- **Firefox 88+**: Secondary target with feature parity
- **Safari 14+**: iOS and macOS support
- **Edge 90+**: Windows support

### Progressive Web App Features
- **Web App Manifest**: For installable web app experience
- **Service Workers**: For offline functionality
- **Push Notifications**: For campaign status updates
- **Background Sync**: For data synchronization

## Third-Party Integrations

### External APIs
- **WhatsApp Business API**: Official WhatsApp business integration
- **WhatsApp Cloud API**: Meta's cloud-hosted WhatsApp API
- **Payment Gateways**: Multiple payment provider support
- **Email Services**: For notifications and communications

### Monitoring Services
- **Supabase Analytics**: Database and authentication monitoring
- **Custom Dashboards**: Business-specific metrics
- **Performance Monitoring**: Core Web Vitals tracking
- **Uptime Monitoring**: Service availability tracking