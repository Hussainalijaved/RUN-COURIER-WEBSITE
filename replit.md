# Run Courier - Logistics Platform

## Overview

Run Courier is a full-stack web application designed for comprehensive courier and delivery management. It connects customers, drivers, dispatchers, administrators, and vendors, offering services like same-day delivery, multi-drop routing, specialized transport, and live tracking across the UK. The platform's core purpose is to enhance operational efficiency through role-based dashboards, real-time updates, and an advanced pricing engine. The business vision is to optimize logistics, provide a seamless user experience, and secure a significant share of the UK's delivery market.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React 18+, TypeScript, and Vite, utilizing Wouter for routing, TanStack Query for server state management, and Radix UI with shadcn/ui for components. Styling is handled by Tailwind CSS, supporting light/dark modes with a design aesthetic inspired by Linear and Stripe. It features responsive, mobile-first layouts tailored for public pages and role-specific dashboards.

### Backend
The backend leverages Node.js, Express, and TypeScript (ESNext modules) to provide a RESTful API. It includes a custom async error handler and uses Supabase as the exclusive data persistence layer. A key architectural decision is the `IStorage` interface, which abstracts data operations, with `SupabaseStorage` as its primary implementation. Server-side code is bundled with esbuild for optimized cold start times.

### Database & Data Layer
Supabase PostgreSQL is the sole data store. The `SupabaseStorage` class implements the `IStorage` interface using the Supabase JavaScript client with a service role key for administrative tasks. The storage layer automatically converts between TypeScript camelCase and Supabase snake_case for consistency. Shared TypeScript schemas in `shared/schema.ts` enforce type consistency across the stack.

### Authentication & Authorization
Supabase Auth manages user authentication and session management. Role-based access control is implemented via `ProtectedRoute` components, directing users to specific dashboards based on their roles (admin, customer, driver, dispatcher, vendor).

### Admin Identity Model
Admins are identified by `auth.jwt()->>'email'` matching entries in the `public.admins` table:
- **Primary Method**: Email-based admin check via `public.is_admin_by_email()` function
- **Admins Table**: Simple table with `email` column for authorized admin emails
- **RLS Policies**: All table policies use `is_admin_by_email()` for admin access
- **Fallback**: `is_admin_or_dispatcher()` also checks `users.role` for backwards compatibility
- **Migration**: `supabase/migrations/015_fix_admin_rls_policies.sql` must be run in Supabase SQL Editor

### Real-Time Features
A WebSocket server (`ws` library) at `/ws/realtime` enables live driver location tracking, real-time job status updates, broadcasting, and offline detection. It uses secure token-based authentication with Supabase JWT verification and server-side role validation.

### Booking State Persistence
A global `BookingContext` persists booking data to `localStorage` with a 24-hour expiry, ensuring data retention across navigation and refreshes. Job status updates are pushed via WebSocket, with administrators receiving all updates and customers receiving updates for their own jobs.

### Driver Application System
A multi-step application process allows prospective drivers to submit details for admin review and approval, activating their account upon verification.

### Mobile API
A dedicated mobile API at `/api/mobile/v1/driver/*` provides driver-specific functionalities including profile management, location updates, job management, and proof of delivery uploads, authenticated via Supabase JWT. It supports admin-to-driver job assignments, with drivers receiving offers in their mobile app.

### Push Notifications
Real-time push notifications alert drivers instantly when jobs are assigned:
- **Device Registration**: Drivers register their Expo push tokens via `/api/mobile/v1/driver/push-token`
- **Database Table**: `driver_devices` stores push tokens per driver with RLS policies
- **Instant Alerts**: Edge functions (`assign-driver`, `batch-assign-driver`) send push notifications via Expo Push API with sound alerts
- **Sound Enabled**: Push messages include `sound: "default"` and `priority: "high"` for immediate attention
- **Channel**: Uses `job-offers` channel for proper notification grouping on Android

### Pay Later & Invoicing
Approved business customers can utilize a "Pay Later" option for bookings, leading to weekly invoicing. An "Invoices" section provides invoice history, status tracking, and PDF download options.

### Pricing Engine
A TypeScript-based pricing engine calculates delivery costs, considering vehicle type, distance, rush hour surcharges, congestion charges, multi-drop fees, and waiting times. It includes fixed base charges for different vehicle types. Pricing configurations are synchronized between client and server.

### Price Isolation (Critical Security)
Strict separation between customer and driver pricing:
- **customer_price** (stored as `total_price`): Visible ONLY to admin and the job's customer
- **driver_price**: Visible ONLY to admin and the assigned driver
- **Database Protection**: RLS policies + role-specific views (`admin_jobs_view`, `driver_jobs_view`, `customer_jobs_view`)
- **API Protection**: All mobile endpoints use explicit column selection, NEVER `select('*')`
- **Realtime Protection**: WebSocket payloads only include `driver_price` for driver channels
- **Verification**: See `PRICE_ISOLATION_VERIFICATION.md` for audit checklist

### Document Upload
A secure backend API (`POST /api/documents/upload`) handles document uploads (various image and PDF formats up to 10MB) using `multer`, with robust security measures, storing files in a structured directory.

### Soft Delete System
The system employs soft deletion using `isActive` and `deactivatedAt` fields for drivers and users, preserving historical data for audit purposes. Deactivated accounts cannot log in or receive jobs, but can be reactivated by administrators.

### Driver ID Format
Driver IDs are permanently formatted as `RC` + 2 digits + 1 letter (e.g., RC02C). These are generated exclusively via the `create-driver` Supabase Edge Function and stored in the `drivers` table's `driver_id` column, serving as the immutable, authoritative source.

### Admin Job Assignment
Admins can assign jobs to available drivers with custom pricing. Drivers receive notifications and can accept or decline assignments, with assignment statuses and history tracked.

### Batch Job Assignment
Admins can assign multiple jobs to a single driver in one action while maintaining individual job records:
- **Database Tables**: `job_assignment_batches` (tracks batch metadata) and `job_assignment_batch_items` (individual jobs within a batch)
- **Transactional Operations**: All-or-nothing assignment via PostgreSQL functions (`batch_assign_driver`, `withdraw_batch_items`)
- **Driver Experience**: Drivers see jobs individually via existing RLS policies (no batch awareness on driver side)
- **Notifications**: Grouped notification on assign, individual notifications on withdraw
- **Admin UI**: Multi-select jobs in AdminJobs page, set single driver price applied to all selected jobs
- **Edge Functions**: `batch-assign-driver` for transactional batch assignment, `withdraw-assignment` supports both single job and batch item withdrawal

### Supabase-Only Architecture
Supabase is the single source of truth for all data, ensuring consistency between the web and mobile applications. Key architectural details include:
- `drivers.id` directly maps to `auth.uid()` from Supabase Auth.
- `jobs.driver_id` stores `auth.uid()` for Row Level Security (RLS) enforcement.
- Real-time subscriptions (`useRealtimeDrivers`, `useRealtimeJobs`) auto-update status changes.
- Shared data access functions in `client/src/lib/data/`.
- Supabase Edge Functions handle privileged operations (e.g., `create-driver`, `assign-driver`, `stripe-create-payment-intent`, `send-email`).
- RLS policies control granular data access based on user roles.

### Web-Mobile Integration
The web admin dashboard and Expo mobile app share a unified backend:
- **Unified Data Source**: Both platforms query Supabase directly via SupabaseStorage class
- **Job Sync**: Jobs assigned on web immediately appear in mobile app (driver_id = auth.uid() RLS)
- **Real-Time Events**: WebSocket broadcasts job:assigned, job:withdrawn, job:status_update to connected drivers
- **Push Notifications**: Expo Push API sends high-priority notifications with sound for background alerts
- **Profile Sync**: Driver profile updates sync via Supabase (both platforms read/write to same table)
- **Price Isolation**: Mobile API never exposes customer pricing - explicit column selection enforced

### Job Geocoding
Jobs are automatically geocoded when created or assigned:
- **Auto-Geocoding**: Addresses are geocoded using Google Maps API to get coordinates
- **Supabase Sync**: Geocoded coordinates (`pickup_latitude`, `pickup_longitude`, `delivery_latitude`, `delivery_longitude`) are synced to Supabase
- **Mobile Map Display**: Driver mobile app uses coordinates to display pickup/delivery locations on map
- **Fallback**: If geocoding fails, jobs still work but map preview will be unavailable

## External Dependencies

-   **Google Maps Integration**: Used for geocoding, distance calculations, and route visualization.
-   **Supabase Services**: Authentication, database, real-time subscriptions, and Edge Functions.
-   **Stripe**: Integrated via Edge Functions for payment processing and managing customer IDs for "Pay Later" invoicing.
-   **Resend**: Used for sending transactional emails via the `send-email` Edge Function to `info@runcourier.co.uk`.