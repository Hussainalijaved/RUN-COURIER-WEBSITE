import { PublicLayout } from '@/components/layout/PublicLayout';

export default function Privacy() {
  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
        
        <div className="prose prose-gray dark:prose-invert max-w-none">
          <p className="text-muted-foreground mb-8">
            Last updated: {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Introduction</h2>
            <p className="text-muted-foreground">
              Run Courier ("we", "our", "us") is committed to protecting your privacy. 
              This policy explains how we collect, use, and safeguard your personal information 
              when you use our courier services and platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Information We Collect</h2>
            <p className="text-muted-foreground mb-4">We collect the following types of information:</p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Personal Details:</strong> Name, email, phone number, addresses</li>
              <li><strong>Payment Information:</strong> Card details (processed securely via Stripe)</li>
              <li><strong>Delivery Information:</strong> Pickup and delivery addresses, recipient details</li>
              <li><strong>Driver Information:</strong> ID documents, vehicle details, location data</li>
              <li><strong>Usage Data:</strong> How you interact with our platform</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>To provide and manage courier services</li>
              <li>To process payments and send invoices</li>
              <li>To communicate about your deliveries</li>
              <li>To improve our services and user experience</li>
              <li>To comply with legal obligations</li>
              <li>To prevent fraud and ensure security</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Location Data</h2>
            <p className="text-muted-foreground">
              For drivers, we collect real-time location data to enable live tracking for customers 
              and efficient job dispatch. This data is only collected while the driver is on duty 
              and is essential for our service operation.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Data Sharing</h2>
            <p className="text-muted-foreground mb-4">We may share your data with:</p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Drivers:</strong> Necessary delivery information only</li>
              <li><strong>Customers:</strong> Driver name, vehicle, and live location during delivery</li>
              <li><strong>Payment Processors:</strong> Stripe for secure payment processing</li>
              <li><strong>Legal Authorities:</strong> When required by law</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Data Security</h2>
            <p className="text-muted-foreground">
              We implement industry-standard security measures including encryption, 
              secure servers, and access controls. Payment information is never stored 
              on our servers - it's handled directly by Stripe.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Your Rights</h2>
            <p className="text-muted-foreground mb-4">Under GDPR, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Access your personal data</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to processing</li>
              <li>Data portability</li>
              <li>Withdraw consent</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Cookies</h2>
            <p className="text-muted-foreground">
              We use essential cookies for site functionality and optional analytics cookies 
              to improve our service. You can manage cookie preferences in your browser settings.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. Data Retention</h2>
            <p className="text-muted-foreground">
              We retain your data for as long as necessary to provide our services and comply 
              with legal obligations. Delivery records are kept for 7 years for accounting purposes. 
              You may request deletion at any time, subject to legal requirements.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Contact Us</h2>
            <p className="text-muted-foreground">
              For privacy-related inquiries or to exercise your rights, contact our Data Protection Officer at:
            </p>
            <p className="text-muted-foreground mt-2">
              Email: privacy@runcourier.co.uk<br />
              Phone: 0800 123 4567<br />
              Address: 123 Courier Lane, London, EC1A 1BB
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">11. Changes to This Policy</h2>
            <p className="text-muted-foreground">
              We may update this policy periodically. Significant changes will be communicated 
              via email or platform notification. Continued use of our services constitutes 
              acceptance of the updated policy.
            </p>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
}
