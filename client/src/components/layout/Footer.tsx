import { Link } from 'wouter';
import { Mail, Phone, MapPin, Clock } from 'lucide-react';
import { SiWhatsapp, SiFacebook, SiTrustpilot, SiAppstore } from 'react-icons/si';
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
                <span>+44 7311 121 217</span>
                <a 
                  href="https://wa.me/447311121217" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-green-500 hover:text-green-600 transition-colors"
                  data-testid="whatsapp-link-1"
                >
                  <SiWhatsapp className="h-4 w-4" />
                </a>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-primary" />
                <span>+44 7862 771 999</span>
                <a 
                  href="https://wa.me/447862771999" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-green-500 hover:text-green-600 transition-colors"
                  data-testid="whatsapp-link-2"
                >
                  <SiWhatsapp className="h-4 w-4" />
                </a>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-primary" />
                <span>info@runcourier.co.uk</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="h-4 w-4 text-primary" />
                <span>112 Bridgwater Road, London, UK, HA4 6LW</span>
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
          <div className="flex items-center gap-6">
            <span className="text-xs text-muted-foreground">
              Trusted by 10,000+ businesses across the UK
            </span>
            <a 
              href="https://www.facebook.com/profile.php?id=61576739843460" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 transition-colors"
              data-testid="facebook-link"
            >
              <SiFacebook className="h-5 w-5" />
            </a>
            <a 
              href="https://uk.trustpilot.com/review/runcourier.co.uk" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-green-500 hover:text-green-600 transition-colors"
              data-testid="trustpilot-link"
            >
              <SiTrustpilot className="h-5 w-5" />
            </a>
            <a 
              href="https://apps.apple.com/gb/app/run-courier/id6752310068" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
              data-testid="appstore-link"
            >
              <SiAppstore className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
