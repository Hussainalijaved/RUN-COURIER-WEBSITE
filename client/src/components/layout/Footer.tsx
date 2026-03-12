import { Link } from 'wouter';
import { Mail, Phone, MapPin, Clock } from 'lucide-react';
import { SiWhatsapp, SiFacebook, SiTrustpilot, SiAppstore, SiGoogleplay } from 'react-icons/si';
import { SmoothImage } from '@/components/ui/smooth-image';
import logoImage from '@assets/run_courier_logo.jpeg';

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
    { href: '/support', label: 'Support & Help' },
  ],
  legal: [
    { href: '/terms', label: 'Terms & Conditions' },
    { href: '/privacy', label: 'Privacy Policy' },
    { href: '/pricing-policy', label: 'Pricing & Service Policy' },
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
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div>
            <Link href="/" className="flex items-center gap-2 mb-4" data-testid="footer-logo-link">
              <SmoothImage 
                src={logoImage} 
                alt="Run Courier" 
                className="h-12 w-auto object-contain rounded-lg"
                wrapperClassName="h-12 flex-shrink-0"
                data-testid="footer-logo-image"
              />
              <span className="font-bold text-base tracking-tight">
                RUN COURIER<sup className="text-xs ml-0.5">™</sup>
              </span>
            </Link>
            
            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="font-medium">+44 20 4634 6100</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="font-medium">+44 7311 121 217</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="font-medium">+44 7862 771 999</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="font-medium">info@runcourier.co.uk</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                <span className="font-medium">112 Bridgwater Road, Ruislip</span>
              </div>
            </div>
            
            <div className="flex gap-3">
              <a 
                href="https://www.facebook.com/profile.php?id=61576739843460" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 transition-colors"
                data-testid="facebook-link-top"
              >
                <SiFacebook className="h-5 w-5" />
              </a>
              <a 
                href="https://uk.trustpilot.com/review/runcourier.co.uk" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-green-500 hover:text-green-600 transition-colors"
                data-testid="trustpilot-link-top"
              >
                <SiTrustpilot className="h-5 w-5" />
              </a>
              <a 
                href="https://apps.apple.com/app/run-courier-driver/id6756506175" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors"
                data-testid="appstore-link-top"
              >
                <SiAppstore className="h-5 w-5" />
              </a>
              <a 
                href="#" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors"
                data-testid="playstore-link-top"
              >
                <SiGoogleplay className="h-5 w-5" />
              </a>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-base">Services</h4>
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
            <h4 className="font-semibold mb-4 text-base">Company</h4>
            <ul className="space-y-2 mb-6">
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
            <h4 className="font-semibold mb-4 text-base">Legal</h4>
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
            <h4 className="font-semibold mb-4 text-base">Portals</h4>
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

        <div className="border-t border-border mt-8 pt-6">
          <p className="text-sm text-muted-foreground text-center">
            © {new Date().getFullYear()} Run Courier. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
