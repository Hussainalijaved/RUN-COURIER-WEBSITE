import { type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import logoImage from '@assets/LOGO APP 1_1764513632490.jpg';
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
    { href: '/admin/customers', label: 'Customers', icon: Users },
    { href: '/admin/map', label: 'Live Map', icon: MapPin },
    { href: '/admin/documents', label: 'Documents', icon: FileText },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  ],
  driver: [
    { href: '/driver', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/driver/jobs', label: 'My Jobs', icon: Package },
    { href: '/driver/active', label: 'Active Job', icon: MapPin },
    { href: '/driver/history', label: 'History', icon: Clock },
    { href: '/driver/documents', label: 'Documents', icon: FileText },
    { href: '/driver/profile', label: 'Profile', icon: User },
  ],
  customer: [
    { href: '/customer', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/customer/book', label: 'New Booking', icon: Package },
    { href: '/customer/orders', label: 'My Orders', icon: Clock },
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
};

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
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
            <Link href="/" className="flex items-center gap-2" data-testid="sidebar-logo-link">
              <img 
                src={logoImage} 
                alt="Run Courier" 
                className="h-8 w-auto object-contain"
                data-testid="sidebar-logo-image"
              />
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">{roleLabel} Panel</span>
              </div>
            </Link>
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
                      >
                        <Link href={item.href} data-testid={`nav-${item.label.toLowerCase().replace(/\s/g, '-')}`}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
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
                    <SidebarMenuButton asChild tooltip="Home">
                      <Link href="/" data-testid="nav-home">
                        <Home className="h-4 w-4" />
                        <span>Back to Website</span>
                      </Link>
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
                    <SidebarMenuButton
                      size="lg"
                      className="data-[state=open]:bg-sidebar-accent"
                      data-testid="user-menu"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                          {user.fullName.split(' ').map(n => n[0]).join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col text-left text-sm">
                        <span className="font-medium truncate">{user.fullName}</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {user.email}
                        </span>
                      </div>
                      <ChevronUp className="ml-auto h-4 w-4" />
                    </SidebarMenuButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    side="top"
                    className="w-[--radix-popper-anchor-width]"
                  >
                    <DropdownMenuItem asChild>
                      <Link href={`/${user.role}/profile`} className="cursor-pointer">
                        <User className="mr-2 h-4 w-4" />
                        Profile
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={signOut}
                      className="text-destructive cursor-pointer"
                      data-testid="button-signout"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex h-14 items-center gap-4 border-b border-border bg-background px-4">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex-1" />
            <Button variant="ghost" size="icon" data-testid="button-notifications">
              <Bell className="h-5 w-5" />
            </Button>
          </header>

          <main className="flex-1 overflow-auto bg-background p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
