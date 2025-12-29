# Run Courier - Logistics Platform

## Overview

Run Courier is a full-stack web application for courier and delivery management, connecting customers, drivers, dispatchers, administrators, and vendors. It offers same-day delivery, multi-drop routing, specialized transport, and live tracking across the UK. The platform aims to boost operational efficiency through role-based dashboards, real-time updates, and a sophisticated pricing engine that accounts for various vehicle types, rush hour rates, congestion charges, and complex delivery scenarios. Its business vision is to optimize logistics operations, provide a seamless user experience, and achieve significant market penetration in the UK's delivery sector.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend uses React 18+ with TypeScript and Vite. It features Wouter for routing, TanStack Query for server state, and Radix UI with shadcn/ui for components. Tailwind CSS handles styling, supporting light/dark modes with a design aesthetic inspired by Linear and Stripe. Layouts are responsive and mobile-first, with distinct structures for public pages and role-specific dashboards.

### Backend
The backend is built with Node.js, Express, and TypeScript (ESNext modules), providing a RESTful API. It includes a custom async error handler and uses Drizzle ORM with PostgreSQL (Neon serverless driver) for data persistence. A key architectural decision is the `IStorage` interface, abstracting all data operations. Server-side code is bundled with esbuild for optimized cold start times.

### Database & Data Layer
PostgreSQL, accessed via the Neon serverless driver, is managed with Drizzle ORM and Drizzle Kit for migrations. The schema includes `users` (with multiple roles and Stripe integration), `drivers`, `jobs`, `vehicles`, `documents`, `notifications`, `vendor_api_keys`, `pricing_settings`, and `jobAssignments`. Shared TypeScript schemas ensure type consistency across the stack.

### Authentication & Authorization
Supabase Auth manages user authentication (email/password) and session management. Role-based access control is implemented via `ProtectedRoute` components, leveraging user metadata to direct users to specific dashboards (`/admin`, `/customer`, `/driver`, `/dispatcher`, `/vendor`).

### Real-Time Features
A WebSocket server (`ws` library) at `/ws/realtime` provides live driver location tracking, **real-time job status updates**, broadcasting, connection heartbeats, and offline detection. It uses secure token-based authentication with Supabase JWT verification and server-side role validation, with a fallback to REST API polling.

### Booking State Persistence (BookingContext)
A global `BookingContext` (`client/src/context/BookingContext.tsx`) manages booking data across page navigation. It automatically persists to localStorage on every change and restores data on page load (24-hour expiry). This ensures users don't lose their entered data when navigating between Quote and Book pages, going back, or refreshing the page.

**Job Status Updates**: The `useJobUpdates` hook subscribes to job status changes via WebSocket. Admins and dispatchers receive all job updates, while customers receive updates for their own jobs only. Job creation events trigger toasts for administrators. The Track page uses 10-second polling for live updates.

**WebSocket Compatibility**: The `getWebSocketUrl()` helper in `queryClient.ts` ensures WebSocket connections work correctly when the frontend is hosted on Hostinger (runcourier.co.uk) by redirecting WebSocket traffic to the Replit backend.

### Driver Application System
A multi-step application process allows prospective drivers to submit personal details, documents, and vehicle/bank information for admin review and approval, activating their account upon verification.

### Mobile API (Driver App)
A dedicated mobile API at `/api/mobile/v1/driver/*` provides driver-specific functionalities, including profile management, location updates, availability toggling, job retrieval, job status updates, and proof of delivery uploads, all authenticated with a Supabase JWT token.

**Mobile Job Offers Endpoints** (Admin-to-Driver Job Assignment Sync):
- `GET /api/mobile/v1/driver/job-offers` - Get pending job offers for the driver
- `POST /api/mobile/v1/driver/job-offers/:id/accept` - Accept a job offer
- `POST /api/mobile/v1/driver/job-offers/:id/reject` - Reject a job offer (with optional reason)

When admin assigns a job via web interface, the driver receives it in their mobile app's job offers list and can accept or reject it.

### Pay Later Feature & Business Customer Invoices
Approved business customers can use a "Pay Later" option for bookings, bypassing immediate payment for weekly invoicing. An "Invoices" section (`/customer/invoices`) provides invoice history, status tracking, dashboard stats, detailed invoice views, and PDF download/print options.

### Pricing Engine
A TypeScript-based pricing engine calculates delivery costs considering vehicle type, distance, rush hour surcharges, weight, Central London congestion charge, multi-drop fees, return trip multipliers, and waiting times. It supports client-side quote generation with server-side validation.

**CRITICAL PRICING RULE - Base Charges (FIXED, never calculated from distance)**:
- Motorbike: £7.00
- Car: £19.00
- Small Van: £25.00
- Medium Van: £30.00

The pricing config is defined in two locations (must stay in sync):
1. Client-side: `client/src/lib/pricing.ts` - `defaultPricingConfig.vehicles`
2. Server-side: `server/routes.ts` - `PRICING_CONFIG.vehicles`

Server-side validation via `validateBasePrice()` ensures motorbike base price is never less than £7.00.

### Form Handling & Validation
React Hook Form is used for form state management, integrated with Zod schemas for type-safe forms, shared validation logic, and automatic error handling.

### Document Upload Backend API
A secure backend API (`POST /api/documents/upload`) handles document uploads (JPEG, PNG, GIF, WebP, PDF up to 10MB) using `multer`. It includes robust security features like path sanitization and traversal prevention, storing files in a structured directory. This replaces the previous Supabase Storage dependency.

### Soft Delete System (Drivers & Users)
Instead of permanently deleting records, the system uses soft delete to preserve job history and audit trails:
- **isActive**: Boolean column indicating whether the account is active (default: true)
- **deactivatedAt**: Timestamp of when the account was deactivated

**Deactivation Rules**:
- Deactivated drivers cannot receive jobs or log in
- Deactivated users cannot access the platform
- All job history is preserved for audit purposes
- Admins can reactivate accounts at any time

**API Endpoints**:
- `POST /api/drivers/:id/deactivate` - Deactivate a driver
- `POST /api/drivers/:id/reactivate` - Reactivate a driver  
- `POST /api/users/:id/deactivate` - Deactivate a user
- `POST /api/users/:id/reactivate` - Reactivate a user
- Query parameter `includeInactive=true` to include inactive records in GET endpoints

**UI Features**: Admin Drivers page shows Deactivate/Reactivate buttons with confirmation dialogs explaining job history preservation.

### Driver ID Format
Driver IDs follow the format: **RC** + 2 numbers + 1 letter (e.g., RC02C, RC15A, RC99Z).
- Format: `RC` prefix + 2 random digits (00-99) + 1 random letter (A-Z)
- Auto-generated on driver creation
- Unique per driver, immutable after creation
- Mobile app displays and uses this same ID
- Note: In code, the field is named `driverCode` but displayed as "Driver ID" in the UI

### Admin Job Assignment System
Admins can assign jobs to available drivers with custom pricing. Drivers receive notifications and can accept or decline assignments via a "Job Offers" tab. Assignment statuses are tracked (pending, sent, accepted, rejected, cancelled, expired), and assignment history is maintained.

## Supabase-Only Architecture Migration (IN PROGRESS)

The platform is transitioning to a Supabase-only backend architecture to enable:
- Website hosting on Hostinger (runcourier.co.uk) connecting directly to Supabase
- Mobile app (com.runcourier.driver) sharing the same Supabase backend
- No dependency on Replit backend for production

### Edge Functions (supabase/functions/)
Privileged operations that require service-role access are handled via Supabase Edge Functions:
- `create-job` - Creates jobs with tracking number generation
- `update-job-status` - Updates job status with POD validation
- `assign-driver` - Assigns drivers to jobs (admin/dispatcher only)
- `stripe-create-payment-intent` - Creates Stripe payment intents
- `stripe-webhook` - Handles Stripe webhook events
- `send-email` - Sends transactional emails via Resend

### RLS Policies (supabase/rls-policies.sql)
Row Level Security policies control data access:
- Customers can only access their own jobs and invoices
- Drivers can only access assigned jobs and their own profile
- Admins/dispatchers have full access
- Public tracking via Edge Functions (not direct table access)

### Frontend Client (client/src/lib/supabaseFunctions.ts)
Client library for calling Edge Functions with proper authentication.

### Deployment Guide (supabase/DEPLOYMENT.md)
Instructions for deploying Edge Functions and configuring RLS policies.

## External Dependencies

-   **Google Maps Integration**: Used for geocoding, distance calculation, and route visualization.
-   **Supabase Services**: Authentication, database, realtime subscriptions, and Edge Functions for privileged operations.
-   **Stripe**: Integrated for immediate payment processing via Edge Functions, managing customer IDs for "Pay Later" invoicing.
-   **Resend**: Transactional emails sent via Edge Function `send-email` to `info@runcourier.co.uk`.