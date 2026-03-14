import { useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, LogIn, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import logoImage from '@assets/run_courier_logo.jpeg';

export default function SupervisorLogin() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      const role = data.user?.user_metadata?.role;
      if (role !== 'supervisor') {
        await supabase.auth.signOut();
        setError('This login is for supervisors only. Please use the correct portal.');
        setLoading(false);
        return;
      }

      const session = data.session;
      const verifyRes = await fetch('/api/supervisor/verify', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        await supabase.auth.signOut();
        setError(verifyData.error || 'Your account is not yet approved. Please contact your admin.');
        setLoading(false);
        return;
      }

      setLocation('/supervisor');
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src={logoImage} alt="Run Courier" className="h-14 w-auto object-contain rounded-md" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Supervisor Portal</h1>
            <p className="text-sm text-muted-foreground mt-1">Run Courier — Operations Team</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Sign In</CardTitle>
            <CardDescription>Enter your supervisor credentials to access the portal.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  data-testid="input-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  data-testid="input-password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading} data-testid="button-sign-in">
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Signing in...</>
                ) : (
                  <><LogIn className="h-4 w-4 mr-2" />Sign In</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Not a supervisor?{' '}
          <a href="/login" className="underline hover:text-foreground transition-colors">
            Go to main login
          </a>
        </p>
      </div>
    </div>
  );
}
