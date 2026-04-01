import { useState } from 'react';
import { Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { Loader2, ArrowLeft, ArrowRight, Mail, CheckCircle, Lock, Eye, EyeOff } from 'lucide-react';
import logoImage from '@assets/run_courier_logo_opt.png';

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

const resetWithCodeSchema = z.object({
  code: z.string().min(1, 'Please enter the verification code').refine((val) => /^\d{6}$/.test(val), { message: 'Code must be exactly 6 digits' }),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
type ResetWithCodeInput = z.infer<typeof resetWithCodeSchema>;


export default function ForgotPassword() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const savedEmail = sessionStorage.getItem('resetEmail');
  const savedTimestamp = sessionStorage.getItem('resetEmailTimestamp');
  const isStillValid = savedTimestamp && (Date.now() - parseInt(savedTimestamp)) < 60 * 60 * 1000;
  const [emailSent, setEmailSent] = useState(!!savedEmail && !!isStillValid);
  const [sentEmail, setSentEmail] = useState(savedEmail && isStillValid ? savedEmail : '');

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const resetForm = useForm<ResetWithCodeInput>({
    resolver: zodResolver(resetWithCodeSchema),
    defaultValues: {
      code: '',
      password: '',
      confirmPassword: '',
    },
  });

  const sendResetCode = async (email: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast({
          title: 'Error',
          description: result.error || 'Failed to send reset code',
          variant: 'destructive',
        });
        return false;
      } else {
        toast({
          title: 'Code Sent',
          description: 'Check your email for the verification code.',
        });
        return true;
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: ForgotPasswordInput) => {
    const success = await sendResetCode(data.email);
    if (success) {
      setEmailSent(true);
      setSentEmail(data.email);
      sessionStorage.setItem('resetEmail', data.email);
      sessionStorage.setItem('resetEmailTimestamp', Date.now().toString());
    }
  };

  const onResendCode = async () => {
    if (sentEmail) {
      await sendResetCode(sentEmail);
    }
  };

  const onResetSubmit = async (data: ResetWithCodeInput) => {
    setIsResetting(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: sentEmail,
          code: data.code,
          newPassword: data.password,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast({
          title: 'Error',
          description: result.error || 'Failed to reset password',
          variant: 'destructive',
        });
      } else {
        setIsSuccess(true);
        sessionStorage.removeItem('resetEmail');
        sessionStorage.removeItem('resetEmailTimestamp');
        toast({
          title: 'Password Updated',
          description: 'Your password has been successfully reset.',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsResetting(false);
    }
  };

  if (isSuccess) {
    return (
      <PublicLayout>
        <div className="min-h-[calc(100vh-200px)] flex items-center justify-center py-12 px-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </div>
              <CardTitle className="text-2xl" data-testid="text-reset-complete">Password Reset Complete</CardTitle>
              <CardDescription>
                Your password has been successfully updated.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/login">
                <Button className="w-full" data-testid="button-go-to-login">
                  Go to Login
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </PublicLayout>
    );
  }

  if (emailSent) {
    return (
      <PublicLayout>
        <div className="min-h-[calc(100vh-200px)] flex items-center justify-center py-12 px-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center">
                  <Mail className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <CardTitle className="text-2xl" data-testid="text-code-sent">Enter Verification Code</CardTitle>
              <CardDescription data-testid="text-code-sent-email">
                We've sent a 6-digit code to:
                <br />
                <span className="font-medium text-foreground">{sentEmail}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...resetForm}>
                <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className="space-y-4">
                  <FormField
                    control={resetForm.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Verification Code</FormLabel>
                        <FormControl>
                          <Input
                            type="text"
                            maxLength={6}
                            placeholder="Enter 6-digit code"
                            autoComplete="one-time-code"
                            className="text-center text-2xl font-bold h-14"
                            data-testid="input-reset-code"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={resetForm.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type={showPassword ? 'text' : 'password'}
                              placeholder="Enter new password"
                              className="pl-10 pr-10"
                              {...field}
                              data-testid="input-new-password"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3"
                              onClick={() => setShowPassword(!showPassword)}
                              data-testid="button-toggle-password"
                            >
                              {showPassword ? (
                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={resetForm.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              type={showConfirmPassword ? 'text' : 'password'}
                              placeholder="Confirm new password"
                              className="pl-10 pr-10"
                              {...field}
                              data-testid="input-confirm-password"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              data-testid="button-toggle-confirm-password"
                            >
                              {showConfirmPassword ? (
                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="bg-muted p-3 rounded-lg text-xs text-muted-foreground">
                    <p className="font-medium mb-1">Password requirements:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>At least 8 characters</li>
                      <li>One uppercase letter</li>
                      <li>One lowercase letter</li>
                      <li>One number</li>
                    </ul>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isResetting}
                    data-testid="button-reset-password"
                  >
                    {isResetting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Resetting Password...
                      </>
                    ) : (
                      'Reset Password'
                    )}
                  </Button>

                  <div className="flex flex-col gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={onResendCode}
                      disabled={isLoading}
                      data-testid="button-resend-code"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        'Resend Code'
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={() => {
                        setEmailSent(false);
                        setSentEmail('');
                        form.reset();
                        resetForm.reset();
                        sessionStorage.removeItem('resetEmail');
                        sessionStorage.removeItem('resetEmailTimestamp');
                      }}
                      data-testid="button-try-different-email"
                    >
                      Try a different email
                    </Button>

                    <Link href="/login">
                      <Button variant="ghost" className="w-full" data-testid="button-back-to-login">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to Login
                      </Button>
                    </Link>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </PublicLayout>
    );
  }

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
                data-testid="forgot-password-logo"
              />
            </div>
            <CardTitle className="text-2xl">Forgot Password</CardTitle>
            <CardDescription>
              Enter your email address and we'll send you a code to reset your password.
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
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            type="email"
                            placeholder="you@example.com"
                            className="pl-10"
                            {...field}
                            data-testid="input-email"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={isLoading}
                  data-testid="button-send-reset-code"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Reset Code'
                  )}
                </Button>

                <Link href="/login">
                  <Button variant="ghost" className="w-full" data-testid="button-back-to-login">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to Login
                  </Button>
                </Link>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
