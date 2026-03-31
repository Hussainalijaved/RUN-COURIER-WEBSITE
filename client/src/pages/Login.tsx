import { useState, useEffect } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/context/AuthContext';
import { loginSchema, type LoginInput } from '@shared/schema';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight } from 'lucide-react';
import logoImage from '@assets/run_courier_logo.png';
import type { UserRole } from '@shared/schema';
import { supabase } from '@/lib/supabase';

interface LoginProps {
  role?: UserRole;
}

const dashboardRoutes: Record<UserRole, string> = {
  admin: '/admin',
  customer: '/customer',
  driver: '/driver',
  dispatcher: '/dispatcher',
  vendor: '/vendor',
  supervisor: '/supervisor',
};

export default function Login({ role = 'customer' }: LoginProps) {
  const [, setLocation] = useLocation();
  const searchParams = useSearch();
  const { signIn, user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  
  const params = new URLSearchParams(searchParams);
  const redirectUrl = params.get('redirect');

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    if (loginSuccess && user) {
      const targetPath = redirectUrl 
        ? decodeURIComponent(redirectUrl) 
        : dashboardRoutes[user.role] || '/customer';
      setLocation(targetPath);
    }
  }, [loginSuccess, user, redirectUrl, setLocation]);

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);
    try {
      const { error } = await signIn(data.email, data.password);
      if (error) {
        toast({
          title: 'Login Failed',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        if (role === 'driver') {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.access_token) {
              const resp = await fetch('/api/driver/must-change-password', {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
              });
              const pwData = await resp.json();
              if (pwData.mustChangePassword) {
                toast({
                  title: 'Password Change Required',
                  description: 'Please change your temporary password before continuing.',
                });
                setLocation('/driver/change-password');
                return;
              }
            }
          } catch (e) {
            console.error('Error checking password change requirement:', e);
          }
        }
        toast({
          title: 'Welcome back!',
          description: 'You have been logged in successfully.',
        });
        setLoginSuccess(true);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const roleTitle = role === 'admin' ? 'Admin' 
    : role === 'driver' ? 'Driver'
    : role === 'dispatcher' ? 'Dispatcher'
    : role === 'vendor' ? 'Vendor'
    : 'Customer';

  const signupPath = role === 'driver' ? '/driver/signup' 
    : role === 'vendor' ? '/vendor/signup'
    : '/signup';

  return (
    <PublicLayout>
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img 
                src={logoImage} 
                alt="Run Courier" 
                className="h-16 w-16 object-cover rounded-xl overflow-hidden"
                data-testid="login-logo-image"
              />
            </div>
            <CardTitle className="text-2xl">{roleTitle} Login</CardTitle>
            <CardDescription>
              Sign in to your Run Courier {roleTitle.toLowerCase()} account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="you@example.com"
                          {...field}
                          data-testid="input-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter your password"
                          {...field}
                          data-testid="input-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                  data-testid="button-submit-login"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Sign In
                </Button>
              </form>
            </Form>

            {(role === 'customer' || role === 'driver' || role === 'vendor') && (
              <div className="mt-6 text-center text-sm">
                <span className="text-muted-foreground">Don't have an account? </span>
                <Link href={signupPath} className="text-primary hover:underline font-medium">
                  Sign up
                </Link>
              </div>
            )}

            <div className="mt-4 text-center">
              <Link
                href="/forgot-password"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Forgot your password?
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}

export function AdminLogin() {
  return <Login role="admin" />;
}

export function DriverLogin() {
  return <Login role="driver" />;
}

export function DispatcherLogin() {
  return <Login role="dispatcher" />;
}

export function VendorLogin() {
  return <Login role="vendor" />;
}
