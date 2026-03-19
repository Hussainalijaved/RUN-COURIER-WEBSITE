import { type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import logoImage from '@assets/run_courier_logo.jpeg';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  LayoutDashboard,
  Package,
  Users,
  MapPin,
  Settings,
  FileText,
  BarChart3,
  Bell,
  LogOut,
  ChevronUp,
  User,
  CheckCircle,
  Clock,
  Upload,
  Calendar,
  Key,
  Home,
  Wallet,
  Calculator,
  Receipt,
  FileSignature,
  Megaphone,
  SlidersHorizontal,
  Search,
  BookUser,
  Layers,
} from 'lucide-react';
import type { UserRole } from '@shared/schema';

interface DashboardLayoutProps {
  children: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  icon: any;
}

const roleNavItems: Record<UserRole, NavItem[]> = {
  admin: [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/jobs', label: 'Jobs', icon: Package },
    { href: '/admin/drivers', label: 'Drivers', icon: Users },
    { href: '/admin/applications', label: 'Applications', icon: FileText },
    { href: '/admin/customers', label: 'Customers', icon: Users },
    { href: '/admin/invoices', label: 'Invoices', icon: Receipt },
    { href: '/admin/business-quote', label: 'Business Quote', icon: Calculator },
    { href: '/admin/map', label: 'Live Map', icon: MapPin },
    { href: '/admin/postcode-map', label: 'Postcode Map', icon: Layers },
    { href: '/admin/documents', label: 'Documents', icon: FileText },
    { href: '/admin/payments', label: 'Driver Payments', icon: Wallet },
    { href: '/admin/contracts', label: 'Contracts', icon: FileSignature },
    { href: '/admin/notices', label: 'Driver Notices', icon: Megaphone },
    { href: '/admin/contacts', label: 'Contacts', icon: BookUser },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/admin/supervisors', label: 'Supervisors', icon: Users },
    { href: '/admin/pricing', label: 'Settings', icon: SlidersHorizontal },
  ],
  driver: [
    { href: '/driver', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/driver/jobs', label: 'My Jobs', icon: Package },
    { href: '/driver/active', label: 'Active Job', icon: MapPin },
    { href: '/driver/history', label: 'History', icon: Clock },
    { href: '/driver/payments', label: 'Payments', icon: Wallet },
    { href: '/driver/documents', label: 'Documents', icon: FileText },
    { href: '/driver/notices', label: 'Notices', icon: Megaphone },
    { href: '/driver/profile', label: 'Profile', icon: User },
  ],
  customer: [
    { href: '/customer', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/customer/book', label: 'New Booking', icon: Package },
    { href: '/customer/orders', label: 'My Orders', icon: Clock },
    { href: '/customer/invoices', label: 'Invoices', icon: FileText },
    { href: '/customer/track', label: 'Track Order', icon: MapPin },
    { href: '/customer/profile', label: 'Profile', icon: User },
  ],
  dispatcher: [
    { href: '/dispatcher', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/dispatcher/jobs', label: 'All Jobs', icon: Package },
    { href: '/dispatcher/drivers', label: 'Drivers', icon: Users },
    { href: '/dispatcher/map', label: 'Live Map', icon: MapPin },
    { href: '/dispatcher/assign', label: 'Assign Jobs', icon: CheckCircle },
  ],
  vendor: [
    { href: '/vendor', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/vendor/orders', label: 'Orders', icon: Package },
    { href: '/vendor/upload', label: 'Bulk Upload', icon: Upload },
    { href: '/vendor/scheduled', label: 'Scheduled', icon: Calendar },
    { href: '/vendor/api', label: 'API Keys', icon: Key },
  ],
  supervisor: [
    { href: '/supervisor', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/supervisor/jobs', label: 'Jobs', icon: Package },
    { href: '/supervisor/jobs/create', label: 'Create Job', icon: CheckCircle },
    { href: '/supervisor/quote', label: 'Get Quote', icon: Calculator },
    { href: '/supervisor/map', label: 'Live Map', icon: MapPin },
    { href: '/supervisor/postcode-map', label: 'Postcode Map', icon: Layers },
    { href: '/supervisor/drivers', label: 'Drivers', icon: Users },
    { href: '/supervisor/customers', label: 'Customers', icon: Users },
    { href: '/supervisor/invoices', label: 'Invoices', icon: Receipt },
    { href: '/supervisor/contacts', label: 'Contacts', icon: BookUser },
    { href: '/supervisor/track', label: 'Track Order', icon: Search },
  ],
};

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, signOut } = useAuth();

  if (!user) {
    return <div className="p-8">Loading...</div>;
  }

  const navItems = roleNavItems[user.role] || [];
  const roleLabel = user.role.charAt(0).toUpperCase() + user.role.slice(1);

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen w-full">
        <Sidebar>
          <SidebarHeader className="border-b border-sidebar-border p-4">
            <a href="/" className="flex items-center gap-2 cursor-pointer" data-testid="sidebar-logo-link" onClick={(e) => { e.preventDefault(); setLocation('/'); }}>
              <img 
                src={logoImage} 
                alt="Run Courier" 
                className="h-8 w-auto object-contain rounded-lg"
                data-testid="sidebar-logo-image"
              />
              <div className="flex flex-col">
                <span className="font-bold text-sm tracking-tight">
                  RUN COURIER<sup className="text-[8px] ml-0.5">™</sup>
                </span>
                <span className="text-xs text-muted-foreground">{roleLabel} Panel</span>
              </div>
            </a>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={location === item.href}
                        tooltip={item.label}
                        data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}
                      >
                        <a
                          href={item.href}
                          onClick={(e) => { e.preventDefault(); setLocation(item.href); }}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Quick Actions</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      tooltip="Home"
                      onClick={(e) => { e.preventDefault(); setLocation('/'); }}
                      className="cursor-pointer"
                      data-testid="nav-home"
                    >
                      <Home className="h-4 w-4" />
                      <span>Back to Website</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border p-2">
            <SidebarMenu>
              <SidebarMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 h-12 p-2 data-[state=open]:bg-sidebar-accent hover:bg-sidebar-accent/80 transition-all duration-200 cursor-pointer rounded-lg border border-transparent hover:border-border/50"
                      data-testid="user-menu"
                      data-size="lg"
                    >
                      <Avatar className="h-8 w-8 ring-2 ring-primary/20">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
                          {user.fullName.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col text-left text-sm">
                        <span className="font-semibold truncate">{user.fullName}</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {user.email}
                        </span>
                      </div>
                      <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="top"
                    className="w-[--radix-popper-anchor-width]"
                  >
                    <DropdownMenuItem asChild>
                      <a 
                        href={`/${user.role}/profile`} 
                        className="cursor-pointer flex items-center" 
                        data-testid="menu-profile-settings"
                        onClick={(e) => { e.preventDefault(); setLocation(`/${user.role}/profile`); }}
                      >
                        <Settings className="mr-2 h-4 w-4" />
                        Profile Settings
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={signOut}
                      className="text-destructive cursor-pointer"
                      data-testid="button-logout"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex h-12 sm:h-14 items-center gap-2 sm:gap-4 border-b border-border bg-background px-3 sm:px-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex-1" />
            <Button variant="ghost" size="icon" data-testid="button-notifications" className="h-9 w-9 sm:h-10 sm:w-10">
              <Bell className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </header>

          <main className="flex-1 overflow-auto bg-background p-3 sm:p-4 lg:p-6" data-scroll-container>
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
