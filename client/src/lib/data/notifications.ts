import { supabase, handleSupabaseError } from './base';
import type { Notification } from './base';

export async function listNotifications(userId: string, unreadOnly = false): Promise<Notification[]> {
  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const { data, error } = await query;
  
  if (error) throw handleSupabaseError(error);
  return (data || []).map(mapNotificationFromDb);
}

export async function getNotificationById(id: string): Promise<Notification | null> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapNotificationFromDb(data) : null;
}

export async function createNotification(notificationData: {
  userId: string;
  title: string;
  message: string;
  type?: string;
  data?: Record<string, unknown>;
}): Promise<Notification> {
  const dbData = {
    id: crypto.randomUUID(),
    user_id: notificationData.userId,
    title: notificationData.title,
    message: notificationData.message,
    type: notificationData.type || 'info',
    is_read: false,
    data: notificationData.data || null,
  };

  const { data, error } = await supabase
    .from('notifications')
    .insert(dbData)
    .select()
    .single();

  if (error) throw handleSupabaseError(error);
  return mapNotificationFromDb(data);
}

export async function markNotificationAsRead(id: string): Promise<Notification | null> {
  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw handleSupabaseError(error);
  }
  
  return data ? mapNotificationFromDb(data) : null;
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw handleSupabaseError(error);
}

export async function deleteNotification(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', id);

  if (error) throw handleSupabaseError(error);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw handleSupabaseError(error);
  return count || 0;
}

function mapNotificationFromDb(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    message: row.message as string,
    type: row.type as string,
    isRead: row.is_read as boolean,
    data: row.data as Record<string, unknown> | null,
    createdAt: row.created_at as string,
  };
}

export function subscribeToNotifications(
  userId: string,
  callback: (payload: { eventType: string; new: Notification | null }) => void
) {
  return supabase
    .channel(`notifications-${userId}`)
    .on(
      'postgres_changes',
      { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'notifications',
        filter: `user_id=eq.${userId}`
      },
      (payload) => {
        callback({
          eventType: payload.eventType,
          new: payload.new ? mapNotificationFromDb(payload.new as Record<string, unknown>) : null,
        });
      }
    )
    .subscribe();
}
