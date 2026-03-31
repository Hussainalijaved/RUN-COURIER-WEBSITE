import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/context/AuthContext';
import { registerSchema, type RegisterInput } from '@shared/schema';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User, Building2, CheckCircle2, Phone } from 'lucide-react';
import logoImage from '@assets/run_courier_logo.png';
import type { UserRole } from '@shared/schema';
import { PostcodeAutocomplete } from '@/components/PostcodeAutocomplete';
import { apiRequest } from '@/lib/queryClient';

type SignupRole = 'driver' | 'customer' | 'vendor';

interface SignupProps {
  role?: SignupRole;
}

export default function Signup({ role = 'customer' }: SignupProps) {
  const [, setLocation] = useLocation();
  const { signUp } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      fullName: '',
      phone: '',
      postcode: '',
      address: '',
      buildingName: '',
      role: role,
      userType: 'individual',
      companyName: '',
      registrationNumber: '',
      businessAddress: '',
    },
  });

  const userType = form.watch('userType');
  const phoneValue = form.watch('phone');

  const handleSendVerificationCode = async () => {
    const phone = form.getValues('phone');
    if (!phone || phone.length < 10) {
      toast({
        title: 'Invalid Phone Number',
        description: 'Please enter a valid UK phone number first.',
        variant: 'destructive',
      });
      return;
    }

    setSendingCode(true);
    try {
      const response = await apiRequest('POST', '/api/auth/send-verification-code', { phone });
      const data = await response.json();
      
      if (response.ok) {
        setVerificationSent(true);
        toast({
          title: 'Code Sent',
          description: 'A verification code has been sent to your phone.',
        });
      } else {
        toast({
          title: 'Failed to Send Code',
          description: data.error || 'Could not send verification code. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to send verification code. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      toast({
        title: 'Invalid Code',
        description: 'Please enter the 6-digit verification code.',
        variant: 'destructive',
      });
      return;
    }

    setVerifyingCode(true);
    try {
      const phone = form.getValues('phone');
      const response = await apiRequest('POST', '/api/auth/verify-phone', { phone, code: verificationCode });
      const data = await response.json();
      
      if (response.ok && data.verificationToken) {
        setPhoneVerified(true);
        setVerificationToken(data.verificationToken);
        toast({
          title: 'Phone Verified',
          description: 'Your phone number has been verified successfully.',
        });
      } else {
        toast({
          title: 'Verification Failed',
          description: data.error || 'Invalid verification code. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to verify code. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setVerifyingCode(false);
    }
  };

  const onSubmit = async (data: RegisterInput) => {
    // Validate verification token before proceeding
    if (!verificationToken) {
      toast({
        title: 'Phone Not Verified',
        description: 'Please verify your phone number before creating an account.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      // Use server-side registration endpoint with phone verification enforcement
      const response = await apiRequest('POST', '/api/auth/register', {
        email: data.email,
        password: data.password,
        fullName: data.fullName,
        phone: data.phone,
        phoneVerificationToken: verificationToken,
        postcode: data.postcode,
        address: data.address,
        buildingName: data.buildingName,
        role: data.role,
        userType: data.userType,
        companyName: data.companyName,
        registrationNumber: data.registrationNumber,
        businessAddress: data.businessAddress,
      });

      const result = await response.json();

      if (!response.ok) {
        // Check if it's a phone verification error
        if (result.error?.includes('phone verification') || result.error?.includes('verification token')) {
          setPhoneVerified(false);
          setVerificationToken(null);
          setVerificationSent(false);
        }
        toast({
          title: 'Registration Failed',
          description: result.error || 'Failed to create account. Please try again.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Account Created',
          description: result.message || 'Please check your email to verify your account before logging in.',
        });
        // Redirect to login page since user needs to verify email first
        const loginRedirect = role === 'driver' ? '/driver/login'
          : role === 'vendor' ? '/vendor/login'
          : '/login';
        setLocation(loginRedirect);
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

  const roleTitle = role === 'driver' ? 'Driver' 
    : role === 'vendor' ? 'Business/Vendor'
    : 'Customer';

  const loginPath = role === 'driver' ? '/driver/login'
    : role === 'vendor' ? '/vendor/login'
    : '/login';

  return (
    <PublicLayout>
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center py-12 px-4">
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img 
                src={logoImage} 
                alt="Run Courier" 
                className="h-16 w-16 object-cover rounded-xl overflow-hidden"
                data-testid="signup-logo-image"
              />
            </div>
            <CardTitle className="text-2xl">{roleTitle} Sign Up</CardTitle>
            <CardDescription>
              Create your Run Courier {roleTitle.toLowerCase()} account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {role === 'customer' && (
                  <FormField
                    control={form.control}
                    name="userType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Type</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            className="grid grid-cols-2 gap-4"
                          >
                            <div>
                              <RadioGroupItem
                                value="individual"
                                id="individual"
                                className="peer sr-only"
                              />
                              <label
                                htmlFor="individual"
                                className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                              >
                                <User className="mb-2 h-6 w-6" />
                                <span className="font-medium">Individual</span>
                              </label>
                            </div>
                            <div>
                              <RadioGroupItem
                                value="business"
                                id="business"
                                className="peer sr-only"
                              />
                              <label
                                htmlFor="business"
                                className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                              >
                                <Building2 className="mb-2 h-6 w-6" />
                                <span className="font-medium">Business</span>
                              </label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {(userType === 'business' || role === 'vendor') && (
                  <>
                    <div className="border-b pb-4 mb-4">
                      <h3 className="font-medium text-sm text-muted-foreground mb-3">Company Details</h3>
                      <div className="space-y-4">
                        <FormField
                          control={form.control}
                          name="companyName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Company Name</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="Your Company Ltd"
                                  {...field}
                                  data-testid="input-company"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="registrationNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Company Registration Number</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="e.g. 12345678"
                                  {...field}
                                  data-testid="input-registration-number"
                                />
                              </FormControl>
                              <FormDescription>
                                Your Companies House registration number
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="businessAddress"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Business Address (if different)</FormLabel>
                              <FormControl>
                                <PostcodeAutocomplete
                                  value={field.value || ''}
                                  onChange={(value, fullAddress) => field.onChange(fullAddress || value)}
                                  placeholder="Business address if different from contact"
                                  data-testid="input-business-address"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    <h3 className="font-medium text-sm text-muted-foreground">Contact Person</h3>
                  </>
                )}

                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{userType === 'business' || role === 'vendor' ? 'Contact Person Name' : 'Full Name'}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="John Smith"
                          {...field}
                          data-testid="input-fullname"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        UK Phone Number
                        {phoneVerified && (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-normal">
                            <CheckCircle2 className="h-3 w-3" /> Verified
                          </span>
                        )}
                      </FormLabel>
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <FormControl>
                            <PhoneInput
                              value={field.value}
                              onChange={(val) => {
                                field.onChange(val);
                                if (phoneVerified) {
                                  setPhoneVerified(false);
                                  setVerificationSent(false);
                                  setVerificationCode('');
                                  setVerificationToken(null);
                                }
                              }}
                              onBlur={field.onBlur}
                              name={field.name}
                              data-testid="input-phone"
                            />
                          </FormControl>
                          {!phoneVerified && (
                            <Button
                              type="button"
                              variant="outline"
                              size="default"
                              onClick={handleSendVerificationCode}
                              disabled={sendingCode || !field.value || field.value.length < 10}
                              data-testid="button-send-code"
                            >
                              {sendingCode ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Phone className="h-4 w-4" />
                              )}
                              <span className="ml-2 hidden sm:inline">
                                {verificationSent ? 'Resend' : 'Verify'}
                              </span>
                            </Button>
                          )}
                        </div>
                        
                        {verificationSent && !phoneVerified && (
                          <div className="flex gap-2">
                            <Input
                              type="text"
                              placeholder="Enter 6-digit code"
                              value={verificationCode}
                              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                              maxLength={6}
                              className="flex-1"
                              data-testid="input-verification-code"
                            />
                            <Button
                              type="button"
                              onClick={handleVerifyCode}
                              disabled={verifyingCode || verificationCode.length !== 6}
                              data-testid="button-verify-code"
                            >
                              {verifyingCode ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : null}
                              Verify
                            </Button>
                          </div>
                        )}
                      </div>
                      <FormDescription>
                        {verificationSent && !phoneVerified 
                          ? 'Enter the 6-digit code sent to your phone'
                          : 'Enter your UK mobile number and verify it'
                        }
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="postcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Postcode</FormLabel>
                      <FormControl>
                        <PostcodeAutocomplete
                          value={field.value}
                          onChange={(value, fullAddress) => {
                            field.onChange(value);
                            if (fullAddress) {
                              form.setValue('address', fullAddress);
                            }
                          }}
                          placeholder="Enter your postcode"
                          data-testid="input-postcode"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Your full address"
                          {...field}
                          data-testid="input-address"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="buildingName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Building Name / Flat Number (Optional)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Flat 2, Rose Building"
                          {...field}
                          data-testid="input-building"
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
                          placeholder="Create a secure password"
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
                  disabled={isLoading || !phoneVerified}
                  data-testid="button-submit-signup"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Create Account
                </Button>
                
                {!phoneVerified && (
                  <p className="text-sm text-muted-foreground text-center">
                    Please verify your phone number to continue
                  </p>
                )}
              </form>
            </Form>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <Link href={loginPath} className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </div>

            <p className="mt-4 text-xs text-center text-muted-foreground">
              By creating an account, you agree to our{' '}
              <Link href="/terms" className="underline">Terms of Service</Link>
              {' '}and{' '}
              <Link href="/privacy" className="underline">Privacy Policy</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}

export function DriverSignup() {
  window.location.href = '/driver/apply';
  return null;
}

export function VendorSignup() {
  return <Signup role="vendor" />;
}
