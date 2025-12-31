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

### Driver ID Format (PERMANENT - NEVER CHANGES)
Driver IDs follow the format: **RC** + 2 numbers + 1 letter (e.g., RC02C, RC15A, RC99Z).
- Format: `RC` prefix + 2 random digits (00-99) + 1 random letter (A-Z)
- **SUPABASE is the AUTHORITATIVE SOURCE** - driver_id column is the single source of truth
- Generated ONLY via Supabase Edge Function `create-driver` when driver is created
- Unique per driver, **IMMUTABLE** after creation - NEVER regenerated or changed
- Mobile app and website both read from the same Supabase `driver_id` column
- In code: Supabase uses `driver_id`, frontend uses `driverCode`, displayed as "Driver ID" in UI

**Driver ID Generation Flow**:
1. Driver registers via website or mobile app
2. `create-driver` Edge Function generates a unique driver_id in RC##L format
3. Driver ID is stored in Supabase `drivers` table `driver_id` column
4. This ID remains permanent and is used across all platforms
5. Local storage syncs FROM Supabase (one-way sync, Supabase is always authoritative)

**Edge Function**: `supabase/functions/create-driver/index.ts`
- Generates unique driver_id checking against existing codes
- Requires authentication via Supabase JWT
- Called via `supabaseFunctions.createDriver()` in frontend

### Admin Job Assignment System
Admins can assign jobs to available drivers with custom pricing. Drivers receive notifications and can accept or decline assignments via a "Job Offers" tab. Assignment statuses are tracked (pending, sent, accepted, rejected, cancelled, expired), and assignment history is maintained.

## Supabase-Only Architecture (CRITICAL)

The platform uses Supabase as the SINGLE source of truth for all data. The website and mobile app are TWO CLIENTS of THE SAME SYSTEM - they must behave as MIRRORS:

### Core Principle
- If a user registers on the website → the same user exists in the mobile app
- If a user registers on the mobile app → the same user exists on the website
- If a booking is created on the website → it MUST appear in the mobile app
- If a booking is created in the mobile app → it MUST appear on the website
- If an admin assigns a job on the website → the driver MUST see it in the app
- If a driver updates a job in the app → the website MUST reflect it immediately

### CRITICAL: Drivers Table Schema
**The Supabase `drivers` table uses `id` as the auth.uid() directly - there is NO separate `user_id` column.**

Key understanding:
- `drivers.id` = auth.uid() (the user's UUID from Supabase Auth)
- `drivers.driver_id` = RC##L format code (e.g., RC01A, RC02C) - display ID only
- These are DIFFERENT columns with different purposes

### Job Assignment ID Mapping
**The `driver_id` field in the `jobs` table stores `auth.uid()` (which equals `drivers.id`).**

This is enforced by:
1. RLS Policy: `jobs_select_driver` checks `auth.uid() = driver_id`
2. Edge Function: `assign-driver` sets `driver_id = driver.id` (the auth.uid)
3. RLS Policy: `drivers_select_own` checks `auth.uid() = id`

**Why this matters**: The mobile app uses Supabase RLS to filter jobs. The `driver_id` in jobs table must match the driver's `id` (which is their auth.uid) for RLS to work correctly.

### Real-Time Subscriptions
- `useRealtimeDrivers` hook: Auto-updates driver status changes
- `useRealtimeJobs` hook: Auto-updates job status changes
- Both use Supabase Realtime postgres_changes subscription

### Data Layer (client/src/lib/data/)
Shared data access functions used by both website and mobile app:
- `jobs.ts`: Job CRUD operations, driver job queries
- `drivers.ts`: Driver CRUD operations
- `base.ts`: Supabase client and helpers

### Edge Functions (supabase/functions/)
Privileged operations that require service-role access are handled via Supabase Edge Functions:
- `create-driver` - Creates drivers with unique driver_id generation (RC##L format)
- `update-driver` - Updates driver information with document verification
- `delete-driver` - Permanently deletes drivers from Supabase
- `create-job` - Creates jobs with tracking number generation
- `update-job-status` - Updates job status with POD validation
- `assign-driver` - Assigns drivers to jobs (admin/dispatcher only)
- `withdraw-assignment` - Withdraws job assignment from driver, returns job to pending (admin/dispatcher only)
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