import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { SmoothBackground } from "@/components/ui/smooth-image";
import supportHeroImage from "@assets/generated_images/customer_support_representative_professional.png";
import { 
  MapPin, 
  CreditCard, 
  AlertTriangle, 
  Phone, 
  Mail, 
  Clock,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  Building2,
  HelpCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const supportFormSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  email: z.string().email("Please enter a valid email address"),
  phone: z.string().optional(),
  bookingNumber: z.string().optional(),
  issueType: z.string().min(1, "Please select an issue type"),
  message: z.string().min(10, "Please provide more details about your issue"),
});

type SupportFormData = z.infer<typeof supportFormSchema>;

const faqs = [
  {
    question: "How do I track my delivery?",
    answer: "Customers receive tracking updates once the booking is confirmed. You can track your delivery using the tracking number provided in your confirmation email, or by visiting our Track a Delivery page."
  },
  {
    question: "My payment was successful. What happens next?",
    answer: "Your booking is confirmed and a driver will be assigned shortly. You will receive a confirmation email with your tracking number and estimated delivery time."
  },
  {
    question: "Can I receive an invoice?",
    answer: "Yes, invoices are sent by email automatically after each delivery. You can also request invoices from our support team at any time."
  },
  {
    question: "What should I do if my delivery is delayed?",
    answer: "Contact our support team immediately with your booking number for assistance. We'll investigate and provide you with a status update as quickly as possible."
  },
  {
    question: "How can I cancel or modify my booking?",
    answer: "Please contact our support team as soon as possible with your booking number. Cancellation and modification policies may apply depending on the delivery status."
  },
  {
    question: "What areas do you cover?",
    answer: "We provide same-day delivery services across the United Kingdom, with specialised coverage in London and major cities."
  }
];

export default function Support() {
  const { toast } = useToast();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<SupportFormData>({
    resolver: zodResolver(supportFormSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      bookingNumber: "",
      issueType: "",
      message: "",
    },
  });

  const onSubmit = async (data: SupportFormData) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.fullName,
          email: data.email,
          phone: data.phone || "",
          subject: `Support Request: ${data.issueType}${data.bookingNumber ? ` - Ref: ${data.bookingNumber}` : ""}`,
          message: data.message,
        }),
      });

      if (response.ok) {
        setIsSubmitted(true);
        form.reset();
      } else {
        throw new Error('Failed to submit');
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to submit your request. Please try again or contact us directly.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PublicLayout>
      {/* Page Header */}
      <SmoothBackground 
        src={supportHeroImage}
        className="min-h-[400px] lg:min-h-[450px] flex items-center"
        overlayClassName="bg-gradient-to-r from-[#0077B6]/70 via-[#0096C7]/60 to-[#00B4D8]/50"
      >
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-3xl mx-auto text-center text-white">
            <HelpCircle className="w-16 h-16 mx-auto mb-6 opacity-90" />
            <h1 className="text-4xl md:text-5xl font-bold mb-4" data-testid="text-support-title">
              Support & Help Centre
            </h1>
            <p className="text-xl text-white/90 max-w-2xl mx-auto" data-testid="text-support-subtitle">
              We're here to help with bookings, payments, tracking, and delivery support.
            </p>
          </div>
        </div>
      </SmoothBackground>

      {/* Quick Support Actions */}
      <section className="py-12 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Link href="/track">
              <Card className="hover-elevate cursor-pointer h-full transition-all duration-200 border-2 hover:border-blue-500">
                <CardContent className="p-6 text-center">
                  <div className="w-14 h-14 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MapPin className="w-7 h-7 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2" data-testid="link-track-delivery">Track a Delivery</h3>
                  <p className="text-sm text-muted-foreground">Check the status of your delivery in real-time</p>
                </CardContent>
              </Card>
            </Link>

            <Card className="hover-elevate cursor-pointer h-full transition-all duration-200 border-2 hover:border-blue-500" onClick={() => document.getElementById('support-form')?.scrollIntoView({ behavior: 'smooth' })}>
              <CardContent className="p-6 text-center">
                <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CreditCard className="w-7 h-7 text-green-600" />
                </div>
                <h3 className="font-semibold text-lg mb-2" data-testid="link-payment-support">Payment & Invoice Support</h3>
                <p className="text-sm text-muted-foreground">Get help with payments, refunds, or invoices</p>
              </CardContent>
            </Card>

            <Card className="hover-elevate cursor-pointer h-full transition-all duration-200 border-2 hover:border-blue-500" onClick={() => document.getElementById('support-form')?.scrollIntoView({ behavior: 'smooth' })}>
              <CardContent className="p-6 text-center">
                <div className="w-14 h-14 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-7 h-7 text-orange-600" />
                </div>
                <h3 className="font-semibold text-lg mb-2" data-testid="link-delivery-issues">Delivery Issues</h3>
                <p className="text-sm text-muted-foreground">Report delays, damages, or missing items</p>
              </CardContent>
            </Card>

            <Card className="hover-elevate cursor-pointer h-full transition-all duration-200 border-2 hover:border-blue-500" onClick={() => document.getElementById('contact-section')?.scrollIntoView({ behavior: 'smooth' })}>
              <CardContent className="p-6 text-center">
                <div className="w-14 h-14 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Phone className="w-7 h-7 text-purple-600" />
                </div>
                <h3 className="font-semibold text-lg mb-2" data-testid="link-contact-support">Contact Support</h3>
                <p className="text-sm text-muted-foreground">Speak directly with our support team</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Support Contact Information */}
      <section id="contact-section" className="py-12">
        <div className="container mx-auto px-4">
          <Card className="max-w-3xl mx-auto bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/50 dark:to-blue-900/30 border-blue-200 dark:border-blue-800">
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold text-center mb-6" data-testid="text-contact-title">
                Run Courier Support
              </h2>
              
              <div className="grid md:grid-cols-3 gap-6 mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <a href="mailto:support@runcourier.co.uk" className="font-medium text-blue-600 hover:underline" data-testid="link-support-email">
                      support@runcourier.co.uk
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <Phone className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <a href="tel:+447311121217" className="font-medium text-blue-600 hover:underline" data-testid="link-support-phone">
                      +44 7311 121217
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Support Hours</p>
                    <p className="font-medium" data-testid="text-support-hours">Mon – Sun, 7AM – 10PM</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-background/50 rounded-lg p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  <strong>Urgent matters?</strong> For time-sensitive delivery issues, please call us directly for immediate assistance.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Support Request Form */}
      <section id="support-form" className="py-12 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-2" data-testid="text-form-title">
              Submit a Support Request
            </h2>
            <p className="text-muted-foreground text-center mb-8">
              Fill out the form below and our team will get back to you promptly.
            </p>

            {isSubmitted ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2" data-testid="text-form-success">Request Submitted</h3>
                  <p className="text-muted-foreground mb-6">
                    Thank you for contacting us. Our support team will respond as soon as possible.
                  </p>
                  <Button onClick={() => setIsSubmitted(false)} data-testid="button-new-request">
                    Submit Another Request
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6 md:p-8">
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                      <div className="grid md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="fullName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Full Name *</FormLabel>
                              <FormControl>
                                <Input placeholder="Your full name" {...field} data-testid="input-full-name" />
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
                              <FormLabel>Email Address *</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder="your@email.com" {...field} data-testid="input-email" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Phone Number (Optional)</FormLabel>
                              <FormControl>
                                <Input type="tel" placeholder="+44 7XXX XXXXXX" {...field} data-testid="input-phone" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="bookingNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Booking / Tracking Number</FormLabel>
                              <FormControl>
                                <Input placeholder="e.g., RC12345678" {...field} data-testid="input-booking-number" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={form.control}
                        name="issueType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Issue Type *</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-issue-type">
                                  <SelectValue placeholder="Select the type of issue" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="payment">Payment issue</SelectItem>
                                <SelectItem value="delay">Delivery delay</SelectItem>
                                <SelectItem value="tracking">Tracking issue</SelectItem>
                                <SelectItem value="invoice">Invoice request</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="message"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Message / Description *</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Please describe your issue in detail..." 
                                className="min-h-[120px] resize-none"
                                {...field} 
                                data-testid="textarea-message"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button 
                        type="submit" 
                        className="w-full" 
                        size="lg"
                        disabled={isLoading}
                        data-testid="button-submit-support"
                      >
                        {isLoading ? "Submitting..." : "Submit Support Request"}
                      </Button>

                      <p className="text-sm text-muted-foreground text-center">
                        Our support team will respond as soon as possible.
                      </p>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-2" data-testid="text-faq-title">
              Frequently Asked Questions
            </h2>
            <p className="text-muted-foreground text-center mb-8">
              Quick answers to common questions
            </p>

            <div className="space-y-3">
              {faqs.map((faq, index) => (
                <Card 
                  key={index} 
                  className="overflow-hidden cursor-pointer hover-elevate"
                  onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                >
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between p-4">
                      <h3 className="font-medium pr-4" data-testid={`text-faq-question-${index}`}>
                        {faq.question}
                      </h3>
                      {expandedFaq === index ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                      )}
                    </div>
                    {expandedFaq === index && (
                      <div className="px-4 pb-4 pt-0">
                        <p className="text-muted-foreground" data-testid={`text-faq-answer-${index}`}>
                          {faq.answer}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Business & Account Support */}
      <section className="py-12 bg-muted/30">
        <div className="container mx-auto px-4">
          <Card className="max-w-2xl mx-auto">
            <CardContent className="p-8 text-center">
              <Building2 className="w-12 h-12 text-blue-600 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-3" data-testid="text-business-support-title">
                Business Support
              </h2>
              <p className="text-muted-foreground mb-4">
                For account setup, weekly invoicing, or contract deliveries, please contact our dedicated business support team.
              </p>
              <a 
                href="mailto:support@runcourier.co.uk" 
                className="inline-flex items-center gap-2 text-blue-600 hover:underline font-medium"
                data-testid="link-business-email"
              >
                <Mail className="w-4 h-4" />
                support@runcourier.co.uk
              </a>
            </CardContent>
          </Card>
        </div>
      </section>
    </PublicLayout>
  );
}
