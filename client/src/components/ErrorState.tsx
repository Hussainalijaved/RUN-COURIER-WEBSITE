import { AlertCircle, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  isNetworkError?: boolean;
}

export function ErrorState({ 
  title = 'Something went wrong', 
  message = 'We could not load this data. Please try again.',
  onRetry,
  isNetworkError = false
}: ErrorStateProps) {
  const Icon = isNetworkError ? WifiOff : AlertCircle;
  
  return (
    <Card className="border-destructive/20 bg-destructive/5" data-testid="error-state">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <Icon className="h-12 w-12 text-destructive mb-4" />
        <h3 className="text-lg font-semibold text-destructive mb-2" data-testid="error-title">
          {title}
        </h3>
        <p className="text-muted-foreground mb-6 max-w-md" data-testid="error-message">
          {message}
        </p>
        {onRetry && (
          <Button 
            variant="outline" 
            onClick={onRetry}
            className="gap-2"
            data-testid="button-retry"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface LoadingTimeoutProps {
  message?: string;
  onRetry?: () => void;
}

export function LoadingTimeout({ 
  message = 'This is taking longer than expected...', 
  onRetry 
}: LoadingTimeoutProps) {
  return (
    <Card className="border-yellow-500/20 bg-yellow-500/5" data-testid="loading-timeout">
      <CardContent className="flex flex-col items-center justify-center py-8 text-center">
        <AlertCircle className="h-10 w-10 text-yellow-500 mb-3" />
        <p className="text-muted-foreground mb-4" data-testid="timeout-message">
          {message}
        </p>
        {onRetry && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={onRetry}
            className="gap-2"
            data-testid="button-retry-timeout"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
