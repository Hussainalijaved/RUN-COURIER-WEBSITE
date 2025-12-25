import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';

export interface JobStatusUpdate {
  jobId: string;
  trackingNumber: string;
  status: string;
  previousStatus?: string;
  customerId?: string;
  driverId?: string | null;
  updatedAt: string;
}

export interface JobCreatedEvent {
  jobId: string;
  trackingNumber: string;
  status: string;
  customerId: string;
  createdAt: string;
}

interface WebSocketMessage {
  type: string;
  payload?: any;
}

interface UseJobUpdatesOptions {
  enabled?: boolean;
  customerId?: string;
  jobId?: string;
  trackingNumber?: string;
  onJobUpdate?: (update: JobStatusUpdate) => void;
  onJobCreated?: (job: JobCreatedEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: string) => void;
}

interface UseJobUpdatesReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnect: () => void;
  latestUpdate: JobStatusUpdate | null;
}

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000];
const PING_INTERVAL = 25000;

export function useJobUpdates(options: UseJobUpdatesOptions = {}): UseJobUpdatesReturn {
  const { 
    enabled = true, 
    customerId, 
    jobId, 
    trackingNumber,
    onJobUpdate, 
    onJobCreated,
    onConnect, 
    onDisconnect, 
    onError 
  } = options;
  const { user } = useAuth();
  
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestUpdate, setLatestUpdate] = useState<JobStatusUpdate | null>(null);
  
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
              
              ws.send(JSON.stringify({ 
                type: 'subscribe:jobs',
                payload: {
                  customerId,
                  jobId,
                  trackingNumber,
                },
              }));
              
              pingIntervalRef.current = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'ping' }));
                }
              }, PING_INTERVAL);
              
              onConnect?.();
              break;

            case 'job:status_update':
              if (message.payload) {
                const update = message.payload as JobStatusUpdate;
                setLatestUpdate(update);
                onJobUpdate?.(update);
                
                queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
                queryClient.invalidateQueries({ queryKey: ['/api/jobs', update.jobId] });
                if (update.trackingNumber) {
                  queryClient.invalidateQueries({ queryKey: ['/api/jobs/track', update.trackingNumber] });
                }
              }
              break;

            case 'job:created':
              if (message.payload) {
                const job = message.payload as JobCreatedEvent;
                onJobCreated?.(job);
                
                queryClient.invalidateQueries({ queryKey: ['/api/jobs'] });
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
  }, [enabled, user, customerId, jobId, trackingNumber, cleanup, onConnect, onDisconnect, onError, onJobUpdate, onJobCreated]);

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
    isConnected,
    isConnecting,
    error,
    reconnect,
    latestUpdate,
  };
}
