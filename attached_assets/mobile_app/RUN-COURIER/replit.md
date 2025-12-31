# RUN COURIER App

## Overview
A comprehensive mobile application built with Expo (React Native) and Supabase, designed for courier drivers. The app streamlines delivery operations, offering features such as secure authentication, efficient job management (admin-assigned), real-time GPS tracking, barcode scanning for parcel handling, robust proof of delivery (POD) capture including photos and signatures, and comprehensive driver profile and document management. The project aims to provide a reliable tool for drivers, enhancing their productivity and ensuring smooth delivery processes.

## User Preferences
- I prefer simple language.
- I want iterative development.
- Ask before making major changes.
- Do not make changes to the folder `Z`.
- Do not make changes to the file `Y`.

## System Architecture
The application is built using React Native with Expo SDK 54 for cross-platform mobile development. The backend and database are powered by Supabase, leveraging its PostgreSQL database, Supabase Auth for authentication, and Supabase Storage for document and photo uploads. Navigation is handled by React Navigation 7+.

**UI/UX Decisions:**
The application adopts an "iOS 26 Liquid Glass" design system, characterized by glass morphism variants for components like cards and buttons, aiming for a professional and modern aesthetic. Key screens such as `ProfileScreen`, `JobOffersScreen`, and `CompletedJobsScreen` have been redesigned to incorporate this liquid glass effect, focusing on clean layouts and intuitive user interactions.

**Technical Implementations & Feature Specifications:**

-   **Authentication:** Email/password login and signup via Supabase Auth with session persistence. Includes a multi-step profile setup for new drivers, capturing vehicle type during registration and requiring document uploads for verification.
-   **Job Management (Admin-Assignment Model):** Drivers only receive jobs explicitly assigned by an administrator. A job workflow tracks status from `pending` to `delivered`, with real-time updates via Supabase subscriptions. Drivers can accept or reject jobs, with rejection reasons recorded.
-   **Active Job Tracking:** Features step-by-step job progress, GPS location tracking (every 10 seconds) with real-time updates to Supabase, and navigation integration with external map services (Google Maps, Waze, Apple Maps).
-   **Barcode Scanning:** Utilizes `expo-camera CameraView` for scanning pickup and delivery barcodes (supporting various types like QR, EAN13, Code128). Scanned data is stored in the job record.
-   **Proof of Delivery (POD):** Allows capture of up to 10 photos (compressed to max 1280px width, JPEG quality 0.6), recipient name input, mandatory signature capture using `@shopify/react-native-skia`, and optional delivery notes. All POD assets are uploaded to Supabase Storage bucket `pod` with path format `pod/{job_id}/{uuid}.jpg`. Uses Promise.all to ensure ALL uploads succeed before marking job as delivered.
-   **Profile Management:** Enables drivers to manage their profile picture, view weekly statistics (jobs, earnings, miles), update personal details, and manage vehicle information.
-   **Document Management:** Integrated with Supabase, storing various driver and vehicle-related documents. Features include conditional document requirements based on nationality and vehicle type, status tracking (e.g., `verified`, `pending`), and completion percentage calculation. Documents are stored in the `driver_documents` bucket.
-   **Nationality Field:** Removed from mobile app UI (EditProfileScreen, ProfileSetupScreen) but retained in Supabase database for website use. ManageDocumentsScreen uses nationality from database (defaults to 'British' if not set) to determine required documents.
-   **Core System Design:** The `AuthContext` manages authentication state and handles mapping between app-level field names and actual Supabase database column names to ensure data consistency.
-   **Offline Resilience (iPad Freeze Fix):** AuthContext uses a completely non-blocking architecture to prevent UI freezes:
    -   `loading=false` is set IMMEDIATELY on mount - no awaits block the UI
    -   Cache hydration runs in background via `.then()` (no await)
    -   Session fetch runs in background via `.then()` (no await)
    -   Auth listener handles all state updates after initial render
    -   Navigation is gated on `userRole` (not session) to handle transient network failures
    -   Fallback driver is created and cached on any profile fetch failure
    -   Cache cleared only on explicit sign out or session expiration

**Project Structure:**
The application follows a modular structure, separating concerns into `App.tsx`, `lib/` (Supabase config), `context/` (Auth), `navigation/`, `screens/` (categorized by auth/driver), `services/`, `components/`, and `constants/`.

## External Dependencies
-   **Supabase:** Primary backend for database (PostgreSQL), authentication, and storage.
-   **Expo (React Native):** Frontend framework for mobile application development.
-   **React Navigation 7+:** For in-app navigation flows.
-   **@shopify/react-native-skia:** Used for signature capture functionality.
-   **expo-camera:** For camera access and barcode scanning.
-   **AsyncStorage:** For session persistence on mobile.
-   **Resend:** Integrated for sending POD email notifications to customers and administrators upon delivery completion.

## Production Build & Deployment

**Current Version:**
- App Version: 1.6.7
- iOS Build Number: 1
- Android Version Code: 9
- Bundle identifier: `com.runcourier.driver`

**EAS Build Configuration:**
- Production builds configured in `eas.json` with iOS App Store distribution
- Environment variables passed via EAS secrets (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_API_URL)
- Clean eas.json without submit section (submit handled via CLI)

**Backend API Configuration:**
- API Base URL: Set via `EXPO_PUBLIC_API_URL` environment variable
- Used by: Payment processing (Stripe), Google Places Autocomplete
- All API calls use centralized configuration from `app.config.js` → `extra.apiUrl`

**Config Validation:**
- `ConfigMissingScreen` displays user-friendly error when Supabase credentials are missing in production builds
- Development mode continues to use mock Supabase for testing
- Environment variables load from: `process.env.EXPO_PUBLIC_*` with fallback to `Constants.expoConfig.extra`

**Required EAS Secrets (set before building):**
```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://your-project.supabase.co"
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your-anon-key"
eas secret:create --scope project --name EXPO_PUBLIC_API_URL --value "https://expo-messenger--almashriqi2010.replit.app"
```

**Build Commands:**
```bash
# Install EAS CLI (if not installed)
npm install -g eas-cli

# Login to Expo account
eas login

# Build for iOS TestFlight
eas build -p ios --profile production

# Submit to App Store Connect (after build completes)
eas submit -p ios

# Build for Android Play Store
eas build -p android --profile production

# Submit to Google Play (after build completes)
eas submit -p android
```

**iOS Permissions Configured:**
- NSLocationWhenInUseUsageDescription: Location for delivery tracking
- NSLocationAlwaysAndWhenInUseUsageDescription: Background location tracking
- NSCameraUsageDescription: POD photos and barcode scanning
- NSPhotoLibraryUsageDescription: Photo library access for POD photos and documents
- NSPhotoLibraryAddUsageDescription: Save POD photos to library
- ITSAppUsesNonExemptEncryption: false (no export compliance required)

**Android Permissions Configured:**
- ACCESS_FINE_LOCATION: GPS location for delivery tracking
- ACCESS_COARSE_LOCATION: Approximate location
- CAMERA: POD photos and barcode scanning

**Version Increment (for future releases):**
When releasing new versions, update in `app.config.js`:
- `version`: Increment semantic version (e.g., 1.0.1 → 1.0.2)
- `ios.buildNumber`: Increment string (e.g., "2" → "3")
- `android.versionCode`: Increment number (e.g., 2 → 3)

## Website-Mobile App Integration

**Job Assignment Flow (Admin Website → Mobile App):**
1. Admin creates/assigns a job in the website by setting:
   - `driver_id`: Target driver's UUID
   - `status`: 'assigned' or 'offered'
2. Mobile app receives job instantly via Supabase real-time subscriptions
3. Driver sees job in "Job Offers" tab with alarm notification
4. Driver accepts → status changes to 'accepted' → job moves to "Active Job" tab
5. Driver rejects → status changes to 'rejected' → admin notified via dashboard

**Real-time Sync Channels:**
- `assigned-jobs-channel`: JobOffersScreen listens for new jobs where driver_id matches
- `pending-jobs-count`: PendingJobsContext updates badge count in real-time
- `active-job-channel`: ActiveJobScreen listens for job status changes

**Database Tables Used:**
- `jobs`: Main job records with status workflow (assigned → accepted → picked_up → on_the_way → delivered)
- `drivers`: Driver profiles linked by user_id/driver_id
- `customer_bookings`: Customer orders linked to jobs via driver_job_id (for website tracking)

**Test Script for Integration:**
```bash
# List recent jobs
node scripts/test-admin-job-assignment.js list

# Assign a test job to first available driver
node scripts/test-admin-job-assignment.js
```

**Backend API (Deployed):**
- URL: https://expo-messenger--almashriqi2010.replit.app
- Endpoints: /api/stripe/create-payment-intent, /api/stripe/confirm-payment
- Used by: Customer payment flow, website integration

**Job Offers API (Backend):**
- URL: https://945d2f5a-7336-462a-b33f-10fb0e78a123-00-2bep7zisdjcv3.spock.replit.dev
- Endpoint: GET /api/mobile/v1/driver/job-offers
- Auth: Supabase JWT token in Authorization header (Bearer token)
- Response: `{ success: true, offers: [...], count: N }`
- Fallback: If API returns error, app falls back to direct Supabase query

## Admin Operations

**Account Deletion & Re-registration:**
To allow a driver or customer to sign up again with the same email after account deletion:
1. Go to Supabase Dashboard → Authentication → Users
2. Delete the user from the auth.users table
3. Go to Table Editor → drivers (or profiles for customers)
4. Delete the corresponding driver/profile record with matching email
5. User can now sign up fresh with the same email

**Supabase Settings for Signups:**
- Authentication → Providers → Email: Enable email provider
- Authentication → Settings: Enable "Allow new users to sign up"

**RECOMMENDED: Add unique constraint on email in drivers table:**
To prevent duplicate driver records at the database level, run this SQL in Supabase:
```sql
-- First, identify and clean up any duplicates (keep oldest record)
DELETE FROM drivers a USING drivers b
WHERE a.ctid > b.ctid AND LOWER(a.email) = LOWER(b.email);

-- Add unique constraint on email (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS drivers_email_unique ON drivers (LOWER(email));
```

**Driver ID Consistency (Mobile & Website):**
- Mobile app signup checks for existing driver by email BEFORE creating new record
- If driver exists (created by website), mobile app reuses it - no duplicate created
- Login uses email lookup first, then falls back to ID lookup
- This ensures drivers registered via website can log in via mobile app with the same account

**Dual-ID Job Query (Handles ID Mismatch):**
- All job queries now search using BOTH `driver.id` (from drivers table) AND `user.id` (from auth)
- This handles cases where website assigns jobs using auth user ID but driver table has different primary key
- Affected screens: JobOffersScreen, ActiveJobScreen, CompletedJobsScreen, ProfileScreen, PendingJobsContext
- Real-time subscriptions also listen to changes for both IDs
- This ensures drivers see ALL their jobs regardless of which ID was used for assignment