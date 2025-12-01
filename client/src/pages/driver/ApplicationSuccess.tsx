import { useLocation } from "wouter";
import { CheckCircle, Home, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicLayout } from "@/components/layout/PublicLayout";

export default function ApplicationSuccess() {
  const [, navigate] = useLocation();

  return (
    <PublicLayout>
      <div className="container mx-auto py-16 px-4 max-w-xl">
        <Card className="text-center">
          <CardHeader className="pb-4">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Application Submitted!</CardTitle>
            <CardDescription>
              Thank you for applying to become a Run Courier driver.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4 text-left">
              <h3 className="font-medium flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4" />
                What happens next?
              </h3>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                <li>Our team will review your application within 2-3 business days</li>
                <li>We may contact you for additional information if needed</li>
                <li>Once approved, you'll receive login credentials via email</li>
                <li>You can then start accepting delivery jobs immediately</li>
              </ul>
            </div>

            <div className="text-sm text-muted-foreground">
              <p>
                If you have any questions about your application, please contact us at{" "}
                <a href="mailto:drivers@runcourier.co.uk" className="text-primary hover:underline">
                  drivers@runcourier.co.uk
                </a>
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
              <Button onClick={() => navigate("/")} data-testid="button-go-home">
                <Home className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
