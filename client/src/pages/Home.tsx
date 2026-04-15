import { Link } from 'wouter';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { SiTrustpilot } from 'react-icons/si';
import {
  Truck,
  Clock,
  Package,
  MapPin,
  Shield,
  Zap,
  ArrowRight,
  Calendar,
  Heart,
  Scale,
  ShoppingBag,
  Utensils,
  RotateCcw,
  Layers,
  CheckCircle,
  Star,
  CalendarClock,
  Repeat,
  Users,
  Timer,
  Headphones,
  BadgeCheck,
  Phone,
} from 'lucide-react';
import { SmoothBackground } from '@/components/ui/smooth-image';
import heroBackground from '@assets/WhatsApp_Image_2025-09-06_at_20.08.04_32824ae2_1764877551595.jpg';

function useCountUp(end: number, duration: number = 2000) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting && !hasStarted) setHasStarted(true); },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [hasStarted]);

  useEffect(() => {
    if (!hasStarted) return;
    let startTime: number;
    let frame: number;
    const animate = (ts: number) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(ease * end));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [hasStarted, end, duration]);

  return { count, ref };
}

const benefits = [
  { icon: Zap,       title: '60-Min Collection',  desc: 'Driver at your door within 60 minutes of booking.' },
  { icon: Shield,    title: 'Fully Insured',       desc: 'Goods-in-transit cover up to £50,000 on every job.' },
  { icon: MapPin,    title: 'Live GPS Tracking',   desc: 'Follow your delivery in real-time from pickup to drop-off.' },
  { icon: BadgeCheck, title: 'DBS-Checked Drivers', desc: 'Every driver is vetted, ID-verified, and professionally trained.' },
];

const services = [
  { icon: Zap,        title: 'Same Day',    desc: 'Collected & delivered today.',        href: '/services/same-day',    color: 'bg-blue-500' },
  { icon: Layers,     title: 'Multi-Drop',  desc: 'Multiple stops, one journey.',         href: '/services/multi-drop',  color: 'bg-indigo-500' },
  { icon: RotateCcw,  title: 'Return Trip', desc: 'Go and come back.',                   href: '/services/return-trip', color: 'bg-violet-500' },
  { icon: Calendar,   title: 'Scheduled',   desc: 'Pre-book a date and time.',            href: '/services/scheduled',   color: 'bg-cyan-500' },
  { icon: Heart,      title: 'Medical',     desc: 'NHS-grade secure transport.',          href: '/services/medical',     color: 'bg-red-500' },
  { icon: Scale,      title: 'Legal',       desc: 'Chain-of-custody documents.',          href: '/services/legal',       color: 'bg-emerald-500' },
  { icon: ShoppingBag, title: 'Retail',     desc: 'Last-mile for e-commerce.',            href: '/services/retail',      color: 'bg-orange-500' },
  { icon: Utensils,   title: 'Restaurants', desc: 'Hot food, delivered fast.',            href: '/services/restaurants', color: 'bg-yellow-500' },
];

const steps = [
  { n: '1', title: 'Get a Quote',       desc: 'Enter pickup and drop-off postcodes for an instant price.' },
  { n: '2', title: 'Confirm & Pay',     desc: 'Review your booking, choose your service, and pay securely online.' },
  { n: '3', title: 'Track & Receive',   desc: 'A driver is dispatched immediately. Track live until delivered.' },
];

const statsConfig = [
  { icon: Truck,       value: 50,   suffix: 'K+', label: 'Deliveries' },
  { icon: Users,       value: 10,   suffix: 'K+', label: 'Customers' },
  { icon: Timer,       value: 998,  suffix: '%',  label: 'On-Time Rate', isDecimal: true },
  { icon: Headphones,  value: 24,   suffix: '/7', label: 'Support' },
];

function Stat({ icon: Icon, value, suffix, label, isDecimal }: {
  icon: typeof Truck; value: number; suffix: string; label: string; isDecimal?: boolean;
}) {
  const { count, ref } = useCountUp(value, 2000);
  const display = isDecimal ? (count / 10).toFixed(1) : count;
  return (
    <div ref={ref} className="flex flex-col items-center text-center">
      <div className="text-3xl md:text-4xl font-bold mb-1 text-white">
        {display}{suffix}
      </div>
      <div className="text-white/70 text-sm font-medium">{label}</div>
    </div>
  );
}

const blogPosts = [
  {
    href: '/blog/best-courier-service-in-london',
    category: 'Guides',
    title: 'Best Courier Service in London — How to Choose',
    date: '7 April 2025',
    readTime: '8 min',
  },
  {
    href: '/blog/how-same-day-courier-services-work-in-london',
    category: 'Guides',
    title: 'How Same-Day Courier Services Work in London',
    date: '20 March 2025',
    readTime: '7 min',
  },
  {
    href: '/blog/urgent-delivery-solutions-for-businesses',
    category: 'Business',
    title: 'Urgent Delivery Solutions for Businesses',
    date: '28 March 2025',
    readTime: '8 min',
  },
];

export default function Home() {
  useEffect(() => {
    document.title = 'Run Courier | Same Day Courier London | Fast & Reliable Delivery';
    const desc = 'Run Courier provides fast, reliable same-day courier services across London and the UK. Book urgent deliveries with real-time tracking.';
    document.querySelector('meta[name="description"]')?.setAttribute('content', desc);
    (document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null)?.setAttribute('content', 'Run Courier | Same Day Courier London | Fast & Reliable Delivery');
    (document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null)?.setAttribute('content', desc);
    (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.setAttribute('href', 'https://www.runcourier.co.uk/');
    (document.querySelector('meta[property="og:url"]') as HTMLMetaElement | null)?.setAttribute('content', 'https://www.runcourier.co.uk/');
  }, []);

  return (
    <PublicLayout>

      {/* ── SECTION 1: HERO ── */}
      <SmoothBackground
        src={heroBackground}
        priority
        className="min-h-[600px] lg:min-h-[680px] flex flex-col"
        overlayClassName="bg-gradient-to-br from-[#003f6b]/80 via-[#0077B6]/70 to-[#0096C7]/60"
      >
        <div className="flex-1 flex items-center justify-center px-4 py-24">
          <div className="max-w-3xl mx-auto text-center text-white">
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/20 rounded-full px-4 py-1.5 mb-6 text-sm font-medium">
              <CheckCircle className="h-4 w-4 text-green-400" />
              Available 24/7 across London &amp; the UK
            </div>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-5 leading-[1.05]">
              Same-Day Courier<br />
              <span className="text-[#48cae4]">London</span>
            </h1>
            <p className="text-lg md:text-xl text-white/85 mb-10 max-w-xl mx-auto leading-relaxed">
              Fast, reliable delivery across London and the UK. Collection within 60 minutes — guaranteed.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/quote">
                <Button
                  size="lg"
                  className="bg-white text-[#0077B6] font-bold px-10 text-base h-14 gap-2 w-full sm:w-auto"
                  data-testid="hero-get-quote"
                >
                  Get a Quote
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="tel:+442046346100">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/50 text-white font-semibold px-8 text-base h-14 gap-2 backdrop-blur-sm bg-white/10 w-full sm:w-auto"
                  data-testid="hero-call"
                >
                  <Phone className="h-4 w-4" />
                  Call Now
                </Button>
              </a>
            </div>
          </div>
        </div>
      </SmoothBackground>

      {/* ── SECTION 2: KEY BENEFITS ── */}
      <section className="py-20 bg-background">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">Why Choose Run Courier?</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Built for businesses and individuals who need speed, reliability, and complete peace of mind.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {benefits.map((b) => (
              <div key={b.title} className="text-center p-6">
                <div className="w-14 h-14 bg-[#0077B6]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <b.icon className="h-7 w-7 text-[#0077B6]" strokeWidth={1.5} />
                </div>
                <h3 className="font-semibold text-base mb-2">{b.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 3: SERVICES ── */}
      <section className="py-20 bg-card border-t border-border">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">Our Services</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">
              From urgent same-day deliveries to specialist medical transport — we cover every need.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {services.map((s) => (
              <Link key={s.href} href={s.href}>
                <Card className="hover-elevate cursor-pointer h-full" data-testid={`service-card-${s.title.toLowerCase().replace(' ', '-')}`}>
                  <CardContent className="p-5 text-center">
                    <div className={`w-12 h-12 ${s.color} rounded-xl flex items-center justify-center mx-auto mb-3`}>
                      <s.icon className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="font-semibold text-sm mb-1">{s.title}</h3>
                    <p className="text-xs text-muted-foreground">{s.desc}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 4: HOW IT WORKS ── */}
      <section className="py-20 bg-background border-t border-border">
        <div className="container mx-auto px-4">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">How It Works</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Book a delivery in under 2 minutes — no account required.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-3xl mx-auto relative">
            <div className="hidden md:block absolute top-8 left-[calc(16.66%+2rem)] right-[calc(16.66%+2rem)] h-px bg-border" />
            {steps.map((step) => (
              <div key={step.n} className="text-center relative">
                <div className="w-16 h-16 bg-[#0077B6] text-white rounded-full flex items-center justify-center mx-auto mb-5 text-2xl font-bold relative z-10">
                  {step.n}
                </div>
                <h3 className="font-bold text-base mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <Link href="/quote">
              <Button size="lg" className="px-10 gap-2" data-testid="how-it-works-quote">
                Get Instant Quote
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="py-14 bg-gradient-to-br from-[#0077B6] via-[#0096C7] to-[#00B4D8]">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 max-w-3xl mx-auto">
            {statsConfig.map((s, i) => <Stat key={i} {...s} />)}
          </div>
        </div>
      </section>

      {/* ── TRUSTPILOT ── */}
      <section className="py-8 bg-card border-y border-border">
        <div className="container mx-auto px-4">
          <a
            href="https://uk.trustpilot.com/review/runcourier.co.uk"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
            data-testid="trustpilot-link"
          >
            <div className="flex items-center gap-2">
              <SiTrustpilot className="h-7 w-7 text-green-500" />
              <span className="text-xl font-bold text-green-500">Trustpilot</span>
            </div>
            <div className="flex items-center gap-0.5">
              {[1,2,3,4,5].map((s) => <Star key={s} className="h-5 w-5 fill-green-500 text-green-500" />)}
            </div>
            <span className="text-sm text-muted-foreground font-medium">Rated Excellent — See our reviews</span>
          </a>
        </div>
      </section>

      {/* ── AREAS WE COVER ── */}
      <section className="py-20 bg-background border-t border-border" aria-label="Areas we cover in London">
        <div className="container mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">Areas We Cover</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Our driver network spans every London postcode — Central, North, South, East, and West — plus all UK destinations.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 max-w-4xl mx-auto mb-8">
            {[
              { area: 'Central London', postcodes: 'EC, WC, W1, SW1' },
              { area: 'North London',   postcodes: 'N1–N22, NW1–NW11' },
              { area: 'South London',   postcodes: 'SE1–SE28, SW' },
              { area: 'East London',    postcodes: 'E1–E18, IG, RM' },
              { area: 'West London',    postcodes: 'W, TW, UB, HA' },
            ].map((zone) => (
              <div key={zone.area} className="bg-card border border-border rounded-xl p-4 text-center">
                <p className="font-semibold text-xs mb-1">{zone.area}</p>
                <p className="text-xs font-mono text-[#0077B6]">{zone.postcodes}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/same-day-courier-london">
              <Button variant="outline" size="sm" data-testid="areas-cta-sameday">Same Day Courier London</Button>
            </Link>
            <Link href="/urgent-courier-london">
              <Button variant="outline" size="sm" data-testid="areas-cta-urgent">Urgent Courier London</Button>
            </Link>
            <Link href="/courier-service-london">
              <Button variant="outline" size="sm" data-testid="areas-cta-service">Courier Service London</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── BLOG ── */}
      <section className="py-20 bg-card border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
            <div>
              <h2 className="text-3xl font-bold mb-1">Latest Insights</h2>
              <p className="text-muted-foreground text-sm">Guides and expertise from the Run Courier team.</p>
            </div>
            <Link href="/blog">
              <Button variant="outline" size="sm" className="gap-1.5" data-testid="blog-view-all">
                View All <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {blogPosts.map((post) => (
              <Link key={post.href} href={post.href}>
                <Card className="hover-elevate cursor-pointer h-full" data-testid={`blog-card-${post.href.split('/').pop()}`}>
                  <CardContent className="p-5 flex flex-col gap-3 h-full">
                    <span className="text-xs font-semibold text-[#0077B6] uppercase tracking-wide">{post.category}</span>
                    <h3 className="font-bold text-sm leading-snug flex-1">{post.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
                      <span>{post.date}</span>
                      <span>·</span>
                      <span>{post.readTime} read</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 5: FINAL CTA ── */}
      <section className="py-24 bg-gradient-to-br from-[#003f6b] via-[#0077B6] to-[#0096C7] text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
            Ready to Send?
          </h2>
          <p className="text-white/80 text-lg mb-10 max-w-md mx-auto">
            Get an instant quote in seconds. No account needed. Drivers available now.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center flex-wrap">
            <Link href="/quote">
              <Button
                size="lg"
                className="bg-white text-[#0077B6] font-bold px-10 text-base h-14 gap-2 w-full sm:w-auto"
                data-testid="cta-get-quote"
              >
                Get a Quote
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/book">
              <Button
                size="lg"
                variant="outline"
                className="border-white/40 text-white bg-white/10 backdrop-blur-sm font-semibold px-10 text-base h-14 w-full sm:w-auto"
                data-testid="cta-book-now"
              >
                Book Now
              </Button>
            </Link>
            <a href="tel:+442046346100">
              <Button
                size="lg"
                variant="outline"
                className="border-white/40 text-white bg-white/10 backdrop-blur-sm font-semibold px-8 text-base h-14 gap-2 w-full sm:w-auto"
                data-testid="cta-call"
              >
                <Phone className="h-4 w-4" />
                +44 20 4634 6100
              </Button>
            </a>
          </div>
        </div>
      </section>

    </PublicLayout>
  );
}
