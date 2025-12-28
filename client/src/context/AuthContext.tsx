import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, type AuthUser } from '@/lib/supabase';
import type { UserRole } from '@shared/schema';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, metadata: Record<string, any>) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function extractUserFromSession(session: any): AuthUser | null {
  if (!session?.user) return null;
  
  const metadata = session.user.user_metadata;
  
  // Normalize role - 'business' and 'individual' are userTypes, not roles
  // If they're stored as role by mistake, map them to 'customer'
  let role = metadata?.role || 'customer';
  if (role === 'business' || role === 'individual') {
    role = 'customer';
  }
  
  return {
    id: session.user.id,
    email: session.user.email || '',
    fullName: metadata?.fullName || metadata?.full_name || 'User',
    role: role as UserRole,
    userType: metadata?.userType || 'individual',
    companyName: metadata?.companyName,
    phone: metadata?.phone,
    isActive: true,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted && session?.user) {
          setUser(extractUserFromSession(session));
        }
      } catch (error) {
        console.error('Auth init error:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
        } else if (session?.user) {
          setUser(extractUserFromSession(session));
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error ? new Error(error.message) : null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUp = async (email: string, password: string, metadata: Record<string, any>) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: metadata },
      });
      return { error: error ? new Error(error.message) : null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const hasRole = (roles: UserRole | UserRole[]) => {
    if (!user) return false;
    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
