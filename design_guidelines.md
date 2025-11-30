# Run Courier Design Guidelines

## Design Approach
**System-Based Approach** drawing from Linear's efficiency, Stripe's professional dashboard aesthetic, and Material Design's enterprise reliability. This logistics platform prioritizes clarity, data density, and operational efficiency over decorative elements.

## Core Design Principles
1. **Operational Clarity**: Information hierarchy that supports quick decision-making
2. **Role Distinction**: Visual consistency across panels with subtle role-specific accents
3. **Real-time Feedback**: Clear indicators for live updates and status changes
4. **Density Balance**: Pack information efficiently without overwhelming users

---

## Typography

**Font Stack**: Inter (primary), SF Pro Display (headings)
- **Headings**: 
  - H1: 2.5rem/700 (page titles)
  - H2: 2rem/600 (section headers)
  - H3: 1.5rem/600 (card headers, panel titles)
- **Body**: 
  - Regular: 0.875rem/400 (data tables, lists)
  - Medium: 1rem/500 (primary content, form labels)
  - Large: 1.125rem/400 (hero, introductory text)
- **UI Elements**: 0.75rem-0.875rem/500 (buttons, badges, status labels)

---

## Layout System

**Spacing Scale**: Tailwind units 2, 4, 6, 8, 12, 16, 24
- Component padding: p-4 to p-6
- Section spacing: py-12 (mobile), py-16 to py-24 (desktop)
- Card gaps: gap-4 to gap-6
- Form field spacing: space-y-4

**Grid Strategy**:
- Dashboard panels: Sidebar (280px fixed) + main content area
- Data tables: Full-width with horizontal scroll on mobile
- Cards: 2-col (md), 3-col (lg), 4-col (xl) for feature grids
- Forms: Single column (max-w-2xl) for clarity

---

## Component Library

### Navigation
**Admin/Driver/Dispatcher Panels**:
- Fixed left sidebar with icon + label navigation
- Top bar: Logo, breadcrumbs, user profile dropdown, notifications bell
- Mobile: Bottom tab bar with primary actions

**Public Website**:
- Horizontal navbar: Logo left, links center, "Login" + "Book Now" (primary CTA) right
- Sticky on scroll with subtle shadow
- Mobile: Hamburger menu overlay

### Dashboard Cards
- White background, subtle border (border-gray-200)
- Rounded corners (rounded-lg)
- Header with icon + title + action button
- Metric cards: Large number (text-3xl/700), label below, trend indicator (↑ +12%)

### Status Indicators
- Pill badges with dot prefix:
  - Active/Available: Green background (bg-green-50, text-green-700)
  - Pending/Waiting: Yellow (bg-yellow-50, text-yellow-700)
  - Completed: Blue (bg-blue-50, text-blue-700)
  - Cancelled/Inactive: Red (bg-red-50, text-red-700)

### Forms
- Labels: 0.875rem/500, text-gray-700, mb-1.5
- Inputs: h-10, px-3, border-gray-300, rounded-md, focus ring (ring-2, ring-blue-500)
- Helper text: 0.75rem, text-gray-500, mt-1
- Error state: border-red-500, text-red-600

### Buttons
- Primary (Book Now, Assign Driver): h-10, px-6, bg-blue-600, hover:bg-blue-700, rounded-md, font-medium
- Secondary (Cancel, View Details): h-10, px-6, border-2 border-gray-300, hover:bg-gray-50
- Icon buttons: w-9 h-9, rounded-full, hover:bg-gray-100

### Data Tables
- Zebra striping (alternate row bg-gray-50)
- Column headers: uppercase text-xs, font-semibold, text-gray-600
- Row height: h-12 for scanability
- Action column (right): Icon buttons for edit/delete/view
- Mobile: Card-based layout stacking key data

### Map Components
- Full-height right panel (50% width on lg+) or embedded cards
- Driver markers: Custom blue pins with vehicle icon
- Route polyline: Blue (#007BFF), 4px width
- Info window: Driver photo, name, vehicle, ETA, status badge

### Modals/Overlays
- Backdrop: bg-black/40
- Panel: max-w-2xl, bg-white, rounded-lg, p-6
- Header: Flex justify-between with close icon
- Actions: Right-aligned button group at bottom

---

## Page-Specific Layouts

### Public Home Page
- **Hero**: Full-viewport height with background gradient (light blue to white), centered content (max-w-4xl), large headline (text-5xl/800), subheadline (text-xl/400), dual CTAs ("Book Now" primary + "Track Parcel" secondary), subtle courier truck illustration on right (optional)
- **Service Icons Section**: 8 cards in 4-col grid (2-col mobile), icon top, title, brief description, "Learn More" link
- **Track Your Parcel**: Centered input (max-w-md) with tracking number field + "Track" button, light background (bg-gray-50)
- **Features**: 3-col benefits grid with icons
- **Footer**: 4-col layout - About, Services, Legal, Contact Info

### Admin Dashboard
- **Top Stats Bar**: 4 metric cards (Today's Jobs, Active Drivers, Revenue, Pending Approvals)
- **Main Grid**: 2-col layout
  - Left: Recent Jobs table (last 10) with quick actions
  - Right: Live Driver Map (h-96)
- **Secondary Row**: Driver Document Approvals queue + Quick Actions panel

### Driver Panel
- **Job Feed**: Card-based list, each showing pickup/dropoff postcodes, weight, vehicle, price, distance, "Accept" (green) / "Reject" (red) buttons
- **Active Job Detail**: Expandable view with map, step-by-step checklist (visual progress bar), status update buttons, POD upload zone
- **Availability Toggle**: Prominent switch in top bar

### Customer Booking Flow
- **Step 1 (Quote)**: 2-col form (Pickup left, Delivery right), vehicle selector cards below, weight slider, toggles for multi-drop/return trip
- **Step 2 (Review)**: Summary card (left), map preview (right), breakdown pricing table
- **Step 3 (Payment)**: Stripe embedded form
- **Step 4 (Tracking)**: Live map with driver location, status timeline on left, ETA countdown

### Dispatcher Panel
- **Main View**: Split screen - Driver list (left sidebar, 30%), Map with all drivers (center, 50%), Job queue (right, 20%)
- **Drag-and-drop**: Jobs draggable onto driver cards to assign

---

## Animations
**Minimal, functional only**:
- Page transitions: Fade-in (300ms)
- Live updates: Subtle pulse on new job notification badge
- Status changes: Color transition (200ms ease)
- Map movements: Smooth pan/zoom with Google Maps defaults
- No decorative animations

---

## Images

### Public Website
- **Hero Section**: Large background image of delivery driver/courier van in action (1920x800px), subtle gradient overlay for text legibility
- **Service Section**: Icon illustrations for each service type (Same Day, Medical, Legal, etc.) - use SVG icons from Heroicons
- **About Page**: Team photo or warehouse/operations center image

### Admin/Internal Panels
- **Driver Profile**: Headshot placeholder with upload functionality
- **Vehicle Photos**: Thumbnail grid in driver details
- **POD Photos**: Large preview modal for proof of delivery images
- No decorative imagery in operational dashboards - focus on data and functionality