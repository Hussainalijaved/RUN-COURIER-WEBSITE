import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { getWebSocketUrl } from '@/lib/queryClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
  timestamp: number;
  isAvailable?: boolean;
  driverCode?: string;
  driverName?: string;
}

// Supabase driver_locations table row type
interface SupabaseDriverLocation {
  id: string;
  driver_id: string;
  job_id: string | null;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  updated_at: string;
  is_moving: boolean;
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

    const wsUrl = getWebSocketUrl('/ws/realtime');

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        if (!mountedRef.current) return;
        
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) {
            setError('No valid session');
            ws.close();
            return;
          }
          
          const authMessage = {
            type: 'auth',
            token: session.access_token,
          };
          ws.send(JSON.stringify(authMessage));
        } catch (err) {
          console.error('Failed to get session for WebSocket auth:', err);
          setError('Authentication failed');
          ws.close();
        }
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

            case 'driver:online':
              if (message.payload) {
                const { driverId, isAvailable, driverCode, driverName, lat, lng } = message.payload;
                if (isAvailable && lat !== undefined && lng !== undefined) {
                  setLocations(prev => {
                    const updated = new Map(prev);
                    updated.set(driverId, {
                      driverId,
                      lat,
                      lng,
                      timestamp: Date.now(),
                      isAvailable: true,
                      driverCode,
                      driverName,
                    });
                    return updated;
                  });
                } else if (!isAvailable) {
                  setLocations(prev => {
                    const updated = new Map(prev);
                    updated.delete(driverId);
                    return updated;
                  });
                }
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

  // Supabase real-time subscription for driver_locations table
  // This provides a reliable fallback/supplement to WebSocket updates
  const supabaseChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled || !user) return;

    // Fetch initial locations from Supabase
    const fetchInitialLocations = async () => {
      try {
        const { data, error: fetchError } = await supabase
          .from('driver_locations')
          .select('driver_id, latitude, longitude, accuracy, heading, speed, updated_at, is_moving')
          .order('updated_at', { ascending: false });

        if (fetchError) {
          console.log('[DriverLocations] Supabase fetch error (table may not exist yet):', fetchError.message);
          return;
        }

        if (data && data.length > 0) {
          setLocations(prev => {
            const updated = new Map(prev);
            data.forEach((loc) => {
              // Only update if we don't have a more recent WebSocket update
              const existing = updated.get(loc.driver_id);
              const locTimestamp = new Date(loc.updated_at).getTime();
              if (!existing || existing.timestamp < locTimestamp) {
                updated.set(loc.driver_id, {
                  driverId: loc.driver_id,
                  lat: Number(loc.latitude),
                  lng: Number(loc.longitude),
                  accuracy: loc.accuracy ? Number(loc.accuracy) : undefined,
                  heading: loc.heading ? Number(loc.heading) : undefined,
                  speed: loc.speed ? Number(loc.speed) : undefined,
                  timestamp: locTimestamp,
                  isAvailable: loc.is_moving,
                });
              }
            });
            return updated;
          });
        }
      } catch (err) {
        console.log('[DriverLocations] Initial fetch failed:', err);
      }
    };

    fetchInitialLocations();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('driver_locations_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_locations',
        },
        (payload) => {
          if (!mountedRef.current) return;
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const loc = payload.new as SupabaseDriverLocation;
            const locTimestamp = new Date(loc.updated_at).getTime();
            
            setLocations(prev => {
              const updated = new Map(prev);
              const existing = updated.get(loc.driver_id);
              
              // Only update if this is more recent
              if (!existing || existing.timestamp < locTimestamp) {
                updated.set(loc.driver_id, {
                  driverId: loc.driver_id,
                  lat: Number(loc.latitude),
                  lng: Number(loc.longitude),
                  accuracy: loc.accuracy ? Number(loc.accuracy) : undefined,
                  heading: loc.heading ? Number(loc.heading) : undefined,
                  speed: loc.speed ? Number(loc.speed) : undefined,
                  timestamp: locTimestamp,
                  isAvailable: loc.is_moving,
                });
              }
              return updated;
            });
          } else if (payload.eventType === 'DELETE') {
            const loc = payload.old as SupabaseDriverLocation;
            setLocations(prev => {
              const updated = new Map(prev);
              updated.delete(loc.driver_id);
              return updated;
            });
          }
        }
      )
      .subscribe();

    supabaseChannelRef.current = channel;

    return () => {
      if (supabaseChannelRef.current) {
        supabase.removeChannel(supabaseChannelRef.current);
        supabaseChannelRef.current = null;
      }
    };
  }, [enabled, user]);

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

    const wsUrl = getWebSocketUrl('/ws/realtime');

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          console.error('No valid session for driver WebSocket');
          ws.close();
          return;
        }
        
        const authMessage = {
          type: 'auth',
          token: session.access_token,
        };
        ws.send(JSON.stringify(authMessage));
      } catch (err) {
        console.error('Failed to get session for driver WebSocket auth:', err);
        ws.close();
      }
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
