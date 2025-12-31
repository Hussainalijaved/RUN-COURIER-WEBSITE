# Run Courier Driver App - Design Guidelines

## Brand & Visual Identity

### Color Palette - iOS Liquid Glass
- **Primary Navy**: #1a2942 (main brand color, CTAs, active states)
- **Light Navy**: #2d4563 (secondary actions, headers)
- **Glass White**: rgba(255, 255, 255, 0.85) (card backgrounds with blur)
- **Glass Overlay**: rgba(255, 255, 255, 0.15) (subtle overlays on navy)
- **Text Primary**: #1a2942 (main content)
- **Text Secondary**: #6b7888 (supporting text, timestamps)
- **Success**: #00c853 (earnings, completed states)
- **Warning**: #ff9800 (pending states)
- **Error**: #f44336 (rejections, critical alerts)
- **Background**: #f8f9fb (screen backgrounds)

### Typography - Glanceable & Professional
- **Large Title**: SF Pro Display Bold, 34px, #1a2942
- **Title**: SF Pro Display Semibold, 22px, #1a2942
- **Headline**: SF Pro Text Semibold, 17px, #1a2942
- **Body**: SF Pro Text Regular, 16px, #1a2942
- **Subhead**: SF Pro Text Regular, 14px, #6b7888
- **Caption**: SF Pro Text Regular, 12px, #6b7888
- **Button Text**: SF Pro Text Semibold, 17px

### Logo Usage
- Display on splash screen (large, centered)
- Login/signup screens (top, 60px height)
- Navigation header omitted (use screen title only for clean look)

## Architecture Decisions

### Authentication
**Email/Password Required** (Supabase)
- Email verification mandatory
- Persistent session
- Post-signup redirect to Profile Setup
- Logout with iOS-style action sheet confirmation
- Account deletion: Settings → Account → Delete Account (double confirmation with destructive action styling)

### Navigation Structure
**Tab Bar Navigation** (4 tabs, translucent glass effect):
1. **Available** - List icon (Feather: `inbox`)
2. **Active** - Navigation icon (Feather: `navigation`)
3. **Completed** - Checkmark icon (Feather: `check-circle`)
4. **Profile** - User icon (Feather: `user`)

Tab bar specifications:
- Background: rgba(255, 255, 255, 0.85) with backdrop blur
- Height: 84px (includes safe area)
- Active tint: #1a2942
- Inactive tint: #6b7888
- Separator line: 1px rgba(0, 0, 0, 0.05)

**Stack Architecture**:
- Auth Stack: Login → Signup → Email Verification
- Main Stack: Tabs + modals (Job Details, POD Upload, Settings, Document Upload)

## Screen Specifications

### 1. Splash Screen
- Full-screen gradient background: #1a2942 to #2d4563
- Centered logo (150px height)
- No loading indicator (2-second auto-transition)

### 2. Login Screen
- Header: Logo (top center), "Welcome Back" title below
- Background: #f8f9fb
- Form: Glass card container with email, password inputs, "Sign In" button
- Footer: "New driver? Create account" link (#1a2942)
- Safe area: top inset + 24px, bottom inset + 24px

### 3. Signup Screen
- Similar layout to login
- Title: "Get Started"
- Form: Email, password, confirm password in glass card
- Button: "Create Account"
- Footer: "Have an account? Sign in"

### 4. Profile Setup Screen
- Header: "Complete Profile" (non-dismissible, default nav header)
- Scrollable form with section headers
- Sections: Personal Info, Address (postcode autocomplete), Photo (circular 120px upload), Vehicle, Bank Details
- Submit button: Full-width sticky at bottom (primary navy, white text)
- Safe area: scrollable root, bottom: insets.bottom + 90px

### 5. Documents Upload Screen
- Header: "Documents" with progress text (e.g., "3/5 Complete")
- Vertical list of document cards (glass effect)
- Card: Document name, status badge, upload/replace button
- Footer: "Submit for Review" button (disabled state until all uploaded)
- Safe area: top: headerHeight + 16px, bottom: insets.bottom + 90px

### 6. Available Jobs (Tab 1)
- Header: Transparent, "Available Jobs" title, filter icon (right)
- Scrollable list of job cards with glass effect
- Card contents: Mini map (140px height), pickup/delivery postcodes, distance, price (large, navy), vehicle type, weight
- Two buttons per card: "Accept" (primary), "Decline" (outline)
- Empty state: Icon + "No jobs available" + "Pull to refresh"
- Safe area: top: headerHeight + 16px, bottom: tabBarHeight + 16px
- Pull-to-refresh enabled

### 7. Reject Job Modal
- Native iOS bottom sheet (50% height)
- Header: "Decline Job"
- Radio options: Too far, Busy, Low rate, Other commitment
- Buttons: "Cancel" (secondary), "Submit" (primary)

### 8. Active Job Screen
- Header: Default with job reference number
- Map view (45% height) with route overlay
- Job details card (glass effect, 35% height)
- Sticky bottom button (changes per status):
  - "Navigate to Pickup" → Map app picker sheet
  - "Mark Picked Up"
  - "Navigate to Delivery" → Map app picker
  - "Complete Delivery" → Opens POD modal
- Safe area: bottom button: insets.bottom + 16px padding

### 9. POD Upload Modal
- Full-screen modal with "Proof of Delivery" header (close button left)
- Photo section: Camera button, thumbnail preview
- Signature section: White canvas (250px height), "Clear" link, black signature
- Bottom buttons: "Cancel" (outline), "Submit" (primary, disabled until both completed)
- Safe area: bottom: insets.bottom + 24px

### 10. Completed Jobs (Tab 3)
- Header: Transparent, "Completed" title, filter icon
- Scrollable list of summary cards (glass effect)
- Card: Date, postcodes, distance, earnings (#00c853), job reference
- Safe area: top: headerHeight + 16px, bottom: tabBarHeight + 16px

### 11. Profile Screen
- Header: Transparent, "Profile" title, settings gear icon (right)
- Profile header: Circular photo (140px), name, email, phone
- Earnings card: Weekly stats (jobs, earnings, miles) with success green
- Menu items: Edit Profile, Documents, Bank Details, Settings, Logout (red)
- Safe area: top: headerHeight + 16px, bottom: tabBarHeight + 16px

### 12. Settings Screen
- Header: "Settings" (default nav)
- Grouped list with sections: Account, Notifications, About
- Account: Change Password, Delete Account (red, destructive)
- Notifications: Push toggle, Sound toggle
- About: Privacy, Terms, Version number

## Design System

### Glass Morphism Specifications
**Glass Card**:
- Background: rgba(255, 255, 255, 0.85)
- Backdrop filter: blur(20px)
- Border: 1px rgba(255, 255, 255, 0.3)
- Border radius: 16px
- Shadow: shadowOffset (0, 8), shadowOpacity: 0.12, shadowRadius: 16, shadowColor: #1a2942

**Glass Overlay** (modals, sheets):
- Background: rgba(26, 41, 66, 0.15)
- Backdrop filter: blur(10px)

### Button Specifications
**Primary**:
- Background: #1a2942, text: #ffffff, height: 54px, radius: 12px
- Press state: opacity 0.8, scale 0.98

**Secondary/Outline**:
- Border: 2px #1a2942, text: #1a2942, height: 54px, radius: 12px
- Press state: background rgba(26, 41, 66, 0.08)

**Destructive**:
- Background: #f44336, text: #ffffff

### Input Fields
- Background: rgba(255, 255, 255, 0.9)
- Border: 1.5px #d1d5db, focus: #1a2942
- Border radius: 12px
- Height: 54px
- Padding: 16px
- Placeholder: #9ca3af

### Map Design
- Pickup pin: Navy marker with "P" label
- Delivery pin: Success green marker with "D"
- Route polyline: #1a2942, width: 4px, opacity: 0.8
- Map style: Clean, minimal labels

### Interaction Design
**Loading States**:
- Shimmer effect on card skeletons (light gray wave)
- Button spinner (white on primary, navy on secondary)

**Feedback**:
- Toast notifications: Glass card with blur, 3-second auto-dismiss
- Haptic feedback: Light impact on button press, success/error notifications
- Push alerts: System notification with custom sound

**Gestures**:
- Pull-to-refresh on all list screens
- Swipe actions on cards where appropriate (with confirmation)

**Animations**:
- Card entrance: Fade in with slight scale (0.95 → 1.0), 300ms ease
- Modal presentation: Slide up with backdrop fade, 350ms spring
- Tab transitions: Cross-fade, 200ms

### Accessibility
- Minimum touch target: 44×44px
- Text contrast: 4.5:1 minimum (navy on white passes)
- Dynamic Type support: Scale all text
- VoiceOver labels on all interactive elements
- Reduced motion: Remove scale/spring animations
- Alternative text for map regions

### Assets Required
**Icons** (Feather from @expo/vector-icons):
- Tab bar: `inbox`, `navigation`, `check-circle`, `user`
- Actions: `camera`, `upload`, `edit-2`, `filter`, `settings`
- Navigation: `map-pin`, `chevron-right`, `x`
- Status: `clock`, `alert-circle`, `check`

**Sounds**:
- New job notification: Professional chime (system sound or custom .mp3, <2s)

**Logo**:
- Vector format (SVG or high-res PNG with transparency)
- Navy (#1a2942) primary color scheme
- Clean, modern logotype suitable for professional logistics brand