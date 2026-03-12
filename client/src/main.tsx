import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { logEnvironmentStatus } from "./lib/env-validation";

// Log environment status (non-blocking)
try {
  logEnvironmentStatus();
} catch (e) {
  console.warn('[Env] Failed to log environment status:', e);
}

// Global error handler to prevent blank screens
window.onerror = (message, source, lineno, colno, error) => {
  console.error('[Global Error]', { message, source, lineno, colno, error });
  return false;
};

// Suppress Vite HMR WebSocket errors - these are internal Vite errors that
// occur in the Replit environment and must not trigger the error overlay.
window.addEventListener('unhandledrejection', (event) => {
  const msg = event.reason?.message || String(event.reason || '');
  if (
    msg.includes('wss://localhost:undefined') ||
    msg.includes('Failed to construct \'WebSocket\'') ||
    msg.includes('WebSocket') && msg.includes('invalid')
  ) {
    event.preventDefault();
    return;
  }
  console.error('[Unhandled Promise Rejection]', event.reason);
});

const rootElement = document.getElementById("root");
if (rootElement) {
  try {
    createRoot(rootElement).render(<App />);
  } catch (error) {
    console.error('[App] Failed to render:', error);
    rootElement.innerHTML = '<div style="padding: 20px; font-family: sans-serif;"><h1>Loading Error</h1><p>Please refresh the page.</p></div>';
  }
} else {
  console.error('[App] Root element not found');
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[SW] Registration failed:', err);
    });
  });
}
