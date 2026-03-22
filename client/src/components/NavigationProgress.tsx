import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

export function NavigationProgress() {
  const [location] = useLocation();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const growRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevLocation = useRef(location);

  useEffect(() => {
    if (location === prevLocation.current) return;
    prevLocation.current = location;

    if (timerRef.current) clearTimeout(timerRef.current);
    if (growRef.current) clearInterval(growRef.current);

    setVisible(true);
    setWidth(0);

    let currentWidth = 0;
    growRef.current = setInterval(() => {
      currentWidth = Math.min(currentWidth + Math.random() * 12 + 4, 85);
      setWidth(currentWidth);
    }, 80);

    timerRef.current = setTimeout(() => {
      if (growRef.current) clearInterval(growRef.current);
      setWidth(100);
      setTimeout(() => setVisible(false), 300);
    }, 600);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (growRef.current) clearInterval(growRef.current);
    };
  }, [location]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-[3px] bg-transparent pointer-events-none"
      aria-hidden="true"
    >
      <div
        className="h-full bg-primary shadow-[0_0_8px_rgba(var(--primary)/0.6)] transition-all duration-150 ease-out"
        style={{ width: `${width}%`, opacity: visible && width >= 100 ? 0 : 1, transition: width >= 100 ? "width 200ms ease-out, opacity 300ms ease-out 100ms" : "width 150ms ease-out" }}
      />
    </div>
  );
}
