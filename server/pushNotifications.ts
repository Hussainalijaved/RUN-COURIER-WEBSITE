import { supabaseAdmin } from "./supabaseAdmin";
import { randomUUID } from "crypto";
import { log } from "./index";

interface DriverDevice {
  id: string;
  driver_id: string;
  push_token: string;
  platform: "ios" | "android";
  app_version?: string;
  device_info?: string;
  last_seen_at?: string;
  created_at?: string;
}

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
  if (!supabaseAdmin) {
    log("Supabase admin client not initialized", "push");
    return { success: false, error: "Supabase not configured" };
  }

  try {
    const { data: existingDevice, error: selectError } = await supabaseAdmin
      .from("driver_devices")
      .select("*")
      .eq("driver_id", driverId)
      .eq("push_token", pushToken)
      .maybeSingle();

    if (selectError && !selectError.message.includes("does not exist")) {
      log(`Error checking existing device: ${selectError.message}`, "push");
    }

    if (existingDevice) {
      const { error: updateError } = await supabaseAdmin
        .from("driver_devices")
        .update({
          last_seen_at: new Date().toISOString(),
          app_version: appVersion,
          device_info: deviceInfo,
        })
        .eq("id", existingDevice.id);

      if (updateError) {
        log(`Failed to update device: ${updateError.message}`, "push");
        return { success: false, error: updateError.message };
      }

      log(`Updated device registration for driver ${driverId}`, "push");
      return { success: true, deviceId: existingDevice.id };
    }

    const deviceId = randomUUID();
    const { error: insertError } = await supabaseAdmin
      .from("driver_devices")
      .insert({
        id: deviceId,
        driver_id: driverId,
        push_token: pushToken,
        platform,
        app_version: appVersion,
        device_info: deviceInfo,
      });

    if (insertError) {
      if (insertError.message.includes("does not exist")) {
        log("driver_devices table does not exist in Supabase - please create it", "push");
        return { success: false, error: "Table not configured. Please contact admin." };
      }
      log(`Failed to insert device: ${insertError.message}`, "push");
      return { success: false, error: insertError.message };
    }

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
  if (!supabaseAdmin) {
    return { success: false, error: "Supabase not configured" };
  }

  try {
    const { error } = await supabaseAdmin
      .from("driver_devices")
      .delete()
      .eq("driver_id", driverId)
      .eq("push_token", pushToken);

    if (error) {
      log(`Failed to unregister device: ${error.message}`, "push");
      return { success: false, error: error.message };
    }

    log(`Unregistered device for driver ${driverId}`, "push");
    return { success: true };
  } catch (error) {
    log(`Failed to unregister device: ${error}`, "push");
    return { success: false, error: String(error) };
  }
}

export async function getDriverDevices(driverId: string): Promise<DriverDevice[]> {
  if (!supabaseAdmin) {
    log("Supabase admin client not initialized", "push");
    return [];
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("driver_devices")
      .select("*")
      .eq("driver_id", driverId);

    if (error) {
      if (error.message.includes("does not exist")) {
        log("driver_devices table does not exist yet", "push");
        return [];
      }
      log(`Failed to get devices: ${error.message}`, "push");
      return [];
    }

    return data || [];
  } catch (error) {
    log(`Failed to get devices: ${error}`, "push");
    return [];
  }
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
    to: device.push_token,
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
    to: device.push_token,
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
