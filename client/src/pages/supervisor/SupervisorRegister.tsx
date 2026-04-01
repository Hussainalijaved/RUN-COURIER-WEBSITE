import { useState, useEffect } from 'react';
import { useLocation, useSearch } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import logoImage from '@assets/run_courier_logo_opt.png';

const UK_CITIES = [
  'London', 'Birmingham', 'Manchester', 'Leeds', 'Glasgow', 'Sheffield', 'Bradford',
  'Liverpool', 'Edinburgh', 'Bristol', 'Leicester', 'Cardiff', 'Coventry', 'Nottingham',
  'Newcastle upon Tyne', 'Sunderland', 'Brighton', 'Hull', 'Plymouth', 'Stoke-on-Trent',
  'Wolverhampton', 'Derby', 'Swansea', 'Southampton', 'Salford', 'Aberdeen', 'Westminster',
  'Portsmouth', 'York', 'Peterborough', 'Dundee', 'Lancaster', 'Oxford', 'Newport',
  'Preston', 'St Albans', 'Norwich', 'Chester', 'Cambridge', 'Exeter', 'Other',
];

export default function SupervisorRegister() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get('token') || '';

  const [validating, setValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [prefillEmail, setPrefillEmail] = useState('');
  const [prefillName, setPrefillName] = useState('');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenError('No invitation token found. Please use the link from your invitation email.');
      setValidating(false);
      return;
    }
    fetch(`/api/supervisors/invite/validate/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid) {
          setTokenValid(true);
          setPrefillEmail(data.email || '');
          setPrefillName(data.fullName || '');
          setFullName(data.fullName || '');
        } else {
          setTokenError(data.error || 'Invalid invitation link.');
        }
      })
      .catch(() => setTokenError('Failed to validate invitation. Please try again.'))
      .finally(() => setValidating(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!city) {
      setError('Please select your office city.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/supervisors/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, fullName, phone, city }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Registration failed. Please try again.');
      } else {
        setSuccess(true);
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src={logoImage} alt="Run Courier" className="h-14 w-14 object-cover rounded-xl overflow-hidden" />
          <div className="text-center">
            <h1 className="text-2xl font-bold text-foreground">Create Your Account</h1>
            <p className="text-sm text-muted-foreground mt-1">Supervisor Portal — Run Courier</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Set Up Your Account</CardTitle>
            {prefillEmail && (
              <CardDescription>
                Setting up account for <strong>{prefillEmail}</strong>
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {!tokenValid && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{tokenError}</AlertDescription>
              </Alert>
            )}
            {success && (
              <div className="space-y-4">
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-700">
                    Your account has been created successfully. Your account is pending admin approval. You will be notified once approved.
                  </AlertDescription>
                </Alert>
                <Button className="w-full" onClick={() => setLocation('/supervisor/login')} data-testid="button-go-to-login">
                  Go to Login
                </Button>
              </div>
            )}
            {tokenValid && !success && (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    placeholder="Your full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    disabled={loading}
                    data-testid="input-full-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number (optional)</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+44 7700 000000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={loading}
                    data-testid="input-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">Office City</Label>
                  <Select value={city} onValueChange={setCity} disabled={loading}>
                    <SelectTrigger id="city" data-testid="select-city">
                      <SelectValue placeholder="Select your office city" />
                    </SelectTrigger>
                    <SelectContent>
                      {UK_CITIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={prefillEmail} disabled className="bg-muted" data-testid="input-email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    data-testid="input-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Repeat your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                    data-testid="input-confirm-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading} data-testid="button-create-account">
                  {loading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating Account...</> : 'Create Account'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
