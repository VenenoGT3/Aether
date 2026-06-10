import { supabase } from "./client";

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  content: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export async function createNotification(
  userId: string,
  title: string,
  content: string,
  type: string
): Promise<{ data: NotificationItem | null; error: unknown }> {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .insert({ user_id: userId, title, content, type, is_read: false })
      .select()
      .single();

    return { data: data as NotificationItem, error };
  } catch (err) {
    console.error("Error creating notification:", err);
    return { data: null, error: err };
  }
}

export async function getNotifications(
  userId: string
): Promise<{ data: NotificationItem[]; error: unknown }> {
  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    return { data: (data || []) as NotificationItem[], error };
  } catch (err) {
    console.error("Error fetching notifications:", err);
    return { data: [], error: err };
  }
}

export async function markNotificationRead(
  notificationId: string
): Promise<{ success: boolean; error: unknown }> {
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);

    return { success: !error, error };
  } catch (err) {
    console.error("Error marking notification as read:", err);
    return { success: false, error: err };
  }
}

export async function markAllNotificationsRead(
  userId: string
): Promise<{ success: boolean; error: unknown }> {
  try {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId);

    return { success: !error, error };
  } catch (err) {
    console.error("Error marking all notifications as read:", err);
    return { success: false, error: err };
  }
}

export async function deleteNotification(
  notificationId: string
): Promise<{ success: boolean; error: unknown }> {
  try {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", notificationId);

    return { success: !error, error };
  } catch (err) {
    console.error("Error deleting notification:", err);
    return { success: false, error: err };
  }
}
