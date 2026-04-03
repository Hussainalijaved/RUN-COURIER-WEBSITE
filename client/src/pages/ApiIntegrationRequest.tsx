import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, ArrowLeft } from "lucide-react";
import { setPageMeta } from "@/lib/seo";
import { useEffect } from "react";

const INTEGRATION_TYPES = [
  { id: "quote", label: "Quote API" },
  { id: "booking", label: "Booking API" },
  { id: "tracking", label: "Tracking API" },
  { id: "custom", label: "Custom Integration" },
] as const;

const formSchema = z.object({
  companyName: z.string().min(2, "Company name required"),
  contactName: z.string().min(2, "Contact name required"),
  email: z.string().email("Valid email address required"),
  phone: z.string().optional(),
  website: z.string().optional(),
  businessType: z.string().optional(),
  platformUsed: z.string().optional(),
  monthlyVolume: z.string().optional(),
  integrationType: z.array(z.string()).min(1, "Select at least one integration type"),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function ApiIntegrationRequest() {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setPageMeta(
      "Request API Integration | Run Courier",
      "Apply for API access to automate your deliveries with Run Courier. Fill in your details and our team will be in touch.",
      "/api-integration-request"
    );
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: "",
      contactName: "",
      email: "",
      phone: "",
      website: "",
      businessType: "",
      platformUsed: "",
      monthlyVolume: "",
      integrationType: [],
      notes: "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      apiRequest("POST", "/api/integration-requests", {
        ...data,
        integrationType: data.integrationType.join(", "),
      }),
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err: any) => {
      toast({
        title: "Submission failed",
        description: err?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (submitted) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-32 px-4 text-center">
          <div className="mb-6 p-4 rounded-full bg-muted">
            <CheckCircle className="h-12 w-12 text-foreground" />
          </div>
          <h1 className="text-3xl font-bold mb-3">Request Received</h1>
          <p className="text-muted-foreground max-w-md mb-8">
            Thank you for your interest. Our team will review your request and be in touch within one business day.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/">
              <Button variant="outline" data-testid="button-back-home">Back to Home</Button>
            </Link>
            <Link href="/api-integration">
              <Button variant="ghost" data-testid="button-view-api-info">API Information</Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="mb-8">
          <Link href="/api-integration">
            <Button variant="ghost" size="sm" className="mb-4 -ml-2" data-testid="button-back-api-info">
              <ArrowLeft className="h-4 w-4 mr-1" /> API Integration
            </Button>
          </Link>
          <h1 className="text-3xl font-bold mb-2">Request API Access</h1>
          <p className="text-muted-foreground">
            Complete this form to apply for API integration. Access is provided to approved business clients only.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your Details</CardTitle>
            <CardDescription>All fields marked with * are required.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-5">

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FormField
                    control={form.control}
                    name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="Acme Ltd" {...field} data-testid="input-company-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="contactName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="Jane Smith" {...field} data-testid="input-contact-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Address *</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="jane@acme.co.uk" {...field} data-testid="input-email" />
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
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="+44 20 1234 5678" {...field} data-testid="input-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Website</FormLabel>
                        <FormControl>
                          <Input placeholder="https://acme.co.uk" {...field} data-testid="input-website" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="businessType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Type</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. E-commerce, Healthcare" {...field} data-testid="input-business-type" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FormField
                    control={form.control}
                    name="platformUsed"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Platform / System Used</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Shopify, SAP, Custom" {...field} data-testid="input-platform" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="monthlyVolume"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Est. Monthly Deliveries</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. 50–200 per month" {...field} data-testid="input-monthly-volume" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Integration Type Checkboxes */}
                <FormField
                  control={form.control}
                  name="integrationType"
                  render={() => (
                    <FormItem>
                      <FormLabel>Required Integration Type *</FormLabel>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        {INTEGRATION_TYPES.map((type) => (
                          <FormField
                            key={type.id}
                            control={form.control}
                            name="integrationType"
                            render={({ field }) => (
                              <FormItem className="flex items-center gap-3 rounded-md border p-3">
                                <FormControl>
                                  <Checkbox
                                    data-testid={`checkbox-integration-${type.id}`}
                                    checked={field.value?.includes(type.id)}
                                    onCheckedChange={(checked) => {
                                      const current = field.value || [];
                                      if (checked) {
                                        field.onChange([...current, type.id]);
                                      } else {
                                        field.onChange(current.filter((v) => v !== type.id));
                                      }
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal cursor-pointer mb-0">{type.label}</FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Additional Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe your use case, any specific requirements, or questions for our team..."
                          rows={4}
                          {...field}
                          data-testid="textarea-notes"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={mutation.isPending}
                  data-testid="button-submit-request"
                >
                  {mutation.isPending ? "Submitting..." : "Submit Request"}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  By submitting this form you agree to be contacted by the Run Courier team regarding your integration request.
                </p>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  );
}
