import { Link } from 'wouter';
import { Mail, Phone, MapPin, Clock, ArrowRight } from 'lucide-react';
import { SiFacebook, SiTrustpilot, SiAppstore, SiGoogle } from 'react-icons/si';
import { SmoothImage } from '@/components/ui/smooth-image';
import logoImage from '@assets/run_courier_logo_opt.png';

const footerLinks = {
  services: [
    { href: '/services/same-day',      label: 'Same Day Delivery' },
    { href: '/services/multi-drop',    label: 'Multi-Drop' },
    { href: '/services/return-trip',   label: 'Return Trip' },
    { href: '/services/scheduled',     label: 'Scheduled' },
    { href: '/services/medical',       label: 'Medical Courier' },
    { href: '/services/legal',         label: 'Legal Courier' },
    { href: '/services/retail',        label: 'Retail & E-commerce' },
    { href: '/services/restaurants',   label: 'Restaurant Delivery' },
  ],
  seo: [
    { href: '/same-day-courier-london',    label: 'Same Day Courier London' },
    { href: '/urgent-courier-london',      label: 'Urgent Courier London' },
    { href: '/courier-service-london',     label: 'Courier Service London' },
    { href: '/urgent-delivery-london',     label: 'Urgent Delivery London' },
    { href: '/medical-courier',            label: 'Medical Courier London' },
    { href: '/business-courier-services',  label: 'Business Courier' },
  ],
  company: [
    { href: '/about',           label: 'About Us' },
    { href: '/blog',            label: 'Blog & Insights' },
    { href: '/contact',         label: 'Contact' },
    { href: '/track',           label: 'Track Parcel' },
    { href: '/api-integration', label: 'API Integration' },
    { href: '/support',         label: 'Support & Help' },
  ],
  portals: [
    { href: '/login',         label: 'Customer Login' },
    { href: '/driver/login',  label: 'Driver Login' },
    { href: '/admin/login',   label: 'Admin Login' },
    { href: '/driver/signup', label: 'Become a Driver' },
  ],
  legal: [
    { href: '/terms',          label: 'Terms & Conditions' },
    { href: '/privacy',        label: 'Privacy Policy' },
    { href: '/pricing-policy', label: 'Pricing Policy' },
  ],
};

export function Footer() {
  return (
    <footer className="bg-[#0a1628] text-white">

      {/* ── Main grid ── */}
      <div className="container mx-auto px-4 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">

          {/* Brand + contact */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-5" data-testid="footer-logo-link">
              <SmoothImage
                src={logoImage}
                alt="Run Courier"
                className="h-9 w-9 object-cover rounded-lg overflow-hidden"
                wrapperClassName="h-9 w-9 flex-shrink-0 rounded-lg overflow-hidden"
                data-testid="footer-logo-image"
              />
              <span className="font-bold text-base tracking-tight text-white">
                RUN COURIER<sup className="text-xs ml-0.5 opacity-70">™</sup>
              </span>
            </Link>

            <p className="text-sm text-white/60 mb-6 max-w-xs leading-relaxed">
              Fast, reliable same-day courier services across London and the UK. Available 24/7, 365 days a year.
            </p>

            <ul className="space-y-3 mb-6">
              <li className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-[#48cae4] flex-shrink-0" />
                <a href="tel:+447311121217" className="text-white/80 hover:text-white transition-colors font-medium">
                  +44 7311 121 217
                </a>
              </li>
              <li className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-[#48cae4] flex-shrink-0" />
                <a href="mailto:info@runcourier.co.uk" className="text-white/80 hover:text-white transition-colors">
                  info@runcourier.co.uk
                </a>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <MapPin className="h-4 w-4 text-[#48cae4] flex-shrink-0 mt-0.5" />
                <span className="text-white/60">112 Bridgwater Road, Ruislip, London HA4 6LW</span>
              </li>
              <li className="flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-[#48cae4] flex-shrink-0" />
                <span className="text-white/60">24/7 — 365 Days a Year</span>
              </li>
            </ul>

            {/* Social icons */}
            <div className="flex items-center gap-4">
              <a
                href="https://www.facebook.com/profile.php?id=61576739843460"
                target="_blank" rel="noopener noreferrer"
                className="text-white/40 hover:text-[#1877F2] transition-colors"
                aria-label="Facebook"
                data-testid="footer-facebook"
              >
                <SiFacebook className="h-5 w-5" />
              </a>
              <a
                href="https://uk.trustpilot.com/review/runcourier.co.uk"
                target="_blank" rel="noopener noreferrer"
                className="text-white/40 hover:text-[#00b67a] transition-colors"
                aria-label="Trustpilot"
                data-testid="footer-trustpilot"
              >
                <SiTrustpilot className="h-5 w-5" />
              </a>
              <a
                href="https://www.google.com/maps/place/RUN+COURIER/@51.5597064,-0.4078805,17z"
                target="_blank" rel="noopener noreferrer"
                className="text-white/40 hover:text-[#4285F4] transition-colors"
                aria-label="Google Maps"
                data-testid="footer-google"
              >
                <SiGoogle className="h-5 w-5" />
              </a>
              <a
                href="https://apps.apple.com/app/run-courier-driver/id6756506175"
                target="_blank" rel="noopener noreferrer"
                className="text-white/40 hover:text-white transition-colors"
                aria-label="App Store"
                data-testid="footer-appstore"
              >
                <SiAppstore className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Services */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-4">Services</h4>
            <ul className="space-y-2.5">
              {footerLinks.services.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-white/60 hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* London Pages */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-4">London</h4>
            <ul className="space-y-2.5 mb-6">
              {footerLinks.seo.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-white/60 hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-4">Portals</h4>
            <ul className="space-y-2.5">
              {footerLinks.portals.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-white/60 hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company + Legal */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-4">Company</h4>
            <ul className="space-y-2.5 mb-6">
              {footerLinks.company.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-white/60 hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-white/40 mb-4">Legal</h4>
            <ul className="space-y-2.5">
              {footerLinks.legal.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-white/60 hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div className="border-t border-white/10">
        <div className="container mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-white/40">
            © {new Date().getFullYear()} Run Courier Ltd. All rights reserved.
          </p>
          <div className="flex items-center gap-1 text-xs text-white/40">
            <span>Registered in England & Wales</span>
            <span className="mx-2">·</span>
            <Link href="/terms" className="hover:text-white/70 transition-colors">Terms</Link>
            <span className="mx-2">·</span>
            <Link href="/privacy" className="hover:text-white/70 transition-colors">Privacy</Link>
            <span className="mx-2">·</span>
            <Link href="/pricing-policy" className="hover:text-white/70 transition-colors">Pricing Policy</Link>
          </div>
        </div>
      </div>

    </footer>
  );
}
