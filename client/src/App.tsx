import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute, PublicOnlyRoute } from "@/components/ProtectedRoute";

import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import Track from "@/pages/Track";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import Login from "@/pages/Login";
import Signup, { DriverSignup, VendorSignup } from "@/pages/Signup";
import AdminSignup from "@/pages/AdminSignup";
import Book from "@/pages/Book";
import Quote from "@/pages/Quote";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentCancel from "@/pages/PaymentCancel";

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
import AdminJobs from "@/pages/admin/AdminJobs";
import AdminDrivers from "@/pages/admin/AdminDrivers";
import AdminMap from "@/pages/admin/AdminMap";

import CustomerDashboard from "@/pages/customer/CustomerDashboard";
import CustomerProfile from "@/pages/customer/CustomerProfile";
import DriverDashboard from "@/pages/driver/DriverDashboard";
import DriverJobs from "@/pages/driver/DriverJobs";
import DriverActive from "@/pages/driver/DriverActive";
import DriverHistory from "@/pages/driver/DriverHistory";
import DriverDocuments from "@/pages/driver/DriverDocuments";
import DriverProfile from "@/pages/driver/DriverProfile";
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
      
      <Route path="/book" component={Book} />
      <Route path="/quote" component={Quote} />
      <Route path="/payment/success" component={PaymentSuccess} />
      <Route path="/payment/cancel" component={PaymentCancel} />
      
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
      <Route path="/admin/drivers">
        <ProtectedRoute allowedRoles={['admin']}>
          <AdminDrivers />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/map">
        <ProtectedRoute allowedRoles={['admin', 'dispatcher']}>
          <AdminMap />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/customers">
        <ProtectedRoute allowedRoles={['admin']}>
          <AdminDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/documents">
        <ProtectedRoute allowedRoles={['admin']}>
          <AdminDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/analytics">
        <ProtectedRoute allowedRoles={['admin']}>
          <AdminDashboard />
        </ProtectedRoute>
      </Route>

      <Route path="/customer">
        <ProtectedRoute allowedRoles={['customer']}>
          <CustomerDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/customer/orders">
        <ProtectedRoute allowedRoles={['customer']}>
          <CustomerDashboard />
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
          <Toaster />
          <Router />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
