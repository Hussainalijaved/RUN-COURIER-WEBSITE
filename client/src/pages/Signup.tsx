import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/context/AuthContext';
import { registerSchema, type RegisterInput } from '@shared/schema';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Loader2, User, Building2 } from 'lucide-react';
import logoImage from '@assets/LOGO APP 1_1764513632490.jpg';
import type { UserRole } from '@shared/schema';
import { PostcodeAutocomplete } from '@/components/PostcodeAutocomplete';

type SignupRole = 'driver' | 'customer' | 'vendor';

interface SignupProps {
  role?: SignupRole;
}

export default function Signup({ role = 'customer' }: SignupProps) {
  const [, setLocation] = useLocation();
  const { signUp } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

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
      businessAddress: '',
    },
  });

  const userType = form.watch('userType');

  const onSubmit = async (data: RegisterInput) => {
    setIsLoading(true);
    try {
      const { error } = await signUp(data.email, data.password, {
        fullName: data.fullName,
        full_name: data.fullName,
        phone: data.phone,
        postcode: data.postcode,
        address: data.address,
        buildingName: data.buildingName,
        role: data.role,
        userType: data.userType,
        companyName: data.companyName,
        businessAddress: data.businessAddress,
      });

      if (error) {
        toast({
          title: 'Registration Failed',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Account Created',
          description: 'Please check your email to verify your account.',
        });
        const redirectPath = role === 'driver' ? '/driver'
          : role === 'vendor' ? '/vendor'
          : '/customer';
        setLocation(redirectPath);
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
                className="h-16 w-auto object-contain"
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
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
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
                      <FormLabel>UK Phone Number</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          placeholder="07XXX XXXXXX"
                          {...field}
                          data-testid="input-phone"
                        />
                      </FormControl>
                      <FormDescription>
                        Enter your UK mobile or landline number
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
                      name="businessAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Business Address (if different)</FormLabel>
                          <FormControl>
                            <PostcodeAutocomplete
                              value={field.value || ''}
                              onChange={(value, fullAddress) => field.onChange(fullAddress || value)}
                              placeholder="Business address if different from above"
                              data-testid="input-business-address"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                  data-testid="button-submit-signup"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Create Account
                </Button>
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
