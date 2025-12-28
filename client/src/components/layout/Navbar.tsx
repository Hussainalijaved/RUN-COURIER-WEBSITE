import { Link, useLocation } from 'wouter';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/context/AuthContext';
import { SmoothImage } from '@/components/ui/smooth-image';
import logoImage from '@assets/LOGO APP 1_1764513632490.jpg';
import {
  Menu,
  X,
  Package,
  MapPin,
  Clock,
  Phone,
  ChevronDown,
  User,
  LogOut,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  {
    label: 'Services',
    children: [
      { href: '/services/same-day', label: 'Same Day Delivery' },
      { href: '/services/medical', label: 'Medical Delivery' },
      { href: '/services/retail', label: 'Retail & E-commerce' },
      { href: '/services/multi-drop', label: 'Multi-Drop' },
      { href: '/services/return-trip', label: 'Return Trip' },
    ],
  },
  { href: '/track', label: 'Track Parcel' },
  { href: '/contact', label: 'Contact' },
];

export function Navbar() {
  const [location, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { user, signOut } = useAuth();

  const getDashboardPath = () => {
    if (!user) return '/login';
    switch (user.role) {
      case 'admin': return '/admin';
      case 'driver': return '/driver';
      case 'customer': return '/customer';
      case 'dispatcher': return '/dispatcher';
      case 'vendor': return '/vendor';
      default: return '/customer';
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 sm:h-16 items-center justify-between gap-2 sm:gap-4 px-3 sm:px-4">
        <Link href="/" className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0 min-w-0" data-testid="logo-link">
          <SmoothImage 
            src={logoImage} 
            alt="Run Courier" 
            className="h-7 sm:h-10 w-auto object-contain flex-shrink-0"
            wrapperClassName="h-7 sm:h-10 flex-shrink-0"
            data-testid="logo-image"
          />
          <span className="font-bold text-[11px] sm:text-lg tracking-tight whitespace-nowrap">
            RUN COURIER<sup className="text-[7px] sm:text-xs ml-0.5">™</sup>
          </span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1">
          {navLinks.map((link, idx) =>
            link.children ? (
              <DropdownMenu key={idx}>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-1" data-testid={`nav-${link.label.toLowerCase()}`}>
                    {link.label}
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  {link.children.map((child) => (
                    <DropdownMenuItem key={child.href} asChild>
                      <Link href={child.href} className="w-full cursor-pointer" data-testid={`nav-${child.label.toLowerCase().replace(/\s/g, '-')}`}>
                        {child.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link key={link.href} href={link.href}>
                <Button
                  variant={location === link.href ? 'secondary' : 'ghost'}
                  data-testid={`nav-${link.label.toLowerCase().replace(/\s/g, '-')}`}
                >
                  {link.label}
                </Button>
              </Link>
            )
          )}
        </nav>

        <div className="flex items-center gap-2">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2" data-testid="user-menu-trigger">
                  <User className="h-4 w-4" />
                  <span className="hidden sm:inline">{user.fullName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem 
                  onSelect={() => {
                    const path = getDashboardPath();
                    console.log('[Nav] Dashboard clicked, navigating to:', path);
                    setLocation(path);
                  }}
                  className="cursor-pointer" 
                  data-testid="link-dashboard"
                >
                  Dashboard
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onSelect={signOut} 
                  className="text-destructive cursor-pointer" 
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" data-testid="button-login">
                  Login
                </Button>
              </Link>
              <Link href="/book">
                <Button data-testid="button-book-now">Book Now</Button>
              </Link>
            </>
          )}

          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild className="lg:hidden">
              <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <div className="flex flex-col gap-4 pt-8">
                {navLinks.map((link, idx) =>
                  link.children ? (
                    <div key={idx} className="flex flex-col gap-2">
                      <span className="text-sm font-medium text-muted-foreground">
                        {link.label}
                      </span>
                      {link.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={() => setIsOpen(false)}
                        >
                          <Button variant="ghost" className="w-full justify-start pl-4">
                            {child.label}
                          </Button>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setIsOpen(false)}
                    >
                      <Button
                        variant={location === link.href ? 'secondary' : 'ghost'}
                        className="w-full justify-start"
                      >
                        {link.label}
                      </Button>
                    </Link>
                  )
                )}
                <div className="border-t border-border pt-4 mt-4">
                  {user ? (
                    <>
                      <Button 
                        className="w-full mb-2"
                        onClick={() => {
                          setLocation(getDashboardPath());
                          setIsOpen(false);
                        }}
                      >
                        Dashboard
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          signOut();
                          setIsOpen(false);
                        }}
                      >
                        Sign Out
                      </Button>
                    </>
                  ) : (
                    <>
                      <Link href="/login" onClick={() => setIsOpen(false)}>
                        <Button variant="outline" className="w-full mb-2">
                          Login
                        </Button>
                      </Link>
                      <Link href="/book" onClick={() => setIsOpen(false)}>
                        <Button className="w-full">Book Now</Button>
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
