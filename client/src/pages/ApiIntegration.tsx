import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { setPageMeta } from "@/lib/seo";
import { useEffect } from "react";
import {
  Zap,
  Package,
  MapPin,
  Building2,
  Code2,
  ShieldCheck,
  ArrowRight,
  CheckCircle,
  Clock,
  BarChart3,
} from "lucide-react";

export default function ApiIntegration() {
  useEffect(() => {
    setPageMeta(
      "API Integration for Business | Run Courier",
      "Connect your business system to Run Courier. Automate quotes, bookings, and live tracking via our secure business API. UK same-day courier integration.",
      "/api-integration"
    );
  }, []);

  const features = [
    {
      icon: Zap,
      title: "Automated Quotes",
      description:
        "Retrieve instant delivery quotes directly from your platform or e-commerce checkout. Uses the same live pricing engine as the Run Courier website.",
    },
    {
      icon: Package,
      title: "Automated Booking",
      description:
        "Create delivery jobs programmatically without manual intervention. Perfect for high-volume e-commerce, fulfilment, and logistics operations.",
    },
    {
      icon: MapPin,
      title: "Live Tracking",
      description:
        "Query real-time job status, driver assignment, and proof of delivery via your own systems or customer-facing interfaces.",
    },
    {
      icon: Building2,
      title: "Business Account Setup",
      description:
        "Link your API integration to your existing Run Courier business account for consolidated invoicing, payment terms, and account management.",
    },
    {
      icon: Code2,
      title: "Custom Integrations",
      description:
        "Need something tailored? Our team works directly with your developers to support bespoke workflows, webhooks, and custom data formats.",
    },
    {
      icon: ShieldCheck,
      title: "Secure API Access",
      description:
        "Every API client receives a unique secret key with scoped permissions. Keys are hashed server-side and never stored in plain text.",
    },
  ];

  const useCases = [
    { label: "E-commerce platforms (Shopify, WooCommerce, Magento)" },
    { label: "ERP and warehouse management systems" },
    { label: "Dispatch and fleet management software" },
    { label: "Healthcare and medical logistics platforms" },
    { label: "Legal and document courier workflows" },
    { label: "Retail and restaurant order fulfilment" },
  ];

  const steps = [
    {
      step: "1",
      title: "Submit a Request",
      description: "Fill out the integration request form with your company details and integration requirements.",
    },
    {
      step: "2",
      title: "Review & Approval",
      description: "Our team reviews your application and sets up your API client with appropriate permissions.",
    },
    {
      step: "3",
      title: "Receive Your API Key",
      description: "You receive a secure API key and documentation link. Your key works immediately on approval.",
    },
    {
      step: "4",
      title: "Build & Go Live",
      description: "Use our documentation and sample code to integrate. Our team is available for technical support.",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden bg-foreground text-background py-20 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <Badge className="mb-4 bg-background/10 text-background border-background/20">
            Business API
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-bold mb-6 leading-tight">
            Automate Your Deliveries with the Run Courier API
          </h1>
          <p className="text-lg sm:text-xl text-background/80 max-w-2xl mx-auto mb-8">
            Connect your business systems directly to Run Courier. Automate quoting, booking, and live tracking — without lifting the phone.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link href="/api-integration-request">
              <Button size="lg" variant="outline" data-testid="button-request-api-hero">
                Request API Access <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/developers">
              <Button size="lg" variant="ghost" className="text-background hover:text-background" data-testid="button-view-docs-hero">
                View Documentation
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">What the API Supports</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              A complete integration layer built on the same backend that powers the Run Courier platform.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <Card key={f.title} className="hover-elevate">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-muted">
                      <f.icon className="h-5 w-5 text-foreground" />
                    </div>
                    <CardTitle className="text-base">{f.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-16 px-4 bg-muted/40">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold mb-3">Who Uses the API?</h2>
            <p className="text-muted-foreground">
              Any business that ships regularly can benefit from automation.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {useCases.map((u) => (
              <div key={u.label} className="flex items-start gap-3">
                <CheckCircle className="h-4 w-4 text-foreground mt-0.5 shrink-0" />
                <span className="text-sm text-muted-foreground">{u.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold mb-3">How to Get Started</h2>
            <p className="text-muted-foreground">
              Access is provided to approved business clients. The process is straightforward.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {steps.map((s) => (
              <Card key={s.step}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <span className="flex-shrink-0 h-8 w-8 rounded-full bg-foreground text-background flex items-center justify-center text-sm font-bold">
                      {s.step}
                    </span>
                    <div>
                      <p className="font-semibold mb-1">{s.title}</p>
                      <p className="text-sm text-muted-foreground">{s.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Endpoint Preview */}
      <section className="py-16 px-4 bg-muted/40">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold mb-3">Available Endpoints</h2>
            <p className="text-muted-foreground">A REST JSON API with simple bearer token authentication.</p>
          </div>
          <div className="space-y-3">
            {[
              { method: "POST", path: "/api/v1/quote", desc: "Calculate a delivery quote" },
              { method: "POST", path: "/api/v1/book-job", desc: "Create a new booking" },
              { method: "GET", path: "/api/v1/track/:reference", desc: "Get real-time job status" },
              { method: "GET", path: "/api/v1/pricing", desc: "Retrieve vehicle pricing structure" },
              { method: "GET", path: "/api/v1/health", desc: "Connection health check" },
            ].map((e) => (
              <div key={e.path} className="flex flex-wrap items-center gap-3 p-4 rounded-md border bg-background">
                <Badge variant={e.method === "POST" ? "default" : "secondary"} className="font-mono text-xs shrink-0">
                  {e.method}
                </Badge>
                <span className="font-mono text-sm">{e.path}</span>
                <span className="text-sm text-muted-foreground ml-auto">{e.desc}</span>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link href="/developers">
              <Button variant="outline" data-testid="button-view-full-docs">
                View Full Documentation <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            {[
              { icon: Clock, value: "Same Day", label: "Delivery Available" },
              { icon: ShieldCheck, value: "HTTPS Only", label: "Encrypted Requests" },
              { icon: BarChart3, value: "60 req/min", label: "Rate Limit Per Client" },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-2">
                <s.icon className="h-6 w-6 text-muted-foreground" />
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-foreground text-background">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to Integrate?</h2>
          <p className="text-background/80 mb-8">
            Submit your request and our team will be in touch within one business day.
          </p>
          <Link href="/api-integration-request">
            <Button size="lg" variant="outline" data-testid="button-request-api-cta">
              Request API Integration <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
