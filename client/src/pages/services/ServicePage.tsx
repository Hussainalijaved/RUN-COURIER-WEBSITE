import { Link } from 'wouter';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ArrowRight, 
  CheckCircle,
  Zap,
  Clock,
  Shield,
  MapPin,
  Package,
  Truck,
  Heart,
  Scale,
  ShoppingBag,
  Utensils,
  RotateCcw,
  Layers,
  Calendar
} from 'lucide-react';
import medicalHeroImage from '@assets/WhatsApp_Image_2025-09-03_at_19.11.49_c1dbfbad_1764877241699.jpg';
import sameDayHeroImage from '@assets/WhatsApp_Image_2025-11-10_at_20.06.18_8ff558b5_1764877634513.jpg';
import multiDropHeroImage from '@assets/WhatsApp_Image_2025-11-10_at_21.07.21_17b4d701_1764877686495.jpg';
import retailHeroImage from '@assets/WhatsApp_Image_2025-11-10_at_20.19.15_47cde5e4_1764877777467.jpg';
import returnTripHeroImage from '@assets/WhatsApp_Image_2025-11-10_at_21.14.32_790bffe7_1764877840111.jpg';

interface ServicePageProps {
  type: 'same-day' | 'medical' | 'legal' | 'retail' | 'multi-drop' | 'return-trip' | 'scheduled' | 'restaurants';
}

const serviceData = {
  'same-day': {
    icon: Zap,
    title: 'Same Day Delivery',
    subtitle: 'Urgent deliveries within hours',
    description: 'When time is of the essence, our same-day delivery service ensures your packages reach their destination quickly and securely. Available across London with collection within the hour.',
    color: 'bg-blue-500',
    heroImage: sameDayHeroImage,
    features: [
      'Collection within 60 minutes',
      'Delivery within 4 hours in London',
      'Real-time GPS tracking',
      'Photo proof of delivery',
      'Signature confirmation',
      '24/7 availability',
    ],
    useCases: [
      'Legal documents requiring urgent signatures',
      'Medical samples needing immediate transport',
      'E-commerce rush orders',
      'Business-critical parts and components',
      'Last-minute gifts and purchases',
    ],
    pricing: 'From £25 + £1.20/mile',
  },
  'medical': {
    icon: Heart,
    title: 'Medical Delivery',
    subtitle: 'Safe transport for medical specimens',
    description: 'Specialized courier service for medical specimens, pharmaceuticals, and healthcare supplies. Our drivers are trained in handling sensitive medical materials with the utmost care.',
    color: 'bg-red-500',
    heroImage: medicalHeroImage,
    features: [
      'Temperature-controlled options',
      'UN3373 compliant packaging',
      'Chain of custody documentation',
      'GDPR compliant handling',
      'Trained and vetted drivers',
      'Priority routing',
    ],
    useCases: [
      'Laboratory specimens and samples',
      'Pharmaceutical deliveries',
      'Medical equipment transport',
      'Hospital-to-hospital transfers',
      'Clinical trial materials',
    ],
    pricing: 'Contact us for specialized pricing',
  },
  'legal': {
    icon: Scale,
    title: 'Legal Document Delivery',
    subtitle: 'Secure legal courier services',
    description: 'Confidential and secure delivery service for legal documents, court filings, and sensitive paperwork. Chain of custody maintained throughout.',
    color: 'bg-indigo-500',
    features: [
      'Tamper-evident packaging',
      'Signature verification',
      'Photo ID confirmation',
      'Detailed delivery receipts',
      'Scheduled court filings',
      'Same-day options',
    ],
    useCases: [
      'Court document filings',
      'Contract deliveries',
      'Will and estate documents',
      'Property deeds and titles',
      'Immigration paperwork',
    ],
    pricing: 'From £25 + £1.20/mile',
  },
  'retail': {
    icon: ShoppingBag,
    title: 'Retail & E-commerce',
    subtitle: 'Seamless e-commerce logistics',
    description: 'End-to-end delivery solutions for online retailers. From warehouse to doorstep, we help you delight your customers with fast, reliable delivery.',
    color: 'bg-pink-500',
    heroImage: retailHeroImage,
    features: [
      'Same-day and next-day options',
      'Branded delivery experience',
      'Returns handling',
      'API integration available',
      'Bulk order discounts',
      'Customer notifications',
    ],
    useCases: [
      'E-commerce order fulfillment',
      'Fashion and apparel',
      'Electronics and gadgets',
      'Home and garden products',
      'Specialty and artisan goods',
    ],
    pricing: 'Volume discounts available',
  },
  'multi-drop': {
    icon: Layers,
    title: 'Multi-Drop Delivery',
    subtitle: 'Multiple stops, one journey',
    description: 'Efficient delivery to multiple addresses in a single trip. Perfect for businesses distributing to multiple locations or customers.',
    color: 'bg-green-500',
    heroImage: multiDropHeroImage,
    features: [
      'Unlimited stops per journey',
      'Optimized route planning',
      'Individual POD per stop',
      'Real-time updates per delivery',
      'Cost-effective pricing',
      'Flexible scheduling',
    ],
    useCases: [
      'Wholesale distribution',
      'Restaurant supply runs',
      'Office document rounds',
      'Marketing material distribution',
      'Multi-location businesses',
    ],
    pricing: '£5 per additional stop',
  },
  'return-trip': {
    icon: RotateCcw,
    title: 'Return Trip Service',
    subtitle: 'There and back again',
    description: 'Need items picked up and brought back? Our return trip service is perfect for exchanges, repairs, or collecting signatures.',
    color: 'bg-purple-500',
    heroImage: returnTripHeroImage,
    features: [
      'Same driver throughout',
      'Waiting time options',
      'Discounted return leg',
      'Flexible pickup locations',
      'Document exchange service',
      'Real-time tracking both ways',
    ],
    useCases: [
      'Contract signature collection',
      'Equipment repairs and returns',
      'Sample collection and return',
      'Product exchanges',
      'Document notarization rounds',
    ],
    pricing: 'Return at 75% of outbound rate',
  },
  'scheduled': {
    icon: Calendar,
    title: 'Scheduled Delivery',
    subtitle: 'Plan your deliveries in advance',
    description: 'Book your deliveries ahead of time for guaranteed collection slots. Perfect for regular shipments and planned logistics.',
    color: 'bg-orange-500',
    features: [
      'Book up to 30 days ahead',
      'Guaranteed time slots',
      'Recurring order options',
      'Calendar integration',
      'Reminder notifications',
      'Easy rescheduling',
    ],
    useCases: [
      'Regular business shipments',
      'Subscription box fulfillment',
      'Weekly/monthly deliveries',
      'Event-based logistics',
      'Stock replenishment runs',
    ],
    pricing: 'Standard rates apply',
  },
  'restaurants': {
    icon: Utensils,
    title: 'Restaurant & Catering',
    subtitle: 'Food delivery done right',
    description: 'Specialized delivery for restaurants, caterers, and food businesses. Temperature-conscious handling and timely delivery for your culinary creations.',
    color: 'bg-yellow-500',
    features: [
      'Insulated bag delivery',
      'Fast collection times',
      'Multiple drop capability',
      'Evening and weekend service',
      'Partner restaurant rates',
      'Corporate catering runs',
    ],
    useCases: [
      'Restaurant to customer delivery',
      'Catering event logistics',
      'Dark kitchen distribution',
      'Corporate lunch orders',
      'Special event catering',
    ],
    pricing: 'Contact for partner rates',
  },
};

export default function ServicePage({ type }: ServicePageProps) {
  const service = serviceData[type];
  const Icon = service.icon;
  const heroImage = 'heroImage' in service ? service.heroImage : null;

  return (
    <PublicLayout>
      {heroImage ? (
        <section className="relative min-h-[400px] lg:min-h-[500px] flex items-center">
          <div 
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${heroImage})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0077B6]/85 via-[#0096C7]/75 to-transparent" />
          <div className="relative container mx-auto px-4 py-16">
            <div className="max-w-2xl">
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-16 h-16 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center`}>
                  <Icon className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold text-white">{service.title}</h1>
                  <p className="text-lg text-white/90">{service.subtitle}</p>
                </div>
              </div>
              <p className="text-lg text-white/90 max-w-xl">
                {service.description}
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <Link href="/book">
                  <Button 
                    size="lg" 
                    className="bg-white text-[#0077B6] hover:bg-white/90 font-semibold gap-2"
                    data-testid="hero-book-now"
                  >
                    Book Now
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/quote">
                  <Button 
                    size="lg"
                    variant="outline"
                    className="border-white text-white hover:bg-white/20"
                    data-testid="hero-get-quote"
                  >
                    Get Quote
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="py-20 bg-gradient-to-b from-primary/5 to-background">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center gap-4 mb-6">
                <div className={`w-16 h-16 ${service.color} rounded-xl flex items-center justify-center`}>
                  <Icon className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold">{service.title}</h1>
                  <p className="text-lg text-muted-foreground">{service.subtitle}</p>
                </div>
              </div>
              <p className="text-lg text-muted-foreground max-w-3xl">
                {service.description}
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 max-w-5xl mx-auto">
            <div>
              <h2 className="text-2xl font-bold mb-6">Key Features</h2>
              <div className="space-y-4">
                {service.features.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-bold mb-6">Common Use Cases</h2>
              <div className="space-y-4">
                {service.useCases.map((useCase, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <Package className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span>{useCase}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl font-bold mb-4">Pricing</h2>
            <p className="text-3xl font-bold text-primary mb-6">{service.pricing}</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/book">
                <Button size="lg" className="gap-2" data-testid="service-book-now">
                  Book Now
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/pricing">
                <Button size="lg" variant="outline" data-testid="service-view-pricing">
                  View Full Pricing
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold mb-8 text-center">Why Choose Run Courier?</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card>
                <CardContent className="p-6 text-center">
                  <Clock className="h-8 w-8 text-primary mx-auto mb-3" />
                  <h3 className="font-semibold mb-1">Fast</h3>
                  <p className="text-sm text-muted-foreground">Same-day delivery across London</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6 text-center">
                  <Shield className="h-8 w-8 text-primary mx-auto mb-3" />
                  <h3 className="font-semibold mb-1">Insured</h3>
                  <p className="text-sm text-muted-foreground">Full coverage for peace of mind</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6 text-center">
                  <MapPin className="h-8 w-8 text-primary mx-auto mb-3" />
                  <h3 className="font-semibold mb-1">Tracked</h3>
                  <p className="text-sm text-muted-foreground">Real-time GPS updates</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6 text-center">
                  <Truck className="h-8 w-8 text-primary mx-auto mb-3" />
                  <h3 className="font-semibold mb-1">Flexible</h3>
                  <p className="text-sm text-muted-foreground">All vehicle types available</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

export function SameDayService() {
  return <ServicePage type="same-day" />;
}

export function MedicalService() {
  return <ServicePage type="medical" />;
}

export function LegalService() {
  return <ServicePage type="legal" />;
}

export function RetailService() {
  return <ServicePage type="retail" />;
}

export function MultiDropService() {
  return <ServicePage type="multi-drop" />;
}

export function ReturnTripService() {
  return <ServicePage type="return-trip" />;
}

export function ScheduledService() {
  return <ServicePage type="scheduled" />;
}

export function RestaurantsService() {
  return <ServicePage type="restaurants" />;
}
