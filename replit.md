# Run Courier - Logistics Platform

## Overview

Run Courier is a comprehensive full-stack web application designed for courier and delivery management. It connects customers, drivers, dispatchers, administrators, and vendors in a real-time logistics network, offering same-day delivery, multi-drop routing, specialized transport (medical, legal, retail), and live tracking across the UK. The platform aims to enhance operational efficiency through role-based dashboards, real-time updates, and a sophisticated pricing engine that accounts for various vehicle types, rush hour rates, congestion charges, and complex delivery scenarios.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

The frontend is built with React 18+ and TypeScript, utilizing Vite for tooling. It employs Wouter for lightweight routing, TanStack Query for server state management, and Radix UI primitives with shadcn/ui components for a customizable design system. Tailwind CSS is used for styling, supporting light/dark modes, with a design aesthetic inspired by Linear and Stripe. Layouts are responsive and designed mobile-first, with distinct structures for public pages and role-specific dashboards.

### Backend

The backend uses Node.js with Express and TypeScript (ESNext modules). It features a RESTful API, a custom async handler for error management, and Drizzle ORM with PostgreSQL (Neon serverless driver) for data persistence. A key decision is the `IStorage` interface, abstracting data operations. Server-side code is bundled with esbuild for optimized cold start times.

### Database & Data Layer

PostgreSQL is the chosen database, accessed via the Neon serverless driver and managed with Drizzle ORM and Drizzle Kit for migrations. The schema includes core entities like `users` (with multiple roles and Stripe integration), `drivers` (with vehicle and location data), `jobs` (tracking delivery status, pricing, and proof-of-delivery), `vehicles`, `documents`, `notifications`, `vendor_api_keys`, and `pricing_settings`. Shared TypeScript schemas ensure type consistency between frontend and backend.

### Authentication & Authorization

Supabase Auth handles user authentication (email/password) and session management. Role-based access control is implemented via `ProtectedRoute` components, leveraging user metadata stored in Supabase to redirect users to their respective dashboards (`/admin`, `/customer`, `/driver`, `/dispatcher`, `/vendor`).

### Real-Time Features

A WebSocket server, built with the `ws` library, provides real-time capabilities at `/ws/realtime`. It supports secure token-based authentication using Supabase JWT verification and server-side role validation. Key features include live driver location tracking, broadcasting, connection heartbeats, and offline detection, with a fallback to REST API polling.

### Driver Application System

Prospective drivers complete a multi-step application form (Personal Details, Documents, Vehicle & Bank, Review) that is then reviewed and approved/rejected by an administrator. Upon approval, the driver's account is activated, and their profile in the database is verified.

### Mobile API (Driver App)

A dedicated mobile API under `/api/mobile/v1/driver/*` provides endpoints for driver-specific functionalities. Authentication requires a Supabase JWT token. Endpoints cover driver profile management, location updates, availability toggling, job retrieval, job status updates, and proof of delivery uploads.

### Pay Later Feature

For approved business customers, a "Pay Later" option allows bookings without immediate payment, with weekly invoicing instead. This feature is enabled by administrators and reflected in the customer's booking flow, bypassing Stripe checkout.

### Business Customer Invoices

Business customers with Pay Later enabled have access to an Invoices section at `/customer/invoices` that provides:

**Features:**
- Invoice history with all past invoices listed
- Status tracking (Pending, Paid, Overdue)
- Dashboard stats: Total Invoices, Pending Payment, Paid This Month, Overdue count
- View invoice details with full breakdown of deliveries
- Download PDF of any invoice
- Print invoices directly from browser

**Invoice Structure:**
- Invoice number (unique identifier)
- Billing period (weekly)
- List of all deliveries made during the period
- Subtotal, VAT (20%), and Total
- Due date (typically 7 days from invoice generation)
- Payment information with bank details

**Key Files:**
- `client/src/pages/customer/CustomerInvoices.tsx` - Invoice history page
- `shared/schema.ts` - Invoice table schema
- `server/routes.ts` - `/api/invoices` endpoints

### Pricing Engine

The pricing engine, implemented in TypeScript, calculates delivery costs based on vehicle type, distance, rush hour surcharges, weight surcharges, Central London congestion charge, multi-drop fees, return trip multipliers, and waiting times. It allows for client-side quote generation with server-side validation.

### Form Handling & Validation

React Hook Form is used for form state management, integrated with Zod schemas for validation. This ensures type-safe forms, shared validation logic between client and server, and automatic error handling.

## External Dependencies

-   **Google Maps Integration**: Used for geocoding, distance calculation, and route visualization via `@googlemaps/js-api-loader`.
-   **Supabase Services**: Utilized for authentication, user management, and storage for document uploads (e.g., driver licenses, DBS certificates).
-   **Neon Database**: Provides serverless PostgreSQL hosting.
-   **Stripe**: Integrated for immediate payment processing and managing customer IDs for the "Pay Later" invoicing feature.
## Email Notifications (Resend Integration)

All website notifications are now automatically sent to **info@runcourier.co.uk** via the Resend email service.

**Integrated Notification Triggers:**
- **New Job Created**: Admin notified when a new job is booked in the system
- **Driver Application Review**: Admin notified when a driver application is reviewed (approved/rejected)
- **Document Upload**: Admin notified when drivers upload documents for verification
- **Invoice Generated**: Admin notified when new invoices are created for Pay Later customers

**Email Service Features:**
- Uses Resend's reliable transactional email API
- Credentials managed through Replit's secure integrations (no API keys exposed)
- All emails sent with HTML formatting and fallback text content
- Non-blocking: notifications sent asynchronously without delaying API responses
- Graceful fallback: If Resend is not configured, system logs warning but continues operating

**Email Service Functions** (in `server/emailService.ts`):
- `sendAdminNotification()` - Send any email to info@runcourier.co.uk
- `sendNewJobNotification()` - Notify admin of new bookings
- `sendDriverApplicationNotification()` - Notify admin of application reviews
- `sendDocumentUploadNotification()` - Notify admin of document uploads
- `sendPaymentNotification()` - Notify admin of invoice generation

All functions include comprehensive job/application details in both HTML and plain text formats.
