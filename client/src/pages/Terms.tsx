import { PublicLayout } from '@/components/layout/PublicLayout';

export default function Terms() {
  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Terms & Conditions</h1>
        
        <div className="prose prose-gray dark:prose-invert max-w-none">
          <p className="text-muted-foreground mb-8">
            Last updated: {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
            <p className="text-muted-foreground">
              These Terms and Conditions govern your use of the Run Courier platform and services. 
              By booking a delivery or using our services, you agree to these terms in full.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Service Description</h2>
            <p className="text-muted-foreground">
              Run Courier provides courier and delivery services across the United Kingdom. 
              Our services include same-day delivery, scheduled pickups, multi-drop deliveries, 
              and specialized transport for medical and legal documents.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. Booking and Payment</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>All prices are displayed in GBP and include VAT where applicable.</li>
              <li>Payment is required at the time of booking unless you have a business account.</li>
              <li>We accept major credit cards, debit cards, and approved business accounts.</li>
              <li>Quotes are estimates and final price may vary based on actual distance and conditions.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Cancellation Policy</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Cancellations made before driver dispatch: Full refund</li>
              <li>Cancellations after driver dispatch: 50% charge applies</li>
              <li>No-shows or refused deliveries: Full charge applies</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Liability and Insurance</h2>
            <p className="text-muted-foreground">
              All deliveries are covered by our goods-in-transit insurance up to £10,000 per consignment. 
              For higher value items, please contact us for additional coverage. We are not liable for:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mt-2">
              <li>Damage caused by inadequate packaging</li>
              <li>Delays due to circumstances beyond our control</li>
              <li>Prohibited or undeclared items</li>
              <li>Consequential losses</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Prohibited Items</h2>
            <p className="text-muted-foreground">
              We do not transport illegal items, hazardous materials (unless properly declared), 
              firearms, live animals, perishables (unless using appropriate service), or cash exceeding £500.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Driver Conduct</h2>
            <p className="text-muted-foreground">
              All our drivers are vetted, insured, and trained. They will handle your items with care. 
              If you experience any issues, please report them immediately through our support channels.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Dispute Resolution</h2>
            <p className="text-muted-foreground">
              Any disputes should first be raised with our customer service team. 
              If unresolved, disputes may be referred to the appropriate ombudsman or courts of England and Wales.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. Changes to Terms</h2>
            <p className="text-muted-foreground">
              We reserve the right to update these terms at any time. 
              Continued use of our services constitutes acceptance of any changes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Contact Us</h2>
            <p className="text-muted-foreground">
              For questions about these terms, please contact us at:
            </p>
            <p className="text-muted-foreground mt-2">
              Email: info@runcourier.co.uk<br />
              Phone: +44 20 4634 6100<br />
              Address: 112 Bridgwater Road, Ruislip, HA4 6LW
            </p>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}
