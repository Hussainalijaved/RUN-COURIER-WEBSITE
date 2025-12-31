import { db } from "./db";
import { driverDevices } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { log } from "./index";

interface ExpoPushMessage {
  to: string;
  sound?: "default" | null;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: "default" | "normal" | "high";
  channelId?: string;
  categoryId?: string;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

export async function registerDriverDevice(
  driverId: string,
  pushToken: string,
  platform: "ios" | "android",
  appVersion?: string,
  deviceInfo?: string
): Promise<{ success: boolean; deviceId?: string; error?: string }> {
  try {
    const existingDevice = await db
      .select()
      .from(driverDevices)
      .where(and(
        eq(driverDevices.driverId, driverId),
        eq(driverDevices.pushToken, pushToken)
      ))
      .limit(1);

    if (existingDevice.length > 0) {
      await db
        .update(driverDevices)
        .set({
          lastSeenAt: new Date(),
          appVersion,
          deviceInfo,
        })
        .where(eq(driverDevices.id, existingDevice[0].id));

      log(`Updated device registration for driver ${driverId}`, "push");
      return { success: true, deviceId: existingDevice[0].id };
    }

    const deviceId = randomUUID();
    await db.insert(driverDevices).values({
      id: deviceId,
      driverId,
      pushToken,
      platform,
      appVersion,
      deviceInfo,
    });

    log(`Registered new device for driver ${driverId}`, "push");
    return { success: true, deviceId };
  } catch (error) {
    log(`Failed to register device: ${error}`, "push");
    return { success: false, error: String(error) };
  }
}

export async function unregisterDriverDevice(
  driverId: string,
  pushToken: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await db
      .delete(driverDevices)
      .where(and(
        eq(driverDevices.driverId, driverId),
        eq(driverDevices.pushToken, pushToken)
      ));

    log(`Unregistered device for driver ${driverId}`, "push");
    return { success: true };
  } catch (error) {
    log(`Failed to unregister device: ${error}`, "push");
    return { success: false, error: String(error) };
  }
}

export async function getDriverDevices(driverId: string) {
  return db
    .select()
    .from(driverDevices)
    .where(eq(driverDevices.driverId, driverId));
}

async function sendExpoPushNotifications(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return [];

  const validMessages = messages.filter(m => 
    m.to && (m.to.startsWith("ExponentPushToken[") || m.to.startsWith("ExpoPushToken["))
  );

  if (validMessages.length === 0) {
    log("No valid Expo push tokens to send to", "push");
    return [];
  }

  try {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(validMessages),
    });

    const result = await response.json();
    
    if (result.errors) {
      log(`Expo push errors: ${JSON.stringify(result.errors)}`, "push");
    }

    return result.data || [];
  } catch (error) {
    log(`Failed to send push notifications: ${error}`, "push");
    return [];
  }
}

export async function sendJobOfferNotification(
  driverId: string,
  jobDetails: {
    jobId: string;
    trackingNumber: string;
    pickupAddress?: string;
    deliveryAddress?: string;
    driverPrice?: string | null;
    vehicleType?: string;
  }
): Promise<{ success: boolean; sentCount: number }> {
  const devices = await getDriverDevices(driverId);

  if (devices.length === 0) {
    log(`No registered devices for driver ${driverId}`, "push");
    return { success: false, sentCount: 0 };
  }

  const priceText = jobDetails.driverPrice 
    ? `£${parseFloat(jobDetails.driverPrice).toFixed(2)}`
    : "Price TBD";

  const pickupShort = jobDetails.pickupAddress?.split(",")[0] || "Pickup";
  const deliveryShort = jobDetails.deliveryAddress?.split(",")[0] || "Delivery";

  const messages: ExpoPushMessage[] = devices.map(device => ({
    to: device.pushToken,
    sound: "default",
    title: "New Job Offer!",
    body: `${pickupShort} → ${deliveryShort} | ${priceText}`,
    data: {
      type: "job_offer",
      jobId: jobDetails.jobId,
      trackingNumber: jobDetails.trackingNumber,
      screen: "JobOffers",
    },
    priority: "high",
    channelId: "job-offers",
  }));

  const tickets = await sendExpoPushNotifications(messages);
  const successCount = tickets.filter(t => t.status === "ok").length;

  log(`Sent job offer notification to ${successCount}/${devices.length} devices for driver ${driverId}`, "push");

  return { success: successCount > 0, sentCount: successCount };
}

export async function sendJobStatusNotification(
  driverId: string,
  jobDetails: {
    jobId: string;
    trackingNumber: string;
    status: string;
    message?: string;
  }
): Promise<{ success: boolean; sentCount: number }> {
  const devices = await getDriverDevices(driverId);

  if (devices.length === 0) {
    return { success: false, sentCount: 0 };
  }

  const statusMessages: Record<string, string> = {
    cancelled: "A job has been cancelled",
    accepted: "Job accepted successfully",
    delivered: "Job marked as delivered",
  };

  const body = jobDetails.message || statusMessages[jobDetails.status] || `Job status: ${jobDetails.status}`;

  const messages: ExpoPushMessage[] = devices.map(device => ({
    to: device.pushToken,
    sound: "default",
    title: `Job ${jobDetails.trackingNumber}`,
    body,
    data: {
      type: "job_status",
      jobId: jobDetails.jobId,
      trackingNumber: jobDetails.trackingNumber,
      status: jobDetails.status,
    },
    priority: "normal",
    channelId: "job-updates",
  }));

  const tickets = await sendExpoPushNotifications(messages);
  const successCount = tickets.filter(t => t.status === "ok").length;

  return { success: successCount > 0, sentCount: successCount };
}
