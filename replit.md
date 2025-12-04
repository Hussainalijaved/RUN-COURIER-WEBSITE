# Run Courier - Logistics Platform

## Overview

Run Courier is a comprehensive courier and delivery management platform built as a full-stack web application. The system connects customers, drivers, dispatchers, administrators, and vendors in a real-time logistics network. It provides same-day delivery services, multi-drop routing, specialized transport (medical, legal, retail), and live tracking capabilities across the UK.

The platform emphasizes operational efficiency with role-based dashboards, real-time updates, and a sophisticated pricing engine that handles multiple vehicle types, rush hour rates, congestion charges, and complex delivery scenarios.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React 18+ with TypeScript
- Vite for build tooling and development server
- Wouter for client-side routing (lightweight alternative to React Router)
- TanStack Query (React Query) for server state management
- Radix UI primitives with shadcn/ui components (New York style variant)
- Tailwind CSS for styling with custom design system

**Key Design Decisions:**
- **Component Library Choice**: Uses shadcn/ui, which provides copy-paste components built on Radix UI primitives. This allows full customization while maintaining accessibility standards.
- **State Management Strategy**: TanStack Query handles all server state with optimistic updates disabled by default (`staleTime: Infinity`, `refetchOnWindowFocus: false`). Local UI state managed through React hooks.
- **Routing Approach**: Wouter chosen for minimal bundle size (~1KB vs React Router's ~10KB), sufficient for the application's routing needs.
- **Design System**: Custom Tailwind configuration with CSS variables for theming, supporting both light and dark modes. Design influenced by Linear's efficiency and Stripe's professional aesthetic per design guidelines.

**Layout Structure:**
- Public pages use `PublicLayout` with Navbar/Footer
- Role-specific dashboards use `DashboardLayout` with sidebar navigation
- Responsive design with mobile-first approach (768px breakpoint)

### Backend Architecture

**Technology Stack:**
- Node.js with Express
- TypeScript (ESNext modules)
- HTTP server for WebSocket potential
- Session-based architecture ready (connect-pg-simple referenced)

**Key Design Decisions:**
- **Module System**: ES Modules throughout (`"type": "module"` in package.json)
- **Request Handling**: Custom async handler wrapper for consistent error handling
- **API Design**: RESTful endpoints under `/api/*` prefix with structured query parameter filtering
- **Storage Abstraction**: `IStorage` interface defines all data operations, separating business logic from data layer implementation
- **Build Strategy**: esbuild bundles server code with selective dependency bundling (allowlist approach) to optimize cold start times

**Server Structure:**
- `server/index.ts` - Express app initialization, middleware setup, logging
- `server/routes.ts` - API route definitions, request handlers
- `server/storage.ts` - Data access layer interface
- `server/static.ts` - Production static file serving
- `server/vite.ts` - Development HMR middleware integration

### Database & Data Layer

**Technology:**
- PostgreSQL (via Neon serverless driver)
- Drizzle ORM for schema definition and queries
- Drizzle Kit for migrations

**Schema Design:**
The system uses a comprehensive relational schema with the following core entities:

- **users**: Supports multiple user types (individual/business) and roles (admin, driver, customer, dispatcher, vendor). Includes Stripe integration fields.
- **drivers**: Extends users with vehicle information, availability status, real-time location tracking, verification status, and performance metrics.
- **jobs**: Central entity tracking deliveries with multiple status states (pending → assigned → accepted → on_the_way_pickup → arrived_pickup → collected → on_the_way_delivery → delivered/cancelled). Includes pricing breakdown, multi-drop support, and proof-of-delivery fields.
- **vehicles**: Reference table for vehicle types (motorbike, car, small_van, medium_van) with capacity constraints.
- **documents**: Driver verification documents with approval workflow.
- **notifications**: User notification system with read/unread tracking.
- **vendor_api_keys**: API access management for vendor integrations.
- **pricing_settings**: Dynamic pricing configuration.

**Key Design Decisions:**
- **Enum Types**: TypeScript string literal types for JobStatus, VehicleType, UserRole etc., ensuring type safety across frontend and backend
- **Location Tracking**: Decimal fields (precision: 10, scale: 7) for GPS coordinates
- **Shared Schema**: `shared/schema.ts` ensures type consistency between client and server through Drizzle's `createInsertSchema` and Zod integration
- **Soft Deletes Implied**: No explicit deleted_at fields in base schema, suggesting hard deletes or status-based archival

### Authentication & Authorization

**Authentication Provider:**
- Supabase Auth for user authentication
- Email/password authentication flow
- Session management via Supabase client

**Key Design Decisions:**
- **Context-based Auth**: `AuthProvider` wraps application, providing `useAuth` hook for authentication state
- **Role-Based Access**: `ProtectedRoute` component enforces role-based access control, redirecting to appropriate dashboards
- **Public/Private Routes**: `PublicOnlyRoute` prevents authenticated users from accessing login/signup
- **Metadata Storage**: User metadata (role, userType, fullName, etc.) stored in Supabase user_metadata for quick access without database queries

**Authorization Pattern:**
```
User Login → Supabase Auth → User Metadata → Role Check → Dashboard Redirect
admin → /admin
customer → /customer  
driver → /driver
dispatcher → /dispatcher
vendor → /vendor
```

### Real-Time Features

**WebSocket Implementation:**
- WebSocket server at `/ws/realtime` using the `ws` library
- Secure token-based authentication using Supabase JWT verification
- Server-side role validation from local database (not metadata)
- Auto-sync of admin/dispatcher users from Supabase on first connection

**Key Files:**
- `server/realtime.ts` - WebSocket server with auth, broadcasting, and connection management
- `server/supabaseAdmin.ts` - Server-side Supabase client for token verification
- `client/src/hooks/useDriverLocations.ts` - React hook for real-time location updates

**Authentication Flow:**
1. Client sends Supabase access token via WebSocket auth message
2. Server verifies token with Supabase Admin API (service role key)
3. Server looks up user in local database for authoritative role
4. If admin/dispatcher not in DB, creates user with Supabase ID as primary key
5. Drivers must have verified profile in drivers table
6. Only admin/dispatcher roles can subscribe to driver locations

**Features:**
- Live driver location tracking with automatic reconnection
- Location broadcasting from drivers to subscribed observers
- Connection heartbeat with ping/pong every 30 seconds
- Offline detection with 2-minute timeout
- Fallback to REST API polling when WebSocket fails

**Client-Side:**
- `useDriverLocations` hook manages WebSocket lifecycle
- Exponential backoff for reconnection attempts
- Merges real-time updates with initial REST data
- Connection status indicator (Connecting/Live/Offline)

### External Dependencies

**Google Maps Integration:**
- `@googlemaps/js-api-loader` for dynamic Maps API loading
- Used for geocoding postcodes, calculating distances, and route visualization
- Lazy initialization pattern in `lib/maps.ts` to defer API key loading

**Supabase Services:**
- **Authentication**: User signup, signin, session management
- **Storage**: Document uploads for driver applications (profile pictures, driving licences, DBS certificates, insurance documents)
- **Environment Variables**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### Driver Application System

**Overview:**
Prospective drivers must submit a comprehensive application before gaining driver access. The system includes a multi-step application form and admin review workflow.

**Application Flow:**
1. Prospective driver visits `/driver/apply` (redirected from "Become a Driver" link)
2. Completes 4-step form: Personal Details → Documents → Vehicle & Bank → Review
3. Submits application (status: pending)
4. Admin reviews at `/admin/applications`, approves or rejects
5. Upon approval, driver account is activated

**Data Collected:**
- **Personal Details**: Full name, email, phone, postcode, address, nationality, NI number, right to work status
- **Documents**: Profile picture, driving licence (front/back), DBS certificate, insurance documents
- **Vehicle & Bank**: Vehicle type selection, bank details (account name, number, sort code)

**Key Files:**
- `client/src/pages/driver/DriverApplication.tsx` - Multi-step application form
- `client/src/pages/driver/ApplicationSuccess.tsx` - Success confirmation page
- `client/src/pages/admin/AdminApplications.tsx` - Admin review interface
- `shared/schema.ts` - `driverApplications` table schema

**API Endpoints:**
- `POST /api/driver-applications` - Submit new application
- `GET /api/driver-applications` - List all applications (admin)
- `GET /api/driver-applications/:id` - Get single application
- `PATCH /api/driver-applications/:id/review` - Approve/reject application

**Neon Database:**
- Serverless PostgreSQL hosting
- Connection via `@neondatabase/serverless` driver
- `DATABASE_URL` environment variable required

**Payment Processing:**
- Stripe integration prepared (stripe customer ID fields in schema, pay-later support)
- Not yet implemented in codebase

**Development Tools:**
- Replit-specific plugins for runtime error overlays, cartographer, and dev banner
- Only loaded in development mode when `REPL_ID` is present

### Pricing Engine

**Architecture:**
Located in `client/src/lib/pricing.ts`, the pricing system implements complex business logic:

**Vehicle-Based Rates:**
- Each vehicle type has base charge, per-mile rate, and rush hour multiplier
- Weight limits: Motorbike (5kg), Car (50kg), Small Van (400kg), Medium Van (750kg)

**Pricing Components:**
- Base fare + (distance × per-mile rate)
- Rush hour surcharges (configurable time periods)
- Weight surcharges (tiered)
- Central London congestion charge
- Multi-drop charges (£5 per additional stop)
- Return trip multiplier (2.0× base price)
- Waiting time charges (free period + per-minute rate)

**Key Design Decisions:**
- Pure TypeScript pricing calculator for testability
- All rates configurable via `PricingConfig` interface
- Client-side quote generation for instant feedback
- Server-side validation ensures quote integrity

### Form Handling & Validation

**Strategy:**
- React Hook Form for form state management
- Zod schemas for validation (defined in `shared/schema.ts`)
- `@hookform/resolvers/zod` for seamless integration

**Benefits:**
- Type-safe forms with TypeScript inference
- Shared validation logic between client and server
- Automatic error handling and display via shadcn/ui Form components