import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';
import { Mail, Phone, MapPin, Clock, Loader2, Send } from 'lucide-react';
import { SiWhatsapp } from 'react-icons/si';

const contactSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().optional(),
  subject: z.string().min(5, 'Subject is required'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
});

type ContactInput = z.infer<typeof contactSchema>;

const contactInfo: {
  icon: typeof Phone;
  title: string;
  details: { text: string; whatsapp?: string }[];
  subtext: string;
}[] = [
  {
    icon: Phone,
    title: 'Phone',
    details: [
      { text: '+44 7311 112 17', whatsapp: 'https://wa.me/4473111217' },
      { text: '+44 7862 771 999', whatsapp: 'https://wa.me/447862771999' },
    ],
    subtext: 'Available 24/7',
  },
  {
    icon: Mail,
    title: 'Email',
    details: [
      { text: 'info@runcourier.co.uk' },
    ],
    subtext: 'Response within 2 hours',
  },
  {
    icon: MapPin,
    title: 'Office',
    details: [
      { text: '112 Bridgwater Road' },
      { text: 'London, UK, HA4 6LW' },
    ],
    subtext: '24/7 Service Available',
  },
  {
    icon: Clock,
    title: 'Support Hours',
    details: [
      { text: '24/7 Customer Service' },
      { text: 'Online & Phone' },
    ],
    subtext: 'Always here to help',
  },
];

export default function Contact() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<ContactInput>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      subject: '',
      message: '',
    },
  });

  const onSubmit = async (data: ContactInput) => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast({
      title: 'Message Sent',
      description: 'Thank you for contacting us. We will get back to you shortly.',
    });
    form.reset();
    setIsLoading(false);
  };

  return (
    <PublicLayout>
      <section className="py-20 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Contact Us</h1>
            <p className="text-lg text-muted-foreground">
              Have a question or need assistance? We're here to help.
              Get in touch with our team.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Send us a Message</CardTitle>
                </CardHeader>
                <CardContent>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="name"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Your name" {...field} data-testid="input-name" />
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
                                <Input type="email" placeholder="you@example.com" {...field} data-testid="input-email" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid sm:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Phone (Optional)</FormLabel>
                              <FormControl>
                                <Input type="tel" placeholder="07XXX XXXXXX" {...field} data-testid="input-phone" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="subject"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Subject</FormLabel>
                              <FormControl>
                                <Input placeholder="How can we help?" {...field} data-testid="input-subject" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name="message"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Message</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Tell us more about your inquiry..."
                                className="min-h-[150px]"
                                {...field}
                                data-testid="input-message"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" disabled={isLoading} className="w-full sm:w-auto" data-testid="button-send">
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Send className="h-4 w-4 mr-2" />
                        )}
                        Send Message
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              {contactInfo.map((info, idx) => (
                <Card key={idx}>
                  <CardContent className="p-6">
                    <div className="flex gap-4">
                      <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                        <info.icon className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-1">{info.title}</h3>
                        {info.details.map((detail, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <span>{detail.text}</span>
                            {detail.whatsapp && (
                              <a 
                                href={detail.whatsapp}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-green-500 hover:text-green-600 transition-colors"
                                data-testid={`whatsapp-contact-${i}`}
                              >
                                <SiWhatsapp className="h-4 w-4" />
                              </a>
                            )}
                          </div>
                        ))}
                        <p className="text-xs text-muted-foreground mt-1">{info.subtext}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl font-bold mb-4">Frequently Asked Questions</h2>
            <p className="text-muted-foreground mb-8">
              Can't find what you're looking for? Contact our support team.
            </p>
            <div className="grid md:grid-cols-2 gap-6 text-left">
              <div>
                <h3 className="font-semibold mb-2">How do I track my delivery?</h3>
                <p className="text-sm text-muted-foreground">
                  Use your tracking number on our Track Parcel page or in your account dashboard.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">What areas do you cover?</h3>
                <p className="text-sm text-muted-foreground">
                  We offer same-day delivery in London and next-day UK-wide.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">How do I become a driver?</h3>
                <p className="text-sm text-muted-foreground">
                  Sign up through our Driver Portal and complete the verification process.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">What's your refund policy?</h3>
                <p className="text-sm text-muted-foreground">
                  Full refunds for cancelled orders before pickup. Contact support for issues.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
