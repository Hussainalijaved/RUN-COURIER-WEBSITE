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
import scheduledHeroImage from '@assets/generated_images/scheduled_delivery_courier_service.png';
import restaurantsHeroImage from '@assets/generated_images/restaurant_catering_delivery_service.png';
import legalHeroImage from '@assets/generated_images/legal_document_courier_delivery.png';

interface ServicePageProps {
  type: 'same-day' | 'medical' | 'legal' | 'retail' | 'multi-drop' | 'return-trip' | 'scheduled' | 'restaurants';
}

const serviceData = {
  'same-day': {
    icon: Zap,
    title: 'Same Day Delivery',
    subtitle: 'Time-Critical Courier Services',
    description: 'When every minute counts, trust Run Courier for urgent same-day deliveries. Our dedicated drivers collect within 60 minutes and deliver your packages swiftly across London and the UK. With real-time tracking and proof of delivery, you stay informed every step of the way.',
    color: 'bg-blue-500',
    heroImage: sameDayHeroImage,
    features: [
      'Rapid collection within 60 minutes of booking',
      'Guaranteed delivery within 4 hours across Greater London',
      'Live GPS tracking with accurate arrival predictions',
      'Photo proof of delivery for complete transparency',
      'Electronic signature capture on delivery',
      'Available 24/7 including weekends and bank holidays',
    ],
    useCases: [
      'Time-sensitive legal documents requiring urgent signatures',
      'Medical specimens and samples needing immediate transport',
      'E-commerce rush orders and same-day purchases',
      'Mission-critical spare parts and business components',
      'Last-minute important gifts and special deliveries',
    ],
    pricing: 'From £25 + £1.20/mile',
  },
  'medical': {
    icon: Heart,
    title: 'Medical Courier Services',
    subtitle: 'Healthcare Logistics You Can Trust',
    description: 'Our specialist medical courier service provides secure, compliant transport for specimens, pharmaceuticals, and healthcare supplies. Every driver is fully trained in handling sensitive medical materials, ensuring your items arrive safely and on time while meeting all regulatory requirements.',
    color: 'bg-red-500',
    heroImage: medicalHeroImage,
    features: [
      'Temperature-controlled transport with validated cold chain',
      'UN3373 Category B compliant packaging and labelling',
      'Full chain of custody documentation and audit trail',
      'GDPR and patient confidentiality compliant protocols',
      'DBS-checked and specifically trained medical couriers',
      'Priority routing to minimise transit times',
    ],
    useCases: [
      'Pathology specimens and diagnostic samples',
      'Prescription pharmaceuticals and controlled medicines',
      'Medical equipment and surgical instrument transport',
      'Inter-hospital patient transfers and urgent supplies',
      'Clinical trial materials and research samples',
    ],
    pricing: 'Contact us for specialized pricing',
  },
  'legal': {
    icon: Scale,
    title: 'Legal Document Courier',
    subtitle: 'Confidential & Compliant Delivery',
    description: 'Entrust your sensitive legal documents to our professional courier service. We maintain strict chain of custody protocols, provide tamper-evident packaging, and ensure every delivery is fully documented. Whether it\'s court filings, contracts, or confidential papers, we handle them with the discretion they deserve.',
    color: 'bg-indigo-500',
    heroImage: legalHeroImage,
    features: [
      'Tamper-evident sealed packaging for document integrity',
      'Verified signature capture with witness confirmation',
      'Photo ID verification of recipients as standard',
      'Comprehensive delivery receipts and audit documentation',
      'Timed court filing service with deadline guarantee',
      'Same-day and express urgent delivery options',
    ],
    useCases: [
      'Court document filings and deadline submissions',
      'Contract execution and agreement deliveries',
      'Will, probate, and estate documentation',
      'Property deeds, titles, and conveyancing papers',
      'Immigration applications and visa documents',
    ],
    pricing: 'From £25 + £1.20/mile',
  },
  'retail': {
    icon: ShoppingBag,
    title: 'Retail & E-commerce Delivery',
    subtitle: 'Last-Mile Excellence for Your Brand',
    description: 'Elevate your customer experience with our premium retail delivery service. From warehouse to doorstep, we provide fast, reliable last-mile logistics that reflect your brand values. Delight your customers with same-day delivery, real-time updates, and professional service that keeps them coming back.',
    color: 'bg-pink-500',
    heroImage: retailHeroImage,
    features: [
      'Same-day, next-day, and scheduled delivery options',
      'Branded delivery experience that represents your business',
      'Seamless returns handling and collection service',
      'API and e-commerce platform integration available',
      'Competitive bulk order and volume discounts',
      'Automated customer delivery notifications and tracking',
    ],
    useCases: [
      'E-commerce and online order fulfilment',
      'Fashion, clothing, and apparel deliveries',
      'Electronics, gadgets, and technology products',
      'Homeware, furniture, and garden supplies',
      'Speciality, artisan, and boutique goods',
    ],
    pricing: 'Volume discounts available',
  },
  'multi-drop': {
    icon: Layers,
    title: 'Multi-Drop Distribution',
    subtitle: 'Smart Routing, Maximum Efficiency',
    description: 'Optimise your delivery operations with our intelligent multi-drop service. We plan the most efficient routes to reach all your destinations in a single journey, saving you time and money. Perfect for businesses distributing to multiple clients, branches, or customers across the city.',
    color: 'bg-green-500',
    heroImage: multiDropHeroImage,
    features: [
      'Unlimited delivery stops per journey',
      'AI-optimised route planning for maximum efficiency',
      'Individual proof of delivery at every stop',
      'Real-time tracking and updates for each drop',
      'Cost-effective pricing that reduces per-delivery costs',
      'Flexible scheduling to suit your business needs',
    ],
    useCases: [
      'Wholesale and trade distribution rounds',
      'Restaurant and hospitality supply deliveries',
      'Office document and mail distribution circuits',
      'Marketing materials and promotional campaigns',
      'Multi-location business and franchise supplies',
    ],
    pricing: '£5 per additional stop',
  },
  'return-trip': {
    icon: RotateCcw,
    title: 'Return Trip Service',
    subtitle: 'Complete Round-Trip Solutions',
    description: 'Sometimes you need items picked up and brought back. Our return trip service assigns a single dedicated driver for your entire journey, ensuring seamless collection, wait time if needed, and secure return. Ideal for signatures, exchanges, repairs, or any job that needs completing on both ends.',
    color: 'bg-purple-500',
    heroImage: returnTripHeroImage,
    features: [
      'Same dedicated driver for the entire round-trip',
      'Flexible waiting time at collection point',
      'Discounted return leg at just 60% of outbound rate',
      'Alternative pickup locations supported',
      'Document exchange and signature collection service',
      'Full real-time tracking in both directions',
    ],
    useCases: [
      'Contract and agreement signature collection',
      'Equipment repairs, servicing, and returns',
      'Sample collection with return of results',
      'Product exchanges and replacements',
      'Document notarisation and legal witness rounds',
    ],
    pricing: 'Return at 60% of outbound rate',
  },
  'scheduled': {
    icon: Calendar,
    title: 'Scheduled Delivery',
    subtitle: 'Reliable, Planned Logistics',
    description: 'Take control of your delivery schedule with our pre-booked service. Reserve your preferred collection times up to 30 days in advance and enjoy guaranteed time slots that fit your business rhythm. Perfect for regular shipments, recurring orders, and planned logistics that keep your operations running smoothly.',
    color: 'bg-orange-500',
    heroImage: scheduledHeroImage,
    features: [
      'Book deliveries up to 30 days in advance',
      'Guaranteed collection and delivery time slots',
      'Recurring order options for regular shipments',
      'Calendar integration for seamless scheduling',
      'Automated reminder notifications before pickup',
      'Easy online rescheduling and modifications',
    ],
    useCases: [
      'Regular weekly or monthly business shipments',
      'Subscription box and membership fulfilment',
      'Scheduled weekly deliveries to key clients',
      'Event-based and seasonal logistics planning',
      'Inventory and stock replenishment runs',
    ],
    pricing: 'Standard rates apply',
  },
  'restaurants': {
    icon: Utensils,
    title: 'Restaurant & Catering Delivery',
    subtitle: 'Fresh Food, Fast Delivery',
    description: 'Keep your culinary creations at their best with our specialist food delivery service. We understand that presentation and temperature matter. Our drivers use insulated equipment and prioritise speed to ensure your dishes arrive fresh, hot, and ready to impress your customers.',
    color: 'bg-yellow-500',
    heroImage: restaurantsHeroImage,
    features: [
      'Professional insulated bag delivery for temperature control',
      'Rapid collection to minimise waiting times',
      'Multi-drop capability for bulk catering orders',
      'Extended evening and weekend service availability',
      'Exclusive partner rates for regular restaurant clients',
      'Corporate catering and event delivery expertise',
    ],
    useCases: [
      'Restaurant to customer direct deliveries',
      'Catering for events, parties, and functions',
      'Dark kitchen and virtual brand distribution',
      'Corporate lunch orders and office catering',
      'Wedding, conference, and special event catering',
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
          <div className="absolute inset-0 bg-gradient-to-r from-[#0077B6]/60 via-[#0096C7]/50 to-transparent" />
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

      {type === 'same-day' && (
        <section className="py-16 bg-slate-50 dark:bg-slate-900/30">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto space-y-4">
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                Our Same Day Delivery service is designed for businesses requiring fast, reliable, and time-critical transportation of goods within the shortest possible timeframe. Once a booking is made, a dedicated driver is immediately assigned to collect the item and deliver it directly to the destination without unnecessary stops or delays. This point-to-point model ensures maximum speed, full security of the parcel, and complete transparency throughout the journey.
              </p>
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                This service is ideal for urgent documents, medical samples, retail orders, spare parts, and high-value goods where delays are not acceptable. Clients benefit from real-time tracking, live updates, proof of delivery, and full accountability from collection to drop-off. Whether you are a business, organisation, or individual requiring urgent delivery, our Same Day service guarantees priority handling and an unparalleled level of reliability.
              </p>
            </div>
          </div>
        </section>
      )}

      {type === 'multi-drop' && (
        <section className="py-16 bg-slate-50 dark:bg-slate-900/30">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto space-y-4">
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                Our Multi-Drop Delivery service is specifically designed for businesses that need to distribute multiple parcels or orders across several locations in one coordinated route. Instead of booking separate deliveries, clients can consolidate their shipments into one efficient plan managed by a single dedicated driver. This not only reduces operational costs but also speeds up the entire delivery process, ensuring every drop is completed professionally and on time.
              </p>
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                Multi-Drop is the ideal solution for e-commerce businesses, pharmacies, bakeries, florists, and organisations that manage daily outbound orders. We optimise each route for speed, fuel efficiency, and accuracy, ensuring every drop is recorded with real-time tracking and proof of delivery. This service helps businesses streamline operations, improve customer satisfaction, and maintain consistent, dependable distribution.
              </p>
            </div>
          </div>
        </section>
      )}

      {type === 'return-trip' && (
        <section className="py-16 bg-slate-50 dark:bg-slate-900/30">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto space-y-4">
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                Our Return Trip service is tailored for customers who require items to be delivered to a destination and then returned to the original pickup point. This is commonly used by businesses handling document signing, contract exchange, material testing, or any process that requires two-way transportation within the same booking. Instead of creating separate jobs, our Return Trip option ensures seamless handling under one organised workflow.
              </p>
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                Clients benefit from reduced costs compared to booking two separate deliveries, as well as improved efficiency and faster turnaround times. With real-time tracking, secure handling, and driver accountability at both ends of the journey, the Return Trip service guarantees complete control and convenience while maintaining the high professional standards expected from business-grade courier services.
              </p>
            </div>
          </div>
        </section>
      )}

      {type === 'scheduled' && (
        <section className="py-16 bg-slate-50 dark:bg-slate-900/30">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto space-y-4">
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                Our Scheduled Delivery service is designed for businesses that need consistent, pre-planned collections and deliveries at fixed times. Whether it's daily, weekly, or monthly routines, we provide tailored logistics solutions that align with your operational requirements. This service ensures full reliability by guaranteeing a dedicated driver arrives at the same time and location as arranged, enabling businesses to plan their workflow with confidence.
              </p>
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                Scheduled deliveries are essential for organisations such as pharmacies, corporate offices, laboratories, manufacturing companies, and retailers who must move items regularly. With full tracking, automated reminders, and priority handling, our Scheduled Delivery service brings structure, predictability, and efficiency to your logistics processes.
              </p>
            </div>
          </div>
        </section>
      )}

      {type === 'medical' && (
        <section className="py-16 bg-slate-50 dark:bg-slate-900/30">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto space-y-4">
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                Our Medical & Healthcare Delivery service is built to support hospitals, clinics, laboratories, pharmacies, and healthcare providers with urgent, sensitive, and highly regulated transportation needs. We handle medical samples, prescriptions, documents, test kits, diagnostic materials, and healthcare supplies with strict adherence to professional standards. Every delivery is treated with exceptional care to maintain integrity, confidentiality, and compliance throughout the process.
              </p>
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                Drivers assigned to medical deliveries are trained to handle time-critical healthcare items responsibly, ensuring safe, direct, and temperature-appropriate transport when required. With real-time tracking, proof of delivery, and secure end-to-end handling, our healthcare courier service provides the reliability and professionalism essential for medical environments where precision and timeliness are vital.
              </p>
            </div>
          </div>
        </section>
      )}

      {type === 'legal' && (
        <section className="py-16 bg-slate-50 dark:bg-slate-900/30">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto space-y-4">
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                Our Legal Courier service supports law firms, solicitors, estate agencies, and corporate offices that require secure, confidential, and time-sensitive document transportation. We specialise in the delivery of legal documents, contracts, deeds, evidence files, court bundles, and signed agreements. Each item is handled with the highest level of confidentiality to protect client information and legal integrity.
              </p>
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                This service ensures your documents are collected promptly, delivered directly, and recorded with proof of delivery for full traceability. Our drivers understand the importance of accuracy and punctuality in legal matters, making this service ideal for firms that require dependable, secure, and professional same-day or scheduled document movement.
              </p>
            </div>
          </div>
        </section>
      )}

      {type === 'retail' && (
        <section className="py-16 bg-slate-50 dark:bg-slate-900/30">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto space-y-4">
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                Our Retail & E-Commerce Delivery service provides online stores, local retailers, and growing brands with efficient, scalable logistics for same-day, next-day, and multi-drop distribution. We handle everything from small parcels and clothing to electronics, accessories, and packaged goods—ensuring each order reaches the customer quickly, safely, and in perfect condition.
              </p>
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                With real-time tracking, automated updates, and proof of delivery, retailers can offer customers a premium delivery experience that enhances brand reputation and reduces failed deliveries. Whether you process a few orders per day or manage high-volume shipments, our retail courier service provides the flexibility, consistency, and professionalism needed for modern e-commerce operations.
              </p>
            </div>
          </div>
        </section>
      )}

      {type === 'restaurants' && (
        <section className="py-16 bg-slate-50 dark:bg-slate-900/30">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto space-y-4">
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                Our Restaurant & Food Delivery service supports restaurants, cafés, catering businesses, and meal-prep companies that require fast, reliable transport of freshly prepared food. We understand the importance of timing, temperature control, and careful handling to preserve quality from the kitchen to the customer. Our dedicated drivers ensure meals are delivered promptly, maintaining freshness and presentation.
              </p>
              <p className="text-lg leading-relaxed text-slate-700 dark:text-slate-300">
                This service is ideal for catering events, large corporate orders, meal plans, and urgent restaurant deliveries. With real-time tracking, organised route planning, and a reliable professional approach, we help food businesses maintain high service standards and deliver exceptional customer satisfaction.
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
