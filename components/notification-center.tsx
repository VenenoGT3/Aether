"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Bell, 
  Check, 
  MessageCircle, 
  DollarSign, 
  Sparkles, 
  Info, 
  X,
  Smartphone,
  CheckCircle,
  HelpCircle,
  AlertTriangle
} from "lucide-react";
import { 
  getNotifications, 
  markNotificationRead, 
  markAllNotificationsRead, 
  deleteNotification, 
  NotificationItem 
} from "@/lib/supabase/notifications";
import { getClientProfile, supabase } from "@/lib/supabase/client";
import { Profile } from "@/types";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const appleSpring = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
  mass: 0.8
};

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<"all" | "campaign" | "payment" | "message" | "system">("all");
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [user, setUser] = useState<Profile | null>(null);

  // Resolve the signed-in user (and refresh on auth changes).
  useEffect(() => {
    let active = true;
    const refresh = () => {
      getClientProfile()
        .then((p) => {
          if (active) setUser(p);
        })
        .catch(() => {
          if (active) setUser(null);
        });
    };
    refresh();
    window.addEventListener("role-change", refresh);
    return () => {
      active = false;
      window.removeEventListener("role-change", refresh);
    };
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const { data } = await getNotifications(user.user_id);
    setNotifications(data);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount
    loadNotifications();

    // Realtime subscription for this user's notifications.
    const channel = supabase
      .channel(`realtime-notifications-${user.user_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.user_id}`,
        },
        () => {
          loadNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, loadNotifications]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // PWA push notification initialization
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read browser permission on mount
      setPushPermission(Notification.permission);
    }
  }, []);

  // Request PWA Push Notifications permissions
  const handleRequestPushPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("Notifications are not supported in this browser.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);

      if (permission === "granted") {
        if ("serviceWorker" in navigator) {
          // Register sw if not already done
          await navigator.serviceWorker.register("/sw.js");
          toast.success("Push notifications configured!", {
            description: "Aether is authorized to deliver system notifications."
          });
        }
      } else if (permission === "denied") {
        toast.warning("Notification permission denied. Review browser settings to unlock.");
      }
    } catch {
      toast.error("Failed to request notification permission.");
    }
  };

  // Test local push notification
  const handleTriggerTestPush = async () => {
    if (pushPermission !== "granted") {
      toast.error("Please grant notification permission first.");
      return;
    }

    toast.info("Push notification will arrive in 3 seconds...", { id: "test-push-load" });

    setTimeout(async () => {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          reg.showNotification("Aether Test Alert", {
            body: "This is a native push notification verifying service worker connectivity.",
            icon: "/favicon.ico",
            badge: "/favicon.ico",
            vibrate: [100, 50, 100],
            data: { url: "/creator/dashboard" }
          } as NotificationOptions & { vibrate?: number[] });
          toast.success("Test push triggered!", { id: "test-push-load" });
        } else {
          // Fallback to standard client notification if worker not active yet
          new Notification("Aether Client Alert", {
            body: "Verifying native client notification bubble (SW fallback).",
            icon: "/favicon.ico"
          });
          toast.success("Test client bubble triggered!", { id: "test-push-load" });
        }
      }
    }, 3000);
  };

  // Action methods
  const handleMarkRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await markNotificationRead(id);
    loadNotifications();
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    await markAllNotificationsRead(user.user_id);
    loadNotifications();
    toast.success("All notifications marked as read.");
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteNotification(id);
    loadNotifications();
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Filter list
  const filteredNotifications = notifications.filter(n => {
    if (activeFilter === "all") return true;
    if (activeFilter === "campaign") return n.type === "campaign_invite" || n.type === "campaign_match";
    if (activeFilter === "payment") return n.type === "payment";
    if (activeFilter === "message") return n.type === "message" || n.type === "chat";
    if (activeFilter === "system") return n.type === "system";
    return true;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case "campaign_invite":
      case "campaign_match":
        return <Sparkles size={14} className="text-[#007AFF]" />;
      case "payment":
        return <DollarSign size={14} className="text-[#34C759]" />;
      case "message":
      case "chat":
        return <MessageCircle size={14} className="text-[#5856D6]" />;
      default:
        return <Info size={14} className="text-[#FF9500]" />;
    }
  };

  const getBgColor = (type: string) => {
    switch (type) {
      case "campaign_invite":
      case "campaign_match":
        return "bg-[#007AFF]/10 border-[#007AFF]/20";
      case "payment":
        return "bg-[#34C759]/10 border-[#34C759]/20";
      case "message":
      case "chat":
        return "bg-[#5856D6]/10 border-[#5856D6]/20";
      default:
        return "bg-[#FF9500]/10 border-[#FF9500]/20";
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all cursor-pointer focus:outline-none"
        aria-label="Notification Center"
      >
        <Bell size={18} className="text-white/80 hover:text-white transition-colors" />
        
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-1 right-1 w-4 h-4 bg-[#FF3B30] text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-[#0c1324] shadow-sm"
          >
            {unreadCount}
          </motion.span>
        )}
      </button>

      {/* Popover Card */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={appleSpring}
            className="absolute right-0 mt-3.5 w-[calc(100vw-2rem)] max-w-[360px] md:w-[400px] md:max-w-[400px] bg-[#0c1324]/85 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_16px_40px_rgba(0,0,0,0.4)] overflow-hidden z-[100] flex flex-col max-h-[580px]"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h3 className="font-sans text-sm font-black tracking-tight text-white">Notifications</h3>
                <p className="text-[10px] text-[#c2c6d6] mt-0.5 font-medium">{unreadCount} unread notices</p>
              </div>

              <div className="flex gap-3">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[10px] font-bold text-[#adc6ff] hover:text-white transition-colors flex items-center gap-1"
                  >
                    <Check size={12} /> Mark all read
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-[#c2c6d6] hover:text-white cursor-pointer transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="px-6 py-3 bg-slate-950/30 border-b border-white/5 flex gap-1.5 overflow-x-auto no-scrollbar">
              {(["all", "campaign", "payment", "message", "system"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider select-none cursor-pointer transition-all ${
                    activeFilter === filter
                      ? "bg-white/15 text-white shadow-[0_0_12px_rgba(255,255,255,0.05)]"
                      : "text-[#c2c6d6] hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Notifications scroll list */}
            <div className="flex-1 overflow-y-auto min-h-[160px] max-h-[300px] divide-y divide-white/5 no-scrollbar">
              {filteredNotifications.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                  <Bell size={24} className="text-white/20 mb-3 animate-bounce" />
                  <p className="text-xs font-bold text-[#c2c6d6]">Inbox is clean</p>
                  <p className="text-[10px] text-[#c2c6d6]/60 mt-1">No notification matches the current filter.</p>
                </div>
              ) : (
                filteredNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-4 flex gap-3 transition-colors ${
                      notif.is_read ? "bg-transparent hover:bg-white/[0.02]" : "bg-white/[0.04] hover:bg-white/[0.06]"
                    }`}
                  >
                    {/* HSL colored icon boundary */}
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border backdrop-blur-sm ${getBgColor(notif.type)}`}>
                      {getIcon(notif.type)}
                    </div>

                    {/* Text Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <h4 className={`text-xs font-bold text-white leading-tight ${notif.is_read ? "opacity-75" : ""}`}>
                          {notif.title}
                        </h4>
                        <span className="text-[9px] font-medium text-[#c2c6d6]/70 shrink-0 mt-0.5">
                          {new Date(notif.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className={`text-[11px] mt-1.5 leading-relaxed ${notif.is_read ? "text-[#c2c6d6]/70" : "text-[#c2c6d6]"}`}>
                        {notif.content}
                      </p>

                      {/* Quick Actions */}
                      <div className="flex gap-4 mt-3">
                        {!notif.is_read && (
                          <button
                            onClick={(e) => handleMarkRead(notif.id, e)}
                            className="text-[10px] font-bold text-[#adc6ff] hover:text-white transition-colors"
                          >
                            Mark as read
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDelete(notif.id, e)}
                          className="text-[10px] font-bold text-rose-400 hover:text-rose-300 transition-colors"
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* PWA Push Notification diagnostic footer */}
            <div className="p-5 border-t border-white/10 bg-slate-950/50">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-white font-black uppercase tracking-[0.2em] flex items-center gap-1.5">
                  <Smartphone size={13} className="text-[#c2c6d6]" /> PWA Push
                </span>
                
                {pushPermission === "granted" ? (
                  <span className="text-[9px] font-black text-emerald-300 uppercase bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20 flex items-center gap-1">
                    <CheckCircle size={10} /> Active
                  </span>
                ) : pushPermission === "denied" ? (
                  <span className="text-[9px] font-black text-rose-300 uppercase bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 flex items-center gap-1">
                    <AlertTriangle size={10} /> Blocked
                  </span>
                ) : (
                  <span className="text-[9px] font-black text-amber-300 uppercase bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20 flex items-center gap-1">
                    <HelpCircle size={10} /> Standby
                  </span>
                )}
              </div>

              {pushPermission !== "granted" ? (
                <div className="space-y-3">
                  <p className="text-[11px] text-[#c2c6d6] leading-relaxed">
                    Authorize device dispatches to receive campaign matches, payment releases, and direct client chats in real-time.
                  </p>
                  <Button
                    onClick={handleRequestPushPermission}
                    size="sm"
                    className="w-full rounded-xl text-[11px] font-black py-1.5 bg-white text-slate-950 hover:bg-[#adc6ff] transition-colors"
                  >
                    Configure Native Alerts
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    onClick={handleTriggerTestPush}
                    variant="secondary"
                    className="flex-1 rounded-xl text-[10px] font-black py-1.5 border border-white/10 bg-white/5 text-white hover:bg-white/10 transition-colors"
                  >
                    Send Test Push (3s)
                  </Button>
                  <Button
                    onClick={async () => {
                      if ("serviceWorker" in navigator) {
                        const regs = await navigator.serviceWorker.getRegistrations();
                        for (const reg of regs) {
                          await reg.unregister();
                        }
                        setPushPermission("default");
                        toast.success("Notifications unsubscribed.");
                      }
                    }}
                    variant="ghost"
                    className="text-[10px] font-black py-1.5 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 rounded-xl transition-colors"
                  >
                    Deactivate
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
