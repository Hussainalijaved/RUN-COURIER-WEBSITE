import { AlertCircle, MapPin, RefreshCw } from 'lucide-react';
import { Button } from './button';
import { Card, CardContent } from './card';
import type { GoogleMapsStatus } from '@/hooks/useGoogleMaps';

interface MapFallbackProps {
  status: GoogleMapsStatus;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
}

export function MapFallback({ status, error, onRetry, className = '' }: MapFallbackProps) {
  if (status === 'loading') {
    return (
      <div className={`flex items-center justify-center h-full min-h-[300px] bg-muted/30 ${className}`} data-testid="map-loading">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Loading map...</p>
        </div>
      </div>
    );
  }

  if (status === 'unconfigured') {
    return (
      <Card className={`h-full min-h-[300px] ${className}`} data-testid="map-unconfigured">
        <CardContent className="flex flex-col items-center justify-center h-full p-6">
          <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-2">Map Not Available</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Google Maps is not configured for this environment. Location features are temporarily unavailable.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (status === 'error') {
    return (
      <Card className={`h-full min-h-[300px] ${className}`} data-testid="map-error">
        <CardContent className="flex flex-col items-center justify-center h-full p-6">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h3 className="font-semibold text-lg mb-2">Failed to Load Map</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
            {error || 'There was a problem loading the map. Please check your internet connection.'}
          </p>
          {onRetry && (
            <Button variant="outline" onClick={onRetry} data-testid="button-retry-map">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return null;
}

export function MapLoadingOverlay() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10" data-testid="map-loading-overlay">
      <div className="text-center space-y-2">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto" />
        <p className="text-xs text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}
