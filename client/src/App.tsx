import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";

import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import Pricing from "@/pages/Pricing";
import Track from "@/pages/Track";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Book from "@/pages/Book";

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
import AdminPricing from "@/pages/admin/AdminPricing";
import AdminMap from "@/pages/admin/AdminMap";

import CustomerDashboard from "@/pages/customer/CustomerDashboard";
import DriverDashboard from "@/pages/driver/DriverDashboard";
import DispatcherDashboard from "@/pages/dispatcher/DispatcherDashboard";
import VendorDashboard from "@/pages/vendor/VendorDashboard";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/about" component={About} />
      <Route path="/contact" component={Contact} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/track" component={Track} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/login" component={Login} />
      <Route path="/signup" component={Signup} />
      <Route path="/book" component={Book} />
      
      <Route path="/services/same-day" component={SameDayService} />
      <Route path="/services/medical" component={MedicalService} />
      <Route path="/services/legal" component={LegalService} />
      <Route path="/services/retail" component={RetailService} />
      <Route path="/services/multi-drop" component={MultiDropService} />
      <Route path="/services/return-trip" component={ReturnTripService} />
      <Route path="/services/scheduled" component={ScheduledService} />
      <Route path="/services/restaurants" component={RestaurantsService} />

      <Route path="/admin" component={AdminDashboard} />
      <Route path="/admin/jobs" component={AdminJobs} />
      <Route path="/admin/drivers" component={AdminDrivers} />
      <Route path="/admin/pricing" component={AdminPricing} />
      <Route path="/admin/map" component={AdminMap} />
      <Route path="/admin/customers" component={AdminDashboard} />
      <Route path="/admin/documents" component={AdminDashboard} />
      <Route path="/admin/analytics" component={AdminDashboard} />

      <Route path="/customer" component={CustomerDashboard} />
      <Route path="/customer/orders" component={CustomerDashboard} />
      <Route path="/customer/book" component={Book} />
      <Route path="/customer/track" component={Track} />
      <Route path="/customer/profile" component={CustomerDashboard} />

      <Route path="/driver" component={DriverDashboard} />
      <Route path="/driver/jobs" component={DriverDashboard} />
      <Route path="/driver/active" component={DriverDashboard} />
      <Route path="/driver/history" component={DriverDashboard} />
      <Route path="/driver/documents" component={DriverDashboard} />
      <Route path="/driver/profile" component={DriverDashboard} />

      <Route path="/dispatcher" component={DispatcherDashboard} />
      <Route path="/dispatcher/jobs" component={DispatcherDashboard} />
      <Route path="/dispatcher/drivers" component={DispatcherDashboard} />
      <Route path="/dispatcher/map" component={AdminMap} />
      <Route path="/dispatcher/assign" component={DispatcherDashboard} />

      <Route path="/vendor" component={VendorDashboard} />
      <Route path="/vendor/orders" component={VendorDashboard} />
      <Route path="/vendor/upload" component={VendorDashboard} />
      <Route path="/vendor/scheduled" component={VendorDashboard} />
      <Route path="/vendor/api" component={VendorDashboard} />

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
