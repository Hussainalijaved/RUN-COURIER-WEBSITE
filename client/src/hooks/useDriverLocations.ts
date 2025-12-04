import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';

export interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  timestamp: number;
}

interface WebSocketMessage {
  type: string;
  payload?: any;
}

interface UseDriverLocationsOptions {
  enabled?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

interface UseDriverLocationsReturn {
  locations: Map<string, DriverLocation>;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnect: () => void;
}

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];
const PING_INTERVAL = 25000;

export function useDriverLocations(options: UseDriverLocationsOptions = {}): UseDriverLocationsReturn {
  const { enabled = true, onConnect, onDisconnect, onError } = options;
  const { user } = useAuth();
  
  const [locations, setLocations] = useState<Map<string, DriverLocation>>(new Map());
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.onopen = null;
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || !user || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    cleanup();
    setIsConnecting(true);
    setError(null);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/realtime`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        
        const authMessage = {
          type: 'auth',
          role: user.role || 'customer',
          userId: user.id,
        };
        ws.send(JSON.stringify(authMessage));
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          switch (message.type) {
            case 'auth:success':
              setIsConnected(true);
              setIsConnecting(false);
              setError(null);
              reconnectAttemptRef.current = 0;
              
              ws.send(JSON.stringify({ type: 'subscribe:drivers' }));
              
              pingIntervalRef.current = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'ping' }));
                }
              }, PING_INTERVAL);
              
              onConnect?.();
              break;

            case 'driver:bulk_snapshot':
              if (Array.isArray(message.payload)) {
                setLocations(new Map(
                  message.payload.map((loc: DriverLocation) => [loc.driverId, loc])
                ));
              }
              break;

            case 'driver:location':
              if (message.payload) {
                const loc = message.payload as DriverLocation;
                setLocations(prev => {
                  const updated = new Map(prev);
                  updated.set(loc.driverId, loc);
                  return updated;
                });
              }
              break;

            case 'driver:offline':
              if (message.payload?.driverId) {
                setLocations(prev => {
                  const updated = new Map(prev);
                  updated.delete(message.payload.driverId);
                  return updated;
                });
              }
              break;

            case 'error':
              const errorMsg = message.payload?.message || 'Unknown error';
              setError(errorMsg);
              onError?.(errorMsg);
              break;

            case 'pong':
              break;
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onerror = (event) => {
        if (!mountedRef.current) return;
        console.error('WebSocket error:', event);
        setError('Connection error');
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        
        setIsConnected(false);
        setIsConnecting(false);
        
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        
        onDisconnect?.();

        if (event.code !== 1000 && enabled) {
          const delay = RECONNECT_DELAYS[Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS.length - 1)];
          reconnectAttemptRef.current++;
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && enabled) {
              connect();
            }
          }, delay);
        }
      };
    } catch (e) {
      setIsConnecting(false);
      setError('Failed to create WebSocket connection');
      console.error('WebSocket creation error:', e);
    }
  }, [enabled, user, cleanup, onConnect, onDisconnect, onError]);

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;
    
    if (enabled && user) {
      connect();
    }

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [enabled, user, connect, cleanup]);

  return {
    locations,
    isConnected,
    isConnecting,
    error,
    reconnect,
  };
}

export function useDriverLocationUpdater() {
  const { user } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    if (!user || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/realtime`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      const authMessage = {
        type: 'auth',
        role: 'driver',
        userId: user.id,
        driverId: user.id,
      };
      ws.send(JSON.stringify(authMessage));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'auth:success') {
          setIsConnected(true);
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setTimeout(() => {
        if (user) connect();
      }, 5000);
    };
  }, [user]);

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const updateLocation = useCallback((lat: number, lng: number, heading?: number, speed?: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && user) {
      wsRef.current.send(JSON.stringify({
        type: 'driver:update_location',
        payload: {
          driverId: user.id,
          lat,
          lng,
          heading,
          speed,
        },
      }));
    }
  }, [user]);

  return {
    isConnected,
    updateLocation,
  };
}
