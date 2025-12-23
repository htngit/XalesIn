# System Overview - Xender-In Next.js Website

## Introduction

The Xender-In Next.js website represents a strategic expansion of the existing Electron desktop application into the web domain. This architecture maintains the core local-first principles that define the application while adapting to the constraints and opportunities of web-based deployment.

The system is designed to provide users with the same WhatsApp automation capabilities through a browser interface while preserving the privacy, security, and performance characteristics of the original desktop application. The architecture leverages modern web technologies to deliver a seamless user experience across devices while maintaining the same underlying business logic and data management patterns.

## Core Architecture Principles

### Local-First Design
The system adheres to the fundamental principle that runtime and assets execute locally, with Supabase serving as a meta disk, quota enforcer, and optional sync source. This approach ensures that sensitive operations remain on the user's device while leveraging cloud infrastructure for authentication, metadata management, and quota control.

### Web-Adapted Local Execution
While the Electron app uses Puppeteer and whatsapp-web.js directly on the user's machine, the web version requires a different approach due to browser security constraints. The architecture includes a companion desktop application or browser extension to handle WhatsApp automation while the web interface provides management and configuration capabilities.

### Data Synchronization
The system implements a dual-sync approach:
- **Auto Sync**: Automatic synchronization of account metadata, quotas, and team information upon login
- **Manual Sync**: User-initiated synchronization of contacts, templates, and assets with explicit consent

## System Components

### Frontend Layer (Next.js Application)
The Next.js application serves as the primary user interface, built with:
- React 18 with TypeScript for type safety
- Tailwind CSS for styling with shadcn/ui components
- Server-Side Rendering (SSR) and Static Site Generation (SSG) capabilities
- API routes for server-side functionality
- Progressive Web App (PWA) features for enhanced mobile experience

### Backend Integration (Supabase)
The system integrates with Supabase for:
- Authentication services using Supabase Auth
- Database operations with PostgreSQL
- Row Level Security (RLS) for tenant isolation
- Storage for asset backup and synchronization
- Edge Functions for payment processing and webhook handling

### Local Execution Environment
The system includes mechanisms for local execution:
- Companion desktop application using Electron for WhatsApp automation
- Service Worker capabilities for background operations
- IndexedDB for local data storage using Dexie.js
- Secure token management in browser storage

## Key Functionalities

### Authentication and Authorization
- Secure login with email/password via Supabase Auth
- Two-factor authentication with PIN verification
- Role-based access control for team management
- Session management with secure JWT token handling

### Core WhatsApp Automation Features
- Contact management with import/export capabilities
- Template creation with variable support
- Campaign configuration with delay settings
- Real-time progress tracking during execution
- History and analytics with detailed reporting

### Data Management
- Local storage using IndexedDB for contacts, templates, and WAL
- Synchronization with Supabase for metadata and quotas
- Asset management with local caching strategies
- Quota reservation and commitment via Supabase RPC

## Technical Approach

### Next.js Specific Considerations
- Leveraging the App Router for navigation
- Implementing proper data fetching strategies
- Optimizing for Core Web Vitals
- Using React Server Components where appropriate
- Implementing Progressive Web App features

### Browser Constraints and Solutions
The architecture addresses browser security limitations by:
- Using a companion desktop application for WhatsApp automation
- Implementing secure communication channels between web and desktop components
- Maintaining local-first principles within browser storage constraints
- Using service workers for background synchronization

## Integration Points

### Supabase Integration
The system connects to Supabase for:
- User authentication and session management
- Quota management via RPC functions
- Team and profile management
- Payment processing through Edge Functions
- Activity logging and history tracking

### Local Storage Integration
The system uses browser storage for:
- IndexedDB via Dexie.js for structured data
- Local storage for session tokens and preferences
- Cache management for offline functionality
- Synchronization queue management

## Security Considerations

The architecture implements multiple security layers:
- End-to-end encryption for sensitive data transmission
- Secure JWT token storage and management
- Input validation and sanitization
- Protection against XSS, CSRF, and injection attacks
- Secure communication with local execution environment
- Compliance with data protection regulations (GDPR, etc.)

## Performance Strategy

The system optimizes performance through:
- Server-Side Rendering for better initial load times
- Static Site Generation for marketing pages
- Image optimization and compression
- Automatic code splitting
- Efficient data fetching with caching strategies
- CDN integration for static assets