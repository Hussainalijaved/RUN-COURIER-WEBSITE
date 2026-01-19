# Mobile App Integration Guide

This document explains how the Run Courier mobile app should integrate with the backend for push notifications, real-time updates, map coordinates, and proof of delivery.

## 1. Push Notifications (Critical for Background Alerts)

### Problem: No sound when app is closed
The push notification system uses Expo Push Notifications with high priority and sound enabled. However, **the mobile app must register its push token on startup**.

### Solution: Register Push Token on App Startup

**Endpoint:** `POST /api/mobile/v1/driver/push-token`

**Headers:**
```
Authorization: Bearer <supabase_jwt_token>
```

**Body:**
```json
{
  "pushToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxx]",
  "platform": "android" | "ios",
  "appVersion": "1.0.0",
  "deviceInfo": "Pixel 6, Android 14"
}
```

**When to call:**
1. On app startup/login
2. When push token changes (Expo provides this via `addPushTokenListener`)
3. When user logs in as a driver

**Example (React Native/Expo):**
```javascript
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

async function registerForPushNotifications(authToken) {
  // Get push token
  const { data: pushToken } = await Notifications.getExpoPushTokenAsync({
    projectId: 'your-expo-project-id'
  });

  // Register with backend
  await fetch('https://your-domain.com/api/mobile/v1/driver/push-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    body: JSON.stringify({
      pushToken: pushToken,
      platform: Device.osName?.toLowerCase() === 'ios' ? 'ios' : 'android',
      appVersion: '1.0.0',
      deviceInfo: `${Device.modelName}, ${Device.osName} ${Device.osVersion}`
    })
  });
}
```

### Android Notification Channel
For Android, ensure you create a notification channel with high importance:

```javascript
Notifications.setNotificationChannelAsync('job-offers', {
  name: 'Job Offers',
  importance: Notifications.AndroidImportance.HIGH,
  sound: 'default',
  vibrationPattern: [0, 250, 250, 250],
  enableVibrate: true,
});
```

---

## 2. Real-Time Job Updates (Eliminate Manual Refresh)

### Problem: Driver has to manually refresh to see new jobs
The backend broadcasts `job:assigned` events via WebSocket when jobs are assigned.

### Solution: Connect to WebSocket on App Startup

**WebSocket URL:** `wss://your-domain.com/ws/realtime`

**Connection Flow:**
1. Connect to WebSocket
2. Send auth message with JWT token
3. Listen for `job:assigned` events
4. Update local state when events are received

**Example:**
```javascript
import { useEffect, useState } from 'react';

function useRealtimeJobs(authToken) {
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    const ws = new WebSocket('wss://your-domain.com/ws/realtime');

    ws.onopen = () => {
      // Authenticate
      ws.send(JSON.stringify({
        type: 'auth',
        token: authToken
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'auth:success') {
        console.log('WebSocket authenticated');
      }
      
      if (data.type === 'job:assigned') {
        // New job assigned - update state immediately
        const newJob = data.payload;
        setJobs(prev => [newJob, ...prev]);
        
        // Optional: Show in-app alert
        Alert.alert('New Job!', `${newJob.pickupAddress} → ${newJob.deliveryAddress}`);
      }
      
      if (data.type === 'job:status_update') {
        // Job status changed - update in state
        setJobs(prev => prev.map(j => 
          j.jobId === data.payload.jobId 
            ? { ...j, status: data.payload.status }
            : j
        ));
      }
    };

    ws.onclose = () => {
      // Reconnect after 5 seconds
      setTimeout(() => {
        // Reconnect logic
      }, 5000);
    };

    return () => ws.close();
  }, [authToken]);

  return jobs;
}
```

---

## 3. Map Coordinates

### Problem: "Location data unavailable" on Active Job screen
The API returns coordinates in every job response.

### Fields Returned:
- `pickupLatitude` - Pickup location latitude (string)
- `pickupLongitude` - Pickup location longitude (string)
- `deliveryLatitude` - Delivery location latitude (string)
- `deliveryLongitude` - Delivery location longitude (string)

### Endpoint: `GET /api/mobile/v1/driver/jobs`

**Response Example:**
```json
{
  "success": true,
  "jobs": [
    {
      "id": "123",
      "trackingNumber": "RC240115-0001",
      "status": "assigned",
      "pickupAddress": "123 London Road, London, SW1A 1AA",
      "pickupLatitude": "51.5074",
      "pickupLongitude": "-0.1278",
      "deliveryAddress": "456 Oxford Street, London, W1D 1BS",
      "deliveryLatitude": "51.5155",
      "deliveryLongitude": "-0.1419",
      "driverPrice": "25.00",
      ...
    }
  ]
}
```

### Troubleshooting Map Issues:
1. **Check if coordinates are null:** If null, the job wasn't geocoded. Contact admin.
2. **Check Google Maps API Key:** Ensure the API key is injected into MapView.
3. **Parse coordinates correctly:** They are returned as strings, convert to numbers.

```javascript
const pickupCoord = {
  latitude: parseFloat(job.pickupLatitude),
  longitude: parseFloat(job.pickupLongitude)
};

const deliveryCoord = {
  latitude: parseFloat(job.deliveryLatitude),
  longitude: parseFloat(job.deliveryLongitude)
};
```

---

## 4. Proof of Delivery (POD) Upload

### Problem: Photos don't appear on admin dashboard
The POD upload endpoint saves images to Supabase Storage and updates the job record.

### Endpoint: `POST /api/mobile/v1/driver/jobs/:jobId/pod/upload`

**Headers:**
```
Authorization: Bearer <supabase_jwt_token>
Content-Type: multipart/form-data
```

**Form Fields:**
- `photo` - Image file (JPEG, PNG, GIF, WebP, max 10MB)
- `signature` - Signature image file (optional)
- `recipientName` - Text field for recipient's name

**Requirements:**
1. Job status must be `on_the_way_delivery` or `delivered`
2. Job must be assigned to the authenticated driver
3. At least one of `photo` or `signature` is required

**Example (React Native):**
```javascript
async function uploadPOD(jobId, photoUri, signatureUri, recipientName, authToken) {
  const formData = new FormData();
  
  if (photoUri) {
    formData.append('photo', {
      uri: photoUri,
      type: 'image/jpeg',
      name: 'delivery-photo.jpg'
    });
  }
  
  if (signatureUri) {
    formData.append('signature', {
      uri: signatureUri,
      type: 'image/png',
      name: 'signature.png'
    });
  }
  
  if (recipientName) {
    formData.append('recipientName', recipientName);
  }
  
  const response = await fetch(
    `https://your-domain.com/api/mobile/v1/driver/jobs/${jobId}/pod/upload`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        // Don't set Content-Type - fetch will set it with boundary
      },
      body: formData
    }
  );
  
  return response.json();
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Proof of Delivery uploaded successfully",
  "pod": {
    "photoUrl": "https://your-supabase-url/storage/v1/object/public/pod-images/job_123/photo_xxx.jpg",
    "signatureUrl": "https://your-supabase-url/storage/v1/object/public/pod-images/job_123/signature_xxx.png",
    "recipientName": "John Smith"
  }
}
```

---

## 5. Database Migration Required

Before push notifications and POD uploads will work, run this SQL in Supabase SQL Editor:

**File:** `supabase/migrations/020_driver_devices_and_pod.sql`

This creates:
- `driver_devices` table for push token storage
- POD columns in jobs table if missing
- Coordinate columns if missing
- Appropriate RLS policies

---

## 6. Debugging Endpoints (Admin Only)

### Check driver's push notification status:
```
GET /api/debug/driver-notifications/:driverId
```

### Test push notification to driver:
```
POST /api/admin/test-push/:driverId
```

### View all registered devices:
```
GET /api/debug/all-driver-devices
```

---

## 7. End-to-End Test Checklist

1. [ ] Mobile app registers push token on startup
2. [ ] `driver_devices` table has entry for the driver
3. [ ] Admin assigns job via web dashboard
4. [ ] Driver's phone receives push notification with sound (even when app closed)
5. [ ] Driver opens app and sees job immediately (no refresh needed)
6. [ ] Map shows pickup and delivery pins
7. [ ] Driver can accept job and update status
8. [ ] Driver takes POD photo and uploads
9. [ ] Admin sees POD photo on job detail page
