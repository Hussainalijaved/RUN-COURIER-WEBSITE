import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import { BookingProvider } from "@/context/BookingContext";
import { ProtectedRoute, PublicOnlyRoute } from "@/components/ProtectedRoute";

function ScrollToTop() {
  const [location] = useLocation();
  
  useEffect(() => {
    // Scroll the window to top
    window.scrollTo(0, 0);
    
    // Also scroll any dashboard/layout content containers to top
    const scrollContainers = document.querySelectorAll('[data-scroll-container]');
    scrollContainers.forEach(container => {
      container.scrollTop = 0;
    });
    
    // Fallback: scroll main elements with overflow-auto
    const mainElements = document.querySelectorAll('main');
    mainElements.forEach(main => {
      main.scrollTop = 0;
    });
  }, [location]);
  
  return null;
}

import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import Track from "@/pages/Track";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import Login, { AdminLogin } from "@/pages/Login";
import Signup, { DriverSignup, VendorSignup } from "@/pages/Signup";
import AdminSignup from "@/pages/AdminSignup";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Book from "@/pages/Book";
import Quote from "@/pages/Quote";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentCancel from "@/pages/PaymentCancel";
import PaymentLink, { PaymentLinkSuccess } from "@/pages/PaymentLink";
import InvoicePayment from "@/pages/InvoicePayment";
import Support from "@/pages/Support";

import {
  SameDayService,
  MedicalService,
  LegalService,
  RetailService,
  MultiDropService,
  ReturnTripService,
  ScheduledService,
  RestaurantsService,
} from "@/pages/services/ServicePage";

import AdminDashboard from "@/pages/admin/AdminDashboard";
import AdminDocuments from "@/pages/admin/AdminDocuments";
import AdminJobs from "@/pages/admin/AdminJobs";
import AdminDrivers from "@/pages/admin/AdminDrivers";
import AdminApplications from "@/pages/admin/AdminApplications";
import AdminMap from "@/pages/admin/AdminMap";
import AdminCreateJob from "@/pages/admin/AdminCreateJob";
import AdminCustomers from "@/pages/admin/AdminCustomers";
import AdminDriverPayments from "@/pages/admin/AdminDriverPayments";
import AdminBusinessQuote from "@/pages/admin/AdminBusinessQuote";
import AdminInvoices from "@/pages/admin/AdminInvoices";

import CustomerDashboard from "@/pages/customer/CustomerDashboard";
import CustomerOrders from "@/pages/customer/CustomerOrders";
import DeliveredOrders from "@/pages/customer/DeliveredOrders";
import CustomerProfile from "@/pages/customer/CustomerProfile";
import CustomerInvoices from "@/pages/customer/CustomerInvoices";
import DriverDashboard from "@/pages/driver/DriverDashboard";
import DriverJobs from "@/pages/driver/DriverJobs";
import DriverActive from "@/pages/driver/DriverActive";
import DriverHistory from "@/pages/driver/DriverHistory";
import DriverDocuments from "@/pages/driver/DriverDocuments";
import DriverProfile from "@/pages/driver/DriverProfile";
import DriverPayments from "@/pages/driver/DriverPayments";
import DriverApplication from "@/pages/driver/DriverApplication";
import DriverApplicationSuccess from "@/pages/driver/ApplicationSuccess";
import DispatcherDashboard from "@/pages/dispatcher/DispatcherDashboard";
import VendorDashboard from "@/pages/vendor/VendorDashboard";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/about" component={About} />
      <Route path="/contact" component={Contact} />
      <Route path="/track" component={Track} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/support" component={Support} />
      
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
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/driver/apply" component={DriverApplication} />
      <Route path="/driver/application-success" component={DriverApplicationSuccess} />
      
      <Route path="/book" component={Book} />
      <Route path="/quote" component={Quote} />
      <Route path="/payment/success" component={PaymentSuccess} />
      <Route path="/payment/cancel" component={PaymentCancel} />
      
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

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <BookingProvider>
            <ScrollToTop />
            <Toaster />
            <Router />
          </BookingProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
