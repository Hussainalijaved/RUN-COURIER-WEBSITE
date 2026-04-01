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
  /** Set true for above-the-fold hero images (LCP element) — skips fade-in and hints high fetch priority */
  priority?: boolean;
}

export function SmoothBackground({
  src,
  className,
  children,
  overlayClassName,
  priority = false,
}: SmoothBackgroundProps) {
  const alreadyLoaded = loadedImages.has(src);
  const [loaded, setLoaded] = useState(alreadyLoaded || priority);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (priority) {
      loadedImages.add(src);
      setLoaded(true);
      return;
    }

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
  }, [src, priority]);

  return (
    <div className={cn("relative", className)}>
      {/* Priority (LCP) images: render an actual <img> so the browser preload scanner
          discovers the resource and assigns it high priority. Visually it's identical
          to the CSS background approach. */}
      {priority ? (
        <img
          {...({ fetchpriority: 'high' } as React.ImgHTMLAttributes<HTMLImageElement>)}
          src={src}
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="sync"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ pointerEvents: 'none' }}
        />
      ) : (
        <>
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
        </>
      )}
      {overlayClassName && (
        <div className={cn("absolute inset-0", overlayClassName)} />
      )}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}
