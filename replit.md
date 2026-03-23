# Run Courier - Logistics Platform

## Overview
Run Courier is a full-stack web application designed for comprehensive courier and delivery management in the UK. It connects customers, drivers, dispatchers, administrators, and vendors, facilitating services like same-day delivery, multi-drop routing, specialized transport, and live tracking. The platform aims to enhance operational efficiency through role-based dashboards, real-time updates, and an advanced pricing engine, with a business vision to optimize logistics, provide a seamless user experience, and secure a significant share of the UK delivery market.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
The frontend is built with React 18+, TypeScript, and Vite, using Wouter for routing, TanStack Query for server state management, and Radix UI with shadcn/ui for components. Styling is managed by Tailwind CSS, supporting light/dark modes with a design aesthetic inspired by Linear and Stripe, and features responsive, mobile-first layouts.

### Backend
The backend utilizes Node.js, Express, and TypeScript (ESNext modules) to provide a RESTful API. It includes a custom async error handler and uses Supabase as the exclusive data persistence layer. A key architectural decision is the `IStorage` interface, which abstracts data operations, with `SupabaseStorage` as its primary implementation. Server-side code is bundled with esbuild for optimized cold start times.

### Database & Data Layer
Supabase PostgreSQL serves as the sole data store. The `SupabaseStorage` class implements the `IStorage` interface using the Supabase JavaScript client with a service role key for administrative tasks. Shared TypeScript schemas in `shared/schema.ts` enforce type consistency across the stack.

### Authentication & Authorization
Supabase Auth manages user authentication and session management. Role-based access control is implemented via `ProtectedRoute` components, directing users to specific dashboards based on their roles (admin, customer, driver, dispatcher, vendor). Admin identification relies on email matching entries in the `public.admins` table, utilizing the `public.is_admin_by_email()` function and RLS policies.

### Real-Time Features
A WebSocket server (`ws` library) at `/ws/realtime` enables live driver location tracking, real-time job status updates, broadcasting, and offline detection. It uses secure token-based authentication with Supabase JWT verification. Job status updates are pushed via WebSocket, with administrators receiving all updates and customers receiving updates for their own jobs.

### GPS Tracking Architecture
Driver GPS locations flow through two parallel paths: WebSocket for real-time updates and REST for persistent storage in the `drivers` and `driver_locations` tables. The `driver_locations` table stores one row per driver, enabling Supabase Realtime subscriptions. The admin live map shows active drivers with live GPS and those without, using postcode-geocoded locations.

### Booking State Persistence
A global `BookingContext` persists booking data to `localStorage` with a 24-hour expiry.

### Driver Application System
A multi-step application process allows prospective drivers to submit details for admin review and approval, including phone verification via SMS OTP and postcode autocomplete.

### Mobile API
A dedicated mobile API at `/api/mobile/v1/driver/*` provides driver-specific functionalities including profile management, location updates, job management, and proof of delivery uploads, authenticated via Supabase JWT. It supports admin-to-driver job assignments.

### Multi-Drop Stop POD & Auto-Complete
For multi-drop jobs, Proof of Delivery (POD) (photo + recipient name) is collected per stop. The driver marks each stop as delivered individually. When all stops for a multi-drop job are delivered, the job auto-completes, setting a synthetic POD on the main job, changing its status to "delivered," sending a delivery confirmation email, and broadcasting a WebSocket update.

### Push Notifications
Real-time push notifications alert drivers instantly when jobs are assigned using Expo Push API. Driver Expo push tokens are stored in the `driver_devices` table.

### Pay Later & Invoicing
Approved business customers can use a "Pay Later" option, leading to weekly invoicing. An "Invoices" section provides invoice history and PDF download options.

### Pricing Engine
A TypeScript-based pricing engine calculates delivery costs, considering vehicle type, distance, surcharges, multi-drop fees, and waiting times. Pricing configurations are synchronized between client and server. All pages calculating quotes use identical distance logic via the `/api/maps/optimized-route` API for consistency.

### Service Type / Service Level
Four service tiers (Flexible 0%, Standard +10%, Urgent +25%, Dedicated/Direct +40%) are displayed as a 2×2 selector on the Quote page after a quote is generated. The selection is stored in `BookingContext` and flows through to the booking/payment step. The server applies the surcharge on `bookingData.totalPrice` before creating the Stripe PaymentIntent or recording a Pay Later booking. The surcharge is stored per-job as `service_type`, `service_type_percent`, and `service_type_amount` columns (auto-migrated on startup). The admin job detail panel shows the full pricing breakdown (base price → service type % → surcharge → final total). Service type percentages are configurable by admins via the Pricing Settings page and stored in the `service_type_pricing` JSONB column in `pricing_settings`. The server reads configured percentages from the database instead of hardcoded values.

### Price Isolation
Strict separation between `customer_price` (stored as `total_price`) and `driver_price` is maintained. This is enforced through RLS policies, role-specific views (`admin_jobs_view`, `driver_jobs_view`, `customer_jobs_view`), explicit column selection in API endpoints, and WebSocket payload filtering.

### Document Upload
A secure backend API (`POST /api/documents/upload`) handles document uploads (image and PDF formats up to 10MB) using `multer`, storing files in a structured directory.

### Soft Delete System
The system employs soft deletion using `isActive` and `deactivatedAt` fields for drivers and users, preserving historical data.

### Driver ID Format
Driver IDs are formatted as `RC` + 2 digits + 1 letter (e.g., RC02C), generated exclusively via the `create-driver` Supabase Edge Function.

### Admin Job Assignment
Admins can assign jobs to available drivers with custom pricing. Drivers receive notifications and can accept or decline assignments.

### Batch Job Assignment
Admins can assign multiple jobs to a single driver transactionally via PostgreSQL functions (`batch_assign_driver`), maintaining individual job records and providing grouped notifications.

### Supabase-Only Architecture
Supabase is the single source of truth for all data, handling authentication, database, real-time subscriptions, and Edge Functions for privileged operations. RLS policies control granular data access.

### Web-Mobile Integration
The web admin dashboard and Expo mobile app share a unified backend. This includes synchronized job assignment, real-time events via WebSockets, push notifications for drivers, and synchronized driver profiles.

### Job Geocoding
Jobs are automatically geocoded using Google Maps API to obtain coordinates, which are synced to Supabase for display on the driver mobile app's map.

### Route Planner
Admins can plan multi-stop delivery routes at `/admin/route-planner`. Features include: adding multiple postcodes/addresses as stops, reordering stops with up/down controls, configuring custom start/end points (first stop, last stop, or custom postcode), auto-optimization toggle, interactive Google Maps route display using the Directions API, per-leg breakdown (distance and time), copy-to-clipboard, open in Google Maps link, and sending the route to a driver via email (using Resend) or via WhatsApp (`wa.me` deep link). Backend email endpoint: `POST /api/route-planner/send-email`. Reuses existing `/api/maps/optimized-route` for distance/time calculations.

### Driver Payment System
Admins can pay drivers via bank transfer from the admin panel. The multi-step flow shows driver bank details, accepts an amount, confirms the payment, and records it. Email confirmation is sent to the driver upon success. Payment history includes delete functionality.

### Driver Profile & Document Storage
Drivers can update their profile and upload documents via the mobile app or during website application. Documents are stored in the Supabase Storage bucket `DRIVER-DOCUMENTS` with mobile-compatible path format: `{authUserId}/{docType}_{timestamp}_{filename}`. The `driver_documents` table tracks all documents.

### Driver Contract Management
Admins can create contract templates with placeholder variables, send contracts to multiple drivers at once via email, and track signing status. Drivers receive an email with a public signing link, leading to a canvas-based signature pad. Signed contracts with signature data are stored permanently.

### Driver Notice / Broadcast System
Admins can create notice templates, send notices to all active approved drivers or selected drivers, and track viewing/acknowledgement status. Notices can optionally require driver acknowledgement and trigger email notifications.

### Supervisor System
A dedicated operations supervisor role with a separate login portal at `/supervisor/login`. Supervisors are invited by admins via email (invite link with 7-day expiry), self-register at `/supervisor/register?token=...`, and must be approved by an admin before gaining access. The `supervisors` table (auto-migrated on startup) tracks invite status, activation, and notes. Admin manages supervisors at `/admin/supervisors` (invite, approve/reject, suspend, delete). Active supervisors access a full operations dashboard including: Dashboard with live stats, Jobs list, Create Job (same UI/logic as admin), Live Map, Drivers, Customers, Invoices, and Job History. The `UserRole` type includes `'supervisor'`, DashboardLayout/ProtectedRoute/dashboardRoutes all handle the supervisor role, and the `/api/supervisor/*` and `/api/supervisors/*` backend routes manage all supervisor operations. Supervisor status flow: `pending` (invited, not yet registered) → `pending_approval` (registered, awaiting admin approval) → `active` (approved) → `suspended` / `deactivated`.

## External Dependencies

-   **Google Maps Integration**: Used for geocoding, distance calculations, and route visualization.
-   **Supabase Services**: Authentication, database, real-time subscriptions, and Edge Functions.
-   **Stripe**: Integrated via Edge Functions for payment processing and managing customer IDs for "Pay Later" invoicing.
-   **Resend**: Used for sending transactional emails via `server/emailService.ts` and the `send-email` Edge Function for booking confirmations and delivery confirmations.
-   **Twilio**: Used for SMS OTP verification during the driver application process.