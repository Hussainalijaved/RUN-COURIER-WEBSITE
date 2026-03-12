import { PublicLayout } from '@/components/layout/PublicLayout';
import { Separator } from '@/components/ui/separator';
import { Link } from 'wouter';

const sections = [
  {
    number: '1',
    title: 'Pricing Structure',
    content: [
      'Run Courier prices are calculated automatically based on distance, vehicle type, service level, time of booking, waiting time, and delivery requirements.',
      'The price shown during booking is the total delivery price unless additional changes are required.',
      'Run Courier may adjust pricing if incorrect information is provided or if delivery conditions change.',
    ],
  },
  {
    number: '2',
    title: 'Service Types',
    content: [
      'Run Courier offers different service levels depending on urgency and availability.',
    ],
    subsections: [
      {
        title: 'Flexible Delivery',
        text: 'Flexible delivery is the most economical option. Jobs may be scheduled within available routes.',
      },
      {
        title: 'Standard Same-Day',
        text: 'Standard same-day delivery is the default service and will be dispatched as soon as possible.',
      },
      {
        title: 'Urgent Priority',
        text: 'Urgent delivery is prioritised and assigned to the nearest available driver.',
      },
      {
        title: 'Dedicated / Direct Delivery',
        text: 'Dedicated delivery means the driver will go directly from collection to delivery without additional stops.',
      },
    ],
    footer: 'Different service types may affect the final delivery price.',
  },
  {
    number: '3',
    title: 'Vehicle Pricing',
    content: [
      'Delivery cost depends on the selected vehicle type, including:',
    ],
    list: ['Motorbike', 'Car', 'Small Van', 'Medium Van'],
    footer: 'Each vehicle has different operating costs and capacity limits.',
  },
  {
    number: '4',
    title: 'Distance Charges',
    content: [
      'Distance is calculated automatically using mapping services.',
      'The total price may include base charge and per-mile rate.',
    ],
  },
  {
    number: '5',
    title: 'Waiting Time',
    content: [
      'Waiting time may be charged if the driver is required to wait at collection or delivery.',
      'Additional waiting charges may be added if waiting exceeds the free period.',
    ],
  },
  {
    number: '6',
    title: 'Multi-Drop Deliveries',
    content: [
      'Additional stops may increase the delivery price.',
      'Each extra drop may include additional distance and stop charges.',
    ],
  },
  {
    number: '7',
    title: 'Return Trips',
    content: [
      'Return deliveries may be charged separately depending on route and distance.',
    ],
  },
  {
    number: '8',
    title: 'Restricted Zones',
    content: [
      'Deliveries to congestion zones, restricted areas, or toll roads may include additional charges.',
    ],
  },
  {
    number: '9',
    title: 'Out of Hours',
    content: [
      'Deliveries outside normal hours, weekends, or bank holidays may include extra charges.',
    ],
  },
  {
    number: '10',
    title: 'Final Price',
    content: [
      'The final price is based on the information provided at booking.',
      'Run Courier reserves the right to adjust price if job details change.',
    ],
  },
  {
    number: '11',
    title: 'Acceptance',
    content: [
      'By placing a booking, the customer agrees to this Pricing & Service Policy.',
    ],
  },
];

export default function PricingPolicy() {
  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Pricing & Service Policy</h1>
          <p className="text-muted-foreground text-sm">
            Last updated: {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>

        <Separator className="mb-8" />

        <div className="space-y-10">
          {sections.map((section) => (
            <div key={section.number} data-testid={`section-pricing-${section.number}`}>
              <h2 className="text-lg font-semibold mb-3">
                {section.number}. {section.title}
              </h2>
              <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">
                {section.content.map((para, i) => (
                  <p key={i}>{para}</p>
                ))}

                {'subsections' in section && section.subsections && (
                  <div className="space-y-3 mt-3">
                    {section.subsections.map((sub) => (
                      <div key={sub.title}>
                        <p className="font-medium text-foreground">{sub.title}</p>
                        <p className="mt-0.5">{sub.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {'list' in section && section.list && (
                  <ul className="list-disc list-inside space-y-1 mt-1">
                    {section.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}

                {'footer' in section && section.footer && (
                  <p className="mt-2">{section.footer}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <Separator className="my-10" />

        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            For questions about pricing, please{' '}
            <Link href="/contact" className="text-primary underline underline-offset-4">
              contact us
            </Link>
            .
          </p>
          <p>
            See also:{' '}
            <Link href="/terms" className="text-primary underline underline-offset-4">
              Terms & Conditions
            </Link>{' '}
            &middot;{' '}
            <Link href="/privacy" className="text-primary underline underline-offset-4">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </PublicLayout>
  );
}
