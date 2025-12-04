import { Link } from 'wouter';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { PublicLayout } from '@/components/layout/PublicLayout';
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
} from 'lucide-react';
import heroBackground from '@assets/stock_images/delivery_courier_van_12c659d1.jpg';

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
    description: 'Urgent deliveries within hours',
    href: '/services/same-day',
    color: 'bg-blue-500',
  },
  {
    icon: Layers,
    title: 'Multi-Drop',
    description: 'Multiple delivery points in one trip',
    href: '/services/multi-drop',
    color: 'bg-green-500',
  },
  {
    icon: RotateCcw,
    title: 'Return Trip',
    description: 'Round-trip delivery service',
    href: '/services/return-trip',
    color: 'bg-purple-500',
  },
  {
    icon: Calendar,
    title: 'Scheduled',
    description: 'Plan deliveries in advance',
    href: '/services/scheduled',
    color: 'bg-orange-500',
  },
  {
    icon: Heart,
    title: 'Medical',
    description: 'Safe medical specimen transport',
    href: '/services/medical',
    color: 'bg-red-500',
  },
  {
    icon: Scale,
    title: 'Legal',
    description: 'Secure legal document delivery',
    href: '/services/legal',
    color: 'bg-indigo-500',
  },
  {
    icon: ShoppingBag,
    title: 'Retail',
    description: 'E-commerce & retail logistics',
    href: '/services/retail',
    color: 'bg-pink-500',
  },
  {
    icon: Utensils,
    title: 'Restaurants',
    description: 'Food & catering delivery',
    href: '/services/restaurants',
    color: 'bg-yellow-500',
  },
];

const features = [
  {
    icon: Clock,
    title: 'Lightning Fast',
    description: 'Same-day delivery across London and UK-wide express service',
  },
  {
    icon: Shield,
    title: 'Fully Insured',
    description: 'All deliveries covered with comprehensive goods-in-transit insurance',
  },
  {
    icon: MapPin,
    title: 'Real-Time Tracking',
    description: 'Track your delivery live on the map with accurate ETA updates',
  },
  {
    icon: Package,
    title: 'Any Size',
    description: 'From documents to large packages - we handle it all',
  },
];

const stats = [
  { value: '50K+', label: 'Deliveries Completed' },
  { value: '10K+', label: 'Happy Customers' },
  { value: '99.8%', label: 'On-Time Rate' },
  { value: '24/7', label: 'Service Available' },
];

export default function Home() {
  const [trackingNumber, setTrackingNumber] = useState('');

  const handleTrack = () => {
    if (trackingNumber.trim()) {
      window.location.href = `/track?id=${trackingNumber}`;
    }
  };

  return (
    <PublicLayout>
      <section className="relative min-h-[600px] lg:min-h-[700px] flex flex-col">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${heroBackground})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0077B6]/90 via-[#0096C7]/85 to-[#00B4D8]/75" />
        
        <div className="relative flex-1 flex items-center justify-center px-4 py-20">
          <div className="max-w-4xl mx-auto text-center text-white">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
              Fast. Reliable. Same-Day
              <span className="block">Delivery Across the UK.</span>
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-10 max-w-2xl mx-auto">
              Trusted by businesses and individuals for urgent deliveries.
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

        <div className="relative bg-white/95 backdrop-blur-sm py-4 px-4 shadow-lg">
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

      <section className="py-20 bg-gradient-to-r from-[#0077B6] via-[#0096C7] to-[#00B4D8] text-white">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            {stats.map((stat, idx) => (
              <div key={idx}>
                <div className="text-4xl lg:text-5xl font-bold mb-2">{stat.value}</div>
                <div className="text-white/80">{stat.label}</div>
              </div>
            ))}
          </div>
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
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-500" />
              <span>4.9/5 Rating</span>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
