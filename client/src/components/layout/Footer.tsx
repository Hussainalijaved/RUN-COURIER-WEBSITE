import { Link } from 'wouter';
import { Mail, Phone, MapPin, Clock } from 'lucide-react';
import logoImage from '@assets/LOGO APP 1_1764513632490.jpg';

const footerLinks = {
  services: [
    { href: '/services/same-day', label: 'Same Day Delivery' },
    { href: '/services/medical', label: 'Medical Delivery' },
    { href: '/services/retail', label: 'Retail & E-commerce' },
    { href: '/services/multi-drop', label: 'Multi-Drop' },
    { href: '/services/return-trip', label: 'Return Trip' },
  ],
  company: [
    { href: '/about', label: 'About Us' },
    { href: '/contact', label: 'Contact' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/track', label: 'Track Parcel' },
  ],
  legal: [
    { href: '/terms', label: 'Terms & Conditions' },
    { href: '/privacy', label: 'Privacy Policy' },
  ],
  portals: [
    { href: '/login', label: 'Customer Login' },
    { href: '/driver/login', label: 'Driver Login' },
    { href: '/admin/login', label: 'Admin Login' },
    { href: '/driver/signup', label: 'Become a Driver' },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4" data-testid="footer-logo-link">
              <img 
                src={logoImage} 
                alt="Run Courier" 
                className="h-12 w-auto object-contain"
                data-testid="footer-logo-image"
              />
            </Link>
            <p className="text-muted-foreground mb-6 max-w-sm">
              Fast, reliable courier services across the UK. Same-day delivery, medical transport, and more.
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-primary" />
                <span>0800 123 4567</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-primary" />
                <span>info@runcourier.co.uk</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="h-4 w-4 text-primary" />
                <span>London, United Kingdom</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-primary" />
                <span>24/7 Service Available</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Services</h4>
            <ul className="space-y-2">
              {footerLinks.services.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Company</h4>
            <ul className="space-y-2">
              {footerLinks.company.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <h4 className="font-semibold mb-4 mt-6">Legal</h4>
            <ul className="space-y-2">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4">Portals</h4>
            <ul className="space-y-2">
              {footerLinks.portals.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-border mt-12 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Run Courier. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">
              Trusted by 10,000+ businesses across the UK
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
