import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocation } from 'wouter';
import type { UserRole } from '@shared/schema';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  redirectTo?: string;
}

const dashboardRoutes: Record<UserRole, string> = {
  admin: '/admin',
  customer: '/customer',
  driver: '/driver',
  dispatcher: '/dispatcher',
  vendor: '/vendor',
  supervisor: '/supervisor',
};

export function ProtectedRoute({ 
  children, 
  allowedRoles, 
  redirectTo = '/login' 
}: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  console.log('[ProtectedRoute] State:', { loading, user: user ? { id: user.id, role: user.role } : null, allowedRoles });

  useEffect(() => {
    if (loading) return;
    
    if (!user) {
      const currentPath = window.location.pathname + window.location.search;
      const loginTarget = redirectTo === '/login'
        ? `/login?redirect=${encodeURIComponent(currentPath)}`
        : redirectTo;
      console.log('[ProtectedRoute] No user, redirecting to:', loginTarget);
      setLocation(loginTarget);
      return;
    }

    if (allowedRoles && !allowedRoles.includes(user.role)) {
      console.log('[ProtectedRoute] Role mismatch, user role:', user.role, 'allowed:', allowedRoles);
      setLocation(dashboardRoutes[user.role] || '/');
    }
  }, [user, loading, allowedRoles, redirectTo, setLocation]);

  if (loading) {
    console.log('[ProtectedRoute] Loading...');
    return (
      <div className="flex items-center justify-center h-screen" data-testid="loading-auth">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    console.log('[ProtectedRoute] No user, showing redirect spinner');
    return (
      <div className="flex items-center justify-center h-screen" data-testid="redirecting-auth">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    console.log('[ProtectedRoute] Role not allowed, showing redirect spinner. User role:', user.role);
    return (
      <div className="flex items-center justify-center h-screen" data-testid="redirecting-role">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  console.log('[ProtectedRoute] Rendering children');
  return <>{children}</>;
}

interface PublicOnlyRouteProps {
  children: React.ReactNode;
}

export function PublicOnlyRoute({ children }: PublicOnlyRouteProps) {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading) return;
    
    if (user) {
      setLocation(dashboardRoutes[user.role] || '/');
    }
  }, [user, loading, setLocation]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen" data-testid="loading-auth">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center justify-center h-screen" data-testid="redirecting-auth">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
