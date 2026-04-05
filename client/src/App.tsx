import { Switch, Route, useLocation, Redirect } from "wouter";
import { useEffect, lazy, Suspense, startTransition } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import { BookingProvider } from "@/context/BookingContext";
import { ProtectedRoute, PublicOnlyRoute } from "@/components/ProtectedRoute";
import { FloatingButtons } from "@/components/FloatingButtons";
import { NavigationProgress } from "@/components/NavigationProgress";

function ScrollToTop() {
  const [location] = useLocation();
  
  useEffect(() => {
    window.scrollTo(0, 0);
    const scrollContainers = document.querySelectorAll('[data-scroll-container]');
    scrollContainers.forEach(container => {
      container.scrollTop = 0;
    });
    const mainElements = document.querySelectorAll('main');
    mainElements.forEach(main => {
      main.scrollTop = 0;
    });
  }, [location]);
  
  return null;
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]" data-testid="page-loader">
      <div className="w-40 h-0.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full w-1/2 bg-primary rounded-full origin-left" style={{ animation: 'progress 1.2s ease-in-out infinite' }} />
      </div>
    </div>
  );
}

function usePrefetchAllRoutes() {
  useEffect(() => {
    const timer = setTimeout(() => {
      startTransition(() => {
        import("@/pages/admin/AdminDashboard");
        import("@/pages/admin/AdminJobs");
        import("@/pages/admin/AdminDrivers");
        import("@/pages/admin/AdminApplications");
        import("@/pages/admin/AdminMap");
        import("@/pages/admin/AdminCreateJob");
        import("@/pages/admin/AdminCustomers");
        import("@/pages/admin/AdminDocuments");
        import("@/pages/admin/AdminDriverPayments");
        import("@/pages/admin/AdminInvoices");
        import("@/pages/admin/AdminPricing");
        import("@/pages/admin/AdminContracts");
        import("@/pages/admin/AdminNotices");
        import("@/pages/admin/AdminNotifications");
        import("@/pages/admin/AdminSupervisors");
        import("@/pages/admin/AdminProfile");
        import("@/pages/admin/AdminContacts");
        import("@/pages/admin/AdminRoutePlanner");
        import("@/pages/admin/AdminApiClients");
        import("@/pages/admin/AdminApiRequests");
        import("@/pages/admin/AdminApiLogs");
        import("@/pages/admin/AdminApiInvoices");
        import("@/pages/supervisor/SupervisorDashboard");
        import("@/pages/supervisor/SupervisorJobs");
        import("@/pages/supervisor/SupervisorMap");
        import("@/pages/supervisor/SupervisorDrivers");
        import("@/pages/supervisor/SupervisorCustomers");
        import("@/pages/supervisor/SupervisorInvoices");
        import("@/pages/supervisor/SupervisorHistory");
        import("@/pages/supervisor/SupervisorProfile");
        import("@/pages/customer/CustomerDashboard");
        import("@/pages/customer/CustomerOrders");
        import("@/pages/customer/CustomerProfile");
        import("@/pages/customer/CustomerInvoices");
        import("@/pages/driver/DriverDashboard");
        import("@/pages/driver/DriverJobs");
        import("@/pages/driver/DriverHistory");
        import("@/pages/driver/DriverDocuments");
        import("@/pages/driver/DriverProfile");
        import("@/pages/driver/DriverPayments");
        import("@/pages/driver/DriverNotices");
      });
    }, 100);
    return () => clearTimeout(timer);
  }, []);
}

import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Login, { AdminLogin } from "@/pages/Login";
import Signup, { DriverSignup, VendorSignup } from "@/pages/Signup";
import Quote from "@/pages/Quote";

const About = lazy(() => import("@/pages/About"));
const Contact = lazy(() => import("@/pages/Contact"));
const Track = lazy(() => import("@/pages/Track"));
const Terms = lazy(() => import("@/pages/Terms"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const PricingPolicy = lazy(() => import("@/pages/PricingPolicy"));
const AdminSignup = lazy(() => import("@/pages/AdminSignup"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const Book = lazy(() => import("@/pages/Book"));
const PaymentSuccess = lazy(() => import("@/pages/PaymentSuccess"));
const PaymentCancel = lazy(() => import("@/pages/PaymentCancel"));
const PaymentLink = lazy(() => import("@/pages/PaymentLink").then(m => ({ default: m.default })));
const PaymentLinkSuccess = lazy(() => import("@/pages/PaymentLink").then(m => ({ default: m.PaymentLinkSuccess })));
const InvoicePayment = lazy(() => import("@/pages/InvoicePayment"));
const Support = lazy(() => import("@/pages/Support"));

const SameDayService = lazy(() => import("@/pages/services/ServicePage").then(m => ({ default: m.SameDayService })));
const MedicalService = lazy(() => import("@/pages/services/ServicePage").then(m => ({ default: m.MedicalService })));
const LegalService = lazy(() => import("@/pages/services/ServicePage").then(m => ({ default: m.LegalService })));
const RetailService = lazy(() => import("@/pages/services/ServicePage").then(m => ({ default: m.RetailService })));
const MultiDropService = lazy(() => import("@/pages/services/ServicePage").then(m => ({ default: m.MultiDropService })));
const ReturnTripService = lazy(() => import("@/pages/services/ServicePage").then(m => ({ default: m.ReturnTripService })));
const ScheduledService = lazy(() => import("@/pages/services/ServicePage").then(m => ({ default: m.ScheduledService })));
const RestaurantsService = lazy(() => import("@/pages/services/ServicePage").then(m => ({ default: m.RestaurantsService })));

const SameDayCourierLondon = lazy(() => import("@/pages/seo/SeoServicePages").then(m => ({ default: m.SameDayCourierLondon })));
const MedicalCourierPage = lazy(() => import("@/pages/seo/SeoServicePages").then(m => ({ default: m.MedicalCourierPage })));
const BusinessCourierServices = lazy(() => import("@/pages/seo/SeoServicePages").then(m => ({ default: m.BusinessCourierServices })));
const UrgentDeliveryLondon = lazy(() => import("@/pages/seo/SeoServicePages").then(m => ({ default: m.UrgentDeliveryLondon })));

const BlogIndex = lazy(() => import("@/pages/blog/Blog").then(m => ({ default: m.BlogIndex })));
const BlogPost = lazy(() => import("@/pages/blog/Blog").then(m => ({ default: m.BlogPost })));

const AdminDashboard = lazy(() => import("@/pages/admin/AdminDashboard"));
const AdminDocuments = lazy(() => import("@/pages/admin/AdminDocuments"));
const AdminJobs = lazy(() => import("@/pages/admin/AdminJobs"));
const AdminDrivers = lazy(() => import("@/pages/admin/AdminDrivers"));
const AdminApplications = lazy(() => import("@/pages/admin/AdminApplications"));
const AdminMap = lazy(() => import("@/pages/admin/AdminMap"));
const AdminCreateJob = lazy(() => import("@/pages/admin/AdminCreateJob"));
const AdminCustomers = lazy(() => import("@/pages/admin/AdminCustomers"));
const AdminDriverPayments = lazy(() => import("@/pages/admin/AdminDriverPayments"));
const AdminBusinessQuote = lazy(() => import("@/pages/admin/AdminBusinessQuote"));
const AdminInvoices = lazy(() => import("@/pages/admin/AdminInvoices"));
const AdminPricing = lazy(() => import("@/pages/admin/AdminPricing"));
const AdminContracts = lazy(() => import("@/pages/admin/AdminContracts"));
const AdminNotices = lazy(() => import("@/pages/admin/AdminNotices"));
const AdminNotifications = lazy(() => import("@/pages/admin/AdminNotifications"));
const AdminSupervisors = lazy(() => import("@/pages/admin/AdminSupervisors"));
const AdminProfile = lazy(() => import("@/pages/admin/AdminProfile"));
const AdminContacts = lazy(() => import("@/pages/admin/AdminContacts"));
const PostcodeMap = lazy(() => import("@/pages/admin/PostcodeMap"));
const AdminRoutePlanner = lazy(() => import("@/pages/admin/AdminRoutePlanner"));
const AdminApiClients = lazy(() => import("@/pages/admin/AdminApiClients"));
const AdminApiRequests = lazy(() => import("@/pages/admin/AdminApiRequests"));
const AdminApiLogs = lazy(() => import("@/pages/admin/AdminApiLogs"));
const AdminApiInvoices = lazy(() => import("@/pages/admin/AdminApiInvoices"));
const ApiIntegration = lazy(() => import("@/pages/ApiIntegration"));
const ApiIntegrationRequest = lazy(() => import("@/pages/ApiIntegrationRequest"));
const Developers = lazy(() => import("@/pages/Developers"));

const SupervisorLogin = lazy(() => import("@/pages/supervisor/SupervisorLogin"));
const SupervisorRegister = lazy(() => import("@/pages/supervisor/SupervisorRegister"));
const SupervisorDashboard = lazy(() => import("@/pages/supervisor/SupervisorDashboard"));
const SupervisorJobs = lazy(() => import("@/pages/supervisor/SupervisorJobs"));
const SupervisorCreateJob = lazy(() => import("@/pages/supervisor/SupervisorCreateJob"));
const SupervisorMap = lazy(() => import("@/pages/supervisor/SupervisorMap"));
const SupervisorDrivers = lazy(() => import("@/pages/supervisor/SupervisorDrivers"));
const SupervisorCustomers = lazy(() => import("@/pages/supervisor/SupervisorCustomers"));
const SupervisorInvoices = lazy(() => import("@/pages/supervisor/SupervisorInvoices"));
const SupervisorHistory = lazy(() => import("@/pages/supervisor/SupervisorHistory"));
const SupervisorProfile = lazy(() => import("@/pages/supervisor/SupervisorProfile"));
const ContractSign = lazy(() => import("@/pages/ContractSign"));

const CustomerDashboard = lazy(() => import("@/pages/customer/CustomerDashboard"));
const CustomerOrders = lazy(() => import("@/pages/customer/CustomerOrders"));
const DeliveredOrders = lazy(() => import("@/pages/customer/DeliveredOrders"));
const CustomerProfile = lazy(() => import("@/pages/customer/CustomerProfile"));
const CustomerInvoices = lazy(() => import("@/pages/customer/CustomerInvoices"));

const DriverDashboard = lazy(() => import("@/pages/driver/DriverDashboard"));
const DriverJobs = lazy(() => import("@/pages/driver/DriverJobs"));
const DriverActive = lazy(() => import("@/pages/driver/DriverActive"));
const DriverHistory = lazy(() => import("@/pages/driver/DriverHistory"));
const DriverDocuments = lazy(() => import("@/pages/driver/DriverDocuments"));
const DriverProfile = lazy(() => import("@/pages/driver/DriverProfile"));
const DriverPayments = lazy(() => import("@/pages/driver/DriverPayments"));
const DriverApplication = lazy(() => import("@/pages/driver/DriverApplication"));
const DriverApplicationSuccess = lazy(() => import("@/pages/driver/ApplicationSuccess"));
const DriverChangePassword = lazy(() => import("@/pages/driver/DriverChangePassword"));
const DriverNotices = lazy(() => import("@/pages/driver/DriverNotices"));

const DispatcherDashboard = lazy(() => import("@/pages/dispatcher/DispatcherDashboard"));
const VendorDashboard = lazy(() => import("@/pages/vendor/VendorDashboard"));

function ApiPassthrough() {
  const [location] = useLocation();
  useEffect(() => {
    if (location.startsWith("/api/")) {
      window.location.href = window.location.origin + location + window.location.search;
    }
  }, [location]);
  return null;
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ApiPassthrough />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/about" component={About} />
        <Route path="/contact" component={Contact} />
        <Route path="/track/:trackingNumber" component={Track} />
        <Route path="/track" component={Track} />
        <Route path="/terms" component={Terms} />
        <Route path="/privacy" component={Privacy} />
        <Route path="/pricing-policy" component={PricingPolicy} />
        <Route path="/support" component={Support} />
        <Route path="/api-integration" component={ApiIntegration} />
        <Route path="/api-integration-request" component={ApiIntegrationRequest} />
        <Route path="/developers" component={Developers} />
        
        <Route path="/login">
          <PublicOnlyRoute>
            <Login />
          </PublicOnlyRoute>
        </Route>
        <Route path="/signup">
          <PublicOnlyRoute>
            <Signup />
          </PublicOnlyRoute>
        </Route>
        <Route path="/admin-signup">
          <PublicOnlyRoute>
            <AdminSignup />
          </PublicOnlyRoute>
        </Route>
        <Route path="/driver/signup">
          <PublicOnlyRoute>
            <DriverSignup />
          </PublicOnlyRoute>
        </Route>
        <Route path="/driver/login">
          <PublicOnlyRoute>
            <Login role="driver" />
          </PublicOnlyRoute>
        </Route>
        <Route path="/vendor/signup">
          <PublicOnlyRoute>
            <VendorSignup />
          </PublicOnlyRoute>
        </Route>
        <Route path="/vendor/login">
          <PublicOnlyRoute>
            <Login role="vendor" />
          </PublicOnlyRoute>
        </Route>
        <Route path="/admin/login">
          <PublicOnlyRoute>
            <AdminLogin />
          </PublicOnlyRoute>
        </Route>
        <Route path="/driver-login">
          <Redirect to="/driver/login" />
        </Route>
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/driver/change-password" component={DriverChangePassword} />
        <Route path="/driver/apply" component={DriverApplication} />
        <Route path="/driver/application-success" component={DriverApplicationSuccess} />
        
        <Route path="/book" component={Book} />
        <Route path="/quote" component={Quote} />
        <Route path="/payment/success" component={PaymentSuccess} />
        <Route path="/payment/cancel" component={PaymentCancel} />
        
        <Route path="/contracts/sign/:token" component={ContractSign} />
        <Route path="/pay/:token" component={PaymentLink} />
        <Route path="/pay/:token/success" component={PaymentLinkSuccess} />
        
        <Route path="/invoice-pay/:token" component={InvoicePayment} />
        
        <Route path="/services/same-day" component={SameDayService} />
        <Route path="/services/medical" component={MedicalService} />
        <Route path="/services/legal" component={LegalService} />
        <Route path="/services/retail" component={RetailService} />
        <Route path="/services/multi-drop" component={MultiDropService} />
        <Route path="/services/return-trip" component={ReturnTripService} />
        <Route path="/services/scheduled" component={ScheduledService} />
        <Route path="/services/restaurants" component={RestaurantsService} />
        <Route path="/same-day-courier-london" component={SameDayCourierLondon} />
        <Route path="/medical-courier" component={MedicalCourierPage} />
        <Route path="/business-courier-services" component={BusinessCourierServices} />
        <Route path="/urgent-delivery-london" component={UrgentDeliveryLondon} />
        <Route path="/blog" component={BlogIndex} />
        <Route path="/blog/:slug" component={BlogPost} />

        <Route path="/admin">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/jobs">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminJobs />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/jobs/create">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminCreateJob />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/drivers">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDrivers />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/applications">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminApplications />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/map">
          <ProtectedRoute allowedRoles={['admin', 'dispatcher']}>
            <AdminMap />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/postcode-map">
          <ProtectedRoute allowedRoles={['admin']}>
            <PostcodeMap />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/customers">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminCustomers />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/documents">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDocuments />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/payments">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDriverPayments />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/analytics">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/business-quote">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminBusinessQuote />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/invoices">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminInvoices />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/pricing">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminPricing />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/contracts">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminContracts />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/notices">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminNotices />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/notifications">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminNotifications />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/supervisors">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminSupervisors />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/contacts">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminContacts />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/route-planner">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminRoutePlanner />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/api-clients">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminApiClients />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/api-requests">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminApiRequests />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/api-logs">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminApiLogs />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/api-invoices">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminApiInvoices />
          </ProtectedRoute>
        </Route>
        <Route path="/admin/profile">
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminProfile />
          </ProtectedRoute>
        </Route>

        <Route path="/customer">
          <ProtectedRoute allowedRoles={['customer']}>
            <CustomerDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/customer/orders">
          <ProtectedRoute allowedRoles={['customer']}>
            <CustomerOrders />
          </ProtectedRoute>
        </Route>
        <Route path="/customer/delivered">
          <ProtectedRoute allowedRoles={['customer']}>
            <DeliveredOrders />
          </ProtectedRoute>
        </Route>
        <Route path="/customer/book">
          <ProtectedRoute allowedRoles={['customer']}>
            <Book />
          </ProtectedRoute>
        </Route>
        <Route path="/customer/track">
          <ProtectedRoute allowedRoles={['customer']}>
            <Track />
          </ProtectedRoute>
        </Route>
        <Route path="/customer/profile">
          <ProtectedRoute allowedRoles={['customer']}>
            <CustomerProfile />
          </ProtectedRoute>
        </Route>
        <Route path="/customer/invoices">
          <ProtectedRoute allowedRoles={['customer']}>
            <CustomerInvoices />
          </ProtectedRoute>
        </Route>

        <Route path="/driver">
          <ProtectedRoute allowedRoles={['driver']}>
            <DriverDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/driver/jobs">
          <ProtectedRoute allowedRoles={['driver']}>
            <DriverJobs />
          </ProtectedRoute>
        </Route>
        <Route path="/driver/active">
          <ProtectedRoute allowedRoles={['driver']}>
            <DriverActive />
          </ProtectedRoute>
        </Route>
        <Route path="/driver/history">
          <ProtectedRoute allowedRoles={['driver']}>
            <DriverHistory />
          </ProtectedRoute>
        </Route>
        <Route path="/driver/documents">
          <ProtectedRoute allowedRoles={['driver']}>
            <DriverDocuments />
          </ProtectedRoute>
        </Route>
        <Route path="/driver/notices">
          <ProtectedRoute allowedRoles={['driver']}>
            <DriverNotices />
          </ProtectedRoute>
        </Route>
        <Route path="/driver/profile">
          <ProtectedRoute allowedRoles={['driver']}>
            <DriverProfile />
          </ProtectedRoute>
        </Route>
        <Route path="/driver/payments">
          <ProtectedRoute allowedRoles={['driver']}>
            <DriverPayments />
          </ProtectedRoute>
        </Route>

        <Route path="/dispatcher">
          <ProtectedRoute allowedRoles={['dispatcher', 'admin']}>
            <DispatcherDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/dispatcher/jobs">
          <ProtectedRoute allowedRoles={['dispatcher', 'admin']}>
            <DispatcherDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/dispatcher/drivers">
          <ProtectedRoute allowedRoles={['dispatcher', 'admin']}>
            <DispatcherDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/dispatcher/map">
          <ProtectedRoute allowedRoles={['dispatcher', 'admin']}>
            <AdminMap />
          </ProtectedRoute>
        </Route>
        <Route path="/dispatcher/assign">
          <ProtectedRoute allowedRoles={['dispatcher', 'admin']}>
            <DispatcherDashboard />
          </ProtectedRoute>
        </Route>

        <Route path="/vendor">
          <ProtectedRoute allowedRoles={['vendor']}>
            <VendorDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/vendor/orders">
          <ProtectedRoute allowedRoles={['vendor']}>
            <VendorDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/vendor/upload">
          <ProtectedRoute allowedRoles={['vendor']}>
            <VendorDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/vendor/scheduled">
          <ProtectedRoute allowedRoles={['vendor']}>
            <VendorDashboard />
          </ProtectedRoute>
        </Route>
        <Route path="/vendor/api">
          <ProtectedRoute allowedRoles={['vendor']}>
            <VendorDashboard />
          </ProtectedRoute>
        </Route>

        <Route path="/supervisor/login">
          <SupervisorLogin />
        </Route>
        <Route path="/supervisor/register">
          <SupervisorRegister />
        </Route>
        <Route path="/supervisor/jobs/create">
          <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/supervisor/login">
            <SupervisorCreateJob />
          </ProtectedRoute>
        </Route>
        <Route path="/supervisor/jobs">
          <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/supervisor/login">
            <SupervisorJobs />
          </ProtectedRoute>
        </Route>
        <Route path="/supervisor/map">
          <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/supervisor/login">
            <SupervisorMap />
          </ProtectedRoute>
        </Route>
        <Route path="/supervisor/postcode-map">
          <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/supervisor/login">
            <PostcodeMap />
          </ProtectedRoute>
        </Route>
        <Route path="/supervisor/drivers">
          <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/supervisor/login">
            <SupervisorDrivers />
          </ProtectedRoute>
        </Route>
        <Route path="/supervisor/customers">
          <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/supervisor/login">
            <SupervisorCustomers />
          </ProtectedRoute>
        </Route>
        <Route path="/supervisor/invoices">
          <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/supervisor/login">
            <SupervisorInvoices />
          </ProtectedRoute>
        </Route>
        <Route path="/supervisor/contacts">
          <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/supervisor/login">
            <AdminContacts />
          </ProtectedRoute>
        </Route>
        <Route path="/supervisor/quote">
          <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/supervisor/login">
            <Quote />
          </ProtectedRoute>
        </Route>
        <Route path="/supervisor/history">
          <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/supervisor/login">
            <SupervisorHistory />
          </ProtectedRoute>
        </Route>
        <Route path="/supervisor/track/:trackingNumber">
          <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/supervisor/login">
            <Track />
          </ProtectedRoute>
        </Route>
        <Route path="/supervisor/track">
          <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/supervisor/login">
            <Track />
          </ProtectedRoute>
        </Route>
        <Route path="/supervisor/route-planner">
          <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/supervisor/login">
            <AdminRoutePlanner />
          </ProtectedRoute>
        </Route>
        <Route path="/supervisor/profile">
          <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/supervisor/login">
            <SupervisorProfile />
          </ProtectedRoute>
        </Route>
        <Route path="/supervisor/notifications">
          <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/supervisor/login">
            <AdminNotifications />
          </ProtectedRoute>
        </Route>
        <Route path="/supervisor">
          <ProtectedRoute allowedRoles={['supervisor']} redirectTo="/supervisor/login">
            <SupervisorDashboard />
          </ProtectedRoute>
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AppContent() {
  usePrefetchAllRoutes();
  return (
    <>
      <NavigationProgress />
      <ScrollToTop />
      <Toaster />
      <FloatingButtons />
      <Router />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <BookingProvider>
            <AppContent />
          </BookingProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
