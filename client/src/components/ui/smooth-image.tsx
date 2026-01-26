import { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@/lib/utils';

const loadedImages = new Set<string>();

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
  const alreadyLoaded = src ? loadedImages.has(src) : false;
  const [loaded, setLoaded] = useState(alreadyLoaded);

  const handleLoad = useCallback(() => {
    if (src) loadedImages.add(src);
    setLoaded(true);
  }, [src]);

  useEffect(() => {
    if (src && loadedImages.has(src)) {
      setLoaded(true);
    }
  }, [src]);

  return (
    <div className={cn("relative overflow-hidden", wrapperClassName)}>
      {!loaded && (
        <div 
          className={cn(
            "absolute inset-0 bg-muted/30 animate-pulse",
            placeholderClassName
          )} 
        />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={cn(
          "transition-opacity duration-300 ease-out",
          loaded ? "opacity-100" : "opacity-0",
          className
        )}
        onLoad={handleLoad}
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
  const alreadyLoaded = loadedImages.has(src);
  const [loaded, setLoaded] = useState(alreadyLoaded);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (loadedImages.has(src)) {
      setLoaded(true);
      return;
    }

    const img = new Image();
    img.src = src;
    imgRef.current = img;
    
    if (img.complete) {
      loadedImages.add(src);
      setLoaded(true);
    } else {
      img.onload = () => {
        loadedImages.add(src);
        setLoaded(true);
      };
    }

    return () => {
      img.onload = null;
    };
  }, [src]);

  return (
    <div className={cn("relative", className)}>
      {!loaded && (
        <div className="absolute inset-0 bg-muted/20 animate-pulse" />
      )}
      <div
        className={cn(
          "absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-300 ease-out",
          loaded ? "opacity-100" : "opacity-0"
        )}
        style={{ backgroundImage: `url(${src})` }}
      />
      {overlayClassName && (
        <div className={cn("absolute inset-0", overlayClassName)} />
      )}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
