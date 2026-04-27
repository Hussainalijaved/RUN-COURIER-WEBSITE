import { useEffect } from 'react';
import { Link, useParams } from 'wouter';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Clock, Calendar, ChevronRight, Tag } from 'lucide-react';
import { setPageMeta } from '@/lib/seo';

import { SmoothBackground } from '@/components/ui/smooth-image';
import heroImage from '@assets/WhatsApp_Image_2025-09-06_at_20.08.04_32824ae2_1764877551595.jpg';
import article1Image from '@assets/WhatsApp_Image_2025-11-10_at_20.06.18_8ff558b5_1764877634513.jpg';
import article2Image from '@assets/WhatsApp_Image_2025-11-10_at_20.19.15_47cde5e4_1764877777467.jpg';
import article3Image from '@assets/WhatsApp_Image_2025-09-03_at_19.11.49_c1dbfbad_1764877241699.jpg';



/* ─────────────────────────────── Article content components ──── */

function Article1Content() {
  return (
    <div className="prose prose-gray dark:prose-invert lg:prose-lg max-w-none">
      <p>
        London is one of the world's busiest cities, and its businesses move at a pace that traditional postal services simply cannot keep up with. Same-day courier services have become an essential part of the capital's commercial infrastructure — enabling law firms to rush court documents, hospitals to transport urgent specimens, and retailers to fulfil last-minute orders before close of business. But how exactly does a same-day courier service work, and what should you expect when you book one?
      </p>

      <h2>What Is a Same-Day Courier Service?</h2>
      <p>
        A same-day courier service is a dedicated delivery solution where a driver collects your item and transports it directly to the recipient — all within the same working day. Unlike standard parcel services that consolidate multiple packages onto shared delivery routes, a same-day courier assigns a driver specifically to your consignment. The parcel goes directly from your door to the destination, with no sorting centres, no overnight warehousing, and no unnecessary stops along the way.
      </p>
      <p>
        At Run Courier, same-day deliveries are available around the clock, every day of the year. You can book for immediate collection or schedule a pickup for a specific time slot — whichever suits your business or personal needs.
      </p>

      <h2>Step-by-Step: How the Booking Process Works</h2>
      <p>
        Booking a same-day courier with Run Courier takes less than two minutes. Here's how the process unfolds from the moment you place your order:
      </p>
      <ol>
        <li><strong>Enter your postcodes.</strong> You provide the collection address and the delivery address. Our pricing engine instantly calculates the route distance and generates an upfront quote — no hidden fees, no surprises.</li>
        <li><strong>Choose your service level.</strong> Select from Flexible, Standard, Urgent, or Dedicated depending on how quickly you need the delivery to arrive. Urgent and Dedicated services prioritise your consignment above all others.</li>
        <li><strong>Confirm and pay.</strong> Secure payment is processed instantly via Stripe. Business customers can also choose our Pay Later option for weekly invoicing.</li>
        <li><strong>Driver dispatch.</strong> Within minutes of booking, our dispatch system locates the nearest available driver and assigns them to your job. You receive instant confirmation with driver details.</li>
        <li><strong>Live tracking begins.</strong> From the moment your driver is assigned, you can track their location in real time on our tracking page. You'll also receive push notifications at key stages — when the driver is on their way, when they've collected, and when delivery is confirmed.</li>
        <li><strong>Proof of delivery.</strong> Your driver captures a digital proof of delivery, including a photo and recipient signature, the moment the parcel is handed over. This is immediately available in your account dashboard.</li>
      </ol>

      <h2>What Vehicles Are Available?</h2>
      <p>
        Not all deliveries are the same size, and neither is our fleet. Run Courier operates a diverse range of vehicles to match every consignment:
      </p>
      <ul>
        <li><strong>Motorbikes</strong> — perfect for documents, small packages, and anything that needs to cut through London traffic at speed.</li>
        <li><strong>Cars</strong> — suitable for medium-sized items, confidential parcels, and deliveries where presentation matters.</li>
        <li><strong>Small vans</strong> — for larger consignments, multi-item shipments, and deliveries that need careful handling.</li>
        <li><strong>Larger vans</strong> — for bulk deliveries, equipment, or multiple-drop routes across London and beyond.</li>
      </ul>
      <p>
        When you book, you select the vehicle type that best matches your item's size and weight. Our pricing tool uses this to calculate your quote accurately.
      </p>

      <h2>Real-Time GPS Tracking and Notifications</h2>
      <p>
        One of the biggest advantages of using a professional same-day courier is full visibility over your delivery. Run Courier's platform provides live GPS tracking so you — and your recipient, if you choose to share the link — can monitor progress in real time. There are no approximate delivery windows to guess at. You see exactly where your driver is on the map, and you receive automatic notifications at every key milestone: collection, en-route, and delivered.
      </p>
      <p>
        For businesses, this level of visibility is invaluable. If you're sending time-sensitive documents to a client or coordinating a delivery as part of a larger operational workflow, knowing the exact status of your parcel eliminates uncertainty and allows you to plan accordingly.
      </p>

      <h2>Who Uses Same-Day Courier Services in London?</h2>
      <p>
        The breadth of industries that rely on same-day couriers in London is remarkable. Among our most frequent customers:
      </p>
      <ul>
        <li><strong>Law firms</strong> sending contracts, court bundles, and signed agreements that must arrive the same day.</li>
        <li><strong>NHS trusts and private hospitals</strong> transporting pathology samples, medication, and medical equipment.</li>
        <li><strong>E-commerce businesses</strong> offering premium same-day delivery to London postcodes as a competitive differentiator.</li>
        <li><strong>Financial institutions</strong> moving sensitive documents between offices and regulatory bodies.</li>
        <li><strong>Retail businesses</strong> fulfilling urgent orders or replenishing store stock with emergency deliveries from a warehouse.</li>
        <li><strong>Individuals</strong> who need to send a gift, collect a forgotten item, or return something urgently.</li>
      </ul>

      <h2>How Collection Times Work</h2>
      <p>
        At Run Courier, we commit to collection within 60 minutes of booking for immediate same-day orders. In practice, during normal operating hours and across central London, the average collection time is considerably shorter. Our driver network is distributed across the city, meaning a nearby driver is almost always available to accept the job promptly.
      </p>
      <p>
        If you'd like to pre-book a pickup for later in the day or at a specific time, our scheduled booking option lets you plan ahead with full flexibility. The driver arrives within the time slot you've specified.
      </p>

      <h2>Conclusion</h2>
      <p>
        Same-day courier services in London have evolved into a sophisticated, technology-driven industry. With transparent pricing, live GPS tracking, digital proof of delivery, and a professional vetted driver network, Run Courier makes it simple to send anything — anywhere in London or across the UK — with confidence and speed. Whether it's a single urgent document or a regular high-volume delivery contract, the process is designed to be as straightforward as possible.
      </p>
      <p>
        Ready to experience it yourself? Get an instant quote in under a minute.
      </p>
    </div>
  );
}

function Article2Content() {
  return (
    <div className="prose prose-gray dark:prose-invert lg:prose-lg max-w-none">
      <p>
        In business, time is not just money — it can be the difference between winning and losing a contract, maintaining a critical supply chain, or meeting a regulatory deadline. Urgent delivery solutions exist precisely for these moments: when standard postal timelines are not an option and when the consequences of a late delivery are too significant to risk. This article explores what urgent delivery means in practice, which industries depend on it most, and how businesses can access fast, reliable urgent courier services in London and across the UK.
      </p>

      <h2>What Counts as an Urgent Delivery?</h2>
      <p>
        Urgent delivery is generally understood as any shipment where time is the primary constraint — where the consignment must arrive within hours rather than days. In the courier industry, this typically means a same-day service with a priority or dedicated designation, ensuring the driver's sole focus is your delivery from the moment of collection until it reaches its destination.
      </p>
      <p>
        At Run Courier, we offer four service tiers to accommodate different levels of urgency. Our Urgent and Dedicated service levels are designed specifically for situations where every minute matters. A dedicated direct service means no other pickups, no route diversions — your parcel travels point to point as quickly as the roads allow.
      </p>

      <h2>Industries That Rely on Urgent Delivery</h2>

      <h3>Legal Services</h3>
      <p>
        Law firms across London are among the heaviest users of urgent courier services. Court filing deadlines are absolute — a document received at 16:31 when the court office closes at 16:30 can jeopardise an entire case. Legal couriers must also navigate strict chain-of-custody requirements: documents must be delivered intact, signed for, and evidenced. Run Courier provides digital signature capture and a timestamped proof of delivery for every job, giving solicitors and barristers the audit trail they need.
      </p>

      <h3>Healthcare and Pharmaceuticals</h3>
      <p>
        Medical specimens, prescription medication, blood products, and urgent surgical equipment cannot wait for standard delivery windows. Healthcare professionals require a courier partner that understands the gravity of each consignment and responds with the appropriate level of urgency. Our drivers are trained to handle medical deliveries with care, and our dispatch system prioritises healthcare jobs appropriately.
      </p>

      <h3>Financial Services</h3>
      <p>
        Banks, insurance companies, and financial brokers regularly need to move signed documents, wet-signature agreements, and sensitive financial records between offices, clients, and regulatory bodies. When a transaction depends on a signature being in the right place by a specific time, a reliable urgent courier is an essential business tool.
      </p>

      <h3>E-Commerce and Retail</h3>
      <p>
        Consumer expectations around delivery have risen dramatically. Many London-based e-commerce businesses now offer same-day delivery as a premium service tier. When an order comes in by midday, the ability to dispatch a driver immediately — and have the product in the customer's hands by early evening — is a powerful competitive advantage. Retailers also use urgent couriers to replenish store stock, deliver to pop-up locations, or fulfil corporate gifting orders on tight timelines.
      </p>

      <h3>Event Management and Production</h3>
      <p>
        The events industry lives and dies by its schedules. A missing prop, a late-arriving guest speaker's materials, or a catering supplier running behind — these situations demand an immediate, reliable logistics solution. Urgent couriers are the invisible backbone that keeps events running smoothly when last-minute logistics go wrong.
      </p>

      <h2>How Urgent Courier Services Differ from Standard Delivery</h2>
      <p>
        Standard parcel carriers operate on consolidated routes: your parcel is picked up alongside many others, sorted at a depot, routed through a network, and eventually delivered — typically the next working day or later. Urgent courier services bypass all of this. A dedicated driver collects your consignment and drives directly to the recipient. There is no sorting, no handoffs, and no shared routing. The result is dramatically shorter transit times and far greater reliability.
      </p>
      <p>
        The trade-off is cost: urgent couriers charge more than standard parcel services. But for any business that has calculated the true cost of a missed deadline — a lost contract, a regulatory fine, a client relationship damaged beyond repair — the premium is almost always justified.
      </p>

      <h2>Real-Time Visibility for Business Customers</h2>
      <p>
        Run Courier's platform provides live GPS tracking for every delivery, regardless of service level. For urgent deliveries in particular, this visibility is essential. Operations managers can monitor a critical shipment in real time, confirm collection has taken place, and share a tracking link with the recipient so they can prepare for arrival. Instant delivery confirmation with a digital proof of delivery is available the moment the handover is complete.
      </p>
      <p>
        Business customers with an account can also view their full delivery history, download proof of delivery documents, and manage billing — all from a single dashboard.
      </p>

      <h2>Setting Up a Business Account</h2>
      <p>
        For companies that use urgent delivery services regularly, a Run Courier business account offers significant advantages. Business accounts provide access to consolidated monthly invoicing, volume-based pricing, priority booking, and a dedicated account contact for operational support. Pay Later options allow approved business customers to receive weekly invoices rather than paying per delivery — streamlining the administrative burden for finance teams.
      </p>
      <p>
        Setting up an account takes minutes. Once approved, you can book deliveries, manage jobs, and access billing all from the business dashboard.
      </p>

      <h2>Conclusion</h2>
      <p>
        Urgent delivery solutions are not a luxury — for many businesses, they are an operational necessity. Whether you need a single critical document delivered across London in under an hour, or you require a reliable same-day logistics partner for your entire business operation, Run Courier is built to meet that need. Fast, tracked, insured, and available 24/7 — when urgency is the requirement, we deliver.
      </p>
    </div>
  );
}

function Article3Content() {
  return (
    <div className="prose prose-gray dark:prose-invert lg:prose-lg max-w-none">
      <p>
        Healthcare logistics is unlike any other sector of the courier industry. The items being transported are not simply packages — they may be life-saving medication, irreplaceable diagnostic samples, or critical medical equipment needed in an emergency. Getting them to the right place, at the right time, in the right condition is not a commercial convenience — it is a matter of patient safety. This article explores why specialised medical courier services matter, what they carry, and what standards they must meet.
      </p>

      <h2>The Unique Demands of Healthcare Logistics</h2>
      <p>
        The healthcare sector places exceptionally demanding requirements on any logistics partner. Where a standard courier might be forgiven for a minor delay, a medical courier error can have serious consequences — a delayed diagnostic sample could mean a delayed diagnosis; a late delivery of surgical equipment could postpone a procedure. Medical couriers must therefore combine the speed of an urgent same-day service with the reliability and compliance consciousness of a regulated healthcare supplier.
      </p>
      <p>
        In London, where hospitals, clinics, laboratories, and pharmaceutical companies are concentrated across a dense urban environment, the demand for fast and reliable medical courier services is particularly high. NHS trusts, private hospitals, clinical research organisations, and specialist pharmacies all depend on courier partners who understand the context of what they are carrying.
      </p>

      <h2>What Do Medical Couriers Transport?</h2>
      <p>
        Medical couriers handle a wide range of consignments, each with its own handling requirements:
      </p>
      <ul>
        <li><strong>Pathology samples</strong> — blood, tissue, urine, and other biological specimens collected from patients and transported to laboratories for testing. These require careful handling to preserve the integrity of the sample and are time-sensitive by nature.</li>
        <li><strong>Pharmaceutical supplies</strong> — prescription medication, vaccines, controlled drugs (under appropriate arrangements), and over-the-counter supplies being moved between pharmacies, hospitals, or from a central warehouse.</li>
        <li><strong>Medical devices and equipment</strong> — surgical instruments, diagnostic equipment, prosthetics, and other healthcare devices that need to reach their destination intact and on time.</li>
        <li><strong>Blood products</strong> — donor blood, plasma, platelets, and other blood derivatives that may be required urgently for transfusions or surgical procedures.</li>
        <li><strong>Clinical trial materials</strong> — pharmaceutical companies and contract research organisations use medical couriers to transport trial medication, patient samples, and regulatory documentation between sites.</li>
        <li><strong>Prescriptions and patient medications</strong> — home delivery of prescriptions for patients with mobility difficulties or chronic conditions who cannot collect their medication in person.</li>
      </ul>

      <h2>Chain of Custody and Compliance</h2>
      <p>
        In healthcare logistics, chain of custody refers to the documented, unbroken sequence of possession and handling of a consignment from collection to delivery. Every handover must be recorded, every recipient must be identifiable, and the entire process must be traceable in the event of a query or incident.
      </p>
      <p>
        Run Courier's platform provides a complete digital chain of custody for every medical delivery. The driver photographs the consignment at collection, captures the recipient's signature at delivery, and the entire record — including GPS-stamped timestamps — is immediately available to the booker. For organisations subject to regulatory oversight, this audit trail is not optional — it is a compliance requirement.
      </p>

      <h2>Speed and Reliability in Medical Delivery</h2>
      <p>
        Many medical consignments are time-critical. A pathology sample collected from a patient at 9am may need to reach a laboratory 12 miles away by 11am to be included in that day's testing run — missing the cutoff means the patient waits another 24 hours for results. This is not an inconvenience; for a patient awaiting a cancer diagnosis or monitoring a chronic condition, it is a deeply significant delay.
      </p>
      <p>
        Run Courier's 60-minute collection promise and dedicated direct routing ensures medical consignments move as quickly as possible. Our GPS-tracked fleet operates 24 hours a day, seven days a week — because healthcare doesn't follow office hours, and neither do we.
      </p>

      <h2>The Importance of DBS Checked, Professional Drivers</h2>
      <p>
        Medical environments require that anyone entering them, even briefly, meets certain vetting standards. All Run Courier drivers undergo thorough DBS (Disclosure and Barring Service) checks and identity verification before they are approved to operate on the platform. This gives healthcare clients confidence that the individuals handling their consignments — and potentially entering clinical environments — are trustworthy, vetted professionals.
      </p>
      <p>
        Driver professionalism extends beyond vetting. Our drivers are briefed on the importance of medical logistics and understand that the packages they carry may have significant consequences for the patients involved. Discretion, care, and punctuality are non-negotiable standards.
      </p>

      <h2>NHS and Private Sector Healthcare Clients</h2>
      <p>
        Run Courier works with both NHS trusts and private healthcare providers across London and the wider UK. NHS organisations benefit from our transparent pricing and digital invoicing, which simplifies procurement and accounts payable processes. Private clinics and healthcare businesses value the flexibility of on-demand booking combined with the option of business accounts for consolidated billing.
      </p>
      <p>
        Clinical research organisations and pharmaceutical companies use our platform to manage inter-site logistics for clinical trials, where documentation and sample integrity are paramount. Our digital proof of delivery system provides the evidence trail that regulatory bodies require.
      </p>

      <h2>Why Choose a Specialist Medical Courier Over a Generic Service?</h2>
      <p>
        Not every courier service is appropriate for healthcare logistics. Generic parcel carriers consolidate shipments, handle packages through automated sorting systems, and operate on standard delivery timelines that are incompatible with medical urgency. A medical consignment sent through a standard carrier risks being lost in a depot, mishandled, or delayed without any meaningful mechanism for escalation.
      </p>
      <p>
        A dedicated same-day medical courier service like Run Courier provides point-to-point transport, real-time tracking, immediate escalation for any issues, and a professional driver who understands the significance of what they are carrying. For healthcare organisations, this is not simply a service preference — it is a risk management decision.
      </p>

      <h2>Conclusion</h2>
      <p>
        Medical courier services play a vital, often invisible role in the healthcare system. They enable hospitals to run efficiently, laboratories to process samples promptly, pharmacies to serve patients effectively, and clinical researchers to gather data reliably. For any healthcare organisation that relies on third-party logistics, choosing a professional, compliant, and genuinely fast medical courier service is one of the most important operational decisions it can make.
      </p>
      <p>
        Run Courier is proud to serve London's healthcare community with the speed, care, and professionalism that patients ultimately depend upon.
      </p>
    </div>
  );
}

/* ─────────────────────────────── Article 4 ──── */

function Article4Content() {
  return (
    <div className="prose prose-gray dark:prose-invert lg:prose-lg max-w-none">
      <p>
        With hundreds of courier companies operating in London, choosing the right one for your business or personal needs can feel overwhelming. The best courier service in London isn't simply the cheapest — it's the one that combines speed, reliability, transparency, and professionalism in a way that fits your specific requirements. In this guide, we break down what makes a courier service truly excellent and how to evaluate the options available to you.
      </p>

      <h2>What Makes the Best Courier Service in London?</h2>
      <p>
        The most important qualities of a reliable courier service in London centre on five core factors: speed of collection, reliability of delivery, real-time visibility, professional drivers, and transparent pricing. A courier that excels in all five areas will consistently deliver a positive experience — for both the sender and the recipient.
      </p>
      <ul>
        <li><strong>Speed of collection</strong> — The best same day couriers in London commit to collection within 60 minutes of booking and consistently meet that promise. Run Courier guarantees collection within 60 minutes for immediate bookings, with an average response time considerably shorter in central London.</li>
        <li><strong>Reliability</strong> — The parcel should arrive at the correct address, intact, within the agreed timeframe. Look for services with a published on-time delivery record and clear escalation processes when things go wrong.</li>
        <li><strong>Live GPS tracking</strong> — The best courier services give both the sender and recipient real-time visibility of the driver's location and delivery status. This eliminates guesswork and allows businesses to plan around a delivery.</li>
        <li><strong>Professional, vetted drivers</strong> — A great courier service only works with DBS-checked, insured, and professionally trained drivers who represent your brand at the door.</li>
        <li><strong>Transparent pricing</strong> — Fixed, upfront quotes with no hidden fees are the gold standard. Variable pricing, fuel surcharges added after booking, and opaque billing all erode trust.</li>
      </ul>

      <h2>Same Day Courier Service in London — The Key Differentiator</h2>
      <p>
        Not all courier services in London offer genuine same-day delivery. Many "same day" services are actually next-day services with a premium label. The best same day courier London companies operate around the clock, dispatch drivers immediately on booking, and route consignments directly — without intermediate sorting or relay points.
      </p>
      <p>
        Run Courier's same day courier service is point-to-point by design. Your item is collected by a single driver who delivers it directly to the recipient, without any stops or handoffs. This is the only way to guarantee both speed and security for time-sensitive consignments.
      </p>

      <h2>Courier Service Near Me — Why Local Network Matters</h2>
      <p>
        When you search for a courier service near me in London, the quality of the answer depends on how densely distributed that courier's driver network is across the capital. A courier company with drivers only in central London will have poor response times for businesses in outer boroughs like Bromley, Enfield, Ealing, or Havering.
      </p>
      <p>
        Run Courier maintains an active driver network across all London zones — from Zone 1 in the heart of the city to the outer boroughs of Zones 4, 5, and 6. This means wherever you are in London, there's likely a professional driver within a short distance of your collection address, ready to be dispatched.
      </p>

      <h2>London Areas Served — Full Coverage Across the Capital</h2>
      <p>
        A truly reliable courier service in London should serve every part of the city equally well. This includes:
      </p>
      <ul>
        <li><strong>Central London</strong> — EC, WC, W1, SW1, SE1 and all City of London postcodes. High-frequency demand from law firms, financial institutions, and corporate offices.</li>
        <li><strong>North London</strong> — N1 through N22, covering Islington, Camden, Hackney, Haringey, Barnet, and surrounding areas.</li>
        <li><strong>South London</strong> — SE and SW postcodes including Southwark, Lambeth, Wandsworth, Croydon, and Bromley.</li>
        <li><strong>East London</strong> — E1 through E18, covering Canary Wharf, Stratford, Newham, Waltham Forest, and Havering.</li>
        <li><strong>West London</strong> — W, TW, UB, and HA postcodes including Hammersmith, Ealing, Hounslow, Harrow, and Hillingdon.</li>
      </ul>
      <p>
        Run Courier serves all of these areas with the same standard of service — same response times, same upfront pricing, same GPS tracking, and the same commitment to professional delivery.
      </p>

      <h2>Business vs Personal Courier Services</h2>
      <p>
        The best courier service for a business is not always the same as for an individual. Business courier services typically require account billing, consolidated invoicing, multi-drop routing, volume pricing, and dedicated account management. Personal users, on the other hand, generally need a simple one-off booking experience with transparent pricing and no commitment.
      </p>
      <p>
        Run Courier serves both audiences. Individual customers can book online in under two minutes and pay by card. Business customers can apply for a Run Courier account, unlocking weekly invoice billing, pay-later functionality, and access to our API integration for seamless logistics management within their own systems.
      </p>

      <h2>Delivery Service London — How to Choose</h2>
      <p>
        When evaluating delivery services in London, compare them on the following criteria before making a decision:
      </p>
      <ol>
        <li>Is pricing shown upfront, or does the final charge differ from the quote?</li>
        <li>Is live GPS tracking included as standard, or an optional extra?</li>
        <li>Are drivers DBS checked and insured?</li>
        <li>What is the actual average collection time — not the headline promise?</li>
        <li>Is proof of delivery (photo and signature) provided automatically?</li>
        <li>Is the service available 24/7, or only during business hours?</li>
        <li>Is there a genuine human to contact if something goes wrong?</li>
      </ol>
      <p>
        Run Courier answers yes to every question on this list. Upfront prices, live tracking, DBS-checked drivers, sub-60-minute collection, automatic proof of delivery, 24/7 availability, and a real operations team you can reach by phone at any time.
      </p>

      <h2>Conclusion — The Best Courier Service in London</h2>
      <p>
        The best courier service in London is the one that delivers on its promises, every time. Speed matters — but so does reliability, transparency, and the confidence that your parcel is in safe hands from the moment it leaves your door to the moment it arrives at its destination.
      </p>
      <p>
        Run Courier has been built from the ground up to meet London's demanding logistics standards. Whether you need a fast same day courier in London, an urgent medical delivery, or a reliable business courier service with consolidated billing — we're ready to deliver.
      </p>
    </div>
  );
}

/* ─────────────────────────────── Article data ──── */

const articles = [
  {
    slug: 'how-same-day-courier-services-work-in-london',
    title: 'How Same-Day Courier Services Work in London',
    metaTitle: 'How Same-Day Courier Services Work in London | Run Courier Blog',
    metaDescription: 'Learn how same-day courier services work in London — from booking and driver dispatch to live GPS tracking and digital proof of delivery. A complete guide from Run Courier.',
    category: 'Guides',
    date: '20 March 2025',
    readTime: '7 min read',
    image: article1Image,
    excerpt: 'Same-day courier services are the backbone of London\'s fast-moving business landscape. Here\'s exactly how the process works — from booking to proof of delivery.',
    Content: Article1Content,
  },
  {
    slug: 'urgent-delivery-solutions-for-businesses',
    title: 'Urgent Delivery Solutions for Businesses',
    metaTitle: 'Urgent Delivery Solutions for Businesses | Run Courier Blog',
    metaDescription: 'Discover how urgent delivery solutions support London businesses — covering legal, medical, financial, and retail sectors. Learn when to use an urgent courier and how to set up a business account.',
    category: 'Business',
    date: '28 March 2025',
    readTime: '8 min read',
    image: article2Image,
    excerpt: 'When deadlines are absolute and delays have real consequences, urgent courier services provide the speed and reliability that businesses across London depend on.',
    Content: Article2Content,
  },
  {
    slug: 'why-medical-courier-services-are-important',
    title: 'Why Medical Courier Services Are Important',
    metaTitle: 'Why Medical Courier Services Are Important | Run Courier Blog',
    metaDescription: 'Medical courier services are critical to healthcare logistics in London. Learn what medical couriers carry, the compliance standards they must meet, and why the NHS and private sector rely on them.',
    category: 'Healthcare',
    date: '1 April 2025',
    readTime: '9 min read',
    image: article3Image,
    excerpt: 'Healthcare logistics is unlike any other sector of the courier industry. We explore why specialist medical courier services are essential — and what standards they must meet.',
    Content: Article3Content,
  },
  {
    slug: 'best-courier-service-in-london',
    title: 'Best Courier Service in London — How to Choose',
    metaTitle: 'Best Courier Service in London — How to Choose | Run Courier Blog',
    metaDescription: 'Looking for the best courier service in London? Learn the five qualities that separate great courier services from average ones — and how to choose the right one for your business.',
    category: 'Guides',
    date: '7 April 2025',
    readTime: '8 min read',
    image: article2Image,
    excerpt: 'With hundreds of couriers operating in London, finding the best one is a matter of knowing what to look for. Speed, reliability, live tracking, and transparent pricing — here\'s what separates the best from the rest.',
    Content: Article4Content,
  },
];

const categoryColors: Record<string, string> = {
  Guides: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  Business: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  Healthcare: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

/* ─────────────────────────────── Blog Index ──── */

export function BlogIndex() {
  useEffect(() => {
    setPageMeta(
      'Courier Blog — Insights & Guides | Run Courier',
      'Expert guides and insights on same-day courier services, urgent delivery solutions, and healthcare logistics in London from the Run Courier team.',
      '/blog',
    );
  }, []);

  return (
    <PublicLayout>
      <SmoothBackground
        src={heroImage}
        priority
        className="min-h-[320px] flex items-center"
        overlayClassName="bg-gradient-to-r from-[#0077B6]/75 via-[#0096C7]/65 to-[#00B4D8]/55"
      >
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-3xl mx-auto text-center text-white">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Courier Insights</h1>
            <p className="text-lg text-white/90">
              Expert guides, industry insights, and practical advice from the Run Courier team.
            </p>
          </div>
        </div>
      </SmoothBackground>

      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              {articles.map((article) => (
                <Link key={article.slug} href={`/blog/${article.slug}`}>
                  <Card className="h-full flex flex-col hover-elevate cursor-pointer overflow-hidden group">
                    <div className="h-48 overflow-hidden">
                      <img
                        src={article.image}
                        alt={article.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    <CardContent className="p-6 flex flex-col gap-3 flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${categoryColors[article.category]}`}>
                          {article.category}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {article.readTime}
                        </span>
                      </div>
                      <h2 className="font-bold text-lg leading-snug group-hover:text-[#0077B6] transition-colors">
                        {article.title}
                      </h2>
                      <p className="text-sm text-muted-foreground flex-1 leading-relaxed">
                        {article.excerpt}
                      </p>
                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {article.date}
                        </span>
                        <span className="text-xs font-medium text-[#0077B6] flex items-center gap-1">
                          Read more <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 bg-card border-t border-border">
        <div className="container mx-auto px-4">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-2xl font-bold mb-3">Need a Same-Day Courier?</h2>
            <p className="text-muted-foreground mb-6">
              Get an instant quote or book your delivery in under two minutes.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/quote">
                <Button size="lg" className="gap-2 bg-[#0077B6]">
                  Get a Quote <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/contact">
                <Button size="lg" variant="outline">
                  Contact Us
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

/* ─────────────────────────────── Individual Blog Post ──── */

export function BlogPost() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const article = articles.find((a) => a.slug === slug);

  useEffect(() => {
    if (article) {
      setPageMeta(article.metaTitle, article.metaDescription, `/blog/${article.slug}`);
    } else {
      document.title = 'Article Not Found | Run Courier Blog';
    }
  }, [article]);

  if (!article) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-24 text-center">
          <h1 className="text-3xl font-bold mb-4">Article Not Found</h1>
          <p className="text-muted-foreground mb-6">The article you're looking for doesn't exist.</p>
          <Link href="/blog">
            <Button>Back to Blog</Button>
          </Link>
        </div>
      </PublicLayout>
    );
  }

  const { Content } = article;
  const otherArticles = articles.filter((a) => a.slug !== slug);

  return (
    <PublicLayout>
      <div className="bg-card border-b border-border py-4">
        <div className="container mx-auto px-4">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
            <Link href="/blog" className="hover:text-foreground transition-colors">Blog</Link>
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="text-foreground truncate max-w-xs">{article.title}</span>
          </nav>
        </div>
      </div>

      <div className="h-64 md:h-80 overflow-hidden relative">
        <img
          src={article.image}
          alt={article.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/20 to-transparent" />
      </div>

      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto">
          <div className="-mt-12 relative z-10 bg-background rounded-xl border border-border p-6 md:p-10 mb-12">
            <div className="flex items-center gap-3 flex-wrap mb-4">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1 ${categoryColors[article.category]}`}>
                <Tag className="h-3 w-3" /> {article.category}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3" /> {article.date}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" /> {article.readTime}
              </span>
            </div>

            <h1 className="text-2xl md:text-3xl font-bold mb-6 leading-tight">
              {article.title}
            </h1>

            <Content />
          </div>

          <div className="border-t border-border pt-8 pb-12">
            <div className="bg-gradient-to-r from-[#0077B6] to-[#00B4D8] rounded-xl p-8 text-white text-center mb-10">
              <h2 className="text-2xl font-bold mb-2">Ready to Book a Delivery?</h2>
              <p className="text-white/85 mb-6 max-w-md mx-auto">
                Get an instant quote and book your same-day courier in under two minutes.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/quote">
                  <Button size="lg" className="bg-white text-[#0077B6] border-white font-semibold">
                    Get a Quote <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
                <Link href="/book">
                  <Button size="lg" variant="outline" className="border-white/60 text-white bg-white/10">
                    Book Now
                  </Button>
                </Link>
              </div>
            </div>

            {otherArticles.length > 0 && (
              <div>
                <h3 className="text-lg font-bold mb-5">More from the Blog</h3>
                <div className="grid sm:grid-cols-2 gap-5">
                  {otherArticles.map((other) => (
                    <Link key={other.slug} href={`/blog/${other.slug}`}>
                      <Card className="flex gap-4 p-4 hover-elevate cursor-pointer">
                        <img
                          src={other.image}
                          alt={other.title}
                          className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${categoryColors[other.category]}`}>
                            {other.category}
                          </span>
                          <p className="font-semibold text-sm mt-1 leading-snug line-clamp-2">
                            {other.title}
                          </p>
                          <span className="text-xs text-muted-foreground">{other.readTime}</span>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-8 text-center">
              <Link href="/blog">
                <Button variant="outline" className="gap-2">
                  <ChevronRight className="h-4 w-4 rotate-180" /> Back to Blog
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}
