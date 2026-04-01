import { useEffect } from 'react';
import { Link } from 'wouter';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  ArrowRight,
  CheckCircle,
  Clock,
  Shield,
  MapPin,
  Package,
  Truck,
  Heart,
  Building2,
  Zap,
  Users,
  Phone,
  FileText,
  ThumbsUp,
  Timer,
  Headphones,
} from 'lucide-react';
import { SmoothBackground } from '@/components/ui/smooth-image';
import sameDayHeroImage from '@assets/WhatsApp_Image_2025-11-10_at_20.06.18_8ff558b5_1764877634513.jpg';
import medicalHeroImage from '@assets/WhatsApp_Image_2025-09-03_at_19.11.49_c1dbfbad_1764877241699.jpg';
import businessHeroImage from '@assets/WhatsApp_Image_2025-11-10_at_20.19.15_47cde5e4_1764877777467.jpg';
import urgentHeroImage from '@assets/WhatsApp_Image_2025-09-06_at_20.08.04_32824ae2_1764877551595.jpg';

/* ─────────────────────────────────────────────────────── helpers ──── */

function setPageMeta(title: string, description: string) {
  document.title = title;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', description);
  let og = document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null;
  if (og) og.setAttribute('content', title);
  let ogDesc = document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null;
  if (ogDesc) ogDesc.setAttribute('content', description);
}

interface FeatureItem { icon: typeof Clock; text: string }
interface SectionBlock { heading: string; body: string }

interface SeoPageProps {
  title: string;
  metaDescription: string;
  h1: string;
  heroSubtitle: string;
  heroImage: string;
  heroOverlay: string;
  features: FeatureItem[];
  sections: SectionBlock[];
  ctaHeading: string;
  ctaBody: string;
  ctaBookLabel?: string;
  ctaQuoteLabel?: string;
}

function SeoPage({
  title,
  metaDescription,
  h1,
  heroSubtitle,
  heroImage,
  heroOverlay,
  features,
  sections,
  ctaHeading,
  ctaBody,
  ctaBookLabel = 'Book a Delivery',
  ctaQuoteLabel = 'Get a Quote',
}: SeoPageProps) {
  useEffect(() => {
    setPageMeta(title, metaDescription);
  }, [title, metaDescription]);

  return (
    <PublicLayout>
      {/* ── Hero ── */}
      <SmoothBackground
        src={heroImage}
        className="min-h-[460px] lg:min-h-[520px] flex flex-col"
        overlayClassName={heroOverlay}
      >
        <div className="flex-1 flex items-center justify-center px-4 py-20">
          <div className="max-w-3xl mx-auto text-center text-white">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-5 leading-tight">
              {h1}
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-8 max-w-2xl mx-auto">
              {heroSubtitle}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/quote">
                <Button
                  size="lg"
                  variant="outline"
                  className="bg-white text-[#0077B6] border-white hover:bg-white/90 hover:text-[#005f92] font-semibold px-8 py-6 text-lg w-full sm:w-auto"
                  data-testid="seo-hero-quote"
                >
                  {ctaQuoteLabel}
                </Button>
              </Link>
              <Link href="/book">
                <Button
                  size="lg"
                  className="bg-white/20 text-white border-2 border-white/50 hover:bg-white/30 font-semibold px-8 py-6 text-lg w-full sm:w-auto backdrop-blur-sm"
                  data-testid="seo-hero-book"
                >
                  {ctaBookLabel}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </SmoothBackground>

      {/* ── Feature highlights bar ── */}
      <section className="bg-card border-b border-border py-10">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {features.map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex flex-col items-center text-center gap-2 p-3">
                <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-xs font-semibold text-muted-foreground leading-tight">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Rich content sections ── */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto space-y-12">
            {sections.map((s, i) => (
              <div key={i}>
                <h2 className="text-2xl font-bold mb-4 text-foreground">{s.heading}</h2>
                <p className="text-muted-foreground leading-relaxed text-base">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust badges ── */}
      <section className="py-10 bg-card border-y border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-center gap-8 text-muted-foreground">
            {[
              { icon: CheckCircle, label: 'Fully Insured' },
              { icon: MapPin,      label: 'GPS Tracked' },
              { icon: FileText,    label: 'Proof of Delivery' },
              { icon: Headphones,  label: '24/7 Support' },
              { icon: ThumbsUp,    label: '99.8% On Time' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-20 bg-gradient-to-br from-[#0077B6] via-[#0096C7] to-[#00B4D8] text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">{ctaHeading}</h2>
          <p className="text-white/85 mb-8 max-w-2xl mx-auto leading-relaxed">{ctaBody}</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/book">
              <Button
                size="lg"
                className="bg-white text-[#0077B6] hover:bg-white/90 font-semibold px-8 gap-2"
                data-testid="seo-cta-book"
              >
                {ctaBookLabel}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button
                size="lg"
                variant="outline"
                className="border-white text-white hover:bg-white/15 font-semibold px-8"
                data-testid="seo-cta-contact"
              >
                Contact Us
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PAGE 1 — /same-day-courier-london
═══════════════════════════════════════════════════════════════════ */
export function SameDayCourierLondon() {
  return (
    <SeoPage
      title="Same Day Courier London | Run Courier – 60-Minute Collection"
      metaDescription="Need a same day courier in London? Run Courier offers 60-minute collection, live GPS tracking, and guaranteed same day delivery across London and the UK."
      h1="Same Day Courier London"
      heroSubtitle="Collection within 60 minutes. Direct delivery to your recipient. Live tracking every step of the way — across London and the wider UK."
      heroImage={sameDayHeroImage}
      heroOverlay="bg-gradient-to-r from-[#0077B6]/75 via-[#0096C7]/65 to-[#00B4D8]/55"
      features={[
        { icon: Clock,   text: '60-Min Collection' },
        { icon: MapPin,  text: 'Live GPS Tracking' },
        { icon: Shield,  text: 'Fully Insured' },
        { icon: FileText,text: 'Proof of Delivery' },
        { icon: Truck,   text: 'All Vehicle Types' },
        { icon: Headphones, text: '24/7 Available' },
      ]}
      sections={[
        {
          heading: 'London\'s Same Day Courier — Ready in 60 Minutes',
          body: 'Run Courier is London\'s trusted same day courier service, built for businesses and individuals who need a delivery done right — today. From the moment you place a booking, we dispatch a professional driver to your collection address within 60 minutes. There are no intermediaries, no sorting depots, no delays. Your item travels directly from sender to recipient in a single journey, giving you the fastest possible transit time and complete peace of mind.',
        },
        {
          heading: 'Complete London Coverage — Every Postcode, Every Borough',
          body: 'Our same day courier network covers every London postcode — from Zone 1 in the heart of the City to outer boroughs including Croydon, Enfield, Bromley, Harrow, and beyond. Whether you\'re sending from a law firm in the EC2, a clinic in W1, or a warehouse in Park Royal, we collect from your door and deliver directly to your recipient. We also offer same day courier services beyond the M25, connecting London businesses with clients and partners across the UK.',
        },
        {
          heading: 'Real-Time GPS Tracking — Always Know Where Your Delivery Is',
          body: 'Every same day booking with Run Courier includes live GPS tracking from the moment your driver is dispatched. You\'ll receive instant notifications when your driver is on the way, when collection is confirmed, and when your item has been delivered. Proof of delivery — including a photo and digital signature — is shared with you automatically at the point of drop-off. No chasing, no uncertainty, no surprises.',
        },
        {
          heading: 'Suitable for Every Industry and Use Case',
          body: 'Run Courier handles same day collections and deliveries for a wide range of sectors and items. Legal firms rely on us for urgent document submissions and signed contract exchanges. Healthcare providers trust us with pathology samples, medication, and medical equipment. E-commerce businesses use our same day courier service to delight customers with rapid fulfilment. Whatever you need to send — envelopes, parcels, pallets, or fragile items — our diverse fleet of motorbikes, cars, small vans, and Luton vans has the right vehicle for your load.',
        },
        {
          heading: 'Transparent Pricing — No Hidden Charges',
          body: 'Getting a same day courier quote from Run Courier takes seconds. Simply enter your pickup and delivery postcodes, select your vehicle type and any special requirements, and receive an instant fixed price. Our pricing is fully transparent — you pay the price you see, with no hidden fees, fuel surcharges, or surprise additions. Registered business customers can access account billing, weekly invoicing, and volume pricing to reduce the cost of regular courier runs.',
        },
      ]}
      ctaHeading="Book Your Same Day Courier Now"
      ctaBody="Get an instant online quote in seconds. Collection within 60 minutes, direct delivery, and live tracking included on every booking."
      ctaBookLabel="Book Now"
      ctaQuoteLabel="Get Instant Quote"
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PAGE 2 — /medical-courier
═══════════════════════════════════════════════════════════════════ */
export function MedicalCourierPage() {
  return (
    <SeoPage
      title="Medical Courier London | Run Courier – Safe Healthcare Logistics"
      metaDescription="Run Courier's medical courier service handles pathology samples, pharmaceuticals, and medical equipment across London with full compliance and chain of custody."
      h1="Medical Courier London"
      heroSubtitle="Secure, compliant, and time-critical healthcare logistics for NHS trusts, hospitals, laboratories, and pharmaceutical organisations across London and the UK."
      heroImage={medicalHeroImage}
      heroOverlay="bg-gradient-to-r from-[#b91c1c]/70 via-[#dc2626]/60 to-[#ef4444]/50"
      features={[
        { icon: Shield,   text: 'Fully Compliant' },
        { icon: FileText, text: 'Chain of Custody' },
        { icon: Clock,    text: 'Priority Routing' },
        { icon: MapPin,   text: 'GPS Tracked' },
        { icon: Users,    text: 'DBS-Checked Drivers' },
        { icon: Headphones, text: '24/7 Available' },
      ]}
      sections={[
        {
          heading: 'Specialist Medical Courier Services in London',
          body: 'Run Courier\'s medical courier London service is purpose-built for the healthcare sector. We understand that medical deliveries are not ordinary parcels — they require adherence to strict regulatory standards, careful temperature management, robust chain-of-custody documentation, and drivers trained to handle sensitive materials with discretion and care. Our medical courier service supports NHS trusts, private hospitals, independent clinics, GP practices, pharmacies, clinical research organisations, and diagnostic laboratories across London and the wider UK.',
        },
        {
          heading: 'What We Transport — Pathology, Pharmaceuticals, and Medical Equipment',
          body: 'Our medical courier service is trusted with a wide range of healthcare consignments. We regularly transport pathology specimens and diagnostic samples between clinical sites, patient homes, and laboratories under safe handling protocols. Pharmaceutical deliveries — including prescription medications, controlled drugs (where licensed), temperature-sensitive biologics, and patient-specific therapies — are handled with validated cold chain management. We also deliver medical devices, surgical instruments, clinical trial materials, blood products, and urgent hospital supplies, all with full documentation and real-time tracking.',
        },
        {
          heading: 'Full Compliance — Chain of Custody and Regulatory Standards',
          body: 'Healthcare logistics demands an unbroken chain of custody. Every Run Courier medical delivery includes a complete digital audit trail: driver identification, timestamped collection and delivery records, GPS route data, photographic proof of delivery, and electronic signature capture. Our protocols are aligned with NHS standards and GDPR requirements for patient data confidentiality. Drivers are DBS-checked and trained in the correct handling of Category B biological substances (UN3373) and temperature-sensitive pharmaceutical products.',
        },
        {
          heading: 'Temperature-Controlled Medical Transport',
          body: 'For temperature-sensitive consignments — vaccines, blood products, tissue samples, and cold-chain pharmaceuticals — Run Courier offers validated cool box and insulated packaging options that maintain the required temperature range throughout transit. Our drivers follow strict protocols to ensure the integrity of your consignment is preserved from collection to delivery. Delivery times and temperature records are documented and made available to your logistics or quality team on request.',
        },
        {
          heading: 'Priority Medical Courier — When Timing Is Critical',
          body: 'Medical courier London bookings with Run Courier receive priority dispatch. A trained driver is assigned to your collection within 60 minutes of booking, and direct — non-stop — routing ensures the shortest possible transit time. For truly time-critical consignments such as urgent surgical specimens, blood products, or emergency pharmaceutical supplies, our dedicated urgent service assigns a single driver with your consignment as their sole priority. Contact our team 24/7 for same-hour response on critical healthcare logistics needs.',
        },
      ]}
      ctaHeading="Enquire About Medical Courier Services"
      ctaBody="Speak to our healthcare logistics team about your specific requirements. We provide compliant, reliable medical courier services across London and the UK."
      ctaBookLabel="Book a Collection"
      ctaQuoteLabel="Get a Quote"
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PAGE 3 — /business-courier-services
═══════════════════════════════════════════════════════════════════ */
export function BusinessCourierServices() {
  return (
    <SeoPage
      title="Business Courier Services London | Run Courier – Corporate Delivery"
      metaDescription="Professional business courier services for London companies. Same day delivery, multi-drop routes, account billing, and dedicated support for your business logistics."
      h1="Business Courier Services London"
      heroSubtitle="Reliable, professional courier services for London businesses. From urgent same day deliveries to regular multi-drop distribution routes — we handle your logistics so you can focus on your business."
      heroImage={businessHeroImage}
      heroOverlay="bg-gradient-to-r from-[#1e3a5f]/80 via-[#0077B6]/65 to-[#0096C7]/55"
      features={[
        { icon: Building2, text: 'Business Accounts' },
        { icon: FileText,  text: 'Invoice Billing' },
        { icon: Truck,     text: 'Full Fleet Available' },
        { icon: MapPin,    text: 'Live Tracking' },
        { icon: Users,     text: 'Dedicated Support' },
        { icon: Shield,    text: 'Fully Insured' },
      ]}
      sections={[
        {
          heading: 'Courier Services Built for London Businesses',
          body: 'Run Courier works with businesses of every size — from sole traders and startups to large corporates and public sector organisations. Our business courier services are designed around the realities of commercial logistics: multiple collections per day, time-specific delivery windows, account billing, and the expectation of a professional, reliable driver who represents your brand at the point of delivery. Whether you need a daily courier run or a one-off urgent collection, we treat every job with the same level of care and professionalism.',
        },
        {
          heading: 'Business Accounts — Simplified Billing and Management',
          body: 'Approved business customers gain access to a dedicated Run Courier account, unlocking weekly consolidated invoicing, volume-based pricing, and a full job history portal. Manage all your deliveries from a single dashboard, download digital proof of delivery for every job, and reconcile courier costs against your accounts with ease. Business accounts are available to registered UK companies and can be set up in as little as 24 hours. Contact our team to discuss account terms, credit facilities, and bespoke pricing structures for regular courier volumes.',
        },
        {
          heading: 'Same Day Business Delivery Across London',
          body: 'For London businesses, speed is often everything. A missed contract signing, a delayed document, or a late spare part can cost far more than a courier fee. Run Courier\'s same day business courier service guarantees collection within 60 minutes and direct delivery to your recipient — no sorting hubs, no relay points. Our same day business delivery covers every London postcode, with services extending to the rest of the UK for inter-city consignments. Real-time GPS tracking keeps your team and your clients informed at every stage.',
        },
        {
          heading: 'Multi-Drop Distribution for High-Volume Business Logistics',
          body: 'Businesses distributing to multiple locations — offices, clients, retail branches, or warehouses — benefit from our efficient multi-drop courier service. Our route-optimised drivers handle unlimited delivery stops in a single journey, with individual proof of delivery captured at every point. This is ideal for wholesale distributors, marketing agencies distributing campaign materials, law firms with multiple filing submissions, and any business needing a reliable daily or weekly distribution run across London.',
        },
        {
          heading: 'Industries We Serve — Legal, Healthcare, Retail, Finance and More',
          body: 'Run Courier\'s business courier services support professionals across a wide range of London industries. Law firms rely on us for urgent court submissions and confidential contract exchanges. Financial institutions use our service for the secure movement of sensitive documents and physical securities. Retail and e-commerce businesses trust Run Courier for rapid same day order fulfilment and customer returns handling. Marketing and PR agencies use our multi-drop service to distribute press packs, samples, and promotional materials. Whatever your sector, we have the expertise, the fleet, and the professionalism to support your business courier needs.',
        },
      ]}
      ctaHeading="Set Up a Business Courier Account"
      ctaBody="Join hundreds of London businesses that rely on Run Courier for their daily logistics. Get an instant quote or contact us to discuss a business account."
      ctaBookLabel="Book a Delivery"
      ctaQuoteLabel="Get Business Quote"
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PAGE 4 — /urgent-delivery-london
═══════════════════════════════════════════════════════════════════ */
export function UrgentDeliveryLondon() {
  return (
    <SeoPage
      title="Urgent Delivery London | Run Courier – Same Hour Courier Service"
      metaDescription="Need urgent delivery in London? Run Courier dispatches within minutes. Direct, dedicated service for time-critical deliveries anywhere in London and the UK."
      h1="Urgent Delivery London"
      heroSubtitle="When it absolutely cannot wait. Run Courier dispatches a dedicated driver within minutes — direct collection, non-stop delivery, live tracking from start to finish."
      heroImage={urgentHeroImage}
      heroOverlay="bg-gradient-to-r from-[#92400e]/80 via-[#d97706]/65 to-[#f59e0b]/50"
      features={[
        { icon: Zap,       text: 'Dispatch in Minutes' },
        { icon: Timer,     text: 'Dedicated Driver' },
        { icon: MapPin,    text: 'Live GPS Tracking' },
        { icon: Shield,    text: 'Fully Insured' },
        { icon: Phone,     text: 'Call & Book Instantly' },
        { icon: Headphones,text: '24/7 Available' },
      ]}
      sections={[
        {
          heading: 'Urgent Delivery London — Dispatched in Minutes, Not Hours',
          body: 'When you have a genuinely urgent delivery in London, you can\'t afford to wait. Run Courier\'s urgent delivery service is built for exactly these moments. From the second you confirm your booking, our dispatch team identifies the nearest available driver and sends them to your collection address immediately — typically within 15 to 30 minutes in central London. There are no delays, no handoffs to third parties, and no stops along the way. Your consignment travels directly from your hands to your recipient\'s, with a dedicated driver focused entirely on your job.',
        },
        {
          heading: 'Dedicated Direct Service — Your Job Is the Only Priority',
          body: 'The key difference between a standard courier and a truly urgent delivery service is dedication. With Run Courier\'s urgent option, the driver assigned to your collection does not pick up any other jobs until yours is complete. This direct, non-stop approach ensures the fastest possible transit time between any two points in London. Whether you\'re crossing the city from Mayfair to Canary Wharf, or sending between North and South London, you get a driver committed solely to getting your item there as quickly as possible.',
        },
        {
          heading: 'Urgent Document Delivery in London',
          body: 'Many of our urgent delivery requests are for time-sensitive documents. Legal firms use our urgent service to meet court filing deadlines at the RCJ, HMCTS, and other London tribunals. Property solicitors rely on us for same-day contract exchanges where timing is legally binding. HR and finance teams send urgent signed agreements and corporate documents. Financial institutions dispatch physical instructions, authorisations, and securities that cannot be transmitted digitally. For every scenario, Run Courier provides tamper-evident handling, chain of custody records, and digital proof of delivery with signature capture.',
        },
        {
          heading: 'Urgent Medical and Pharmaceutical Delivery',
          body: 'Healthcare is one of the most time-critical sectors for urgent delivery. Run Courier supports hospitals, clinics, and pharmacies with urgent medical courier services across London. We handle urgent medication deliveries for patients who cannot travel, urgent blood and tissue sample transport between clinical sites, and emergency medical equipment dispatch to hospitals and operating theatres. Our trained medical couriers understand the protocols required for healthcare consignments and are available 24 hours a day, 7 days a week — including bank holidays.',
        },
        {
          heading: 'Book Urgent Delivery Online or by Phone — 24 Hours a Day',
          body: 'Booking an urgent delivery with Run Courier is straightforward and fast. Our online platform provides an instant quote in seconds — enter your collection and delivery postcodes, choose your vehicle, and confirm. A driver is dispatched automatically, and you receive live GPS tracking from the moment they\'re on the way. For the most time-critical situations, you can also call our operations team directly around the clock. We operate 24/7, 365 days a year — because urgent deliveries don\'t follow a 9-to-5 schedule.',
        },
      ]}
      ctaHeading="Book an Urgent Delivery Right Now"
      ctaBody="Get an instant quote in seconds. A driver will be dispatched to your address within minutes. Available 24/7 across London and the UK."
      ctaBookLabel="Book Urgent Delivery"
      ctaQuoteLabel="Get Instant Quote"
    />
  );
}
