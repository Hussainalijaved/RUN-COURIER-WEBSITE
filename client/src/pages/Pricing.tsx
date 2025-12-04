import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { 
  Bike, 
  Car, 
  Truck, 
  Package, 
  CheckCircle,
  ArrowRight,
  Clock,
  MapPin,
  Weight,
  RotateCcw,
  Layers
} from 'lucide-react';
import { defaultPricingConfig, formatPrice } from '@/lib/pricing';

const vehicleDetails = [
  {
    type: 'motorbike',
    icon: Bike,
    name: 'Motorbike',
    description: 'Perfect for documents and small packages',
    features: ['Up to 5 kg', 'Fastest option', 'Documents & small items'],
    popular: false,
  },
  {
    type: 'car',
    icon: Car,
    name: 'Car',
    description: 'Ideal for medium-sized deliveries',
    features: ['Up to 50 kg', 'Multiple packages', 'Weather protected'],
    popular: true,
  },
  {
    type: 'small_van',
    icon: Truck,
    name: 'Small Van',
    description: 'Great for larger items and bulk orders',
    features: ['Up to 400 kg', 'Bulky items', 'Business deliveries'],
    popular: false,
  },
  {
    type: 'medium_van',
    icon: Package,
    name: 'Medium Van',
    description: 'For heavy and oversized deliveries',
    features: ['Up to 750 kg', 'Furniture & equipment', 'Large orders'],
    popular: false,
  },
];

const additionalCharges = [
  {
    icon: Weight,
    title: 'Weight Surcharges',
    items: [
      '4-10 kg: +£5',
      '10-20 kg: +£10',
      '20-30 kg: +£15',
      '30-50 kg: +£20',
      'Over 50 kg: +£40',
    ],
  },
  {
    icon: MapPin,
    title: 'Central London',
    items: [
      '+£15 surcharge',
      'Applies to EC, WC, W1, SW1 postcodes',
    ],
  },
  {
    icon: Clock,
    title: 'Waiting Time',
    items: [
      '10 minutes free',
      '£0.50/minute after',
    ],
  },
  {
    icon: Layers,
    title: 'Multi-Drop',
    items: [
      '+£5 per additional stop',
      'Unlimited stops',
    ],
  },
  {
    icon: RotateCcw,
    title: 'Return Trip',
    items: [
      'Same location: 60% of distance rate',
      'Different location: Full rate',
    ],
  },
];

export default function Pricing() {
  const { vehicles } = defaultPricingConfig;

  return (
    <PublicLayout>
      <section className="py-20 bg-gradient-to-b from-primary/5 to-background">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Simple, Transparent Pricing</h1>
            <p className="text-lg text-muted-foreground">
              No hidden fees. Get an instant quote based on distance, weight, and vehicle type.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold mb-8 text-center">Vehicle Rates</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {vehicleDetails.map((vehicle) => {
              const config = vehicles[vehicle.type as keyof typeof vehicles];
              return (
                <Card key={vehicle.type} className={`relative ${vehicle.popular ? 'border-primary ring-2 ring-primary ring-offset-2' : ''}`}>
                  {vehicle.popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
                      Most Popular
                    </Badge>
                  )}
                  <CardHeader className="text-center pb-2">
                    <div className="w-16 h-16 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                      <vehicle.icon className="h-8 w-8 text-primary" />
                    </div>
                    <CardTitle>{vehicle.name}</CardTitle>
                    <CardDescription>{vehicle.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-center">
                    <div className="mb-4">
                      {config.baseCharge > 0 && (
                        <div className="text-3xl font-bold">
                          {formatPrice(config.baseCharge)}
                          <span className="text-sm font-normal text-muted-foreground"> base</span>
                        </div>
                      )}
                      <div className="text-lg">
                        <span className="font-semibold">{formatPrice(config.perMileRate)}</span>
                        <span className="text-muted-foreground">/mile</span>
                      </div>
                      <div className="text-sm text-muted-foreground mt-1">
                        Rush hour: {formatPrice(config.rushHourRate)}/mile
                      </div>
                    </div>
                    <ul className="space-y-2 text-sm text-left">
                      {vehicle.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl font-bold mb-8 text-center">Additional Charges</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {additionalCharges.map((charge, idx) => (
              <Card key={idx}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <charge.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold">{charge.title}</h3>
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {charge.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-center">Rush Hour Times</h2>
            <Card>
              <CardContent className="p-6">
                <div className="grid sm:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold mb-2">Morning Rush</h3>
                    <p className="text-2xl font-bold text-primary">07:00 - 09:00</p>
                    <p className="text-sm text-muted-foreground">Higher per-mile rates apply</p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Evening Rush</h3>
                    <p className="text-2xl font-bold text-primary">17:00 - 19:00</p>
                    <p className="text-sm text-muted-foreground">Higher per-mile rates apply</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 bg-primary text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Get Your Instant Quote</h2>
          <p className="mb-8 max-w-xl mx-auto opacity-90">
            Enter your pickup and delivery details for an accurate price estimate
          </p>
          <Link href="/quote">
            <Button size="lg" variant="secondary" className="gap-2" data-testid="cta-get-quote">
              Get a Quote
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-center">Business Accounts</h2>
            <Card>
              <CardContent className="p-8">
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <h3 className="font-semibold text-lg mb-4">Benefits</h3>
                    <ul className="space-y-3">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <span>Monthly invoicing</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <span>Volume discounts</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <span>Dedicated account manager</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <span>API integration</span>
                      </li>
                    </ul>
                  </div>
                  <div className="flex flex-col justify-center">
                    <p className="text-muted-foreground mb-4">
                      Get in touch to discuss custom pricing for high-volume deliveries.
                    </p>
                    <Link href="/contact">
                      <Button className="w-full" data-testid="contact-sales">
                        Contact Sales
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
