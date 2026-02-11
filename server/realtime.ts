import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { IncomingMessage } from 'http';
import { log } from './index';
import { storage } from './storage';
import { verifyAccessToken, type VerifiedUser } from './supabaseAdmin';

interface DriverLocation {
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

interface AuthMessage {
  type: 'auth';
  token: string;
}

interface LocationUpdateMessage {
  type: 'driver:update_location';
  payload: {
    driverId: string;
    lat: number;
    lng: number;
    heading?: number;
    speed?: number;
    accuracy?: number;
  };
}

interface SubscribeDriversMessage {
  type: 'subscribe:drivers';
}

interface SubscribeJobsMessage {
  type: 'subscribe:jobs';
  payload?: {
    customerId?: string;
    jobId?: string;
    trackingNumber?: string;
  };
}

type IncomingMessage_WS = AuthMessage | LocationUpdateMessage | SubscribeDriversMessage | SubscribeJobsMessage | { type: 'ping' };

interface OutgoingLocationMessage {
  type: 'driver:location';
  payload: DriverLocation;
}

interface BulkSnapshotMessage {
  type: 'driver:bulk_snapshot';
  payload: DriverLocation[];
}

interface DriverOfflineMessage {
  type: 'driver:offline';
  payload: { driverId: string };
}

interface DriverOnlineMessage {
  type: 'driver:online';
  payload: {
    driverId: string;
    isAvailable: boolean;
    driverCode?: string;
    driverName?: string;
    lat?: number;
    lng?: number;
  };
}

interface AuthSuccessMessage {
  type: 'auth:success';
  payload: { role: string; userId: string };
}

interface ErrorMessage {
  type: 'error';
  payload: { message: string; code?: string };
}

interface JobStatusUpdateMessage {
  type: 'job:status_update';
  payload: {
    jobId: string;
    trackingNumber: string;
    status: string;
    previousStatus?: string;
    customerId?: string;
    driverId?: string | null;
    updatedAt: string;
  };
}

interface JobCreatedMessage {
  type: 'job:created';
  payload: {
    jobId: string;
    trackingNumber: string;
    status: string;
    customerId: string;
    createdAt: string;
  };
}

interface JobAssignedMessage {
  type: 'job:assigned';
  payload: {
    jobId: string;
    trackingNumber: string;
    jobNumber?: string | null;
    status: string;
    driverId: string;
    pickupAddress?: string;
    pickupPostcode?: string;
    pickupLatitude?: string | null;
    pickupLongitude?: string | null;
    deliveryAddress?: string;
    deliveryPostcode?: string;
    deliveryLatitude?: string | null;
    deliveryLongitude?: string | null;
    recipientName?: string;
    recipientPhone?: string;
    distance?: string | null;
    vehicleType?: string;
    driverPrice?: string | null;
    staticMapUrl?: string | null;
    assignedAt: string;
    playSound: boolean;
    alert: boolean;
  };
}

interface DocumentPendingMessage {
  type: 'document:pending';
  payload: {
    documentId: string;
    driverId: string;
    driverName?: string;
    documentType: string;
    fileName: string;
    uploadedAt: string;
  };
}

interface JobHiddenMessage {
  type: 'job:hidden';
  payload: {
    jobId: string;
    trackingNumber: string;
    driverId: string;
    hidden: boolean;
    hiddenAt?: string;
  };
}

interface JobWithdrawnMessage {
  type: 'job:withdrawn';
  payload: {
    jobId: string;
    trackingNumber: string;
    driverId: string;
    reason?: string;
    withdrawnAt: string;
  };
}

type OutgoingMessage = 
  | OutgoingLocationMessage 
  | BulkSnapshotMessage 
  | DriverOfflineMessage 
  | DriverOnlineMessage
  | AuthSuccessMessage 
  | ErrorMessage
  | JobStatusUpdateMessage
  | JobCreatedMessage
  | JobAssignedMessage
  | DocumentPendingMessage
  | JobWithdrawnMessage
  | JobHiddenMessage
  | { type: 'pong' };

interface JobSubscription {
  customerId?: string;
  jobId?: string;
  trackingNumber?: string;
}

interface AuthenticatedClient {
  ws: WebSocket;
  user: VerifiedUser;
  driverId?: string;
  isSubscribed: boolean;
  jobSubscription?: JobSubscription;
  lastActivity: number;
}

const driverConnections = new Map<string, AuthenticatedClient>();
const observerConnections = new Map<string, AuthenticatedClient>();
const jobSubscribers = new Map<string, AuthenticatedClient>();
const locationCache = new Map<string, DriverLocation>();
const lastUpdateTime = new Map<string, number>();

const MIN_UPDATE_INTERVAL_MS = 1000;
const HEARTBEAT_INTERVAL_MS = 30000;
const OFFLINE_THRESHOLD_MS = 120000;

export function setupRealtimeServer(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ 
    server,
    path: '/ws/realtime'
  });

  log('WebSocket server initialized on /ws/realtime', 'realtime');

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const clientId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let client: AuthenticatedClient | null = null;

    log(`New WebSocket connection: ${clientId}`, 'realtime');

    const authTimeout = setTimeout(() => {
      if (!client) {
        sendMessage(ws, { type: 'error', payload: { message: 'Authentication timeout', code: 'AUTH_TIMEOUT' } });
        ws.close(4001, 'Authentication timeout');
      }
    }, 10000);

    ws.on('message', async (data: Buffer) => {
      try {
        const message: IncomingMessage_WS = JSON.parse(data.toString());

        if (message.type === 'ping') {
          sendMessage(ws, { type: 'pong' });
          if (client) {
            client.lastActivity = Date.now();
          }
          return;
        }

        if (message.type === 'auth') {
          clearTimeout(authTimeout);
          client = await handleAuth(ws, message, clientId);
          return;
        }

        if (!client) {
          sendMessage(ws, { type: 'error', payload: { message: 'Not authenticated', code: 'NOT_AUTHENTICATED' } });
          return;
        }

        client.lastActivity = Date.now();

        switch (message.type) {
          case 'driver:update_location':
            await handleLocationUpdate(client, message);
            break;
          case 'subscribe:drivers':
            handleSubscribe(client);
            break;
          case 'subscribe:jobs':
            handleJobSubscribe(client, message, clientId);
            break;
          default:
            sendMessage(ws, { type: 'error', payload: { message: 'Unknown message type', code: 'UNKNOWN_TYPE' } });
        }
      } catch (error) {
        log(`Error processing message: ${error}`, 'realtime');
        sendMessage(ws, { type: 'error', payload: { message: 'Invalid message format', code: 'INVALID_FORMAT' } });
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      if (client) {
        if (client.user.role === 'driver' && client.driverId) {
          driverConnections.delete(client.driverId);
          broadcastDriverOffline(client.driverId);
          log(`Driver ${client.driverId} disconnected`, 'realtime');
        } else {
          observerConnections.delete(clientId);
          jobSubscribers.delete(clientId);
          log(`Observer ${clientId} disconnected`, 'realtime');
        }
      }
    });

    ws.on('error', (error) => {
      log(`WebSocket error for ${clientId}: ${error.message}`, 'realtime');
    });
  });

  setInterval(() => {
    const now = Date.now();
    
    driverConnections.forEach((client, driverId) => {
      if (now - client.lastActivity > OFFLINE_THRESHOLD_MS) {
        log(`Driver ${driverId} timed out`, 'realtime');
        client.ws.close(4002, 'Connection timeout');
        driverConnections.delete(driverId);
        broadcastDriverOffline(driverId);
      } else if (client.ws.readyState === WebSocket.OPEN) {
        sendMessage(client.ws, { type: 'pong' });
      }
    });

    observerConnections.forEach((client, clientId) => {
      if (now - client.lastActivity > OFFLINE_THRESHOLD_MS) {
        client.ws.close(4002, 'Connection timeout');
        observerConnections.delete(clientId);
      }
    });
  }, HEARTBEAT_INTERVAL_MS);

  return wss;
}

async function handleAuth(ws: WebSocket, message: AuthMessage, clientId: string): Promise<AuthenticatedClient | null> {
  const { token } = message;

  if (!token) {
    sendMessage(ws, { type: 'error', payload: { message: 'Token required', code: 'INVALID_AUTH' } });
    return null;
  }

  const verifiedUser = await verifyAccessToken(token);
  
  if (!verifiedUser) {
    sendMessage(ws, { type: 'error', payload: { message: 'Invalid or expired token', code: 'AUTH_FAILED' } });
    return null;
  }

  let dbUser = await storage.getUser(verifiedUser.id);
  
  let authorizedRole: string;
  
  if (dbUser && dbUser.role) {
    authorizedRole = dbUser.role;
    log(`WebSocket auth: User ${verifiedUser.id} found in database with role: ${authorizedRole}`, 'realtime');
  } else {
    if (verifiedUser.role === 'driver') {
      authorizedRole = 'driver';
      log(`WebSocket auth: Driver ${verifiedUser.id} not in users table, will validate driver profile`, 'realtime');
    } else if (['admin', 'dispatcher'].includes(verifiedUser.role)) {
      log(`WebSocket auth: Admin/dispatcher user ${verifiedUser.id} authenticated via Supabase token`, 'realtime');
      authorizedRole = verifiedUser.role;
    } else {
      log(`WebSocket auth failed: User ${verifiedUser.id} not in database and metadata role (${verifiedUser.role}) is not allowed`, 'realtime');
      sendMessage(ws, { type: 'error', payload: { message: 'User not found', code: 'USER_NOT_FOUND' } });
      return null;
    }
  }

  const verifiedUserWithDbRole: VerifiedUser = {
    ...verifiedUser,
    role: authorizedRole,
  };

  let driverId: string | undefined;
  
  if (authorizedRole === 'driver') {
    const driver = await storage.getDriver(verifiedUser.id);
    if (driver && driver.isVerified) {
      driverId = driver.id;
    } else {
      log(`WebSocket auth failed: Driver ${verifiedUser.id} not found or not verified`, 'realtime');
      sendMessage(ws, { type: 'error', payload: { message: 'Driver profile not found or not verified', code: 'DRIVER_NOT_VERIFIED' } });
      return null;
    }
  }

  const client: AuthenticatedClient = {
    ws,
    user: verifiedUserWithDbRole,
    driverId,
    isSubscribed: false,
    lastActivity: Date.now(),
  };

  if (authorizedRole === 'driver' && driverId) {
    const existingConnection = driverConnections.get(driverId);
    if (existingConnection) {
      existingConnection.ws.close(4003, 'Replaced by new connection');
    }
    driverConnections.set(driverId, client);
    log(`Driver ${driverId} (${verifiedUser.email}) authenticated via database role`, 'realtime');
    
    // Broadcast driver connection immediately so they appear on live map instantly
    broadcastDriverAvailability(driverId, true).catch(err => {
      log(`Error broadcasting driver availability on connect: ${err}`, 'realtime');
    });
  } else if (['admin', 'dispatcher'].includes(authorizedRole)) {
    observerConnections.set(clientId, client);
    log(`Observer ${authorizedRole}:${verifiedUser.email} authenticated via database role`, 'realtime');
  } else {
    log(`WebSocket auth rejected: User ${verifiedUser.id} has insufficient role: ${authorizedRole}`, 'realtime');
    sendMessage(ws, { type: 'error', payload: { message: 'Insufficient permissions for real-time tracking', code: 'UNAUTHORIZED' } });
    return null;
  }

  sendMessage(ws, { type: 'auth:success', payload: { role: authorizedRole, userId: verifiedUser.id } });
  return client;
}

async function handleLocationUpdate(client: AuthenticatedClient, message: LocationUpdateMessage): Promise<void> {
  if (client.user.role !== 'driver' || !client.driverId) {
    sendMessage(client.ws, { type: 'error', payload: { message: 'Only drivers can update location', code: 'UNAUTHORIZED' } });
    return;
  }

  const { payload } = message;
  const now = Date.now();

  if (payload.driverId !== client.driverId) {
    sendMessage(client.ws, { type: 'error', payload: { message: 'Cannot update another driver\'s location', code: 'UNAUTHORIZED' } });
    return;
  }

  const lastUpdate = lastUpdateTime.get(client.driverId) || 0;
  if (now - lastUpdate < MIN_UPDATE_INTERVAL_MS) {
    return;
  }

  if (typeof payload.lat !== 'number' || typeof payload.lng !== 'number') {
    sendMessage(client.ws, { type: 'error', payload: { message: 'Invalid coordinates', code: 'INVALID_COORDS' } });
    return;
  }

  if (payload.lat < -90 || payload.lat > 90 || payload.lng < -180 || payload.lng > 180) {
    sendMessage(client.ws, { type: 'error', payload: { message: 'Coordinates out of range', code: 'COORDS_OUT_OF_RANGE' } });
    return;
  }

  const location: DriverLocation = {
    driverId: client.driverId,
    lat: payload.lat,
    lng: payload.lng,
    heading: payload.heading,
    speed: payload.speed,
    accuracy: payload.accuracy,
    timestamp: now,
  };

  locationCache.set(client.driverId, location);
  lastUpdateTime.set(client.driverId, now);

  try {
    await storage.updateDriverLocation(
      client.driverId,
      payload.lat.toString(),
      payload.lng.toString()
    );
  } catch (error) {
    log(`Error persisting driver location: ${error}`, 'realtime');
  }

  broadcastLocation(location);
}

function handleSubscribe(client: AuthenticatedClient): void {
  if (!['admin', 'dispatcher'].includes(client.user.role)) {
    sendMessage(client.ws, { type: 'error', payload: { message: 'Only admins and dispatchers can subscribe', code: 'UNAUTHORIZED' } });
    return;
  }

  client.isSubscribed = true;

  const snapshot: DriverLocation[] = Array.from(locationCache.values());
  sendMessage(client.ws, { type: 'driver:bulk_snapshot', payload: snapshot });
  
  log(`Client subscribed to driver locations, sent ${snapshot.length} cached locations`, 'realtime');
}

function handleJobSubscribe(client: AuthenticatedClient, message: SubscribeJobsMessage, clientId: string): void {
  const subscription: JobSubscription = message.payload || {};
  
  if (client.user.role === 'customer') {
    subscription.customerId = client.user.id;
  }
  
  client.jobSubscription = subscription;
  client.isSubscribed = true; // Mark as subscribed so broadcasts reach this client
  jobSubscribers.set(clientId, client);
  
  log(`Client ${clientId} subscribed to job updates (customerId: ${subscription.customerId || 'all'}, jobId: ${subscription.jobId || 'all'})`, 'realtime');
}

export function broadcastJobUpdate(job: {
  id: string;
  trackingNumber: string;
  status: string;
  previousStatus?: string;
  customerId: string;
  driverId?: string | null;
  updatedAt?: Date | null;
}): void {
  const message: JobStatusUpdateMessage = {
    type: 'job:status_update',
    payload: {
      jobId: job.id,
      trackingNumber: job.trackingNumber,
      status: job.status,
      previousStatus: job.previousStatus,
      customerId: job.customerId,
      driverId: job.driverId,
      updatedAt: job.updatedAt?.toISOString() || new Date().toISOString(),
    },
  };

  let sentCount = 0;

  jobSubscribers.forEach((client) => {
    if (client.ws.readyState !== WebSocket.OPEN) return;
    
    const sub = client.jobSubscription;
    if (!sub) return;
    
    const isAdmin = ['admin', 'dispatcher'].includes(client.user.role);
    const matchesCustomer = sub.customerId && sub.customerId === job.customerId;
    const matchesJob = sub.jobId && sub.jobId === job.id;
    const matchesTracking = sub.trackingNumber && sub.trackingNumber === job.trackingNumber;
    // Drivers receive updates for jobs assigned to them
    const isDriverForJob = client.user.role === 'driver' && job.driverId && client.driverId === job.driverId;
    
    if (isAdmin || matchesCustomer || matchesJob || matchesTracking || isDriverForJob) {
      sendMessage(client.ws, message);
      sentCount++;
    }
  });
  
  observerConnections.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN && ['admin', 'dispatcher'].includes(client.user.role)) {
      sendMessage(client.ws, message);
      sentCount++;
    }
  });

  log(`Broadcasted job status update for ${job.id} (${job.status}) to ${sentCount} clients`, 'realtime');
}

export function broadcastJobCreated(job: {
  id: string;
  trackingNumber: string;
  status: string;
  customerId: string;
  createdAt?: Date | null;
}): void {
  const message: JobCreatedMessage = {
    type: 'job:created',
    payload: {
      jobId: job.id,
      trackingNumber: job.trackingNumber,
      status: job.status,
      customerId: job.customerId,
      createdAt: job.createdAt?.toISOString() || new Date().toISOString(),
    },
  };

  observerConnections.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN && ['admin', 'dispatcher'].includes(client.user.role)) {
      sendMessage(client.ws, message);
    }
  });

  jobSubscribers.forEach((client) => {
    if (client.ws.readyState !== WebSocket.OPEN) return;
    const sub = client.jobSubscription;
    if (!sub) return;
    
    const isAdmin = ['admin', 'dispatcher'].includes(client.user.role);
    const matchesCustomer = sub.customerId && sub.customerId === job.customerId;
    
    if (isAdmin || matchesCustomer) {
      sendMessage(client.ws, message);
    }
  });

  log(`Broadcasted job created for ${job.id}`, 'realtime');
}

export function broadcastJobAssigned(job: {
  id: string;
  trackingNumber: string;
  jobNumber?: string | null;
  status: string;
  driverId: string;
  pickupAddress?: string;
  pickupPostcode?: string;
  pickupLatitude?: string | null;
  pickupLongitude?: string | null;
  deliveryAddress?: string;
  deliveryPostcode?: string;
  deliveryLatitude?: string | null;
  deliveryLongitude?: string | null;
  recipientName?: string;
  recipientPhone?: string;
  distance?: string | null;
  vehicleType?: string;
  driverPrice?: string | null;
}): void {
  let staticMapUrl: string | null = null;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (apiKey && job.pickupLatitude && job.pickupLongitude && job.deliveryLatitude && job.deliveryLongitude) {
    staticMapUrl = `https://maps.googleapis.com/maps/api/staticmap?size=600x300&markers=color:green|label:P|${job.pickupLatitude},${job.pickupLongitude}&markers=color:red|label:D|${job.deliveryLatitude},${job.deliveryLongitude}&path=color:0x007BFF|weight:4|${job.pickupLatitude},${job.pickupLongitude}|${job.deliveryLatitude},${job.deliveryLongitude}&key=${apiKey}`;
  }

  const message: JobAssignedMessage = {
    type: 'job:assigned',
    payload: {
      jobId: job.id,
      trackingNumber: job.trackingNumber,
      jobNumber: job.jobNumber || null,
      status: job.status,
      driverId: job.driverId,
      pickupAddress: job.pickupAddress,
      pickupPostcode: job.pickupPostcode,
      pickupLatitude: job.pickupLatitude,
      pickupLongitude: job.pickupLongitude,
      deliveryAddress: job.deliveryAddress,
      deliveryPostcode: job.deliveryPostcode,
      deliveryLatitude: job.deliveryLatitude,
      deliveryLongitude: job.deliveryLongitude,
      recipientName: job.recipientName,
      recipientPhone: job.recipientPhone,
      distance: job.distance,
      vehicleType: job.vehicleType,
      driverPrice: job.driverPrice,
      staticMapUrl: staticMapUrl,
      assignedAt: new Date().toISOString(),
      playSound: true,
      alert: true,
    },
  };

  let sentCount = 0;

  // Send to all connected drivers that match this driverId
  driverConnections.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN && client.driverId === job.driverId) {
      sendMessage(client.ws, message);
      sentCount++;
      log(`Sent job assignment notification to driver ${job.driverId}`, 'realtime');
    }
  });

  // Also send to job subscribers who are this driver
  jobSubscribers.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN && client.driverId === job.driverId) {
      sendMessage(client.ws, message);
      sentCount++;
    }
  });

  // Send to admins/dispatchers for monitoring
  observerConnections.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN && ['admin', 'dispatcher'].includes(client.user.role)) {
      sendMessage(client.ws, message);
      sentCount++;
    }
  });

  log(`Broadcasted job assignment for ${job.id} to driver ${job.driverId} (${sentCount} clients)`, 'realtime');
}

export function broadcastJobHidden(job: {
  id: string;
  trackingNumber: string;
  driverId: string;
  hidden: boolean;
  hiddenAt?: Date | null;
}): void {
  const message: JobHiddenMessage = {
    type: 'job:hidden',
    payload: {
      jobId: job.id,
      trackingNumber: job.trackingNumber,
      driverId: job.driverId,
      hidden: job.hidden,
      hiddenAt: job.hiddenAt?.toISOString(),
    },
  };

  let sentCount = 0;

  // Send to the specific driver whose job visibility changed
  driverConnections.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN && client.driverId === job.driverId) {
      sendMessage(client.ws, message);
      sentCount++;
    }
  });

  // Also send to job subscribers who are this driver
  jobSubscribers.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN && client.driverId === job.driverId) {
      sendMessage(client.ws, message);
      sentCount++;
    }
  });

  log(`Broadcasted job hidden status for ${job.id} (hidden: ${job.hidden}) to driver ${job.driverId} (${sentCount} clients)`, 'realtime');
}

export function broadcastJobWithdrawn(job: {
  id: string;
  trackingNumber: string;
  driverId: string;
  reason?: string;
}): void {
  const message: JobWithdrawnMessage = {
    type: 'job:withdrawn',
    payload: {
      jobId: job.id,
      trackingNumber: job.trackingNumber,
      driverId: job.driverId,
      reason: job.reason,
      withdrawnAt: new Date().toISOString(),
    },
  };

  let sentCount = 0;

  // Send to the specific driver whose job was withdrawn
  driverConnections.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN && client.driverId === job.driverId) {
      sendMessage(client.ws, message);
      sentCount++;
    }
  });

  // Also send to job subscribers who are this driver
  jobSubscribers.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN && client.driverId === job.driverId) {
      sendMessage(client.ws, message);
      sentCount++;
    }
  });

  // Also send to admins/dispatchers for monitoring
  observerConnections.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN && ['admin', 'dispatcher'].includes(client.user.role)) {
      sendMessage(client.ws, message);
      sentCount++;
    }
  });

  log(`Broadcasted job withdrawn for ${job.id} to driver ${job.driverId} (${sentCount} clients)`, 'realtime');
}

export function broadcastDocumentPending(document: {
  id: string;
  driverId: string;
  driverName?: string;
  type: string;
  fileName: string;
  uploadedAt?: Date | null;
}): void {
  const message: DocumentPendingMessage = {
    type: 'document:pending',
    payload: {
      documentId: document.id,
      driverId: document.driverId,
      driverName: document.driverName,
      documentType: document.type,
      fileName: document.fileName,
      uploadedAt: document.uploadedAt?.toISOString() || new Date().toISOString(),
    },
  };

  let sentCount = 0;

  // Send only to admins/dispatchers
  observerConnections.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN && ['admin', 'dispatcher'].includes(client.user.role)) {
      sendMessage(client.ws, message);
      sentCount++;
    }
  });

  // Also send to job subscribers who are admins
  jobSubscribers.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN && ['admin', 'dispatcher'].includes(client.user.role)) {
      sendMessage(client.ws, message);
      sentCount++;
    }
  });

  log(`Broadcasted document pending for ${document.id} (${document.type}) to ${sentCount} admin clients`, 'realtime');
}

// Broadcast profile updates to a specific driver (for real-time sync between web and mobile)
export function broadcastProfileUpdate(driverId: string, profileData: Record<string, any>): void {
  const message = {
    type: 'driver:profile_update',
    payload: {
      driverId,
      ...profileData,
      updatedAt: new Date().toISOString(),
    },
  };

  let sentCount = 0;

  // Send to the specific driver if connected
  const driverClient = driverConnections.get(driverId);
  if (driverClient && driverClient.ws.readyState === WebSocket.OPEN) {
    sendMessage(driverClient.ws, message);
    sentCount++;
  }

  // Also send to admins/dispatchers for monitoring
  observerConnections.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN && ['admin', 'dispatcher'].includes(client.user.role)) {
      sendMessage(client.ws, message);
      sentCount++;
    }
  });

  log(`Broadcasted profile update for driver ${driverId} to ${sentCount} clients`, 'realtime');
}

function broadcastLocation(location: DriverLocation): void {
  const message: OutgoingLocationMessage = {
    type: 'driver:location',
    payload: location,
  };

  observerConnections.forEach((client) => {
    if (client.isSubscribed && client.ws.readyState === WebSocket.OPEN) {
      sendMessage(client.ws, message);
    }
  });
}

function broadcastDriverOffline(driverId: string): void {
  locationCache.delete(driverId);
  lastUpdateTime.delete(driverId);

  const message: DriverOfflineMessage = {
    type: 'driver:offline',
    payload: { driverId },
  };

  observerConnections.forEach((client) => {
    if (client.isSubscribed && client.ws.readyState === WebSocket.OPEN) {
      sendMessage(client.ws, message);
    }
  });
}

function sendMessage(ws: WebSocket, message: OutgoingMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export async function hydrateLocationCache(): Promise<void> {
  try {
    const drivers = await storage.getDrivers();
    let count = 0;
    
    for (const driver of drivers) {
      if (driver.currentLatitude && driver.currentLongitude) {
        const lat = parseFloat(driver.currentLatitude);
        const lng = parseFloat(driver.currentLongitude);
        
        if (!isNaN(lat) && !isNaN(lng)) {
          locationCache.set(driver.id, {
            driverId: driver.id,
            lat,
            lng,
            timestamp: driver.lastLocationUpdate?.getTime() || Date.now(),
            isAvailable: driver.isAvailable === true,
            driverCode: driver.driverCode || undefined,
            driverName: driver.fullName || undefined,
          });
          count++;
        }
      }
    }
    
    log(`Hydrated location cache with ${count} driver locations`, 'realtime');
  } catch (error) {
    log(`Error hydrating location cache: ${error}`, 'realtime');
  }
}

export function getConnectionStats(): { drivers: number; observers: number; cachedLocations: number } {
  return {
    drivers: driverConnections.size,
    observers: observerConnections.size,
    cachedLocations: locationCache.size,
  };
}

export function broadcastLocationUpdate(
  driverId: string, 
  lat: number, 
  lng: number, 
  status: 'available' | 'busy' | 'offline' = 'available'
): void {
  const location: DriverLocation = {
    driverId,
    lat,
    lng,
    timestamp: Date.now(),
  };

  locationCache.set(driverId, location);
  lastUpdateTime.set(driverId, Date.now());
  
  broadcastLocation(location);
}

export async function broadcastDriverAvailability(
  driverId: string,
  isAvailable: boolean
): Promise<void> {
  try {
    const driver = await storage.getDriver(driverId);
    if (!driver) {
      log(`broadcastDriverAvailability: driver ${driverId} not found`, 'realtime');
      return;
    }

    const lat = driver.currentLatitude ? parseFloat(driver.currentLatitude) : undefined;
    const lng = driver.currentLongitude ? parseFloat(driver.currentLongitude) : undefined;

    const driverName = driver.fullName || 'Unknown Driver';
    
    const message: DriverOnlineMessage = {
      type: 'driver:online',
      payload: {
        driverId,
        isAvailable,
        driverCode: driver.driverCode || undefined,
        driverName,
        lat,
        lng,
      },
    };

    log(`Broadcasting driver ${isAvailable ? 'ONLINE' : 'OFFLINE'}: ${driver.driverCode || driverId}`, 'realtime');

    if (isAvailable && lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) {
      const location: DriverLocation = {
        driverId,
        lat,
        lng,
        timestamp: Date.now(),
        isAvailable: true,
        driverCode: driver.driverCode || undefined,
        driverName,
      };
      locationCache.set(driverId, location);
      lastUpdateTime.set(driverId, Date.now());
      broadcastLocation(location);
    } else if (!isAvailable) {
      locationCache.delete(driverId);
      lastUpdateTime.delete(driverId);
    }

    observerConnections.forEach((client) => {
      if (client.isSubscribed && client.ws.readyState === WebSocket.OPEN) {
        sendMessage(client.ws, message);
      }
    });
  } catch (error) {
    log(`Error in broadcastDriverAvailability: ${error}`, 'realtime');
  }
}
