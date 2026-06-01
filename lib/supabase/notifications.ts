import { supabase, isMockMode } from "./client";

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  content: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

const STORAGE_KEY = "aether-mock-notifications";

// Helper to trigger custom event for real-time local sync
function dispatchLocalNotificationSync() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("aether-notifications-update"));
  }
}

export async function createNotification(
  userId: string,
  title: string,
  content: string,
  type: string
): Promise<{ data: NotificationItem | null; error: any }> {
  const newNotif = {
    id: `notif_${Math.random().toString(36).substr(2, 9)}`,
    user_id: userId,
    title,
    content,
    type,
    is_read: false,
    created_at: new Date().toISOString()
  };

  if (isMockMode) {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      const notifications = stored ? JSON.parse(stored) : [];
      notifications.unshift(newNotif);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
      dispatchLocalNotificationSync();
    }
    return { data: newNotif, error: null };
  }

  try {
    const { data, error } = await supabase
      .from("notifications")
      .insert({
        user_id: userId,
        title,
        content,
        type,
        is_read: false
      })
      .select()
      .single();
    
    return { data: data as NotificationItem, error };
  } catch (err: any) {
    console.error("Error creating live notification:", err);
    return { data: null, error: err };
  }
}

export async function getNotifications(userId: string): Promise<{ data: NotificationItem[]; error: any }> {
  if (isMockMode) {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      const notifications = stored ? JSON.parse(stored) : [];
      const userNotifs = notifications.filter((n: any) => n.user_id === userId);
      return { data: userNotifs, error: null };
    }
    return { data: [], error: null };
  }

  try {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    return { data: (data || []) as NotificationItem[], error };
  } catch (err: any) {
    console.error("Error fetching live notifications:", err);
    return { data: [], error: err };
  }
}

export async function markNotificationRead(notificationId: string): Promise<{ success: boolean; error: any }> {
  if (isMockMode) {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const notifications = JSON.parse(stored);
        const updated = notifications.map((n: any) => 
          n.id === notificationId ? { ...n, is_read: true } : n
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        dispatchLocalNotificationSync();
      }
    }
    return { success: true, error: null };
  }

  try {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);

    return { success: !error, error };
  } catch (err: any) {
    console.error("Error marking live notification as read:", err);
    return { success: false, error: err };
  }
}

export async function markAllNotificationsRead(userId: string): Promise<{ success: boolean; error: any }> {
  if (isMockMode) {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const notifications = JSON.parse(stored);
        const updated = notifications.map((n: any) => 
          n.user_id === userId ? { ...n, is_read: true } : n
        );
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        dispatchLocalNotificationSync();
      }
    }
    return { success: true, error: null };
  }

  try {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId);

    return { success: !error, error };
  } catch (err: any) {
    console.error("Error marking all live notifications as read:", err);
    return { success: false, error: err };
  }
}

export async function deleteNotification(notificationId: string): Promise<{ success: boolean; error: any }> {
  if (isMockMode) {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const notifications = JSON.parse(stored);
        const filtered = notifications.filter((n: any) => n.id !== notificationId);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
        dispatchLocalNotificationSync();
      }
    }
    return { success: true, error: null };
  }

  try {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", notificationId);

    return { success: !error, error };
  } catch (err: any) {
    console.error("Error deleting live notification:", err);
    return { success: false, error: err };
  }
}
