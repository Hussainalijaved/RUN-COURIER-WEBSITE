# Run Courier - Logistics Platform

## Overview
Run Courier is a full-stack web application for comprehensive courier and delivery management in the UK. It connects customers, drivers, dispatchers, administrators, and vendors to facilitate services like same-day delivery, multi-drop routing, specialized transport, and live tracking. The platform's core purpose is to optimize logistics, provide a seamless user experience, and secure a significant share of the UK delivery market by enhancing operational efficiency through role-based dashboards, real-time updates, and an advanced pricing engine.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built using React 18+, TypeScript, and Vite, featuring Wouter for routing, TanStack Query for server state management, and Radix UI with shadcn/ui for components. Styling is handled by Tailwind CSS, supporting responsive, mobile-first layouts and light/dark modes, with a design aesthetic inspired by Linear and Stripe.

### Backend
The backend is developed with Node.js, Express, and TypeScript (ESNext modules), providing a RESTful API with a custom async error handler. It uses Supabase as the exclusive data persistence layer. A key architectural decision is the `IStorage` interface, abstracting data operations, with `SupabaseStorage` as its primary implementation. Server-side code is bundled with esbuild for optimized performance.

### Database & Data Layer
Supabase PostgreSQL serves as the sole data store. The `SupabaseStorage` class implements the `IStorage` interface using the Supabase JavaScript client with a service role key. Shared TypeScript schemas enforce type consistency across the stack.

### Authentication & Authorization
Supabase Auth manages user authentication and session management. Role-based access control is implemented via `ProtectedRoute` components, directing users to specific dashboards based on their roles (admin, customer, driver, dispatcher, vendor). Admin identification uses email matching entries in the `public.admins` table and RLS policies.

### Real-Time Features
A WebSocket server (`ws` library) at `/ws/realtime` enables live driver location tracking, real-time job status updates, broadcasting, and offline detection using secure token-based authentication with Supabase JWT verification. Job status updates are pushed via WebSocket, with administrators receiving all updates and customers receiving updates for their jobs.

### GPS Tracking Architecture
Driver GPS locations are processed via WebSockets for real-time updates and REST for persistent storage in `drivers` and `driver_locations` tables. The `driver_locations` table uses one row per driver, enabling Supabase Realtime subscriptions. The admin live map displays active drivers with real-time GPS and those without, using postcode-geocoded locations.

### Mobile API
Dedicated mobile APIs (`/api/mobile/v1/driver/*` and `/api/mobile/v1/customer/*`) provide driver-specific functionalities (profile management, location updates, job management, POD uploads) and customer functionalities (profile management, booking history) authenticated via Supabase JWT.

### Unified Document System (Web + Mobile)
All driver documents share a single source of truth across web and mobile:
- **Single storage**: Supabase Storage (`DRIVER-DOCUMENTS` bucket), organised by driver ID
- **Single tracking table**: `driver_documents` in Supabase — written by both web and mobile, read by both `GET /api/documents` (web) and `GET /api/mobile/v1/driver/documents` (mobile)
- **Driver URL columns**: `drivers` table holds canonical URL shortcuts (`driving_licence_front_url`, `driving_licence_back_url`, `goods_in_transit_insurance_url`, `hire_reward_insurance_url`, `profile_picture_url`, `dbs_certificate_url`). Both web upload (`POST /api/documents/upload`) and mobile register (`POST /api/mobile/v1/driver/documents/register`) update these columns in the background after every upload.
- **`GET /api/mobile/v1/driver/documents`**: Returns all documents from `driver_documents` plus any URL-column documents not yet in that table (synthesized with `approved` status).
- **`GET /api/documents?driverId=X`**: Always synthesizes any driver URL-column documents missing from the aggregate results, so application-uploaded docs always appear on the web dashboard.
- No document is stored in two separate systems; no driver needs to upload twice.

### Multi-Drop Stop POD & Auto-Complete
Proof of Delivery (POD) (photo + recipient name) is collected per stop for multi-drop jobs. Upon delivery of all stops, the job auto-completes, setting a synthetic POD on the main job, changing its status to "delivered," sending a delivery confirmation email, and broadcasting a WebSocket update.

### Push Notifications
Real-time push notifications, powered by Expo Push API, alert drivers instantly when jobs are assigned. Driver Expo push tokens are stored in the `driver_devices` table.

### Pay Later & Invoicing
Approved business customers can use a "Pay Later" option, leading to weekly invoicing. An "Invoices" section provides invoice history and PDF download options.

### Pricing Engine
A TypeScript-based pricing engine calculates delivery costs based on vehicle type, distance, surcharges, multi-drop fees, and waiting times. Pricing configurations are synchronized between client and server, and all quote pages use the `/api/maps/optimized-route` API for consistent distance logic. Service tiers (Flexible, Standard, Urgent, Dedicated/Direct) are configurable by admins and applied as surcharges.

### Price Isolation
Strict separation between `customer_price` (stored as `total_price`) and `driver_price` is maintained through RLS policies, role-specific views (`admin_jobs_view`, `driver_jobs_view`, `customer_jobs_view`), explicit column selection in API endpoints, and WebSocket payload filtering.

### Soft Delete System
The system employs soft deletion using `isActive` and `deactivatedAt` fields for drivers and users, preserving historical data. Customer booking history deletion results in `customer_hidden` being set to `true` on the `jobs` table, filtering it from customer views while retaining it for admins.

### Admin Job Management
Admins can assign jobs to available drivers (individual or batch assignments), which triggers notifications and allows drivers to accept or decline.

### Supabase-Only Architecture
Supabase is the single source of truth for all data, handling authentication, database, real-time subscriptions, and Edge Functions for privileged operations. RLS policies control granular data access.

### Route Planner
Admins can plan multi-stop delivery routes with features like adding/reordering stops, custom start/end points, auto-optimization toggle, interactive Google Maps route display, per-leg breakdown, and sending routes to drivers via email or WhatsApp.

### Driver Payment System
Admins can process driver payments via bank transfer from the admin panel, including payment recording, email confirmation, and history management.

### Driver Profile & Document Storage
Drivers can update profiles and upload documents (image/PDF, up to 10MB) via the mobile app or during application. Documents are stored in a Supabase Storage bucket (`DRIVER-DOCUMENTS`) with a structured path.

### Driver Contract Management
Admins can create contract templates, send them to multiple drivers for e-signing via a canvas-based signature pad, and track signing status. Signed contracts are stored permanently.

### Driver Notice / Broadcast System
Admins can create and send notices to active drivers, with options for required acknowledgement and email notifications.

### Parcel Barcode Scanning
Drivers can scan the customer's own barcode at pickup (stored as `pickup_barcode`) and verify at delivery (stored as `delivery_barcode`). The `PATCH /api/mobile/v1/driver/jobs/:jobId/barcode` endpoint handles both operations: pickup saves the barcode, delivery verifies it matches the pickup scan and returns 422 `BARCODE_MISMATCH` if not. Barcode state (scanned/verified flags + timestamps) is persisted in Supabase and displayed in the admin job detail panel. The mobile app allows re-scanning the pickup barcode. Barcodes are completely independent of Run Courier tracking numbers.

### API Integration System
A comprehensive API integration system allows approved business clients to integrate programmatically. It includes API key authentication, rate limiting, permission-based access control (quote, booking, tracking, cancel, webhooks), detailed request logging, and admin CRUD for API clients and requests. It supports `instant` payment (each booking is `pending`) or `pay_later` (added to invoice ledger) modes.

### Weekly API Invoicing
An automatic weekly invoicing process runs every Monday for `pay_later` API clients. It queries unbilled jobs, groups them into invoices, creates records in Neon (`api_invoices` + `api_invoice_items`), marks Supabase jobs as `invoiced`, and sends HTML invoice emails with detailed breakdowns. Admins can manage invoices, mark them paid, resend emails, and trigger runs manually via a dedicated admin page.

### Supervisor System
A dedicated operations supervisor role with a separate login portal. Supervisors are invited by admins, self-register, and must be approved. Active supervisors gain access to a full operations dashboard including live stats, jobs list, create job, live map, drivers, customers, invoices, and job history. The system handles supervisor invite, registration, approval, suspension, and deactivation workflows.

## External Dependencies

-   **Google Maps Integration**: Used for geocoding, distance calculations, and route visualization.
-   **Supabase Services**: Provides authentication, database (PostgreSQL), real-time subscriptions, and Edge Functions.
-   **Stripe**: Integrated via Edge Functions for payment processing and managing customer IDs for "Pay Later" invoicing.
-   **Resend**: Used for sending transactional emails (booking confirmations, delivery confirmations, API invoices, contract sending, route planner emails).
-   **Twilio**: Used for SMS OTP verification during the driver application process.
-   **Expo Push API**: Utilized for sending real-time push notifications to drivers.
-   **Neon (PostgreSQL)**: Used for storing API client data, API integration logs, and API invoicing records.