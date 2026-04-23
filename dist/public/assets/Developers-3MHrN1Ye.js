import{r as x,j as e,aM as h,e as n,al as i,B as o,au as p,C as c,a as l,c as g,Z as b,u as j,J as f}from"./index-Cp041vsl.js";import{s as v}from"./seo-BW3aqrj8.js";import{C as y}from"./copy-BId68Bgb.js";const N="/assets/developers_hero-BRc0gtrg.jpg";function r({code:t,language:a="json"}){const{toast:s}=j(),[u,d]=x.useState(!1);function m(){navigator.clipboard.writeText(t).then(()=>{d(!0),setTimeout(()=>d(!1),2e3),s({title:"Copied to clipboard"})})}return e.jsxs("div",{className:"relative group rounded-md border bg-muted overflow-hidden",children:[e.jsxs("div",{className:"flex items-center justify-between px-4 py-2 border-b bg-muted/80 text-xs text-muted-foreground",children:[e.jsx("span",{className:"font-mono",children:a}),e.jsx(o,{size:"icon",variant:"ghost",onClick:m,className:"h-6 w-6","data-testid":"button-copy-code",children:u?e.jsx(f,{className:"h-3 w-3"}):e.jsx(y,{className:"h-3 w-3"})})]}),e.jsx("pre",{className:"p-4 text-xs overflow-x-auto font-mono leading-relaxed whitespace-pre",children:e.jsx("code",{children:t})})]})}function k({method:t}){const a={POST:"default",GET:"secondary",PATCH:"secondary",DELETE:"secondary"};return e.jsx(n,{variant:a[t]||"secondary",className:"font-mono text-xs",children:t})}function P(){x.useEffect(()=>{v("Developer Documentation | Run Courier API","Run Courier partner API documentation. Authentication, endpoints, request/response examples, error codes, and integration guides.")},[]);const t=[{method:"GET",path:"/api/v1/health",auth:!1,summary:"Health check — confirms the API is reachable.",request:null,response:`{
  "success": true,
  "status": "operational",
  "service": "Run Courier Partner API",
  "version": "v1"
}`},{method:"GET",path:"/api/v1/pricing",auth:!0,permission:"quote",summary:"Returns supported vehicle types and base pricing information.",request:null,response:`{
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
}`},{method:"POST",path:"/api/v1/quote",auth:!0,permission:"quote",summary:"Calculate a delivery quote using the live Run Courier pricing engine.",request:`{
  "pickupPostcode": "EC1A 1BB",
  "deliveryPostcode": "SW1A 1AA",
  "vehicleType": "small_van",
  "weight": 25,
  "pickupDate": "2025-06-01",
  "pickupTime": "10:00",
  "isMultiDrop": false,
  "isReturnTrip": false
}`,response:`{
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
}`},{method:"POST",path:"/api/v1/book-job",auth:!0,permission:"booking",summary:"Create a new delivery booking. Returns a tracking reference immediately.",request:`{
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
}`,response:`{
  "success": true,
  "bookingReference": "RC2025001ABC",
  "jobId": "uuid-...",
  "status": "pending",
  "totalPriceGbp": 32.50,
  "trackingUrl": "https://runcourier.co.uk/track/RC2025001ABC",
  "message": "Booking created successfully."
}`},{method:"GET",path:"/api/v1/track/:reference",auth:!0,permission:"tracking",summary:"Get real-time status of a booking by its tracking reference.",request:null,response:`{
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
}`}],a=[{code:"invalid_api_key",http:401,desc:"API key is missing or not recognised."},{code:"inactive_client",http:403,desc:"Your API access has been suspended. Contact Run Courier."},{code:"permission_denied",http:403,desc:"Your key does not have access to this endpoint."},{code:"validation_failed",http:400,desc:"Required fields are missing or invalid."},{code:"duplicate_request",http:409,desc:"Idempotency-Key has already been used within 30 seconds."},{code:"booking_not_found",http:404,desc:"No booking matches the provided reference."},{code:"rate_limit_exceeded",http:429,desc:"Exceeded 60 requests per minute. Slow down and retry."},{code:"internal_error",http:500,desc:"Server-side error. Contact support if it persists."}];return e.jsxs(h,{children:[e.jsxs("section",{className:"relative min-h-[380px] md:min-h-[420px] flex items-center overflow-hidden","aria-label":"Developer Documentation hero",children:[e.jsx("div",{className:"absolute inset-0 bg-cover bg-center bg-no-repeat",style:{backgroundImage:`url(${N})`},"aria-hidden":"true"}),e.jsx("div",{className:"absolute inset-0",style:{background:"linear-gradient(135deg, rgba(0,30,70,0.92) 0%, rgba(0,80,140,0.82) 50%, rgba(0,119,182,0.70) 100%)"},"aria-hidden":"true"}),e.jsx("div",{className:"relative z-10 w-full px-4 py-16",children:e.jsx("div",{className:"container mx-auto",children:e.jsx("div",{className:"max-w-3xl mx-auto",children:e.jsxs("div",{className:"backdrop-blur-md bg-white/10 border border-white/20 rounded-xl px-8 py-8 md:px-10 shadow-xl",children:[e.jsx(n,{className:"mb-3 bg-white/20 text-white border-white/30 no-default-hover-elevate",children:"Partner API v1"}),e.jsx("h1",{className:"text-4xl font-bold mb-3 text-white drop-shadow-sm",children:"Developer Documentation"}),e.jsx("p",{className:"text-white/90 text-lg max-w-2xl leading-relaxed",children:"The Run Courier Partner API lets approved business clients automate quoting, booking, and tracking via a simple REST interface."}),e.jsxs("div",{className:"mt-6 flex flex-wrap gap-3",children:[e.jsx(i,{href:"/api-integration-request",children:e.jsxs(o,{className:"bg-white text-[#0077B6] hover:bg-white/90","data-testid":"button-request-access-docs",children:["Request API Access ",e.jsx(p,{className:"ml-2 h-4 w-4"})]})}),e.jsx(i,{href:"/api-integration",children:e.jsx(o,{variant:"outline",className:"border-white/60 text-white backdrop-blur-sm bg-white/10","data-testid":"button-learn-api-integration",children:"Learn About Integration"})})]})]})})})})]}),e.jsx("section",{className:"py-16 px-4",children:e.jsx("div",{className:"container mx-auto",children:e.jsxs("div",{className:"max-w-4xl mx-auto space-y-14",children:[e.jsxs("div",{children:[e.jsx("h2",{className:"text-2xl font-bold mb-4",children:"Authentication"}),e.jsx("p",{className:"text-muted-foreground mb-4",children:"Include your API key on every request using one of these headers. Keys are scoped with specific permissions — your key will only work for endpoints you have been granted access to."}),e.jsx(r,{language:"http",code:`Authorization: Bearer rc_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# or alternatively:

X-Api-Key: rc_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}),e.jsx(c,{className:"mt-4",children:e.jsx(l,{className:"pt-4 pb-4",children:e.jsxs("p",{className:"text-sm text-muted-foreground",children:[e.jsx("strong",{children:"Important:"})," API keys are shown only once when created. Store yours securely in an environment variable — never in client-side code or version control."]})})})]}),e.jsxs("div",{children:[e.jsx("h2",{className:"text-2xl font-bold mb-4",children:"Base URL"}),e.jsx(r,{language:"text",code:"https://runcourier.co.uk"}),e.jsxs("p",{className:"text-sm text-muted-foreground mt-3",children:["All endpoints return ",e.jsx("code",{className:"text-xs px-1.5 py-0.5 rounded bg-muted border font-mono",children:"application/json"}),". All requests must use HTTPS."]})]}),e.jsxs("div",{children:[e.jsx("h2",{className:"text-2xl font-bold mb-4",children:"Rate Limiting"}),e.jsxs("p",{className:"text-muted-foreground mb-3",children:["Each API client is limited to ",e.jsx("strong",{children:"60 requests per minute"}),". Exceeding this returns HTTP 429. Back off and retry after 60 seconds."]}),e.jsx(r,{language:"json",code:`{
  "error": "rate_limit_exceeded",
  "message": "Too many requests. Limit is 60 per minute."
}`})]}),e.jsxs("div",{children:[e.jsx("h2",{className:"text-2xl font-bold mb-4",children:"Idempotency (Booking)"}),e.jsxs("p",{className:"text-muted-foreground mb-3",children:["To prevent duplicate bookings, include an ",e.jsx("code",{className:"text-xs px-1.5 py-0.5 rounded bg-muted border font-mono",children:"Idempotency-Key"})," header on"," ",e.jsx("code",{className:"text-xs px-1.5 py-0.5 rounded bg-muted border font-mono",children:"POST /api/v1/book-job"})," requests. Repeat the same key within 30 seconds and you'll receive a 409 instead of a duplicate job."]}),e.jsx(r,{language:"http",code:"Idempotency-Key: order-12345-attempt-1"})]}),e.jsxs("div",{children:[e.jsx("h2",{className:"text-2xl font-bold mb-6",children:"Endpoints"}),e.jsx("div",{className:"space-y-10",children:t.map(s=>e.jsxs("div",{className:"space-y-4",children:[e.jsxs("div",{className:"flex flex-wrap items-center gap-3",children:[e.jsx(k,{method:s.method}),e.jsx("code",{className:"text-sm font-mono",children:s.path}),s.auth&&e.jsx(n,{variant:"outline",className:"text-xs",children:"Auth required"}),s.permission&&e.jsxs(n,{variant:"outline",className:"text-xs",children:["permission: ",s.permission]})]}),e.jsx("p",{className:"text-sm text-muted-foreground",children:s.summary}),s.request&&e.jsxs("div",{children:[e.jsx("p",{className:"text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide",children:"Request Body"}),e.jsx(r,{code:s.request,language:"json"})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide",children:"Response"}),e.jsx(r,{code:s.response,language:"json"})]})]},`${s.method}-${s.path}`))})]}),e.jsxs("div",{children:[e.jsx("h2",{className:"text-2xl font-bold mb-4",children:"Error Codes"}),e.jsxs("p",{className:"text-muted-foreground mb-6",children:["All errors return a JSON object with an"," ",e.jsx("code",{className:"text-xs px-1.5 py-0.5 rounded bg-muted border font-mono",children:"error"})," code and a human-readable"," ",e.jsx("code",{className:"text-xs px-1.5 py-0.5 rounded bg-muted border font-mono",children:"message"}),"."]}),e.jsx("div",{className:"rounded-md border overflow-hidden",children:e.jsxs("table",{className:"w-full text-sm",children:[e.jsx("thead",{className:"bg-muted text-muted-foreground",children:e.jsxs("tr",{children:[e.jsx("th",{className:"text-left px-4 py-3 font-medium",children:"Error Code"}),e.jsx("th",{className:"text-left px-4 py-3 font-medium",children:"HTTP"}),e.jsx("th",{className:"text-left px-4 py-3 font-medium",children:"Description"})]})}),e.jsx("tbody",{className:"divide-y",children:a.map(s=>e.jsxs("tr",{className:"bg-background",children:[e.jsx("td",{className:"px-4 py-3 font-mono text-xs",children:s.code}),e.jsx("td",{className:"px-4 py-3 text-muted-foreground",children:s.http}),e.jsx("td",{className:"px-4 py-3 text-muted-foreground",children:s.desc})]},s.code))})]})})]}),e.jsxs("div",{children:[e.jsx("h2",{className:"text-2xl font-bold mb-4",children:"Job Status Values"}),e.jsx("div",{className:"flex flex-wrap gap-2",children:["pending","assigned","accepted","arrived_pickup","picked_up","on_the_way","delivered","cancelled","failed"].map(s=>e.jsx("code",{className:"text-xs px-2 py-1 rounded-md bg-muted border font-mono",children:s},s))})]}),e.jsx("div",{children:e.jsxs(c,{children:[e.jsx(g,{children:e.jsx(b,{children:"Support & Contact"})}),e.jsxs(l,{className:"space-y-2 text-sm text-muted-foreground",children:[e.jsx("p",{children:"For technical support, integration questions, or to request additional permissions:"}),e.jsxs("p",{children:[e.jsx("strong",{className:"text-foreground",children:"Email:"})," ",e.jsx("a",{href:"mailto:sales@runcourier.co.uk",className:"underline text-primary",children:"sales@runcourier.co.uk"})]}),e.jsxs("p",{children:[e.jsx("strong",{className:"text-foreground",children:"Website:"})," ",e.jsx("a",{href:"https://runcourier.co.uk/contact",className:"underline text-primary",children:"runcourier.co.uk/contact"})]}),e.jsxs("p",{className:"mt-4",children:["Don't have API access yet?"," ",e.jsx(i,{href:"/api-integration-request",className:"underline text-primary",children:"Submit a request"})," ","and our team will be in touch."]})]})]})})]})})})]})}export{P as default};
