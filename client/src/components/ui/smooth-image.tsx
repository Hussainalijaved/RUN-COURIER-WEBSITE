import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface SmoothImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  wrapperClassName?: string;
  placeholderClassName?: string;
}

export function SmoothImage({
  src,
  alt,
  className,
  wrapperClassName,
  placeholderClassName,
  ...props
}: SmoothImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  const handleLoad = useCallback(() => {
    setLoaded(true);
  }, []);

  const handleError = useCallback(() => {
    setError(true);
    setLoaded(true);
  }, []);

  return (
    <div className={cn("relative overflow-hidden", wrapperClassName)}>
      {!loaded && (
        <div 
          className={cn(
            "absolute inset-0 bg-muted/50 animate-pulse",
            placeholderClassName
          )} 
        />
      )}
      <img
        src={src}
        alt={alt}
        className={cn(
          "transition-opacity duration-500 ease-out",
          loaded ? "opacity-100" : "opacity-0",
          error && "opacity-50",
          className
        )}
        onLoad={handleLoad}
        onError={handleError}
        {...props}
      />
    </div>
  );
}

interface SmoothBackgroundProps {
  src: string;
  className?: string;
  children?: React.ReactNode;
  overlayClassName?: string;
}

export function SmoothBackground({
  src,
  className,
  children,
  overlayClassName,
}: SmoothBackgroundProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className={cn("relative", className)}>
      {!loaded && (
        <div className="absolute inset-0 bg-muted/30 animate-pulse" />
      )}
      <div
        className={cn(
          "absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-700 ease-out",
          loaded ? "opacity-100" : "opacity-0"
        )}
        style={{ backgroundImage: `url(${src})` }}
      />
      {overlayClassName && (
        <div className={cn("absolute inset-0", overlayClassName)} />
      )}
      <img
        src={src}
        alt=""
        className="hidden"
        onLoad={() => setLoaded(true)}
      />
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
