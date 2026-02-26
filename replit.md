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

### Booking State Persistence
A global `BookingContext` persists booking data to `localStorage` with a 24-hour expiry.

### Driver Application System
A multi-step application process allows prospective drivers to submit details for admin review and approval. This includes phone verification via SMS OTP using Twilio, and postcode autocomplete using Google Maps Places API.

### Mobile API
A dedicated mobile API at `/api/mobile/v1/driver/*` provides driver-specific functionalities including profile management, location updates, job management, and proof of delivery uploads, authenticated via Supabase JWT. It supports admin-to-driver job assignments.

### Push Notifications
Real-time push notifications alert drivers instantly when jobs are assigned using Expo Push API. Drivers register their Expo push tokens, which are stored in the `driver_devices` table.

### Pay Later & Invoicing
Approved business customers can use a "Pay Later" option, leading to weekly invoicing. An "Invoices" section provides invoice history and PDF download options.

### Pricing Engine
A TypeScript-based pricing engine calculates delivery costs, considering vehicle type, distance, surcharges, multi-drop fees, and waiting times. Pricing configurations are synchronized between client and server. All pages calculating quotes use identical distance logic via the `/api/maps/optimized-route` API for consistency, with multi-drop logic determining distances and counts.

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
The web admin dashboard and Expo mobile app share a unified backend. This includes synchronized job assignment, real-time events via WebSockets, push notifications for drivers, and synchronized driver profiles. The mobile app must register push tokens and connect to the WebSocket for real-time updates.

### Job Geocoding
Jobs are automatically geocoded using Google Maps API to obtain coordinates, which are synced to Supabase for display on the driver mobile app's map.

### Driver Payment System
Admins can pay drivers directly from the admin panel. The multi-step payment flow shows driver bank details (already saved), accepts an amount, confirms the payment, and sends an email confirmation to the driver. Company bank details for Run Courier are stored in `data/company-settings.json`. Payment history includes delete functionality. The system uses `POST /api/driver-payments` to record payments and `DELETE /api/driver-payments/:id` to remove them.

### Driver Profile & Document Storage
Drivers can update their profile and upload documents via the mobile app or during website application. Documents are stored in Supabase Storage bucket `DRIVER-DOCUMENTS` (uppercase) with mobile-compatible path format: `{authUserId}/{docType}_{timestamp}_{filename}`. The `driver_documents` table tracks all documents with `driver_id`, `doc_type`, `file_url`, `storage_path`, and `bucket` fields. When a driver applies via the website, documents are initially uploaded to `driver-documents` bucket under `drivers/pending/{type}/{file}`, then copied to the driver's permanent path in `DRIVER-DOCUMENTS` bucket during approval. Document types use mobile-app-compatible names: `driving_licence`, `driving_licence_back`, `dbs_certificate`, `goods_in_transit`, `hire_and_reward`, `profile_picture`, `vehicle_photos_*`. The `DOC_TYPE_GROUPS` alias system in routes.ts maps between different naming conventions (e.g., `driving_license` ↔ `driving_licence`).

## External Dependencies

-   **Google Maps Integration**: Used for geocoding, distance calculations, and route visualization.
-   **Supabase Services**: Authentication, database, real-time subscriptions, and Edge Functions.
-   **Stripe**: Integrated via Edge Functions for payment processing and managing customer IDs for "Pay Later" invoicing.
-   **Resend**: Used for sending transactional emails via the `send-email` Edge Function.
-   **Twilio**: Used for SMS OTP verification during the driver application process.