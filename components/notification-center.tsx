"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Bell, 
  Check, 
  Trash2, 
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
import { getMockUser } from "@/lib/supabase/client";
import { 
  getNotifications, 
  markNotificationRead, 
  markAllNotificationsRead, 
  deleteNotification, 
  NotificationItem 
} from "@/lib/supabase/notifications";
import { isMockMode, supabase } from "@/lib/supabase/client";
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
  const [swRegistered, setSwRegistered] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const user = getMockUser();

  // Load notifications
  const loadNotifications = async () => {
    if (!user) return;
    const { data } = await getNotifications(user.id);
    setNotifications(data);
  };

  useEffect(() => {
    loadNotifications();

    // Listen to mock notifications update event
    const handleMockSync = () => {
      loadNotifications();
    };
    window.addEventListener("aether-notifications-update", handleMockSync);
    window.addEventListener("role-change", handleMockSync);
    window.addEventListener("storage", handleMockSync);

    // Live mode realtime subscription
    let channel: any = null;
    if (!isMockMode && user) {
      channel = supabase
        .channel(`realtime-notifications-${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`
          },
          () => {
            loadNotifications();
          }
        )
        .subscribe();
    }

    return () => {
      window.removeEventListener("aether-notifications-update", handleMockSync);
      window.removeEventListener("role-change", handleMockSync);
      window.removeEventListener("storage", handleMockSync);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user?.id]);

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
      setPushPermission(Notification.permission);
    }
    
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        setSwRegistered(!!reg);
      });
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
          const reg = await navigator.serviceWorker.register("/sw.js");
          setSwRegistered(true);
          toast.success("Push notifications configured!", {
            description: "Aether is authorized to deliver system notifications."
          });
        }
      } else if (permission === "denied") {
        toast.warning("Notification permission denied. Review browser settings to unlock.");
      }
    } catch (err: any) {
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
            data: { url: "/influencer/dashboard" }
          } as any);
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
    await markAllNotificationsRead(user.id);
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
        className="relative w-8 h-8 rounded-full flex items-center justify-center hover:bg-secondary/60 active:scale-95 transition-all cursor-pointer focus:outline-none"
        aria-label="Notification Center"
      >
        <Bell size={18} className="text-foreground/80 hover:text-foreground transition-colors" />
        
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-1.5 right-1.5 w-4 h-4 bg-[#FF3B30] text-white text-[9px] font-black rounded-full flex items-center justify-center border border-background shadow-sm"
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
            className="absolute right-0 mt-3.5 w-[360px] md:w-[400px] bg-popover/90 backdrop-blur-lg border border-border/40 rounded-3xl shadow-[0_20px_40px_rgba(0,0,0,0.12)] overflow-hidden z-50 flex flex-col max-h-[580px]"
          >
            {/* Header */}
            <div className="px-6 py-4.5 border-b border-border/10 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm tracking-tight">Notifications</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">{unreadCount} unread notices</p>
              </div>

              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[10px] font-bold text-[#007AFF] hover:underline flex items-center gap-0.5"
                  >
                    <Check size={11} /> Mark all read
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="px-6 py-3 bg-secondary/20 border-b border-border/5 flex gap-1.5 overflow-x-auto no-scrollbar">
              {["all", "campaign", "payment", "message", "system"].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter as any)}
                  className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider select-none cursor-pointer transition-colors ${
                    activeFilter === filter
                      ? "bg-foreground text-background"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            {/* Notifications scroll list */}
            <div className="flex-1 overflow-y-auto min-h-[160px] max-h-[300px] divide-y divide-border/5">
              {filteredNotifications.length === 0 ? (
                <div className="p-12 text-center flex flex-col items-center justify-center">
                  <Bell size={24} className="text-muted-foreground/30 mb-2 animate-bounce" />
                  <p className="text-xs font-semibold text-muted-foreground">Inbox is clean</p>
                  <p className="text-[10px] text-muted-foreground mt-1">No notification matches the current filter.</p>
                </div>
              ) : (
                filteredNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-4 flex gap-3 transition-colors ${
                      notif.is_read ? "bg-transparent" : "bg-primary/5 dark:bg-primary/10"
                    }`}
                  >
                    {/* HSL colored icon boundary */}
                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 border ${getBgColor(notif.type)}`}>
                      {getIcon(notif.type)}
                    </div>

                    {/* Text Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-1">
                        <h4 className={`text-xs font-bold text-foreground truncate ${notif.is_read ? "opacity-85" : ""}`}>
                          {notif.title}
                        </h4>
                        <span className="text-[8px] text-muted-foreground shrink-0 mt-0.5">
                          {new Date(notif.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                        {notif.content}
                      </p>

                      {/* Quick Actions */}
                      <div className="flex gap-3 mt-2">
                        {!notif.is_read && (
                          <button
                            onClick={(e) => handleMarkRead(notif.id, e)}
                            className="text-[9px] font-bold text-[#007AFF] hover:underline"
                          >
                            Mark as read
                          </button>
                        )}
                        <button
                          onClick={(e) => handleDelete(notif.id, e)}
                          className="text-[9px] font-bold text-destructive hover:underline"
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
            <div className="p-5 border-t border-border/10 bg-secondary/35">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-foreground font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Smartphone size={13} className="text-muted-foreground" /> PWA Push Notifications
                </span>
                
                {pushPermission === "granted" ? (
                  <span className="text-[8px] font-bold text-[#34C759] uppercase bg-[#34C759]/10 px-2 py-0.5 rounded-full border border-[#34C759]/20 flex items-center gap-0.5">
                    <CheckCircle size={8} /> Active
                  </span>
                ) : pushPermission === "denied" ? (
                  <span className="text-[8px] font-bold text-[#FF3B30] uppercase bg-[#FF3B30]/10 px-2 py-0.5 rounded-full border border-[#FF3B30]/20 flex items-center gap-0.5">
                    <AlertTriangle size={8} /> Blocked
                  </span>
                ) : (
                  <span className="text-[8px] font-bold text-[#FF9500] uppercase bg-[#FF9500]/10 px-2 py-0.5 rounded-full border border-[#FF9500]/20 flex items-center gap-0.5">
                    <HelpCircle size={8} /> Standby
                  </span>
                )}
              </div>

              {pushPermission !== "granted" ? (
                <div className="space-y-2">
                  <p className="text-[9px] text-muted-foreground leading-normal">
                    Authorize device dispatches to receive campaign matches, payment releases, and direct client chats in real-time.
                  </p>
                  <Button
                    onClick={handleRequestPushPermission}
                    size="sm"
                    className="w-full rounded-xl text-[10px] font-bold py-1 bg-primary text-primary-foreground hover:opacity-90"
                  >
                    Configure Native Alerts
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    onClick={handleTriggerTestPush}
                    variant="secondary"
                    className="flex-1 rounded-xl text-[9px] font-bold py-1 border border-border"
                  >
                    Send Test Push (3s)
                  </Button>
                  <Button
                    onClick={async () => {
                      if ("serviceWorker" in navigator) {
                        const regs = await navigator.serviceWorker.getRegistrations();
                        for (let reg of regs) {
                          await reg.unregister();
                        }
                        setSwRegistered(false);
                        setPushPermission("default");
                        toast.success("Notifications unsubscribed.");
                      }
                    }}
                    variant="ghost"
                    className="text-[9px] font-bold py-1 text-destructive hover:bg-destructive/10 rounded-xl"
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
