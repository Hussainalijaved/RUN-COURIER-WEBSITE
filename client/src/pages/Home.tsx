import { Link } from 'wouter';
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { SiTrustpilot, SiAppstore } from 'react-icons/si';
import {
  Truck,
  Clock,
  Package,
  MapPin,
  Shield,
  Zap,
  ArrowRight,
  Search,
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
} from 'lucide-react';

function useCountUp(end: number, duration: number = 2000, startOnView: boolean = true) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!startOnView) {
      setHasStarted(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasStarted) {
          setHasStarted(true);
        }
      },
      { threshold: 0.3 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [hasStarted, startOnView]);

  useEffect(() => {
    if (!hasStarted) return;

    let startTime: number;
    let animationFrame: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(easeOut * end));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationFrame);
  }, [hasStarted, end, duration]);

  return { count, ref };
}
import { SmoothBackground } from '@/components/ui/smooth-image';
import heroBackground from '@assets/WhatsApp_Image_2025-09-06_at_20.08.04_32824ae2_1764877551595.jpg';

const heroServices = [
  { icon: Clock, label: 'Same-Day', href: '/services/same-day' },
  { icon: Calendar, label: 'Next-Day', href: '/services/scheduled' },
  { icon: CalendarClock, label: 'Scheduled', href: '/services/scheduled' },
  { icon: Layers, label: 'Multi-Drop', href: '/services/multi-drop' },
  { icon: Repeat, label: 'Return Trip', href: '/services/return-trip' },
];

const services = [
  {
    icon: Zap,
    title: 'Same Day Delivery',
    description: 'Time-critical deliveries collected within 60 minutes and delivered the same day. Perfect for urgent documents, contracts, and last-minute shipments across London and the UK.',
    href: '/services/same-day',
    color: 'bg-blue-500',
  },
  {
    icon: Layers,
    title: 'Multi-Drop',
    description: 'Efficient route-optimised deliveries to multiple locations in a single journey. Ideal for businesses distributing to several clients, saving you time and money.',
    href: '/services/multi-drop',
    color: 'bg-green-500',
  },
  {
    icon: RotateCcw,
    title: 'Return Trip',
    description: 'Complete round-trip service with collection and return to your original location. Perfect for signed documents, equipment loans, or items requiring acknowledgement.',
    href: '/services/return-trip',
    color: 'bg-purple-500',
  },
  {
    icon: Calendar,
    title: 'Scheduled',
    description: 'Pre-book your deliveries for a specific date and time that suits your schedule. Reliable, punctual service for planned shipments and regular business needs.',
    href: '/services/scheduled',
    color: 'bg-orange-500',
  },
  {
    icon: Heart,
    title: 'Medical',
    description: 'Temperature-controlled, secure transport for medical specimens, pharmaceuticals, and healthcare supplies. Fully compliant with NHS and healthcare industry standards.',
    href: '/services/medical',
    color: 'bg-red-500',
  },
  {
    icon: Scale,
    title: 'Legal',
    description: 'Confidential, chain-of-custody delivery for legal documents, court filings, and sensitive contracts. Proof of delivery and signature capture as standard.',
    href: '/services/legal',
    color: 'bg-indigo-500',
  },
  {
    icon: ShoppingBag,
    title: 'Retail',
    description: 'Seamless last-mile delivery solutions for e-commerce and retail businesses. Same-day dispatch, branded tracking, and exceptional customer experience.',
    href: '/services/retail',
    color: 'bg-pink-500',
  },
  {
    icon: Utensils,
    title: 'Restaurants',
    description: 'Fast, reliable food and catering delivery that keeps your meals fresh. Insulated transport and dedicated drivers for restaurants, caterers, and food businesses.',
    href: '/services/restaurants',
    color: 'bg-yellow-500',
  },
];

const features = [
  {
    icon: Clock,
    title: 'Lightning Fast',
    description: 'Collection within 60 minutes of booking. Same-day delivery across London and express nationwide service when time matters most.',
  },
  {
    icon: Shield,
    title: 'Fully Insured',
    description: 'Complete peace of mind with comprehensive goods-in-transit insurance up to £50,000. Your items are protected from collection to delivery.',
  },
  {
    icon: MapPin,
    title: 'Real-Time Tracking',
    description: 'Follow your delivery every step of the way with live GPS tracking, instant notifications, and accurate arrival time predictions.',
  },
  {
    icon: Package,
    title: 'Any Size',
    description: 'From urgent documents to bulky equipment, our diverse fleet handles everything. Motorbikes, cars, and vans ready for any job.',
  },
];

const statsConfig = [
  { icon: Truck, value: 50, suffix: 'K+', label: 'Deliveries Completed' },
  { icon: Users, value: 10, suffix: 'K+', label: 'Happy Customers' },
  { icon: Timer, value: 99.8, suffix: '%', label: 'On-Time Delivery Rate', isDecimal: true },
  { icon: Headphones, value: 24, suffix: '/7', label: 'Service Available' },
];

function AnimatedStat({ icon: Icon, value, suffix, label, isDecimal }: {
  icon: typeof Truck;
  value: number;
  suffix: string;
  label: string;
  isDecimal?: boolean;
}) {
  const { count, ref } = useCountUp(isDecimal ? value * 10 : value, 2000);
  const displayValue = isDecimal ? (count / 10).toFixed(1) : count;

  return (
    <div ref={ref} className="flex flex-col items-center text-center p-6 relative group">
      <div className="mb-4 p-3 rounded-full bg-white/10 backdrop-blur-sm">
        <Icon className="h-8 w-8 text-white" strokeWidth={1.5} />
      </div>
      <div className="text-4xl md:text-5xl lg:text-6xl font-bold mb-2 tracking-tight">
        {displayValue}{suffix}
      </div>
      <div className="text-white/80 text-sm md:text-base font-medium tracking-wide uppercase">
        {label}
      </div>
    </div>
  );
}

export default function Home() {
  const [trackingNumber, setTrackingNumber] = useState('');

  const handleTrack = () => {
    if (trackingNumber.trim()) {
      window.location.href = `/track?id=${trackingNumber}`;
    }
  };

  return (
    <PublicLayout>
      <SmoothBackground 
        src={heroBackground}
        className="min-h-[600px] lg:min-h-[700px] flex flex-col"
        overlayClassName="bg-gradient-to-r from-[#0077B6]/70 via-[#0096C7]/60 to-[#00B4D8]/50"
      >
        <div className="flex-1 flex items-center justify-center px-4 py-20">
          <div className="max-w-4xl mx-auto text-center text-white">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
              Fast. Reliable. Same-Dayy
              <span className="block">Delivery Across the UK.</span>
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-10 max-w-2xl mx-auto">
              Professional courier services trusted by thousands of businesses. Collection within 60 minutes, real-time tracking, and guaranteed same-day delivery.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/quote">
                <Button 
                  size="lg" 
                  variant="outline"
                  className="bg-white text-[#0077B6] border-white hover:bg-white/90 hover:text-[#005f92] font-semibold px-8 py-6 text-lg w-full sm:w-auto"
                  data-testid="hero-get-quote"
                >
                  Get Quote
                </Button>
              </Link>
              <Link href="/book">
                <Button 
                  size="lg"
                  className="bg-white/20 text-white border-2 border-white/50 hover:bg-white/30 font-semibold px-8 py-6 text-lg w-full sm:w-auto backdrop-blur-sm"
                  data-testid="hero-book-now"
                >
                  Book Now
                </Button>
              </Link>
            </div>
          </div>
        </div>

      </SmoothBackground>

      {/* Service Quick Links Bar */}
      <div className="bg-white py-4 px-4 shadow-lg border-b border-gray-200">
        <div className="container mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-4 lg:gap-8">
            {heroServices.map((service) => (
              <Link key={service.label} href={service.href}>
                <button
                  className="flex items-center gap-2 px-4 py-3 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors group"
                  data-testid={`service-tab-${service.label.toLowerCase().replace(' ', '-')}`}
                >
                  <service.icon className="h-5 w-5 text-gray-500 group-hover:text-[#0077B6]" />
                  <span className="font-medium text-sm md:text-base">{service.label}</span>
                </button>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Promotional Banner */}
      <section className="bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 py-4">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-white text-center">
            <div className="flex items-center gap-2">
              <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-bold">NEW</span>
              <span className="font-medium">Create your account and enjoy <strong className="text-yellow-300">20% OFF</strong> at checkout for your first 3 bookings!</span>
            </div>
            <Link href="/signup">
              <Button 
                size="sm" 
                variant="outline" 
                className="bg-white text-blue-600 border-white hover:bg-white/90 font-semibold"
                data-testid="promo-signup-button"
              >
                Sign Up Now
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 bg-card border-y border-border">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center mb-8">
            <h2 className="text-2xl font-bold mb-2">Track Your Parcel</h2>
            <p className="text-muted-foreground">
              Enter your tracking number to see real-time updates
            </p>
          </div>
          <div className="max-w-md mx-auto flex gap-2">
            <Input
              type="text"
              placeholder="Enter tracking number..."
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              className="flex-1"
              data-testid="input-tracking-number"
            />
            <Button onClick={handleTrack} data-testid="button-track">
              <Search className="h-4 w-4 mr-2" />
              Track
            </Button>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Our Services</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Comprehensive courier solutions for every need. Click on any service to learn more.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 lg:gap-6">
            {services.map((service) => (
              <Link key={service.href} href={service.href}>
                <Card className="h-full hover-elevate active-elevate-2 cursor-pointer transition-all duration-200 group">
                  <CardContent className="p-6 text-center">
                    <div className={`w-14 h-14 ${service.color} rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                      <service.icon className="h-7 w-7 text-white" />
                    </div>
                    <h3 className="font-semibold mb-2">{service.title}</h3>
                    <p className="text-sm text-muted-foreground">{service.description}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-card">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Why Choose Run Courier?</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              We're committed to delivering excellence with every package
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, idx) => (
              <Card key={idx} className="border-0 shadow-none bg-transparent">
                <CardContent className="p-6">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-gradient-to-br from-[#0077B6] via-[#0096C7] to-[#00B4D8] text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50"></div>
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">Trusted by Thousands</h2>
            <p className="text-white/70 text-sm md:text-base">Our track record speaks for itself</p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
            {statsConfig.map((stat, idx) => (
              <AnimatedStat key={idx} {...stat} />
            ))}
          </div>
        </div>
        <div className="absolute top-0 left-0 w-64 h-64 bg-white/5 rounded-full -translate-x-1/2 -translate-y-1/2 blur-3xl"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white/5 rounded-full translate-x-1/2 translate-y-1/2 blur-3xl"></div>
      </section>

      <section className="py-12 bg-card border-y border-border">
        <div className="container mx-auto px-4">
          <a 
            href="https://uk.trustpilot.com/review/runcourier.co.uk" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex flex-col sm:flex-row items-center justify-center gap-4 group"
            data-testid="trustpilot-section"
          >
            <div className="flex items-center gap-3">
              <SiTrustpilot className="h-8 w-8 text-green-500" />
              <span className="text-2xl font-bold text-green-500">Trustpilot</span>
            </div>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star key={star} className="h-6 w-6 fill-green-500 text-green-500" />
              ))}
            </div>
            <span className="text-muted-foreground group-hover:text-foreground transition-colors">
              Rated Excellent - See our reviews
            </span>
          </a>
        </div>
      </section>

      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Book your delivery in three simple steps
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 bg-[#0077B6] text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                1
              </div>
              <h3 className="font-semibold mb-2">Enter Details</h3>
              <p className="text-sm text-muted-foreground">
                Enter pickup and delivery postcodes to get started
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-[#0096C7] text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                2
              </div>
              <h3 className="font-semibold mb-2">Confirm Booking</h3>
              <p className="text-sm text-muted-foreground">
                Review your details and confirm your delivery
              </p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-[#00B4D8] text-white rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                3
              </div>
              <h3 className="font-semibold mb-2">Track & Receive</h3>
              <p className="text-sm text-muted-foreground">
                Track your delivery in real-time until it arrives
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 bg-card">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to Ship?</h2>
            <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
              Join thousands of businesses and individuals who trust Run Courier for their delivery needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/book">
                <Button size="lg" className="gap-2 bg-[#0077B6] hover:bg-[#005f92]" data-testid="cta-book-now">
                  Book a Delivery
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/driver/apply">
                <Button size="lg" variant="outline" data-testid="cta-become-driver">
                  Become a Driver
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 bg-gradient-to-r from-[#0077B6] to-[#00B4D8]">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 text-white">
            <div className="text-center md:text-left">
              <h3 className="text-xl font-bold mb-1">Download Our App</h3>
              <p className="text-white/80 text-sm">Track deliveries on the go</p>
            </div>
            <a 
              href="https://apps.apple.com/app/run-courier-driver/id6756506175" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-black text-white px-6 py-3 rounded-xl hover:bg-gray-900 transition-colors"
              data-testid="appstore-download"
            >
              <SiAppstore className="h-8 w-8" />
              <div className="text-left">
                <div className="text-xs">Download on the</div>
                <div className="text-lg font-semibold">App Store</div>
              </div>
            </a>
          </div>
        </div>
      </section>

      <section className="py-16 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap items-center justify-center gap-8 text-muted-foreground">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>Fully Insured</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>GPS Tracked</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>Proof of Delivery</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>24/7 Support</span>
            </div>
            <a 
              href="https://uk.trustpilot.com/review/runcourier.co.uk" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:text-foreground transition-colors"
              data-testid="trustpilot-badge"
            >
              <SiTrustpilot className="h-5 w-5 text-green-500" />
              <span>Excellent on Trustpilot</span>
            </a>
          </div>
        </div>
      </section>

      {/* TrustBox widget - Review Collector */}
      <section className="py-8 bg-muted/30">
        <div className="container mx-auto px-4">
          <div 
            className="trustpilot-widget" 
            data-locale="en-US" 
            data-template-id="56278e9abfbbba0bdcd568bc" 
            data-businessunit-id="680d6e40f2df4b8e0dcdb1fa" 
            data-style-height="52px" 
            data-style-width="100%"
            data-token="53adaaec-ffbe-4b55-aa14-7fa6b09646da"
          >
            <a href="https://www.trustpilot.com/review/runcourier.co.uk" target="_blank" rel="noopener noreferrer">Trustpilot</a>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
