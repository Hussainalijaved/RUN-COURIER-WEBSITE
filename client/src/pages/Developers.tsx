import { useState } from "react";
import { Link } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check, ArrowRight } from "lucide-react";
import { setPageMeta } from "@/lib/seo";
import { useEffect } from "react";

function CodeBlock({ code, language = "json" }: { code: string; language?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied to clipboard" });
    });
  }

  return (
    <div className="relative group rounded-md border bg-muted overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/80 text-xs text-muted-foreground">
        <span className="font-mono">{language}</span>
        <Button
          size="icon"
          variant="ghost"
          onClick={handleCopy}
          className="h-6 w-6"
          data-testid="button-copy-code"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
      <pre className="p-4 text-xs overflow-x-auto font-mono leading-relaxed whitespace-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, "default" | "secondary"> = {
    POST: "default",
    GET: "secondary",
    PATCH: "secondary",
    DELETE: "secondary",
  };
  return (
    <Badge variant={colors[method] || "secondary"} className="font-mono text-xs">
      {method}
    </Badge>
  );
}

export default function Developers() {
  useEffect(() => {
    setPageMeta(
      "Developer Documentation | Run Courier API",
      "Run Courier partner API documentation. Authentication, endpoints, request/response examples, error codes, and integration guides.",
      "/developers"
    );
  }, []);

  const endpoints = [
    {
      method: "GET",
      path: "/api/v1/health",
      auth: false,
      summary: "Health check — confirms the API is reachable.",
      request: null,
      response: `{
  "success": true,
  "status": "operational",
  "service": "Run Courier Partner API",
  "version": "v1"
}`,
    },
    {
      method: "GET",
      path: "/api/v1/pricing",
      auth: true,
      permission: "quote",
      summary: "Returns supported vehicle types and base pricing information.",
      request: null,
      response: `{
  "success": true,
  "vehicles": [
    {
      "vehicleType": "motorbike",
      "name": "Motorbike",
      "maxWeightKg": 20,
      "basePriceGbp": 8.5,
      "perMileRateGbp": 1.30
    },
    {
      "vehicleType": "small_van",
      "name": "Small Van",
      "maxWeightKg": 500,
      "basePriceGbp": 20.0,
      "perMileRateGbp": 1.50
    }
  ]
}`,
    },
    {
      method: "POST",
      path: "/api/v1/quote",
      auth: true,
      permission: "quote",
      summary: "Calculate a delivery quote using the live Run Courier pricing engine.",
      request: `{
  "pickupPostcode": "EC1A 1BB",
  "deliveryPostcode": "SW1A 1AA",
  "vehicleType": "small_van",
  "weight": 25,
  "pickupDate": "2025-06-01",
  "pickupTime": "10:00",
  "isMultiDrop": false,
  "isReturnTrip": false
}`,
      response: `{
  "success": true,
  "quoteReference": "QT-LX9K2M",
  "vehicleType": "small_van",
  "totalPriceGbp": 34.75,
  "breakdown": {
    "baseCharge": 20.00,
    "distanceCharge": 12.75,
    "weightSurcharge": 2.00,
    "isRushHour": false
  },
  "validFor": "30 minutes",
  "message": "Quote generated successfully."
}`,
    },
    {
      method: "POST",
      path: "/api/v1/book-job",
      auth: true,
      permission: "booking",
      summary: "Create a new delivery booking. Returns a tracking reference immediately.",
      request: `{
  "pickupAddress": "10 Finsbury Square, London",
  "pickupPostcode": "EC2A 1AF",
  "pickupContactName": "Dispatch Team",
  "pickupContactPhone": "+44 20 1234 5678",
  "deliveryAddress": "1 Parliament Square, London",
  "deliveryPostcode": "SW1P 3BD",
  "recipientName": "Jane Smith",
  "recipientPhone": "+44 7700 900000",
  "vehicleType": "small_van",
  "weight": 15,
  "pickupDate": "2025-06-01",
  "pickupTime": "09:30",
  "specialInstructions": "Call recipient on arrival",
  "isReturnTrip": false
}`,
      response: `{
  "success": true,
  "bookingReference": "RC2025001ABC",
  "jobId": "uuid-...",
  "status": "pending",
  "totalPriceGbp": 32.50,
  "trackingUrl": "https://runcourier.co.uk/track/RC2025001ABC",
  "message": "Booking created successfully."
}`,
    },
    {
      method: "GET",
      path: "/api/v1/track/:reference",
      auth: true,
      permission: "tracking",
      summary: "Get real-time status of a booking by its tracking reference.",
      request: null,
      response: `{
  "success": true,
  "bookingReference": "RC2025001ABC",
  "jobNumber": "482931",
  "status": "on_the_way",
  "statusLabel": "on the way",
  "pickupAddress": "10 Finsbury Square, London",
  "deliveryAddress": "1 Parliament Square, London",
  "scheduledPickupTime": "2025-06-01T09:30:00",
  "driverAssigned": true,
  "delivered": false,
  "proofOfDeliveryAvailable": false,
  "trackingUrl": "https://runcourier.co.uk/track/RC2025001ABC",
  "lastUpdated": "2025-06-01T10:14:22.000Z"
}`,
    },
  ];

  const errors = [
    { code: "invalid_api_key", http: 401, desc: "API key is missing or not recognised." },
    { code: "inactive_client", http: 403, desc: "Your API access has been suspended. Contact Run Courier." },
    { code: "permission_denied", http: 403, desc: "Your key does not have access to this endpoint." },
    { code: "validation_failed", http: 400, desc: "Required fields are missing or invalid." },
    { code: "duplicate_request", http: 409, desc: "Idempotency-Key has already been used within 30 seconds." },
    { code: "booking_not_found", http: 404, desc: "No booking matches the provided reference." },
    { code: "rate_limit_exceeded", http: 429, desc: "Exceeded 60 requests per minute. Slow down and retry." },
    { code: "internal_error", http: 500, desc: "Server-side error. Contact support if it persists." },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="mb-12">
          <Badge className="mb-3">Partner API v1</Badge>
          <h1 className="text-4xl font-bold mb-3">Developer Documentation</h1>
          <p className="text-muted-foreground max-w-xl">
            The Run Courier Partner API lets approved business clients automate quoting, booking, and tracking via a simple REST interface.
          </p>
          <div className="mt-4">
            <Link href="/api-integration-request">
              <Button size="sm" data-testid="button-request-access-docs">
                Request API Access <ArrowRight className="ml-2 h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Authentication */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold mb-4">Authentication</h2>
          <p className="text-muted-foreground mb-4">
            Include your API key on every request using one of these headers. Keys are scoped with specific permissions — your key will only work for endpoints you have been granted access to.
          </p>
          <CodeBlock
            language="http"
            code={`Authorization: Bearer rc_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# or alternatively:

X-Api-Key: rc_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}
          />
          <Card className="mt-4 border-muted">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-muted-foreground">
                <strong>Important:</strong> API keys are shown only once when created. Store yours securely in an environment variable — never in client-side code or version control.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Base URL */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold mb-4">Base URL</h2>
          <CodeBlock language="text" code="https://runcourier.co.uk" />
          <p className="text-sm text-muted-foreground mt-3">All endpoints return <code>application/json</code>. All requests must use HTTPS.</p>
        </section>

        {/* Rate Limiting */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold mb-4">Rate Limiting</h2>
          <p className="text-muted-foreground mb-3">
            Each API client is limited to <strong>60 requests per minute</strong>. Exceeding this returns HTTP 429. Back off and retry after 60 seconds.
          </p>
          <CodeBlock
            language="json"
            code={`{
  "error": "rate_limit_exceeded",
  "message": "Too many requests. Limit is 60 per minute."
}`}
          />
        </section>

        {/* Idempotency */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold mb-4">Idempotency (Booking)</h2>
          <p className="text-muted-foreground mb-3">
            To prevent duplicate bookings, include an <code>Idempotency-Key</code> header on <code>POST /api/v1/book-job</code> requests. Repeat the same key within 30 seconds and you'll receive a 409 instead of a duplicate job.
          </p>
          <CodeBlock
            language="http"
            code={`Idempotency-Key: order-12345-attempt-1`}
          />
        </section>

        {/* Endpoints */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold mb-6">Endpoints</h2>
          <div className="space-y-10">
            {endpoints.map((ep) => (
              <div key={`${ep.method}-${ep.path}`} className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <MethodBadge method={ep.method} />
                  <code className="text-sm font-mono">{ep.path}</code>
                  {ep.auth && (
                    <Badge variant="outline" className="text-xs">
                      Auth required
                    </Badge>
                  )}
                  {ep.permission && (
                    <Badge variant="outline" className="text-xs">
                      permission: {ep.permission}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{ep.summary}</p>
                {ep.request && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Request Body</p>
                    <CodeBlock code={ep.request} language="json" />
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Response</p>
                  <CodeBlock code={ep.response} language="json" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Error Codes */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold mb-4">Error Codes</h2>
          <p className="text-muted-foreground mb-6">All errors return a JSON object with an <code>error</code> code and a human-readable <code>message</code>.</p>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Error Code</th>
                  <th className="text-left px-4 py-3 font-medium">HTTP</th>
                  <th className="text-left px-4 py-3 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {errors.map((e) => (
                  <tr key={e.code} className="bg-background">
                    <td className="px-4 py-3 font-mono text-xs">{e.code}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.http}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Status Values */}
        <section className="mb-14">
          <h2 className="text-2xl font-bold mb-4">Job Status Values</h2>
          <div className="flex flex-wrap gap-2">
            {[
              "pending", "assigned", "accepted", "arrived_pickup",
              "picked_up", "on_the_way", "delivered", "cancelled", "failed",
            ].map((s) => (
              <code key={s} className="text-xs px-2 py-1 rounded-md bg-muted border font-mono">{s}</code>
            ))}
          </div>
        </section>

        {/* Support */}
        <section className="mb-14">
          <Card>
            <CardHeader>
              <CardTitle>Support & Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>For technical support, integration questions, or to request additional permissions:</p>
              <p>
                <strong>Email:</strong>{" "}
                <a href="mailto:sales@runcourier.co.uk" className="underline">
                  sales@runcourier.co.uk
                </a>
              </p>
              <p>
                <strong>Website:</strong>{" "}
                <a href="https://runcourier.co.uk/contact" className="underline">
                  runcourier.co.uk/contact
                </a>
              </p>
              <p className="mt-4">
                Don't have API access yet?{" "}
                <Link href="/api-integration-request" className="underline">
                  Submit a request
                </Link>{" "}
                and our team will be in touch.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>

      <Footer />
    </div>
  );
}
