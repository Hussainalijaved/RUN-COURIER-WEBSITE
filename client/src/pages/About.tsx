import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Truck, 
  Users, 
  Award, 
  Clock, 
  Shield, 
  MapPin,
  Target,
  Heart
} from 'lucide-react';
import aboutHeroImage from '@assets/WhatsApp_Image_2025-11-10_at_20.30.47_6eef4c81_1764879185103.jpg';

const values = [
  {
    icon: Clock,
    title: 'Reliability',
    description: 'We deliver on time, every time. Our 99.8% on-time delivery rate speaks for itself.',
  },
  {
    icon: Shield,
    title: 'Trust',
    description: 'Fully insured deliveries with real-time tracking give you peace of mind.',
  },
  {
    icon: Heart,
    title: 'Care',
    description: 'We treat every package as if it were our own, handling with the utmost care.',
  },
  {
    icon: Target,
    title: 'Excellence',
    description: 'We continuously improve our services to exceed customer expectations.',
  },
];

const stats = [
  { value: '2018', label: 'Founded' },
  { value: '500+', label: 'Drivers' },
  { value: '50K+', label: 'Deliveries' },
  { value: '10K+', label: 'Customers' },
];

export default function About() {
  return (
    <PublicLayout>
      <section className="relative min-h-[400px] lg:min-h-[500px] flex items-center">
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${aboutHeroImage})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0077B6]/70 via-[#0096C7]/60 to-[#00B4D8]/50" />
        
        <div className="relative container mx-auto px-4 py-20">
          <div className="max-w-3xl mx-auto text-center text-white">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">About Run Courier</h1>
            <p className="text-lg text-white/90">
              We're on a mission to revolutionize courier delivery across the UK. 
              Fast, reliable, and customer-focused - that's the Run Courier promise.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6">Our Story</h2>
              <div className="space-y-4 text-muted-foreground">
                <p>
                  Run Courier is a professional same-day delivery and logistics company dedicated to providing fast, secure, and reliable transport services for businesses across London and the UK. Founded on principles of precision, transparency, and uncompromising service quality, we support organisations that depend on time-critical and sensitive deliveries — including healthcare providers, law firms, retail brands, corporate offices, laboratories, restaurants, and e-commerce businesses.
                </p>
                <p>
                  Our mission is to deliver a logistics experience built on trust and operational excellence. Every job is handled with care by trained, vetted drivers who understand the importance of confidentiality, punctuality, and professional conduct. Whether transporting medical samples, confidential documents, fragile goods, retail orders, or large multi-drop routes, we maintain strict standards of safety, accuracy, and reliability from collection to final delivery.
                </p>
                <p>
                  At Run Courier, we combine advanced technology with practical industry expertise to streamline the entire delivery process. Our platform offers real-time tracking, instant notifications, optimised routes, fast booking, proof of delivery, and dedicated support — giving our clients complete visibility and control over every shipment. We operate seven days a week and specialise in same-day, scheduled, multi-drop, and specialist courier services tailored to the unique requirements of modern businesses.
                </p>
                <p>
                  As a growing logistics provider, we remain committed to continuous improvement and building long-term professional partnerships. Our focus is simple: to be the courier service that businesses trust when it matters most — delivering every item with speed, security, and the highest level of professionalism.
                </p>
              </div>
            </div>
            <div className="bg-card rounded-xl p-8 border border-border">
              <div className="grid grid-cols-2 gap-6">
                {stats.map((stat, idx) => (
                  <div key={idx} className="text-center p-4">
                    <div className="text-3xl font-bold text-primary mb-1">{stat.value}</div>
                    <div className="text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 bg-card">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Our Values</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              The principles that guide everything we do
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value, idx) => (
              <Card key={idx} className="border-0 shadow-none bg-transparent">
                <CardContent className="p-6 text-center">
                  <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <value.icon className="h-7 w-7 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">{value.title}</h3>
                  <p className="text-sm text-muted-foreground">{value.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold mb-6 text-center">Why Choose Us</h2>
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Truck className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Professional Fleet</h3>
                  <p className="text-muted-foreground">
                    Our fleet includes motorbikes, cars, and vans - equipped to handle 
                    any delivery size from documents to large parcels.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Vetted Drivers</h3>
                  <p className="text-muted-foreground">
                    All our drivers undergo thorough background checks, have valid 
                    licenses, and carry appropriate insurance for peace of mind.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <MapPin className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">UK-Wide Coverage</h3>
                  <p className="text-muted-foreground">
                    We cover all of London with same-day service and offer next-day 
                    delivery to anywhere in the United Kingdom.
                  </p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                  <Award className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">Industry Expertise</h3>
                  <p className="text-muted-foreground">
                    From medical specimens to legal documents, we understand the 
                    unique requirements of different industries.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
