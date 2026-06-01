"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslation } from "@/lib/translations";
import { getClientProfile, supabase, isMockMode } from "@/lib/supabase/client";
import { Profile } from "@/types";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ChevronRight,
  Send, 
  FileCheck2, 
  ArrowLeft,
  DollarSign,
  AlertCircle,
  Clock,
  ExternalLink,
  CreditCard,
  CheckCircle2,
  Lock,
  User,
  Users,
  Check,
  X,
  ChevronDown,
  Layers,
  Video,
  Plus,
  FileText,
  BarChart3,
  Sparkles,
  MessageSquare,
  RefreshCw,
  MousePointerClick,
  Calendar,
  MessageCircle,
  Eye,
  Share2,
  TrendingUp,
  Award
} from "lucide-react";
import { toast } from "sonner";
import { fundEscrowAction, releaseEscrowAction } from "@/lib/stripe/actions";
import { getIsStripeMockMode } from "@/lib/stripe/connect";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  Legend,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";
import confetti from "canvas-confetti";
import { useCampaignMetrics, calculateROIProjection } from "@/lib/supabase/metrics";

// Custom SVG icons for social platforms
function InstagramIcon({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      width={size} 
      height={size} 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

function YoutubeIcon({ className, size = 16 }: { className?: string; size?: number }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      width={size} 
      height={size} 
      fill="currentColor" 
      className={className}
    >
      <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.108C19.522 3.5 12 3.5 12 3.5s-7.522 0-9.388.555A3.002 3.002 0 0 0 .502 6.163C0 8.07 0 12 0 12s0 3.93.502 5.837a3.003 3.003 0 0 0 2.11 2.108C4.478 20.5 12 20.5 12 20.5s7.522 0 9.388-.555a3.003 3.003 0 0 0 2.11-2.108C24 15.93 24 12 24 12s0-3.93-.502-5.837zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

// --- TYPES ---

interface Annotation {
  id: string;
  authorName: string;
  authorRole: "business" | "influencer";
  text: string;
  x: number; // 0-100 percentage
  y: number; // 0-100 percentage
  resolved: boolean;
  createdAt: string;
}

interface Submission {
  version: number;
  submittedAt: string;
  postUrl: string;
  imageUrl: string;
  caption?: string;
  metrics: {
    views: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
    ctr: number;
    roi: number;
  };
  annotations: Annotation[];
}

interface Participant {
  id: string;
  fullName: string;
  handle: string;
  avatarUrl: string;
  status: "applied" | "escrowed" | "submitted" | "released" | "rejected";
  payout: number;
  submissions: Submission[];
  pitch?: string;
}

interface CampaignDetailState {
  id: string;
  title: string;
  budget: number;
  status: "open" | "applied" | "escrowed" | "submitted" | "released";
  brief: {
    objectives: string[];
    toneOfVoice: string[];
    guidelines: string[];
    keyMessaging: string;
    kpis?: string[];
  };
  deliverables: {
    type: string;
    description: string;
    platform: "TikTok" | "Instagram" | "YouTube";
    count: number;
  }[];
  timeline: {
    label: string;
    date: string;
    completed: boolean;
  }[];
  participants: Participant[];
}

const MOCK_PRESET_IMAGES = [
  {
    name: "Minimal Tech",
    url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80"
  },
  {
    name: "Studio View",
    url: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=600&q=80"
  },
  {
    name: "Cozy Workspace",
    url: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=600&q=80"
  },
  {
    name: "Programming Setup",
    url: "https://images.unsplash.com/photo-1607799279861-4dd421887fb3?auto=format&fit=crop&w=600&q=80"
  }
];

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const [user, setUser] = useState<Profile | null>(null);
  const [mounted, setMounted] = useState(false);

  // Core Campaign detail state
  const [campaign, setCampaign] = useState<CampaignDetailState | null>(null);
  const [activeParticipantId, setActiveParticipantId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"Brief" | "Deliverables" | "Timeline" | "Budget">("Brief");
  
  // Workspace tabs toggler and metrics hooks
  const [workspaceTab, setWorkspaceTab] = useState<"workspace" | "analytics" | "chat">("workspace");
  const campaignId = (params?.id as string) || "camp_1";
  const { metrics, updateMetrics } = useCampaignMetrics(campaignId);
  
  const [localAttributed, setLocalAttributed] = useState("0");
  const [localSpend, setLocalSpend] = useState("0");
  const [localClicks, setLocalClicks] = useState("0");
  const [localImpressions, setLocalImpressions] = useState("0");
  const [localConversions, setLocalConversions] = useState("0");

  useEffect(() => {
    if (metrics) {
      setLocalAttributed(metrics.attributed_value.toString());
      setLocalSpend(metrics.budget_spent.toString());
      setLocalClicks(metrics.clicks.toString());
      setLocalImpressions(metrics.impressions.toString());
      setLocalConversions(metrics.conversions.toString());
    }
  }, [metrics]);

  const handleMetricChange = async (field: string, value: string) => {
    const num = parseFloat(value) || 0;
    
    if (field === "attributed_value") setLocalAttributed(value);
    else if (field === "budget_spent") setLocalSpend(value);
    else if (field === "clicks") setLocalClicks(value);
    else if (field === "impressions") setLocalImpressions(value);
    else if (field === "conversions") setLocalConversions(value);
    
    await updateMetrics({
      [field]: num
    });
    setAiPrediction(null); // Reset forecast to prompt update
  };

  // Interactive UI panel toggles
  const [isApplying, setIsApplying] = useState(false);
  const [pitchText, setPitchText] = useState("");
  const [pitchRate, setPitchRate] = useState("2500");
  
  // Submission form state (Influencer side)
  const [postUrl, setPostUrl] = useState("");
  const [postCaption, setPostCaption] = useState("");
  const [selectedPresetImage, setSelectedPresetImage] = useState(MOCK_PRESET_IMAGES[0].url);
  const [estViews, setEstViews] = useState("15000");
  const [estLikes, setEstLikes] = useState("950");
  const [estComments, setEstComments] = useState("70");
  const [estShares, setEstShares] = useState("30");
  
  // AI safety and prediction states
  const [commentsTab, setCommentsTab] = useState<"pins" | "safety">("pins");
  const [safetyReport, setSafetyReport] = useState<any>(null);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [lastAuditedVersion, setLastAuditedVersion] = useState<number | null>(null);
  const [aiPrediction, setAiPrediction] = useState<any>(null);
  const [predictLoading, setPredictLoading] = useState(false);
  
  // Annotation tool states
  const [selectedVersionNum, setSelectedVersionNum] = useState<number>(1);
  const [isPinningMode, setIsPinningMode] = useState(false);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [activeTempPin, setActiveTempPin] = useState<{ x: number; y: number } | null>(null);
  const [newPinComment, setNewPinComment] = useState("");
  
  const [actionLoading, setActionLoading] = useState(false);
  
  const imageRef = useRef<HTMLImageElement>(null);

  const runSafetyAudit = async () => {
    const participant = campaign?.participants.find(p => p.id === activeParticipantId);
    const sub = participant?.submissions.find(s => s.version === selectedVersionNum);
    if (!sub || !campaign) return;
    
    setSafetyLoading(true);
    try {
      const res = await fetch("/api/ai/safety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: sub.caption || "Taking my desktop productivity setup to the next level with campaign tools. #workspace #desk #aether",
          platform: campaign.deliverables[0]?.platform || "Instagram",
          guidelines: campaign.brief.guidelines || []
        })
      });
      const data = await res.json();
      if (data.success) {
        setSafetyReport(data.report);
        setLastAuditedVersion(selectedVersionNum);
        toast.success("AI Safety audit completed!");
      } else {
        toast.error("Safety audit failed: " + data.error);
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to run safety audit.");
    } finally {
      setSafetyLoading(false);
    }
  };

  const fetchAIPrediction = async () => {
    if (!campaign) return;
    setPredictLoading(true);
    try {
      const part = campaign.participants.find(p => p.id === activeParticipantId);
      const res = await fetch("/api/ai/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign: {
            title: campaign.title,
            budget: campaign.budget,
            brief: {
              objectives: campaign.brief.objectives,
              guidelines: campaign.brief.guidelines
            }
          },
          metrics: {
            views: metrics.impressions,
            likes: Math.round(metrics.clicks * 0.1),
            comments: Math.round(metrics.conversions * 0.5),
            shares: Math.round(metrics.conversions * 0.2),
            clicks: metrics.clicks,
            conversions: metrics.conversions,
            budget_spent: metrics.budget_spent,
            attributed_value: metrics.attributed_value
          },
          creator: part ? {
            followers: part.id === "mock-influencer-uuid" ? 48500 : 35000,
            engagement: 4.8,
            niches: campaign.brief.objectives
          } : undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        setAiPrediction(data.prediction);
      } else {
        console.error("AI Predict failed:", data.error);
      }
    } catch (err) {
      console.error("Failed fetching AI prediction:", err);
    } finally {
      setPredictLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceTab === "analytics" && !aiPrediction && !predictLoading && campaign) {
      fetchAIPrediction();
    }
  }, [workspaceTab, campaignId]);

  useEffect(() => {
    if (safetyReport && lastAuditedVersion !== selectedVersionNum) {
      setSafetyReport(null);
    }
  }, [selectedVersionNum]);

  const appleSpring = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30,
    mass: 0.8
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  // --- MESSAGING AND UTM ARCHITECT CODE ---
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [hasUnreadMessages, setHasUnreadMessages] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const [utmSource, setUtmSource] = useState("instagram");
  const [utmMedium, setUtmMedium] = useState("reel");

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (workspaceTab === "chat") {
      scrollToBottom();
      setHasUnreadMessages(false);
    }
  }, [chatMessages, workspaceTab]);

  const getInitialChatMessages = () => {
    const creatorName = user?.role === "influencer" ? user.full_name : (campaign?.participants.find(p => p.id === activeParticipantId)?.fullName || "Marcus Vance");
    const brandName = "Sarah Jenkins (Brand)";
    
    return [
      {
        id: "msg_init_1",
        sender_id: "system",
        sender_name: "System",
        sender_avatar: "",
        role: "system",
        content: `Campaign Contract Initiated. Budget secured in escrow.`,
        created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
        is_read: true
      },
      {
        id: "msg_init_2",
        sender_id: "mock-business-uuid",
        sender_name: brandName,
        sender_avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
        role: "business",
        content: `Hi there! We are excited to collaborate with you on this campaign. Let us know if you have any questions about the deliverables brief!`,
        created_at: new Date(Date.now() - 3600000 * 23).toISOString(),
        is_read: true
      }
    ];
  };

  const loadChatMessages = () => {
    if (!activeParticipantId) return;
    const key = `aether-campaign-messages-${campaignId}-${activeParticipantId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        setChatMessages(JSON.parse(stored));
      } catch (e) {
        setChatMessages(getInitialChatMessages());
      }
    } else {
      const initialMsgs = getInitialChatMessages();
      localStorage.setItem(key, JSON.stringify(initialMsgs));
      setChatMessages(initialMsgs);
    }
  };

  useEffect(() => {
    if (mounted && activeParticipantId) {
      loadChatMessages();
    }
  }, [mounted, activeParticipantId, campaignId]);

  useEffect(() => {
    if (isMockMode || !activeParticipantId || !mounted) return;
    
    // Live mode realtime subscription for messages table
    const channel = supabase
      .channel(`chat-messages-${campaignId}-${activeParticipantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages"
        },
        (payload: any) => {
          const newMsg = payload.new;
          setChatMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeParticipantId, mounted]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || chatInput;
    if (!text.trim() || !user || !activeParticipantId) return;

    setChatInput("");
    const messageId = `msg_${Math.random().toString(36).substr(2, 9)}`;
    const brandName = "Sarah Jenkins (Brand)";
    const creatorName = campaign?.participants.find(p => p.id === activeParticipantId)?.fullName || user.full_name;

    const myMsg = {
      id: messageId,
      sender_id: user.id,
      sender_name: user.role === "business" ? brandName : creatorName,
      sender_avatar: user.avatar_url,
      role: user.role,
      content: text,
      created_at: new Date().toISOString(),
      is_read: false
    };

    const updatedMsgs = [...chatMessages, myMsg];
    setChatMessages(updatedMsgs);

    if (isMockMode) {
      const key = `aether-campaign-messages-${campaignId}-${activeParticipantId}`;
      localStorage.setItem(key, JSON.stringify(updatedMsgs));
      
      // Auto-reply logic (Brand / Creator automated responder)
      setIsTyping(true);
      setTimeout(async () => {
        setIsTyping(false);
        const replyId = `msg_${Math.random().toString(36).substr(2, 9)}`;
        let replyContent = "";

        if (user.role === "influencer") {
          const lowerText = text.toLowerCase();
          if (lowerText.includes("draft") || lowerText.includes("upload") || lowerText.includes("reel")) {
            replyContent = "Awesome! We will review the draft deliverable shortly. Please verify that the annotations pins are resolved if you resubmitted.";
          } else if (lowerText.includes("payment") || lowerText.includes("escrow") || lowerText.includes("stripe")) {
            replyContent = "Yes, your contract budget is securely locked in Stripe Connect escrow. Payout will release automatically upon approval.";
          } else if (lowerText.includes("hi") || lowerText.includes("hello") || lowerText.includes("hey")) {
            replyContent = "Hey Marcus! Hope you're doing great. Let us know if you need anything from the brand brief assets.";
          } else {
            replyContent = "Thanks for the message! Our marketing team will review this and get back to you shortly.";
          }
        } else {
          const lowerText = text.toLowerCase();
          if (lowerText.includes("review") || lowerText.includes("change") || lowerText.includes("fix")) {
            replyContent = "Understood! I'll update the clip according to your pinned comments and upload version " + (selectedVersionNum + 1) + " soon.";
          } else if (lowerText.includes("status") || lowerText.includes("progress")) {
            replyContent = "Just finished the main sequence edits. I will upload the draft here for your review in a few hours!";
          } else {
            replyContent = "Hey Sarah! Got it, I am on it. Let's make this launch look amazing.";
          }
        }

        const replyMsg = {
          id: replyId,
          sender_id: user.role === "business" ? activeParticipantId : "mock-business-uuid",
          sender_name: user.role === "business" ? creatorName : brandName,
          sender_avatar: user.role === "business" 
            ? "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80" 
            : "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
          role: user.role === "business" ? "influencer" : "business",
          content: replyContent,
          created_at: new Date().toISOString(),
          is_read: false
        };

        const finalMsgs = [...updatedMsgs, replyMsg];
        setChatMessages(finalMsgs);
        localStorage.setItem(key, JSON.stringify(finalMsgs));

        // Create notification & mock email
        import("@/lib/supabase/notifications").then(n => {
          n.createNotification(
            user.id,
            `New message on ${campaign?.title || "Campaign"}`,
            replyContent,
            "message"
          );
        });

        import("@/lib/resend").then(r => {
          r.sendNewMessageEmail(
            user.email || "",
            user.role === "business" ? creatorName : brandName,
            replyContent,
            campaign?.title || "Campaign"
          );
        });

        // Trigger unread dot if not on chat tab
        if (workspaceTab !== "chat") {
          setHasUnreadMessages(true);
        }

      }, 1500);
    } else {
      // Supabase Live insert
      try {
        const { error } = await supabase
          .from("messages")
          .insert({
            participation_id: activeParticipantId,
            sender_id: user.id,
            content: text
          });
        if (error) throw error;
      } catch (err: any) {
        toast.error("Failed to deliver message: " + err.message);
      }
    }
  };

  // --- MOCK DATABASE INITIALIZER ---
  const loadCampaignState = (activeUser: Profile) => {
    const key = `aether-campaign-rich-data-${campaignId}`;
    const storedState = localStorage.getItem(key);
    
    let currentCampaign: CampaignDetailState;

    if (storedState) {
      try {
        currentCampaign = JSON.parse(storedState) as CampaignDetailState;
      } catch (e) {
        currentCampaign = createDefaultCampaign(campaignId);
      }
    } else {
      currentCampaign = createDefaultCampaign(campaignId);
    }

    // Auto-select active participant for Business
    // If there are participants, select the first one. If Marcus Vance is one of them, prefer him for testing.
    let selectedPartId = "";
    if (activeUser.role === "business") {
      const marcus = currentCampaign.participants.find(p => p.id === "mock-influencer-uuid");
      if (marcus) {
        selectedPartId = marcus.id;
      } else if (currentCampaign.participants.length > 0) {
        selectedPartId = currentCampaign.participants[0].id;
      }
    } else {
      // Influencer logs in: select their own profile participant details
      selectedPartId = activeUser.id;
    }

    setCampaign(currentCampaign);
    setActiveParticipantId(selectedPartId);

    // Set active version based on selected participant
    const part = currentCampaign.participants.find(p => p.id === selectedPartId);
    if (part && part.submissions && part.submissions.length > 0) {
      setSelectedVersionNum(part.submissions[part.submissions.length - 1].version);
    } else {
      setSelectedVersionNum(1);
    }
  };

  useEffect(() => {
    async function initPage() {
      const activeUser = await getClientProfile();
      if (activeUser) {
        setUser(activeUser);
        loadCampaignState(activeUser);
      }
    }
    initPage();

    const handleSync = () => {
      initPage();
    };
    window.addEventListener("storage", handleSync);
    window.addEventListener("role-change", handleSync);
    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("role-change", handleSync);
    };
  }, [campaignId]);

  // Persists the state to localStorage and re-triggers state loading
  const persistCampaignState = (updatedCampaign: CampaignDetailState) => {
    localStorage.setItem(`aether-campaign-rich-data-${campaignId}`, JSON.stringify(updatedCampaign));
    setCampaign(updatedCampaign);
  };

  const createDefaultCampaign = (id: string): CampaignDetailState => {
    let title = "Aether Lifestyle Launch";
    let budget = 4500;
    let status: "open" | "applied" | "escrowed" | "submitted" | "released" = "open";

    if (id === "camp_1") {
      title = "Summer Tech Capsule";
      budget = 2500;
      status = "escrowed";
    } else if (id === "camp_3") {
      title = "Minimalist Workspace Review";
      budget = 1200;
      status = "released";
    }

    const defaultBrief = {
      objectives: [
        "Showcase summer workspace gear in natural, minimalist aesthetics.",
        "Highlight durability, visual appeal, and workflow ergonomics.",
        "Drive traffic to the product launch with custom discount codes."
      ],
      toneOfVoice: ["Minimalist", "Aesthetic", "Sophisticated", "Warm", "Product-centric"],
      guidelines: [
        "Position the product in the primary focal area within the first 3 seconds.",
        "Incorporate clean camera pan movements under soft natural lighting.",
        "Tag the brand and include the landing page link in the bio/caption.",
        "Do not show competing workspace accessories in the same frames."
      ],
      keyMessaging: "Elevate your focus with Aether's precision-engineered workspace tools."
    };

    const defaultDeliverables = [
      { type: "Video Review", description: "60s Dedicated review highlighting material craftsmanship.", platform: "TikTok" as const, count: 1 },
      { type: "Aesthetic Post", description: "High-resolution carousel featuring the desk setup in context.", platform: "Instagram" as const, count: 1 }
    ];

    const defaultTimeline = [
      { label: "Application & Verification", date: "May 25, 2026", completed: true },
      { label: "Stripe Escrow Funding", date: "May 28, 2026", completed: id === "camp_3" || id === "camp_1" },
      { label: "Draft Deliverable Upload", date: "June 5, 2026", completed: id === "camp_3" },
      { label: "Review & Adjustments", date: "June 12, 2026", completed: id === "camp_3" },
      { label: "Content Release & Payout", date: "June 15, 2026", completed: id === "camp_3" }
    ];

    const initialParticipants: Participant[] = [
      {
        id: "mock-influencer-uuid", // Marcus Vance
        fullName: "Marcus Vance",
        handle: "@marcusv",
        avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
        status: id === "camp_3" ? "released" : id === "camp_2" ? "applied" : "escrowed",
        payout: budget,
        submissions: id === "camp_3" ? [
          {
            version: 1,
            submittedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            postUrl: "https://youtube.com/watch?v=marcusworkspacereview",
            imageUrl: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?auto=format&fit=crop&w=600&q=80",
            metrics: { views: 24500, likes: 1450, comments: 230, shares: 180, clicks: 1250, ctr: 5.1, roi: 3.2 },
            annotations: [
              { id: "ann_3", authorName: "Sarah Jenkins", authorRole: "business", text: "Love the lighting here. The desk shelf is displayed perfectly.", x: 50, y: 25, resolved: true, createdAt: "2026-05-20T10:00:00Z" }
            ]
          }
        ] : []
      },
      {
        id: "sofia-chen-uuid",
        fullName: "Sofia Chen",
        handle: "@sofiac",
        avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
        status: id === "camp_1" ? "submitted" : "escrowed",
        payout: id === "camp_1" ? 2800 : 4200,
        submissions: id === "camp_1" ? [
          {
            version: 1,
            submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
            postUrl: "https://instagram.com/p/C7W28z2yX8a",
            imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80",
            metrics: { views: 1800, likes: 120, comments: 14, shares: 5, clicks: 85, ctr: 4.7, roi: 1.8 },
            annotations: [
              { id: "ann_1", authorName: "Sarah Jenkins", authorRole: "business", text: "Please align the keyboard to the center. It looks slightly tilted here.", x: 45, y: 55, resolved: false, createdAt: "2026-05-23T14:15:00Z" },
              { id: "ann_2", authorName: "Sofia Chen", authorRole: "influencer", text: "Got it! I will fix this in the next version.", x: 45, y: 55, resolved: true, createdAt: "2026-05-23T14:30:00Z" }
            ]
          }
        ] : []
      },
      {
        id: "dave-miller-uuid",
        fullName: "Dave Miller",
        handle: "@davem",
        avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80",
        status: id === "camp_3" ? "released" : "applied",
        payout: id === "camp_3" ? 1200 : 1500,
        submissions: id === "camp_3" ? [
          {
            version: 1,
            submittedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
            postUrl: "https://youtube.com/watch?v=daveworkspacereview",
            imageUrl: "https://images.unsplash.com/photo-1607799279861-4dd421887fb3?auto=format&fit=crop&w=600&q=80",
            metrics: { views: 12450, likes: 980, comments: 110, shares: 45, clicks: 520, ctr: 4.17, roi: 2.1 },
            annotations: [
              { id: "ann_4", authorName: "Sarah Jenkins", authorRole: "business", text: "Excellent branding integration.", x: 30, y: 40, resolved: true, createdAt: "2026-05-19T10:00:00Z" }
            ]
          }
        ] : []
      }
    ];

    return {
      id,
      title,
      budget,
      status,
      brief: defaultBrief,
      deliverables: defaultDeliverables,
      timeline: defaultTimeline,
      participants: initialParticipants
    };
  };

  if (!user || !campaign) return null;

  const isBusiness = user.role === "business";
  const selectedParticipant = campaign.participants.find(p => p.id === activeParticipantId);

  // Extract versions for version dropdown
  const submissionVersions = selectedParticipant?.submissions.map(s => s.version).reverse() || [];
  const currentSubmission = selectedParticipant?.submissions.find(s => s.version === selectedVersionNum);

  // --- HANDLERS ---

  // INFLUENCER: Apply to Campaign
  const handleApply = () => {
    setIsApplying(true);
  };

  const submitApplyForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pitchText.trim()) {
      toast.error("Please add a short pitch.");
      return;
    }

    const proposedPayout = parseFloat(pitchRate) || campaign.budget;
    
    // Add Marcus Vance as participant in applied state
    const marcusParticipant: Participant = {
      id: user.id,
      fullName: user.full_name,
      handle: user.social_handle || `@${user.full_name.toLowerCase().replace(/\s+/g, "")}`,
      avatarUrl: user.avatar_url,
      status: "applied",
      payout: proposedPayout,
      submissions: []
    };

    const updated = {
      ...campaign,
      participants: [...campaign.participants.filter(p => p.id !== user.id), marcusParticipant]
    };

    persistCampaignState(updated);
    setActiveParticipantId(user.id);
    setIsApplying(false);
    
    toast.success("Application submitted successfully!", {
      description: "The brand has been notified and will review your pitch."
    });
  };

  // BUSINESS: Fund Escrow for Participant
  const handleFundEscrow = async () => {
    if (!selectedParticipant) return;
    setActionLoading(true);
    toast.loading("Initializing secure escrow funding...", { id: "fund-escrow" });

    try {
      const res = await fundEscrowAction(campaignId, selectedParticipant.payout);

      if (res.success) {
        const updatedParticipants = campaign.participants.map(p => {
          if (p.id === selectedParticipant.id) {
            return { ...p, status: "escrowed" as const };
          }
          return p;
        });

        // Also update timeline status
        const updatedTimeline = campaign.timeline.map(t => {
          if (t.label.includes("Stripe Escrow")) return { ...t, completed: true };
          return t;
        });

        const updated = {
          ...campaign,
          participants: updatedParticipants,
          timeline: updatedTimeline,
          status: "escrowed" as const
        };

        persistCampaignState(updated);

        // Store transaction locally if mock mode
        if (res.isMock) {
          const stored = localStorage.getItem("aether-mock-transactions");
          const txList = stored ? JSON.parse(stored) : [];
          const newTx = {
            id: "tx_mock_" + Math.random().toString(36).substring(7),
            amount: selectedParticipant.payout,
            type: "escrow",
            status: "succeeded",
            created_at: new Date().toISOString(),
            campaignTitle: campaign.title,
            partner: selectedParticipant.fullName
          };
          localStorage.setItem("aether-mock-transactions", JSON.stringify([newTx, ...txList]));
          window.dispatchEvent(new Event("storage"));
        }

        toast.success("Escrow Funded successfully!", {
          id: "fund-escrow",
          description: `Funds lock confirmed. Creator ${selectedParticipant.fullName} notified.`
        });
      } else {
        toast.error(res.error || "Funding failed.", { id: "fund-escrow" });
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred.", { id: "fund-escrow" });
    } finally {
      setActionLoading(false);
    }
  };

  // INFLUENCER: Submit Draft Deliverable
  const handleSubmitDraft = (e: React.FormEvent) => {
    e.preventDefault();
    if (!postUrl.trim()) {
      toast.error("Please enter your draft post link.");
      return;
    }

    if (!selectedParticipant) return;

    const newVersionNum = (selectedParticipant.submissions.length || 0) + 1;
    const newSubmission: Submission = {
      version: newVersionNum,
      submittedAt: new Date().toISOString(),
      postUrl,
      imageUrl: selectedPresetImage,
      caption: postCaption || "Taking my desktop productivity setup to the next level with campaign tools. #workspace #desk #aether",
      metrics: {
        views: parseInt(estViews) || 12000,
        likes: parseInt(estLikes) || 800,
        comments: parseInt(estComments) || 60,
        shares: parseInt(estShares) || 20,
        clicks: Math.floor((parseInt(estViews) || 12000) * 0.05),
        ctr: 5.0,
        roi: 2.1
      },
      annotations: []
    };

    const updatedParticipants = campaign.participants.map(p => {
      if (p.id === selectedParticipant.id) {
        return {
          ...p,
          status: "submitted" as const,
          submissions: [...p.submissions, newSubmission]
        };
      }
      return p;
    });

    const updated = {
      ...campaign,
      participants: updatedParticipants,
      status: "submitted" as const
    };

    persistCampaignState(updated);
    setSelectedVersionNum(newVersionNum);
    
    // Clear inputs
    setPostUrl("");
    setPostCaption("");
    toast.success(`Draft Version ${newVersionNum} submitted!`, {
      description: "Brand has been notified to review your deliverable."
    });
  };

  // BUSINESS: Request changes / Reject Draft
  const handleRejectDraft = () => {
    if (!selectedParticipant || !currentSubmission) return;
    
    // Prompt brand for a change comment
    const commentText = prompt("Enter instructions for the creator:");
    if (commentText === null) return;
    if (!commentText.trim()) {
      toast.error("Please provide review feedback comment.");
      return;
    }

    // Add a coordinate-less or center pin annotation for instructions
    const newAnn: Annotation = {
      id: "ann_" + Math.random().toString(36).substring(7),
      authorName: user.full_name,
      authorRole: "business",
      text: commentText,
      x: 50,
      y: 50,
      resolved: false,
      createdAt: new Date().toISOString()
    };

    const updatedParticipants = campaign.participants.map(p => {
      if (p.id === selectedParticipant.id) {
        const updatedSubmissions = p.submissions.map(s => {
          if (s.version === selectedVersionNum) {
            return { ...s, annotations: [...s.annotations, newAnn] };
          }
          return s;
        });
        return {
          ...p,
          status: "rejected" as const, // or keep in escrowed to let them upload
          submissions: updatedSubmissions
        };
      }
      return p;
    });

    const updated = {
      ...campaign,
      participants: updatedParticipants
    };

    persistCampaignState(updated);
    toast.warning("Change request sent to Creator", {
      description: "Draft status updated to 'Changes Requested'."
    });
  };

  // BUSINESS: Approve and Release payout
  const handleApproveRelease = async () => {
    if (!selectedParticipant) return;
    setActionLoading(true);
    toast.loading("Releasing Stripe Connect payout...", { id: "release-escrow" });

    try {
      const res = await releaseEscrowAction(campaignId);

      if (res.success) {
        const updatedParticipants = campaign.participants.map(p => {
          if (p.id === selectedParticipant.id) {
            return { ...p, status: "released" as const };
          }
          return p;
        });

        // Also update timeline status
        const updatedTimeline = campaign.timeline.map(t => {
          if (t.label.includes("Content Release") || t.label.includes("Draft Deliverable") || t.label.includes("Review")) {
            return { ...t, completed: true };
          }
          return t;
        });

        const updated = {
          ...campaign,
          participants: updatedParticipants,
          timeline: updatedTimeline,
          status: "released" as const
        };

        persistCampaignState(updated);

        // Store transaction locally if mock mode
        if (res.isMock) {
          const stored = localStorage.getItem("aether-mock-transactions");
          const txList = stored ? JSON.parse(stored) : [];
          const newTx = {
            id: "tx_mock_" + Math.random().toString(36).substring(7),
            amount: selectedParticipant.payout,
            type: "release",
            status: "succeeded",
            created_at: new Date().toISOString(),
            campaignTitle: campaign.title,
            partner: selectedParticipant.fullName
          };
          localStorage.setItem("aether-mock-transactions", JSON.stringify([newTx, ...txList]));
          window.dispatchEvent(new Event("storage"));
        }

        // Trigger premium celebration confetti!
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.65 }
        });

        toast.success("Payout Released Instantly!", {
          id: "release-escrow",
          description: `Contract completed successfully. Creator ${selectedParticipant.fullName} paid.`
        });
      } else {
        toast.error(res.error || "Release failed.", { id: "release-escrow" });
      }
    } catch (err: any) {
      toast.error(err.message || "An error occurred.", { id: "release-escrow" });
    } finally {
      setActionLoading(false);
    }
  };

  // --- ANNOTATION PIN SYSTEM ACTIONS ---

  // User clicks on the Image Mockup to drop a pin
  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!currentSubmission || !imageRef.current) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    setActiveTempPin({ x, y });
    setIsPinningMode(true);
  };

  // Save the dropped pin comment
  const handleSavePinComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPinComment.trim() || !activeTempPin || !selectedParticipant || !currentSubmission) return;

    const newAnn: Annotation = {
      id: "ann_" + Math.random().toString(36).substring(7),
      authorName: user.full_name,
      authorRole: user.role,
      text: newPinComment,
      x: activeTempPin.x,
      y: activeTempPin.y,
      resolved: false,
      createdAt: new Date().toISOString()
    };

    const updatedParticipants = campaign.participants.map(p => {
      if (p.id === selectedParticipant.id) {
        const updatedSubmissions = p.submissions.map(s => {
          if (s.version === selectedVersionNum) {
            return {
              ...s,
              annotations: [...s.annotations, newAnn]
            };
          }
          return s;
        });
        return {
          ...p,
          submissions: updatedSubmissions
        };
      }
      return p;
    });

    const updated = {
      ...campaign,
      participants: updatedParticipants
    };

    persistCampaignState(updated);
    setNewPinComment("");
    setActiveTempPin(null);
    setIsPinningMode(false);
    toast.success("Feedback pin dropped!");
  };

  // Resolve / Unresolve Pin Annotation
  const handleToggleResolvePin = (pinId: string) => {
    if (!selectedParticipant || !currentSubmission) return;

    const updatedParticipants = campaign.participants.map(p => {
      if (p.id === selectedParticipant.id) {
        const updatedSubmissions = p.submissions.map(s => {
          if (s.version === selectedVersionNum) {
            const updatedAnns = s.annotations.map(a => {
              if (a.id === pinId) {
                return { ...a, resolved: !a.resolved };
              }
              return a;
            });
            return { ...s, annotations: updatedAnns };
          }
          return s;
        });
        return { ...p, submissions: updatedSubmissions };
      }
      return p;
    });

    const updated = {
      ...campaign,
      participants: updatedParticipants
    };

    persistCampaignState(updated);
  };

  // Render Status Timeline Steps
  const renderStatusTimeline = () => {
    const activeStatus = selectedParticipant?.status || campaign.status;

    const steps = [
      { key: "applied", label: t("Pitch & Application"), desc: t("Creator application") },
      { key: "escrowed", label: t("Escrow Funded"), desc: t("Budget locked in Stripe") },
      { key: "submitted", label: t("Draft Submitted"), desc: t("Deliverables uploaded") },
      { key: "released", label: t("Funds Released"), desc: t("Contract complete") }
    ];

    const getStepState = (stepKey: string, index: number) => {
      const statusOrder = ["applied", "escrowed", "submitted", "released"];
      const activeIdx = statusOrder.indexOf(activeStatus === "rejected" ? "escrowed" : activeStatus);
      
      if (activeStatus === "released") return "completed";
      if (stepKey === activeStatus) return "active";
      if (index < activeIdx) return "completed";
      return "upcoming";
    };

    return (
      <div className="p-8 apple-card mb-8">
        <h3 className="text-sm font-bold mb-6 tracking-tight flex items-center gap-2">
          <Clock size={16} className="text-primary" />
          {t("Milestone Escrow Timeline")}
        </h3>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative">
          {steps.map((step, idx) => {
            const state = getStepState(step.key, idx);
            return (
              <div key={step.key} className="flex items-center gap-4 flex-1 w-full">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border font-bold text-xs transition-all ${
                  state === "completed" 
                    ? "bg-[#34C759] border-[#34C759] text-white shadow-sm" 
                    : state === "active"
                    ? "bg-[#007AFF] border-[#007AFF] text-white animate-pulse shadow-md"
                    : "border-border text-muted-foreground bg-secondary/20"
                }`}>
                  {state === "completed" ? <Check size={14} /> : idx + 1}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-xs text-foreground tracking-tight">{step.label}</p>
                  <p className="text-[10px] text-muted-foreground font-normal">{step.desc}</p>
                </div>
                {idx < steps.length - 1 && (
                  <ChevronRight size={14} className="hidden md:block text-muted-foreground/20 ml-auto" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render Brief/Deliverables Tabs Content
  const renderBriefTabs = () => {
    return (
      <div className="apple-card p-8 min-h-[350px]">
        {/* Tabs Bar */}
        <div className="flex gap-1 bg-secondary/50 p-1 rounded-2xl border border-border/10 mb-6">
          {(["Brief", "Deliverables", "Timeline", "Budget"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`relative flex-1 py-2 text-xs font-semibold rounded-xl cursor-pointer focus:outline-none transition-colors ${
                activeTab === tab ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {activeTab === tab && (
                <motion.div
                  layoutId="active-tab"
                  className="absolute inset-0 bg-card rounded-xl shadow-sm border border-border/10"
                  transition={appleSpring}
                />
              )}
              <span className="relative z-10">{t(tab)}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="text-xs leading-relaxed space-y-4"
          >
            {activeTab === "Brief" && (
              <div className="space-y-4">
                <div>
                  <h4 className="font-bold text-foreground mb-1.5 uppercase tracking-wider text-[10px] text-primary">{t("Campaign Description")}</h4>
                  <p className="text-muted-foreground">{campaign.brief.keyMessaging}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <h4 className="font-bold text-foreground mb-1.5 uppercase tracking-wider text-[10px] text-primary">{t("Objectives")}</h4>
                    <ul className="list-disc pl-4 space-y-1.5 text-muted-foreground">
                      {campaign.brief.objectives.map((o, i) => <li key={i}>{t(o)}</li>)}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground mb-1.5 uppercase tracking-wider text-[10px] text-primary">{t("Guidelines")}</h4>
                    <ul className="list-disc pl-4 space-y-1.5 text-muted-foreground">
                      {campaign.brief.guidelines.map((g, i) => <li key={i}>{t(g)}</li>)}
                    </ul>
                  </div>
                </div>
                {campaign.brief.kpis && campaign.brief.kpis.length > 0 && (
                  <div className="pt-4 border-t border-border/10">
                    <h4 className="font-bold text-[#FF9500] mb-2 uppercase tracking-wider text-[10px] flex items-center gap-1">
                      <Sparkles size={11} className="fill-[#FF9500]" /> {t("AI Target KPIs")}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {campaign.brief.kpis.map((k, i) => (
                        <div key={i} className="p-3 bg-secondary/30 border border-border/10 rounded-2xl font-semibold text-muted-foreground text-[11px] leading-snug">
                          {t(k)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "Deliverables" && (
              <div className="space-y-4">
                <h4 className="font-bold text-foreground mb-1 text-xs uppercase tracking-wider text-primary">{t("Asset Requirements")}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {campaign.deliverables.map((d, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-secondary/30 border border-border/10 flex gap-3.5 items-start">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        {d.platform === "TikTok" ? <Video size={16} /> : d.platform === "Instagram" ? <InstagramIcon size={16} /> : <YoutubeIcon size={16} />}
                      </div>
                      <div>
                        <p className="font-bold text-foreground text-xs">{t(d.type)} ({d.count}x)</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{t(d.description)}</p>
                        <span className="inline-block mt-2 text-[9px] px-2 py-0.5 rounded-full font-bold uppercase bg-secondary text-foreground">
                          {t(d.platform)} {t("Deliverable")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "Timeline" && (
              <div className="space-y-4">
                <h4 className="font-bold text-foreground mb-1 text-xs uppercase tracking-wider text-primary">{t("Milestones & Deadlines")}</h4>
                <div className="relative pl-6 border-l border-border space-y-6">
                  {campaign.timeline.map((tItem, i) => (
                    <div key={i} className="relative">
                      <div className={`absolute -left-[30px] top-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        tItem.completed ? "bg-[#34C759] border-[#34C759] text-white" : "bg-card border-border text-transparent"
                      }`}>
                        {tItem.completed && <Check size={8} />}
                      </div>
                      <div>
                        <p className="font-bold text-foreground text-xs">{t(tItem.label)}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{t("Due")}: {tItem.date}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "Budget" && (
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-border/15">
                  <div>
                    <h4 className="font-bold text-foreground text-xs">{t("Contract Budget Allocation")}</h4>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{t("Escrowed security funds stored via Stripe.")}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] uppercase text-muted-foreground block font-bold">{t("Total Budget")}</span>
                    <span className="text-xl font-extrabold text-foreground flex items-center justify-end">
                      <DollarSign size={16} />{campaign.budget.toLocaleString()}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="p-4 rounded-2xl bg-[#007AFF]/10 border border-[#007AFF]/15">
                    <span className="text-[10px] uppercase text-[#007AFF] font-bold block mb-1">{t("Escrowed Balance")}</span>
                    <span className="text-lg font-bold text-foreground flex items-center">
                      <DollarSign size={15} />
                      {campaign.status !== "open" && campaign.status !== "applied" ? campaign.budget.toLocaleString() : "0"}
                    </span>
                    <p className="text-[9px] text-muted-foreground mt-1">{t("Locked in Stripe Connect escrow ledger.")}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#34C759]/10 border border-[#34C759]/15">
                    <span className="text-[10px] uppercase text-[#34C759] font-bold block mb-1">{t("Released Payouts")}</span>
                    <span className="text-lg font-bold text-foreground flex items-center">
                      <DollarSign size={15} />
                      {campaign.status === "released" ? campaign.budget.toLocaleString() : "0"}
                    </span>
                    <p className="text-[9px] text-muted-foreground mt-1">{t("Transferred directly to influencer connected bank account.")}</p>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  };

  // Render Live Analytics ROI panel
  const renderLiveMetrics = () => {
    // Generate daily tracking data dynamically matching the current metrics
    const days = 7;
    const historyData = [];
    for (let i = 1; i <= days; i++) {
      const ratio = i / days;
      // Introduce slight randomness for realistic curves
      const clicks = Math.round(metrics.clicks * ratio * (0.95 + (i * 0.01) * Math.random()));
      const conversions = Math.round(metrics.conversions * ratio * (0.95 + (i * 0.01) * Math.random()));
      const revenue = Math.round(metrics.attributed_value * ratio * (0.95 + (i * 0.01) * Math.random()));
      
      historyData.push({
        day: `Day ${i}`,
        Clicks: Math.min(metrics.clicks, clicks),
        Conversions: Math.min(metrics.conversions, conversions),
        Revenue: Math.min(metrics.attributed_value, revenue)
      });
    }
    
    // Ensure final day matches exactly
    historyData[days - 1] = {
      day: `Day ${days} (Live)`,
      Clicks: metrics.clicks,
      Conversions: metrics.conversions,
      Revenue: metrics.attributed_value
    };

    const roiProjection = calculateROIProjection(
      campaign.budget,
      metrics,
      user?.engagement_rate || 4.8,
      user?.followers || 48500
    );

    // Generate Confidence Narrowing Data
    const narrowingData = [];
    for (let conv = 0; conv <= 100; conv += 10) {
      const dataWeight = Math.min(1.0, conv / 80);
      const maxMargin = 1.8;
      const minMargin = 0.15;
      const margin = maxMargin - (maxMargin - minMargin) * dataWeight;
      
      narrowingData.push({
        conversions: conv,
        Lower: parseFloat(Math.max(0.1, roiProjection.projectedROI - margin).toFixed(2)),
        Expected: roiProjection.projectedROI,
        Upper: parseFloat((roiProjection.projectedROI + margin).toFixed(2))
      });
    }

    // Map ROI to progress bar percentage (0x to 6x ROI scale)
    const getRoiPercent = (val: number) => {
      const maxVal = 6.0;
      return Math.min(100, Math.max(0, (val / maxVal) * 100));
    };

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-3 duration-300">
        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {/* Live ROI Card */}
          <div className="p-6 apple-card bg-gradient-to-br from-[#007AFF]/5 to-transparent flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 text-[#007AFF]/15">
              <Sparkles size={40} />
            </div>
            <div>
              <div className="flex justify-between items-start">
                <span className="text-[10px] uppercase font-bold text-[#007AFF] tracking-wider">{t("Live ROI")}</span>
                <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase bg-[#007AFF]/10 text-[#007AFF]">{t("formula")}</span>
              </div>
              <h3 className="text-3xl font-black text-foreground mt-4 tracking-tight">
                {metrics.budget_spent > 0 ? (metrics.attributed_value / metrics.budget_spent).toFixed(1) : "0.0"}x
              </h3>
            </div>
            <p className="text-[9px] text-muted-foreground mt-4 border-t border-border/10 pt-2 font-medium">
              {t("Attributed")}: ${metrics.attributed_value.toLocaleString()} / {t("Spend")}: ${metrics.budget_spent.toLocaleString()}
            </p>
          </div>

          {/* Attributed Value Card */}
          <div className="p-6 apple-card flex flex-col justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t("Attributed Revenue")}</span>
              <h3 className="text-3xl font-bold text-foreground mt-4 tracking-tight">
                ${metrics.attributed_value.toLocaleString()}
              </h3>
            </div>
            <p className="text-[9px] text-[#34C759] mt-4 border-t border-border/10 pt-2 font-semibold flex items-center gap-1">
              <TrendingUp size={11} /> {t("Live sales tracked")}
            </p>
          </div>

          {/* Budget Spent Card */}
          <div className="p-6 apple-card flex flex-col justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t("Budget Spent")}</span>
              <h3 className="text-3xl font-bold text-foreground mt-4 tracking-tight">
                ${metrics.budget_spent.toLocaleString()}
              </h3>
            </div>
            <p className="text-[9px] text-muted-foreground mt-4 border-t border-border/10 pt-2">
              {t("Contract Value")}: ${campaign.budget.toLocaleString()}
            </p>
          </div>

          {/* Traffic CTR Card */}
          <div className="p-6 apple-card flex flex-col justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t("Conversion & CTR")}</span>
              <h3 className="text-3xl font-bold text-foreground mt-4 tracking-tight">
                {metrics.clicks > 0 ? ((metrics.conversions / metrics.clicks) * 100).toFixed(1) : "0.0"}%
              </h3>
            </div>
            <p className="text-[9px] text-muted-foreground mt-4 border-t border-border/10 pt-2 font-medium">
              {t("Conversions")}: {metrics.conversions} / {t("Clicks")}: {metrics.clicks}
            </p>
          </div>
        </div>

        {/* Projected ROI Confidence Interval Visualizer */}
        <div className="p-8 apple-card">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
            <div>
              <span className="text-[10px] uppercase font-bold text-[#34C759] tracking-wider bg-[#34C759]/10 px-2 py-0.5 rounded-full">{t("Predictive Engine")}</span>
              <h3 className="text-lg font-bold mt-2 tracking-tight">{t("Projected ROI Confidence Interval")}</h3>
              <p className="text-[11px] text-muted-foreground mt-1 max-w-xl">
                {t("Estimates the ultimate return on investment by combining actual conversions with the creator's reach history. The shaded region narrows as actual tracking data accumulates.")}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[9px] uppercase text-muted-foreground block font-bold">{t("Estimated Final ROI")}</span>
              <span className="text-3xl font-black text-[#34C759] mt-1 block">
                {roiProjection.projectedROI.toFixed(1)}x
              </span>
            </div>
          </div>

          {/* Slider Range Track */}
          <div className="space-y-4">
            <div className="relative w-full h-8 bg-secondary/50 rounded-2xl border border-border/10">
              {/* Confidence Interval Shaded Region */}
              <div 
                className="absolute top-0 bottom-0 bg-gradient-to-r from-[#007AFF]/15 to-[#34C759]/15 rounded-2xl"
                style={{
                  left: `${getRoiPercent(roiProjection.lowerBound)}%`,
                  right: `${100 - getRoiPercent(roiProjection.upperBound)}%`
                }}
              />
              
              {/* Projected ROI Marker (Expected Value) */}
              <div 
                className="absolute top-0 bottom-0 w-1 bg-[#34C759] shadow-md"
                style={{ left: `${getRoiPercent(roiProjection.projectedROI)}%` }}
              />
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#34C759] border-2 border-white shadow-md flex items-center justify-center cursor-pointer"
                style={{ left: `calc(${getRoiPercent(roiProjection.projectedROI)}% - 8px)` }}
                title={`Projected ROI: ${roiProjection.projectedROI}x`}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              </div>

              {/* Actual ROI Marker */}
              {roiProjection.currentROI > 0 && (
                <>
                  <div 
                    className="absolute top-0 bottom-0 w-0.5 bg-[#007AFF] opacity-50"
                    style={{ left: `${getRoiPercent(roiProjection.currentROI)}%` }}
                  />
                  <div 
                    className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-[#007AFF] border border-white shadow-sm flex items-center justify-center cursor-pointer"
                    style={{ left: `calc(${getRoiPercent(roiProjection.currentROI)}% - 7px)` }}
                    title={`Actual ROI: ${roiProjection.currentROI}x`}
                  />
                </>
              )}
            </div>

            {/* Range Legend */}
            <div className="flex justify-between items-center text-[10px] text-muted-foreground font-semibold px-1">
              <span>{t("0.0x (No Return)")}</span>
              <span>{t("1.0x (Break Even)")}</span>
              <span className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded bg-[#007AFF]/25 border border-[#007AFF]/20" /> {t("Actual ROI so far")} ({roiProjection.currentROI.toFixed(1)}x)
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded bg-[#34C759]/25 border border-[#34C759]/20" /> {t("90% Confidence Interval")} ({roiProjection.lowerBound.toFixed(1)}x - {roiProjection.upperBound.toFixed(1)}x)
              </span>
              <span>{t("6.0x+ ROI")}</span>
            </div>
          </div>
        </div>

        {/* Aether AI Predictor module */}
        <div className="p-8 apple-card bg-gradient-to-br from-[#007AFF]/5 via-background to-transparent relative overflow-hidden space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-[#007AFF]/10 border border-[#007AFF]/15 flex items-center justify-center text-primary">
                <Sparkles size={20} className="fill-primary/10" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[#007AFF] tracking-wider block">{t("Aether AI Predictor")}</span>
                <h3 className="text-lg font-bold mt-1 tracking-tight">{t("AI-Driven Campaign Forecast Engine")}</h3>
              </div>
            </div>
            
            <Button
              type="button"
              disabled={predictLoading}
              onClick={fetchAIPrediction}
              variant="secondary"
              className="text-xs font-semibold py-2 px-4 rounded-xl border border-border flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <RefreshCw size={12} className={predictLoading ? "animate-spin" : ""} />
              {predictLoading ? t("Forecasting...") : aiPrediction ? t("Recalculate Forecast") : t("Run AI Forecast")}
            </Button>
          </div>

          {predictLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <RefreshCw size={32} className="text-primary animate-spin mb-4" />
              <h4 className="text-sm font-semibold text-foreground">{t("Generating Performance Forecast...")}</h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs font-medium">
                {t("Gemini is analyzing metric pacing, click efficiency, conversion rates, and creator demographics to project campaign limits.")}
              </p>
            </div>
          ) : aiPrediction ? (
            <div className="space-y-6 animate-in fade-in duration-400">
              {/* Numbers Grid */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="p-4 bg-secondary/35 rounded-2xl border border-border/10">
                  <span className="text-[9px] uppercase font-bold text-muted-foreground block mb-1">{t("AI-Predicted ROI")}</span>
                  <span className="text-2xl font-black text-[#34C759] tracking-tight">{aiPrediction.predictedROI.toFixed(2)}x</span>
                </div>
                <div className="p-4 bg-secondary/35 rounded-2xl border border-border/10">
                  <span className="text-[9px] uppercase font-bold text-muted-foreground block mb-1">{t("AI-Projected Sales")}</span>
                  <span className="text-2xl font-black text-foreground tracking-tight">${aiPrediction.predictedRevenue.toLocaleString()}</span>
                </div>
                <div className="p-4 bg-secondary/35 rounded-2xl border border-border/10">
                  <span className="text-[9px] uppercase font-bold text-muted-foreground block mb-1">{t("Predicted Conversions")}</span>
                  <span className="text-2xl font-black text-foreground tracking-tight">{aiPrediction.predictedConversions}</span>
                </div>
                <div className="p-4 bg-secondary/35 rounded-2xl border border-border/10">
                  <span className="text-[9px] uppercase font-bold text-muted-foreground block mb-1">{t("Predicted Clicks")}</span>
                  <span className="text-2xl font-black text-foreground tracking-tight">{aiPrediction.predictedClicks.toLocaleString()}</span>
                </div>
                <div className="p-4 bg-secondary/35 rounded-2xl border border-border/10 col-span-2 md:col-span-1">
                  <span className="text-[9px] uppercase font-bold text-muted-foreground block mb-1 font-sans">{t("Pacing Status")}</span>
                  <span className={`text-xs font-bold inline-block px-2.5 py-1 rounded-full mt-1.5 uppercase ${
                    aiPrediction.pacingStatus === "overperforming" 
                      ? "bg-[#34C759]/10 text-[#34C759] border border-[#34C759]/15" 
                      : aiPrediction.pacingStatus === "underperforming" 
                      ? "bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/15" 
                      : "bg-[#FF9500]/10 text-[#FF9500] border border-[#FF9500]/15"
                  }`}>
                    {t(aiPrediction.pacingStatus.replace("_", " "))}
                  </span>
                </div>
              </div>

              {/* Slider Visual Comparison */}
              <div className="p-5 bg-card border border-border/20 rounded-3xl space-y-4">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block font-sans">{t("Comparison: Math Model vs. AI Predictive Model")}</span>
                
                <div className="space-y-3.5">
                  {/* Math Model Row */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-semibold">
                      <span className="text-muted-foreground">{t("Standard Mathematical Trend projection")}</span>
                      <span className="text-foreground">{roiProjection.projectedROI.toFixed(1)}x ROI</span>
                    </div>
                    <div className="w-full bg-secondary/50 h-2.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-[#007AFF] h-full rounded-full transition-all duration-500" 
                        style={{ width: `${getRoiPercent(roiProjection.projectedROI)}%` }}
                      />
                    </div>
                  </div>

                  {/* AI Model Row */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-[10px] font-semibold">
                      <span className="text-primary flex items-center gap-1"><Sparkles size={10} className="fill-primary/10" /> {t("Aether AI Context-Aware projection")}</span>
                      <span className="text-[#34C759] font-bold">{aiPrediction.predictedROI.toFixed(1)}x ROI</span>
                    </div>
                    <div className="w-full bg-secondary/50 h-2.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-[#34C759] h-full rounded-full transition-all duration-500" 
                        style={{ width: `${getRoiPercent(aiPrediction.predictedROI)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed strategic review & actionable steps */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2 border-t border-border/10">
                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block font-sans">{t("AI Strategic Pacing Analysis")}</span>
                  <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                    {t(aiPrediction.analysis)}
                  </p>
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block font-sans">{t("Aether Actionable Growth Roadmap")}</span>
                  <ul className="space-y-2 text-xs pl-0 list-none font-medium">
                    {aiPrediction.recommendations.map((rec: string, index: number) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-[#007AFF]/10 text-primary text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {index + 1}
                        </span>
                        <span className="text-muted-foreground">{t(rec)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-8 flex flex-col items-center justify-center text-center bg-secondary/15 rounded-3xl border border-dashed border-border/10">
              <Sparkles size={28} className="text-muted-foreground/30 mb-2 animate-pulse" />
              <h4 className="text-xs font-semibold text-muted-foreground">{t("Predictive Forecast Inactive")}</h4>
              <p className="text-[10px] text-muted-foreground mt-1 max-w-[240px]">
                {t("Run the AI prediction model to simulate ultimate campaign conversion volume, reach potential, and revenue returns.")}
              </p>
              <Button 
                type="button"
                onClick={fetchAIPrediction} 
                size="sm"
                className="mt-4 rounded-xl text-[10px] py-1.5 px-4 cursor-pointer"
              >
                {t("Run AI Forecast")}
              </Button>
            </div>
          )}
        </div>

        {/* Split Grid: Metrics Editor & Performance Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Manual Entry Editor Form */}
          <div className="p-8 apple-card">
            <h3 className="text-sm font-bold mb-1 tracking-tight">{t("Manual Metrics Editor")}</h3>
            <p className="text-[11px] text-muted-foreground mb-6">
              {t("Override UTM tracking properties manually. Numbers update the ROI model and charts instantly.")}
            </p>

            <div className="space-y-5">
              <div>
                <label className="text-[9px] font-bold text-muted-foreground block mb-1.5 uppercase tracking-wider">
                  {t("Attributed Value / Sales ($)")}
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={localAttributed}
                    onChange={(e) => handleMetricChange("attributed_value", e.target.value)}
                    className="w-full pl-8 pr-4 py-3 text-xs font-semibold bg-secondary/40 border border-border/20 rounded-2xl focus:outline-none focus:border-primary/45 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="text-[9px] font-bold text-muted-foreground block mb-1.5 uppercase tracking-wider">
                  {t("Budget Spent ($)")}
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">$</span>
                  <input
                    type="number"
                    value={localSpend}
                    onChange={(e) => handleMetricChange("budget_spent", e.target.value)}
                    className="w-full pl-8 pr-4 py-3 text-xs font-semibold bg-secondary/40 border border-border/20 rounded-2xl focus:outline-none focus:border-primary/45 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[8px] font-bold text-muted-foreground block mb-1.5 uppercase tracking-wider">
                    {t("Impressions")}
                  </label>
                  <input
                    type="number"
                    value={localImpressions}
                    onChange={(e) => handleMetricChange("impressions", e.target.value)}
                    className="w-full px-3 py-3 text-xs font-semibold bg-secondary/40 border border-border/20 rounded-2xl focus:outline-none focus:border-primary/45 transition-colors text-center"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-bold text-muted-foreground block mb-1.5 uppercase tracking-wider">
                    {t("Clicks")}
                  </label>
                  <input
                    type="number"
                    value={localClicks}
                    onChange={(e) => handleMetricChange("clicks", e.target.value)}
                    className="w-full px-3 py-3 text-xs font-semibold bg-secondary/40 border border-border/20 rounded-2xl focus:outline-none focus:border-primary/45 transition-colors text-center"
                  />
                </div>
                <div>
                  <label className="text-[8px] font-bold text-muted-foreground block mb-1.5 uppercase tracking-wider">
                    {t("Conversions")}
                  </label>
                  <input
                    type="number"
                    value={localConversions}
                    onChange={(e) => handleMetricChange("conversions", e.target.value)}
                    className="w-full px-3 py-3 text-xs font-semibold bg-secondary/40 border border-border/20 rounded-2xl focus:outline-none focus:border-primary/45 transition-colors text-center"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Charts Display */}
          <div className="lg:col-span-2 space-y-8">
            {/* Chart 1: Performance Trends */}
            <div className="p-8 apple-card">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold tracking-tight">{t("Performance Traffic Growth")}</h3>
                <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                  <TrendingUp size={12} className="text-[#34C759]" /> {t("Live synchronization active")}
                </span>
              </div>

              {mounted && (
                <div className="h-[220px] w-full text-[10px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.3} />
                      <XAxis dataKey="day" stroke="var(--muted-foreground)" />
                      <YAxis stroke="var(--muted-foreground)" />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "16px",
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          color: "var(--foreground)"
                        }}
                      />
                      <Legend verticalAlign="top" height={36} />
                      <Line type="monotone" dataKey="Clicks" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="Conversions" stroke="#34C759" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Chart 2: Confidence Bounds Narrowing */}
            <div className="p-8 apple-card">
              <h3 className="text-sm font-bold mb-1 tracking-tight">{t("Interval Convergence Model")}</h3>
              <p className="text-[10px] text-muted-foreground mb-6">
                {t("Shaded bounds demonstrate how error margin narrows as conversion volume grows.")}
              </p>

              {mounted && (
                <div className="h-[200px] w-full text-[10px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={narrowingData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.3} />
                      <XAxis dataKey="conversions" stroke="var(--muted-foreground)" label={{ value: 'Conversions Volume', position: 'insideBottom', offset: -5 }} />
                      <YAxis stroke="var(--muted-foreground)" />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "16px",
                          background: "var(--card)",
                          border: "1px solid var(--border)",
                          color: "var(--foreground)"
                        }}
                      />
                      <Area type="monotone" dataKey="Upper" stroke="transparent" fill="var(--primary)" fillOpacity={0.08} />
                      <Area type="monotone" dataKey="Lower" stroke="transparent" fill="var(--card)" fillOpacity={1.0} />
                      <Line type="monotone" dataKey="Expected" stroke="#34C759" strokeWidth={2.5} strokeDasharray="5 5" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderChatInterface = () => {
    if (!campaign || !user) return null;

    const brandName = "Sarah Jenkins (Brand)";
    const creatorName = campaign.participants.find(p => p.id === activeParticipantId)?.fullName || "Marcus Vance";
    const partnerName = user.role === "business" ? creatorName : brandName;
    const partnerAvatar = user.role === "business" 
      ? (campaign.participants.find(p => p.id === activeParticipantId)?.avatarUrl || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80")
      : "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80";

    const chatTemplates = user.role === "influencer" 
      ? [
          t("Just uploaded the video draft for review!"),
          t("Could you check the logo placement?"),
          t("Are we on track for the live date?"),
          t("Thanks for the updates!")
        ]
      : [
          t("Hi! Deliverable looks amazing. Escrow payout is authorized."),
          t("Could you adjust the sound profile in the next version?"),
          t("Please verify that the UTM link matches our tracking specs."),
          t("Good work! Let's lock this version.")
        ];

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start animate-in fade-in slide-in-from-bottom-2 duration-350">
        {/* Chat window container (2 columns on wide screens) */}
        <div className="lg:col-span-2 p-6 md:p-8 apple-card flex flex-col h-[560px]">
          {/* Header */}
          <div className="flex items-center gap-3.5 pb-4 border-b border-border/10 mb-4 select-none">
            <img src={partnerAvatar} alt={partnerName} className="w-10 h-10 rounded-full object-cover border border-border/20" />
            <div>
              <h3 className="text-xs font-bold text-foreground leading-none">{partnerName}</h3>
              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-[#34C759] rounded-full inline-block animate-pulse" /> {t("Direct secure messenger active")}
              </p>
            </div>
          </div>

          {/* Messages list */}
          <div className="flex-1 overflow-y-auto space-y-3.5 pr-2 mb-4 flex flex-col min-h-[100px]">
            {chatMessages.map((msg, index) => {
              const isMe = msg.sender_id === user.id || msg.role === user.role;
              const isSystem = msg.role === "system";

              if (isSystem) {
                return (
                  <div key={msg.id || index} className="self-center my-3 bg-secondary/35 border border-border/5 px-4 py-1.5 rounded-full text-[9px] font-bold text-muted-foreground uppercase tracking-widest text-center max-w-[90%] shadow-sm">
                    {t(msg.content)}
                  </div>
                );
              }

              return (
                <div key={msg.id || index} className={`flex flex-col ${isMe ? "items-end" : "items-start"} max-w-full`}>
                  <div className={`text-[9px] text-muted-foreground mb-1 select-none px-2`}>
                    {msg.sender_name} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className={`px-4 py-2.5 rounded-2xl text-xs leading-relaxed break-words max-w-[75%] shadow-sm ${
                    isMe 
                      ? "bg-[#007AFF] text-white rounded-tr-sm" 
                      : "bg-secondary/70 text-foreground border border-border/5 rounded-tl-sm"
                  }`}>
                    {msg.content}
                  </div>
                </div>
              );
            })}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex flex-col items-start select-none">
                <div className="text-[9px] text-muted-foreground mb-1 px-2">{partnerName} {t("is typing...")}</div>
                <div className="bg-secondary/70 border border-border/5 px-4 py-3 rounded-2xl rounded-tl-sm flex gap-1.5 shadow-sm">
                  <span className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Chat quick replies templates */}
          <div className="flex gap-2 overflow-x-auto pb-3 mb-1.5 scroll-smooth no-scrollbar select-none">
            {chatTemplates.map((template, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(template)}
                className="px-3.5 py-2 rounded-2xl bg-secondary/40 text-[10px] text-muted-foreground border border-border/15 font-semibold shrink-0 hover:text-foreground hover:bg-secondary cursor-pointer transition-colors active:scale-98"
              >
                {template}
              </button>
            ))}
          </div>

          {/* Form input bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex gap-2 items-center"
          >
            <input
              type="text"
              placeholder="iMessage"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="flex-1 bg-secondary/35 border border-border/20 px-4 py-3 rounded-2xl text-xs font-semibold focus:outline-none focus:border-[#007AFF]/40 transition-colors"
            />
            <button
              type="submit"
              disabled={!chatInput.trim()}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all focus:outline-none cursor-pointer border-0 shrink-0 select-none ${
                chatInput.trim() 
                  ? "bg-[#007AFF] text-white hover:scale-105 active:scale-95 shadow-sm" 
                  : "bg-secondary text-muted-foreground/40"
              }`}
            >
              <Send size={15} />
            </button>
          </form>
        </div>

        {/* Right column: Campaign Info + UTM Generator Widget (Influencer side) */}
        <div className="lg:col-span-1 space-y-6">
          <div className="p-8 apple-card space-y-5">
            <h3 className="text-sm font-bold tracking-tight">{t("Campaign Messenger Details")}</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {t("Use this private threaded space to negotiate deliverable revisions, budget card increases, and check the contract's escrow status.")}
            </p>
            
            <div className="space-y-4 pt-4 border-t border-border/10">
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-semibold">{t("Contract Budget:")}</span>
                <span className="font-extrabold text-foreground">${campaign.budget.toLocaleString()} USD</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-semibold">{t("Stripe Escrow Status:")}</span>
                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                  campaign.status === "open" || campaign.status === "applied"
                    ? "bg-secondary text-muted-foreground"
                    : "bg-[#34C759]/10 text-[#34C759] border border-[#34C759]/20"
                }`}>
                  {campaign.status === "open" || campaign.status === "applied" ? t("Unfunded") : t("Secured")}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-muted-foreground font-semibold">{t("Platform:")}</span>
                <span className="font-semibold text-foreground flex items-center gap-1 capitalize">
                  {t(campaign.deliverables[0]?.platform || "Instagram")}
                </span>
              </div>
            </div>
          </div>

          {/* Render UTM generator widget (Influencer side) */}
          {/* Render UTM generator widget (Influencer side) */}
          {user.role === "influencer" && campaign.status !== "open" && campaign.status !== "applied" && (
            <div className="p-8 apple-card space-y-6 relative overflow-hidden">
              <h3 className="text-sm font-bold tracking-tight flex items-center gap-1.5">
                <ExternalLink size={15} className="text-[#007AFF]" /> {t("Attribution & UTM Builder")}
              </h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {t("Generate tracking links and promo discount codes to measure the direct sales and ROI you drive for this launch.")}
              </p>

              {/* UTM link configurations */}
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[8px] font-bold text-muted-foreground block mb-1 uppercase tracking-wider">{t("Source")}</label>
                    <select
                      value={utmSource}
                      onChange={(e) => setUtmSource(e.target.value)}
                      className="w-full bg-secondary/40 border border-border/20 px-2.5 py-2 text-[10px] rounded-xl font-bold cursor-pointer"
                    >
                      <option value="instagram">{t("Instagram")}</option>
                      <option value="tiktok">{t("TikTok")}</option>
                      <option value="youtube">{t("YouTube")}</option>
                      <option value="linktree">{t("Linktree")}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[8px] font-bold text-muted-foreground block mb-1 uppercase tracking-wider">{t("Medium")}</label>
                    <select
                      value={utmMedium}
                      onChange={(e) => setUtmMedium(e.target.value)}
                      className="w-full bg-secondary/40 border border-border/20 px-2.5 py-2 text-[10px] rounded-xl font-bold cursor-pointer"
                    >
                      <option value="reel">{t("Reel / Video")}</option>
                      <option value="bio">{t("Bio Link")}</option>
                      <option value="story">{t("Story Swipe")}</option>
                      <option value="sponsor">{t("Sponsor slot")}</option>
                    </select>
                  </div>
                </div>

                {/* Generated UTM */}
                <div>
                  <label className="text-[8px] font-bold text-muted-foreground block mb-1 uppercase tracking-wider">{t("Attribution URL")}</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`https://aether.co/c/${campaignId}?utm_source=${utmSource}&utm_medium=${utmMedium}&utm_campaign=${campaign.title.toLowerCase().replace(/\s+/g, "-")}&influencer=${user.full_name.toLowerCase().split(" ")[0]}&code=${user.full_name.split(" ")[0].toUpperCase()}15`}
                      className="flex-1 bg-secondary/25 border border-border/20 px-3 py-2 text-[9px] rounded-xl font-mono select-all overflow-hidden truncate focus:outline-none"
                    />
                    <Button
                      onClick={() => {
                        const url = `https://aether.co/c/${campaignId}?utm_source=${utmSource}&utm_medium=${utmMedium}&utm_campaign=${campaign.title.toLowerCase().replace(/\s+/g, "-")}&influencer=${user.full_name.toLowerCase().split(" ")[0]}&code=${user.full_name.split(" ")[0].toUpperCase()}15`;
                        navigator.clipboard.writeText(url);
                        toast.success(t("UTM Link Copied!"), {
                          description: t("Paste it in your profile bio or video description.")
                        });
                      }}
                      size="sm"
                      className="rounded-xl px-3 py-1.5 text-[9px] font-bold shadow-sm"
                    >
                      {t("Copy")}
                    </Button>
                  </div>
                </div>

                {/* Generated Promo Code & Apple Wallet style UI */}
                <div className="pt-2">
                  <label className="text-[8px] font-bold text-muted-foreground block mb-1.5 uppercase tracking-wider">{t("Verified Promo Code")}</label>
                  
                  {/* Apple Wallet visual pass */}
                  <motion.div
                    whileHover={{ scale: 1.015, y: -2 }}
                    className="p-4 bg-gradient-to-br from-[#007AFF] to-[#5856D6] rounded-2xl text-white shadow-md relative overflow-hidden select-none"
                  >
                    <div className="absolute top-[-30px] right-[-30px] w-24 h-24 bg-white/10 rounded-full blur-xl pointer-events-none" />
                    
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-[8px] text-white/70 uppercase font-black tracking-widest leading-none">{t("Aether Verified Code")}</span>
                        <h4 className="text-lg font-black tracking-wider mt-1">{user.full_name.split(" ")[0].toUpperCase()}15</h4>
                      </div>
                      <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md">
                        <DollarSign size={16} />
                      </div>
                    </div>

                    <div className="flex justify-between items-end mt-6 pt-3 border-t border-white/15">
                      <div>
                        <span className="text-[7px] text-white/50 uppercase block font-bold leading-none">{t("Promotion Discount")}</span>
                        <span className="text-[10px] font-extrabold mt-0.5 block leading-none">{t("15% off site-wide")}</span>
                      </div>
                      
                      <div className="w-10 h-10 bg-white rounded-lg p-1.5 flex items-center justify-center shadow-sm">
                        <svg viewBox="0 0 100 100" className="w-full h-full text-black" fill="currentColor">
                          <rect x="0" y="0" width="20" height="20" />
                          <rect x="0" y="80" width="20" height="20" />
                          <rect x="80" y="0" width="20" height="20" />
                          <rect x="0" y="40" width="20" height="20" />
                          <rect x="40" y="40" width="20" height="20" />
                          <rect x="40" y="0" width="20" height="20" />
                          <rect x="80" y="40" width="20" height="20" />
                          <rect x="40" y="80" width="20" height="20" />
                          <rect x="80" y="80" width="20" height="20" />
                        </svg>
                      </div>
                    </div>
                  </motion.div>
                  
                  <div className="flex justify-end mt-2.5">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${user.full_name.split(" ")[0].toUpperCase()}15`);
                        toast.success(t("Promo Code Copied!"), {
                          description: t("Discount code is active for attribution.")
                        });
                      }}
                      className="text-[9px] font-bold text-[#007AFF] hover:underline"
                    >
                      {t("Copy Promo Code")}
                    </button>
                  </div>
                </div>

                {/* Simulate Traffic widget */}
                <div className="p-3.5 rounded-2xl bg-secondary/35 border border-border/10 space-y-3.5 mt-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-bold text-foreground uppercase tracking-wider flex items-center gap-1">
                      <Sparkles size={11} className="text-[#FF9500] fill-[#FF9500]" /> {t("Simulation Controller")}
                    </span>
                    <span className="text-[8px] text-muted-foreground">{t("Mock mode active")}</span>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        toast.loading(t("Simulating clicks traffic..."), { id: "sim-load" });
                        await new Promise((resolve) => setTimeout(resolve, 800));
                        
                        const newClicks = metrics ? metrics.clicks + 75 : 75;
                        const newImps = metrics ? metrics.impressions + 1200 : 1200;
                        
                        await updateMetrics({
                          clicks: newClicks,
                          impressions: newImps
                        });
                        
                        setLocalClicks(newClicks.toString());
                        setLocalImpressions(newImps.toString());
                        
                        toast.success(t("Simulated 75 clicks & 1200 impressions!"), { 
                          id: "sim-load",
                          description: t("Analytics tables and graphs updated.")
                        });
                        window.dispatchEvent(new Event("aether-metrics-update"));
                      }}
                      className="flex-1 py-2 px-1 text-[9px] font-bold rounded-xl bg-secondary hover:bg-secondary/70 border border-border/15 transition-all text-center cursor-pointer active:scale-95"
                    >
                      {t("+75 Clicks")}
                    </button>
                    <button
                      onClick={async () => {
                        toast.loading(t("Simulating promo sales..."), { id: "sim-load" });
                        await new Promise((resolve) => setTimeout(resolve, 800));
                        
                        const newConvs = metrics ? metrics.conversions + 4 : 4;
                        const newAttributed = metrics ? metrics.attributed_value + 380 : 380;
                        const newSpend = metrics ? metrics.budget_spent + 50 : 50;
                        
                        await updateMetrics({
                          conversions: newConvs,
                          attributed_value: newAttributed,
                          budget_spent: newSpend
                        });
                        
                        setLocalConversions(newConvs.toString());
                        setLocalAttributed(newAttributed.toString());
                        setLocalSpend(newSpend.toString());
                        
                        toast.success(t("Simulated 4 conversions ($380 value)!"), { 
                          id: "sim-load",
                          description: t("Estimated ROI metrics recalculated.")
                        });
                        window.dispatchEvent(new Event("aether-metrics-update"));
                      }}
                      className="flex-1 py-2 px-1 text-[9px] font-bold rounded-xl bg-secondary hover:bg-secondary/70 border border-border/15 transition-all text-center cursor-pointer active:scale-95"
                    >
                      {t("+4 Purchases")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 md:py-12">
      {/* Back to dashboard */}
      <button 
        onClick={() => router.push("/campaigns")}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6 cursor-pointer focus:outline-none"
      >
        <ArrowLeft size={14} /> {t("Back to campaigns")}
      </button>

      {/* Top Header Grid */}
      <div className="p-8 apple-card relative overflow-hidden mb-8">
        <div className="absolute top-0 right-0 w-[300px] h-[150px] bg-gradient-to-l from-[#007AFF]/10 to-transparent blur-[70px] pointer-events-none" />
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <span className="text-[10px] font-bold px-2.5 py-0.5 bg-secondary text-muted-foreground rounded-full uppercase tracking-wider">
              {campaign.status === "released" ? t("Released & Live") : t(campaign.status)}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mt-3 mb-1">{campaign.title}</h1>
            <p className="text-xs text-muted-foreground">{t("Contract ID")}: {campaignId.toUpperCase()}-SECURE-CONNECT</p>
          </div>
          
          <div className="flex items-center gap-6 shrink-0">
            <div>
              <span className="text-[9px] uppercase text-muted-foreground font-bold block">{t("Total Contract Budget")}</span>
              <span className="text-2xl font-black text-foreground flex items-center justify-start mt-0.5">
                <DollarSign size={20} />{campaign.budget.toLocaleString()}
              </span>
            </div>
            
            {/* If Business and no participants funded yet, fund all option */}
            {isBusiness && selectedParticipant?.status === "applied" && (
              <Button 
                onClick={handleFundEscrow} 
                disabled={actionLoading}
                className="rounded-2xl bg-[#FF9500] hover:bg-[#e08400] text-white text-xs py-3.5 px-6 cursor-pointer font-bold shadow-sm flex items-center gap-1.5"
              >
                {t("Accept & Fund Escrow")} <DollarSign size={14} />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Segment: Participant List Selector (ONLY Business View) */}
      {isBusiness && (
        <div className="mb-8">
          <span className="text-[10px] uppercase text-muted-foreground font-bold block mb-3.5">
            {t("Active Campaign Partners")}
          </span>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {campaign.participants.map((p) => {
              const active = p.id === activeParticipantId;
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setActiveParticipantId(p.id);
                    if (p.submissions && p.submissions.length > 0) {
                      setSelectedVersionNum(p.submissions[p.submissions.length - 1].version);
                    } else {
                      setSelectedVersionNum(1);
                    }
                  }}
                  className={`flex items-center gap-3 p-3.5 pr-5 rounded-2xl border text-left cursor-pointer transition-all duration-200 shrink-0 ${
                    active 
                      ? "bg-card border-primary/50 ring-2 ring-primary/20 shadow-md translate-y-[-2px]" 
                      : "bg-card/40 border-border hover:bg-card/75 hover:border-border/60"
                  }`}
                >
                  <img src={p.avatarUrl} alt={p.fullName} className="w-9 h-9 rounded-full object-cover border border-border" />
                  <div>
                    <p className="text-xs font-bold text-foreground leading-none">{p.fullName}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{p.handle}</p>
                    <span className={`inline-block text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full mt-1.5 ${
                      p.status === "released" 
                        ? "bg-[#34C759]/10 text-[#34C759]" 
                        : p.status === "submitted"
                        ? "bg-[#007AFF]/10 text-[#007AFF]"
                        : p.status === "escrowed"
                        ? "bg-[#FF9500]/10 text-[#FF9500]"
                        : "bg-secondary text-muted-foreground"
                    }`}>
                      {t(p.status)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Stepper Status Timeline */}
      {renderStatusTimeline()}

      {/* Workspace / Analytics Toggle */}
      <div className="flex justify-center sm:justify-start mb-8 mt-4">
        <div className="bg-secondary/40 border border-border/20 p-1.5 rounded-2xl flex gap-1 relative max-w-xl w-full sm:w-auto">
          {/* Active Tab Sliding Pill */}
          <div className="absolute inset-y-1.5 left-1.5 right-1.5 pointer-events-none">
            <motion.div
              layoutId="activeWorkspaceTabPill"
              className="bg-card shadow-sm border border-border/30 rounded-xl h-full"
              initial={false}
              animate={{
                x: workspaceTab === "workspace" ? "0%" : workspaceTab === "analytics" ? "100%" : "200%",
                width: "33.33%"
              }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          </div>

          <button
            onClick={() => setWorkspaceTab("workspace")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl relative z-10 transition-colors cursor-pointer select-none ${
              workspaceTab === "workspace" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers size={13} />
            {t("Milestones & Workspace")}
          </button>
          
          <button
            onClick={() => setWorkspaceTab("analytics")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl relative z-10 transition-colors cursor-pointer select-none ${
              workspaceTab === "analytics" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp size={13} />
            {t("Analytics & Live ROI")}
          </button>

          <button
            onClick={() => setWorkspaceTab("chat")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl relative z-10 transition-colors cursor-pointer select-none ${
              workspaceTab === "chat" ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageSquare size={13} />
            {t("Direct Chat")}
            {hasUnreadMessages && (
              <span className="w-1.5 h-1.5 bg-[#FF3B30] rounded-full inline-block animate-pulse" />
            )}
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {workspaceTab === "workspace" ? (
          <motion.div
            key="workspace-tab-content"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={appleSpring}
          >
            {/* Main Grid: Split Content Preview and Details */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start mb-8">
        
        {/* Left Column: Brief details + actions (Influencer Apply or Submit panels) */}
        <div className="lg:col-span-1 space-y-8">
          {renderBriefTabs()}

          {/* INFLUENCER ROLE: Call to Action Panels */}
          {!isBusiness && (
            <div className="apple-card p-8">
              <h3 className="text-sm font-bold mb-4 tracking-tight">{t("Milestone Action Panel")}</h3>
              
              {/* Not Applied yet: Discover State */}
              {!selectedParticipant && (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t("You have not applied to this campaign contract yet. Submit your pitch and proposed budget payout to begin.")}
                  </p>
                  
                  {isApplying ? (
                    <form onSubmit={submitApplyForm} className="space-y-4 pt-2 border-t border-border/10">
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground block mb-1 uppercase">{t("Pitch Message")}</label>
                        <textarea
                          placeholder={t("Why are you a good fit for this launch?")}
                          value={pitchText}
                          onChange={(e) => setPitchText(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-xs bg-secondary/35 border border-border/20 rounded-xl focus:outline-none focus:border-primary/45 resize-none h-20"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground block mb-1 uppercase">{t("Proposed Payout ($)")}</label>
                        <input
                          type="number"
                          placeholder="2500"
                          value={pitchRate}
                          onChange={(e) => setPitchRate(e.target.value)}
                          className="w-full px-3.5 py-2 text-xs bg-secondary/35 border border-border/20 rounded-xl focus:outline-none focus:border-primary/45"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" className="rounded-xl flex-1 text-xs py-2">{t("Submit Pitch")}</Button>
                        <Button type="button" variant="secondary" onClick={() => setIsApplying(false)} className="rounded-xl text-xs py-2">{t("Cancel")}</Button>
                      </div>
                    </form>
                  ) : (
                    <Button onClick={handleApply} className="w-full rounded-2xl text-xs py-3.5 font-bold shadow-sm flex items-center justify-center gap-1.5 cursor-pointer">
                      {t("Apply to Campaign")} <Sparkles size={14} />
                    </Button>
                  )}
                </div>
              )}

              {/* Applied but not Funded yet */}
              {selectedParticipant && selectedParticipant.status === "applied" && (
                <div className="p-4 rounded-2xl bg-secondary/30 border border-border/10 flex items-start gap-3">
                  <Clock size={16} className="text-[#FF9500] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-foreground leading-none">{t("Application Under Review")}</p>
                    <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed">
                      {t("Awaiting escrow funding from Brand client. Budget must be secured in Stripe before you can submit drafts.")}
                    </p>
                  </div>
                </div>
              )}

              {/* Escrowed / Rejected: Submit Draft Form */}
              {selectedParticipant && (selectedParticipant.status === "escrowed" || selectedParticipant.status === "rejected") && (
                <form onSubmit={handleSubmitDraft} className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-[#007AFF]/10 border border-[#007AFF]/15 flex items-start gap-2.5 mb-2">
                    <ShieldCheck size={16} className="text-[#007AFF] shrink-0 mt-0.5" />
                    <span className="text-[10px] text-muted-foreground leading-relaxed">
                      <b className="text-foreground font-bold">{t("Stripe Escrow Verified:")}</b> {t("Payout value of")} <b className="text-foreground">${selectedParticipant.payout.toLocaleString()}</b> {t("is secured in transaction.")}
                    </span>
                  </div>

                  {selectedParticipant.status === "rejected" && (
                    <div className="p-3.5 rounded-2xl bg-[#FF3B30]/10 border border-[#FF3B30]/15 flex items-start gap-2.5">
                      <AlertCircle size={16} className="text-[#FF3B30] shrink-0 mt-0.5" />
                      <span className="text-[10px] text-muted-foreground leading-relaxed">
                        <b className="text-foreground font-bold">{t("Changes Requested:")}</b> {t("Review comments on the right side and resubmit draft below.")}
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground block mb-1 uppercase">{t("Draft Content URL")}</label>
                    <input
                      type="text"
                      placeholder="https://tiktok.com/@marcusv/draft/398234"
                      value={postUrl}
                      onChange={(e) => setPostUrl(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs bg-secondary/35 border border-border/20 rounded-xl focus:outline-none focus:border-primary/45"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground block mb-1 uppercase">{t("Post Caption / Description")}</label>
                    <textarea
                      placeholder={t("Enter the caption text to post along with your draft. E.g. 'Highly recommend the @Aether desk shelf! #ad'")}
                      value={postCaption}
                      onChange={(e) => setPostCaption(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs bg-secondary/35 border border-border/20 rounded-xl focus:outline-none focus:border-primary/45 resize-none h-16"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground block mb-1.5 uppercase">{t("Select Aesthetic Preset Image")}</label>
                    <div className="grid grid-cols-4 gap-2">
                      {MOCK_PRESET_IMAGES.map((img) => (
                        <button
                          key={img.name}
                          type="button"
                          onClick={() => setSelectedPresetImage(img.url)}
                          className={`relative aspect-square rounded-lg overflow-hidden border cursor-pointer ${
                            selectedPresetImage === img.url ? "border-primary ring-2 ring-primary/20 scale-95" : "border-border hover:border-border/60"
                          }`}
                        >
                          <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5 pt-1">
                    <div>
                      <label className="text-[9px] font-bold text-muted-foreground block mb-1 uppercase">{t("Est. Views")}</label>
                      <input
                        type="number"
                        value={estViews}
                        onChange={(e) => setEstViews(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-secondary/35 border border-border/20 rounded-xl focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-muted-foreground block mb-1 uppercase">{t("Est. Likes")}</label>
                      <input
                        type="number"
                        value={estLikes}
                        onChange={(e) => setEstLikes(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-secondary/35 border border-border/20 rounded-xl focus:outline-none"
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full rounded-xl text-xs py-3 font-bold cursor-pointer">
                    {t("Submit Deliverable Draft")}
                  </Button>
                </form>
              )}

              {/* Submitted & Awaiting Review */}
              {selectedParticipant && selectedParticipant.status === "submitted" && (
                <div className="p-4 rounded-2xl bg-secondary/35 border border-border/10 flex items-start gap-3">
                  <Clock size={16} className="text-[#FF9500] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-foreground leading-none">{t("Draft Pending Brand Review")}</p>
                    <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed font-normal">
                      {t("Your draft content is under review by the brand. They will release escrow payout or submit feedback pins shortly.")}
                    </p>
                  </div>
                </div>
              )}

              {/* Released / Completed */}
              {selectedParticipant && selectedParticipant.status === "released" && (
                <div className="p-4 rounded-2xl bg-[#34C759]/10 border border-[#34C759]/15 flex items-start gap-3">
                  <ShieldCheck size={16} className="text-[#34C759] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-foreground leading-none">{t("Contract Completed")}</p>
                    <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed font-normal">
                      {t("Funds successfully released. Estimated ROI is currently active based on real-time social metrics.")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* BUSINESS ROLE: Application Review Panel */}
          {isBusiness && selectedParticipant && selectedParticipant.status === "applied" && (
            <div className="apple-card p-8 space-y-6">
              <div>
                <span className="text-[10px] uppercase text-[#FF9500] font-bold block mb-1.5 tracking-wider">
                  {t("Campaign Application")}
                </span>
                <h3 className="text-sm font-bold tracking-tight">{t("Review Creator Pitch")}</h3>
              </div>

              {/* Pitch Text */}
              <div className="p-4 rounded-2xl bg-secondary/35 border border-border/10">
                <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block mb-1.5">{t("Proposed Pitch")}</span>
                <p className="text-xs text-foreground leading-relaxed italic">
                  "{selectedParticipant.pitch || "Hi, I am interested in collaborating on this campaign and creating high-quality content that matches your design language."}"
                </p>
              </div>

              {/* AI Match Badge */}
              <div className="p-4 rounded-2xl bg-[#FF9500]/5 border border-[#FF9500]/15 space-y-2">
                <span className="text-[10px] uppercase font-bold text-[#FF9500] tracking-wider flex items-center gap-1">
                  <Sparkles size={11} className="fill-[#FF9500]" /> {t("Aether AI Matching")}
                </span>
                <p className="text-xs text-foreground font-semibold leading-relaxed">
                  {selectedParticipant.id === "mock-influencer-uuid" 
                    ? t("This creator has delivered 3.2× ROI for similar tech campaigns.")
                    : selectedParticipant.fullName.includes("Sofia") 
                    ? t("This creator has delivered 3.2× ROI for similar beauty campaigns.")
                    : t("This creator is predicted to deliver 2.8x ROI for this category.")}
                </p>
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[10px] bg-[#FF9500]/10 text-[#FF9500] px-2 py-0.5 rounded-full font-bold">
                    {selectedParticipant.id === "mock-influencer-uuid" ? "98%" : "96%"} {t("Match")}
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium">{t("Based on past performance and ER")}</span>
                </div>
              </div>

              {/* Proposed payout */}
              <div className="flex justify-between items-center py-2 border-t border-b border-border/10">
                <span className="text-xs text-muted-foreground font-medium">{t("Proposed Rate")}</span>
                <span className="text-sm font-bold text-foreground">${selectedParticipant.payout.toLocaleString()}</span>
              </div>

              {/* Accept & Fund */}
              <Button 
                onClick={handleFundEscrow} 
                disabled={actionLoading}
                className="w-full rounded-2xl bg-[#FF9500] hover:bg-[#e08400] text-white text-xs py-3.5 font-bold shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {t("Accept & Fund Escrow")} <DollarSign size={14} />
              </Button>
            </div>
          )}

          {/* BUSINESS ROLE: Content Review panel when in review */}
          {isBusiness && selectedParticipant && selectedParticipant.status === "submitted" && (
            <div className="apple-card p-8">
              <h3 className="text-sm font-bold mb-4 tracking-tight flex items-center gap-1.5">
                <FileCheck2 size={16} className="text-primary" /> {t("Review Content Draft")}
              </h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                {t("Click on the mobile preview screen to drop coordinate pin comments. If everything matches your brief, release escrow payout.")}
              </p>
              <div className="flex gap-2">
                <Button 
                  onClick={handleApproveRelease} 
                  disabled={actionLoading}
                  className="rounded-xl flex-1 bg-[#34C759] hover:bg-[#2db04e] text-white text-xs py-3 font-bold shadow-sm"
                >
                  {t("Approve & Release")}
                </Button>
                <Button 
                  onClick={handleRejectDraft} 
                  variant="secondary"
                  className="rounded-xl flex-1 text-xs py-3 border border-border"
                >
                  {t("Request Changes")}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right 2 Columns: Content Preview + Side-by-Side Annotation system */}
        <div className="lg:col-span-2 space-y-8">
          
          {selectedParticipant && (selectedParticipant.status === "submitted" || selectedParticipant.status === "released" || selectedParticipant.status === "rejected" || (selectedParticipant.submissions && selectedParticipant.submissions.length > 0)) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              
              {/* Phone Content Preview */}
              <div className="space-y-4">
                <span className="text-[10px] uppercase text-muted-foreground font-bold block mb-1">
                  {t("Deliverable Mockup Preview")}
                </span>

                {/* Smartphone Device Mockup wrapper */}
                <div className="border-8 border-foreground rounded-[36px] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] overflow-hidden w-[260px] h-[480px] mx-auto bg-black relative flex flex-col">
                  {/* Dynamic platform icons top bar */}
                  <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-24 h-4 bg-black rounded-full z-30" />
                  
                  {/* Interactive Pinning Layer */}
                  <div 
                    onClick={handleImageClick}
                    className="w-full h-full relative cursor-crosshair group overflow-hidden bg-[#16161a]"
                  >
                    {/* Content Image */}
                    {currentSubmission ? (
                      <img 
                        ref={imageRef}
                        src={currentSubmission.imageUrl} 
                        alt="Draft deliverable" 
                        className="w-full h-full object-cover select-none"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                        {t("No Draft Uploaded")}
                      </div>
                    )}

                    {/* Social overlay overlays matching mobile players */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60 pointer-events-none z-10" />

                    {/* TikTok style actions panel */}
                    <div className="absolute right-3.5 bottom-20 flex flex-col gap-4 items-center z-10 text-white select-none pointer-events-none">
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-black/40 border border-white/20 flex items-center justify-center">
                          <CheckCircle2 size={14} className="text-primary" />
                        </div>
                        <span className="text-[8px] font-bold mt-1">{t("Logo")}</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-black/40 border border-white/20 flex items-center justify-center">
                          <MessageCircle size={14} />
                        </div>
                        <span className="text-[8px] font-bold mt-1">{currentSubmission?.metrics.comments || 0}</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="w-8 h-8 rounded-full bg-black/40 border border-white/20 flex items-center justify-center">
                          <Share2 size={14} />
                        </div>
                        <span className="text-[8px] font-bold mt-1">{currentSubmission?.metrics.shares || 0}</span>
                      </div>
                    </div>

                    <div className="absolute left-3.5 bottom-4 right-10 text-white z-10 select-none pointer-events-none">
                      <p className="text-[10px] font-bold">{selectedParticipant.handle}</p>
                      <p className="text-[8px] text-white/80 line-clamp-2 mt-1 leading-normal">
                        {currentSubmission?.caption || "Taking my desktop productivity setup to the next level with campaign tools. #workspace #desk #aether"}
                      </p>
                    </div>

                    {/* Visual pins overlay */}
                    {currentSubmission?.annotations.map((ann, idx) => {
                      const isHovered = hoveredPinId === ann.id;
                      return (
                        <motion.div
                          key={ann.id}
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: isHovered ? 1.25 : 1, opacity: 1 }}
                          whileTap={{ scale: 0.9 }}
                          transition={{ type: "spring", stiffness: 350, damping: 20 }}
                          className={`w-6 h-6 rounded-full border border-white font-bold text-[9px] flex items-center justify-center absolute shadow-lg z-20 cursor-pointer -translate-x-1/2 -translate-y-1/2 ${
                            ann.resolved 
                              ? "bg-muted-foreground/60 text-white/80" 
                              : "bg-primary text-white"
                          } ${isHovered ? "ring-2 ring-white/50" : ""}`}
                          style={{ left: `${ann.x}%`, top: `${ann.y}%` }}
                          title={ann.text}
                          onClick={(e) => {
                            e.stopPropagation();
                            setHoveredPinId(ann.id);
                          }}
                        >
                          {idx + 1}
                          {!ann.resolved && (
                            <span className="absolute inset-0 rounded-full border-2 border-primary animate-ping opacity-75 pointer-events-none" />
                          )}
                        </motion.div>
                      );
                    })}

                    {/* Temporary pin dropping */}
                    {activeTempPin && (
                      <div
                        className="w-6 h-6 rounded-full bg-[#FF9500] text-white border border-white font-bold text-[9px] flex items-center justify-center absolute shadow-lg -translate-x-1/2 -translate-y-1/2 z-20"
                        style={{ left: `${activeTempPin.x}%`, top: `${activeTempPin.y}%` }}
                      >
                        ?
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-center text-[10px] text-muted-foreground italic flex justify-center items-center gap-1">
                  <MousePointerClick size={12} />
                  {t("Click preview screen to drop coordinate comments.")}
                </div>
              </div>

              {/* Side Comments Panel + Annotations thread */}
              <div className="space-y-4 h-[510px] flex flex-col">
                {/* Visual Tab Selection */}
                <div className="flex bg-secondary/50 p-1 rounded-xl select-none">
                  <button
                    type="button"
                    onClick={() => setCommentsTab("pins")}
                    className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                      commentsTab === "pins" 
                        ? "bg-card text-foreground shadow-sm" 
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("Review Pins")} ({currentSubmission?.annotations.length || 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommentsTab("safety")}
                    className={`flex-1 text-center py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      commentsTab === "safety" 
                        ? "bg-card text-foreground shadow-sm" 
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t("AI Safety Guard")} <Sparkles size={11} className="fill-[#007AFF] text-[#007AFF]" />
                  </button>
                </div>

                {commentsTab === "pins" ? (
                  <>
                    <div className="flex justify-between items-center pb-2 border-b border-border/10">
                      <div>
                        <span className="text-[10px] text-muted-foreground font-bold uppercase block">{t("Version Selector")}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <select
                            value={selectedVersionNum}
                            onChange={(e) => setSelectedVersionNum(parseInt(e.target.value))}
                            className="text-xs bg-secondary/40 border border-border/20 px-2 py-1 rounded-lg focus:outline-none font-bold"
                          >
                            {submissionVersions.map((vNum) => (
                              <option key={vNum} value={vNum}>
                                {t("Version")} {vNum}
                              </option>
                            ))}
                          </select>
                          <span className="text-[10px] text-muted-foreground">
                            {currentSubmission && new Date(currentSubmission.submittedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {currentSubmission && (
                        <a 
                          href={currentSubmission.postUrl} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-[10px] font-bold text-primary flex items-center gap-0.5 hover:underline"
                        >
                          {t("Post Link")} <ExternalLink size={10} />
                        </a>
                      )}
                    </div>

                    {/* Input block for dropping pin comment */}
                    {activeTempPin && (
                      <form onSubmit={handleSavePinComment} className="p-4 rounded-2xl bg-secondary/50 border border-[#FF9500]/25 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-[9px] text-[#FF9500] font-bold uppercase flex items-center gap-1">
                            <Sparkles size={11} /> {t("Dropping Pin Feedback")}
                          </span>
                          <button 
                            type="button" 
                            onClick={() => setActiveTempPin(null)} 
                            className="text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <textarea
                          placeholder={t("Type instructions linked to this screenshot coordinate...")}
                          value={newPinComment}
                          onChange={(e) => setNewPinComment(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-card border border-border/20 rounded-xl focus:outline-none focus:border-[#FF9500]/40 resize-none h-14"
                          required
                        />
                        <div className="flex justify-end gap-1.5">
                          <Button type="submit" size="sm" className="rounded-lg text-[10px] py-1">{t("Save Pin")}</Button>
                        </div>
                      </form>
                    )}

                    {/* Annotations comments list */}
                    <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                      {currentSubmission && currentSubmission.annotations.length > 0 ? (
                        currentSubmission.annotations.map((ann, idx) => {
                          const isHovered = hoveredPinId === ann.id;
                          return (
                            <motion.div
                              key={ann.id}
                              layout
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ 
                                opacity: ann.resolved ? 0.7 : 1,
                                y: 0,
                                scale: isHovered ? 1.01 : 1
                              }}
                              transition={{ type: "spring", stiffness: 350, damping: 25 }}
                              onMouseEnter={() => setHoveredPinId(ann.id)}
                              onMouseLeave={() => setHoveredPinId(null)}
                              className={`p-3.5 rounded-2xl border transition-colors relative ${
                                ann.resolved 
                                  ? "bg-secondary/20 border-border/10" 
                                  : isHovered 
                                  ? "bg-card border-primary/45 shadow-sm" 
                                  : "bg-card border-border/10"
                              }`}
                            >
                              <div className="flex justify-between items-start mb-1.5">
                                <span className="text-[10px] font-bold text-foreground flex items-center gap-1.5">
                                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white ${
                                    ann.resolved ? "bg-muted-foreground/60" : "bg-primary"
                                  }`}>
                                    {idx + 1}
                                  </span>
                                  {ann.authorName}
                                </span>
                                <span className="text-[8px] text-muted-foreground">
                                  {new Date(ann.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              
                              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                {ann.text}
                              </p>

                              {/* Action Resolve Buttons */}
                              <div className="flex justify-between items-center mt-3 pt-2 border-t border-border/10">
                                <span className="text-[8px] text-muted-foreground uppercase font-bold">
                                  {t("Pin Coordinate:")} ({Math.round(ann.x)}%, {Math.round(ann.y)}%)
                                </span>
                                
                                <button
                                  type="button"
                                  onClick={() => handleToggleResolvePin(ann.id)}
                                  className={`text-[9px] font-bold px-2 py-0.5 rounded-full border cursor-pointer transition-colors ${
                                    ann.resolved 
                                      ? "bg-[#34C759]/10 border-[#34C759]/20 text-[#34C759]" 
                                      : "bg-secondary border-border hover:bg-[#34C759]/10 hover:border-[#34C759]/20 hover:text-[#34C759]"
                                  }`}
                                >
                                  {ann.resolved ? t("Resolved") : t("Mark Resolve")}
                                </button>
                              </div>
                            </motion.div>
                          );
                        })
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-secondary/15 rounded-3xl border border-dashed border-border/10">
                          <MessageSquare size={24} className="text-muted-foreground/30 mb-2" />
                          <p className="text-xs font-semibold text-muted-foreground">{t("No coordinate feedback dropped yet")}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">{t("Pins placed on the mockup preview appear here.")}</p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    <div className="pb-2 border-b border-border/10">
                      <span className="text-[10px] text-muted-foreground font-bold uppercase block font-sans">{t("Compliance Checker")}</span>
                      <h3 className="text-xs font-bold text-foreground mt-1">{t("AI Safety Guard")}</h3>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-secondary/35 border border-border/10">
                      <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">{t("Audited Text Caption")}</span>
                      <p className="text-xs text-foreground italic leading-relaxed">
                        "{currentSubmission?.caption || "Taking my desktop productivity setup to the next level with campaign tools. #workspace #desk #aether"}"
                      </p>
                    </div>

                    {safetyLoading ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center">
                        <RefreshCw size={24} className="text-primary animate-spin mb-3" />
                        <p className="text-xs font-semibold text-foreground">{t("AI Guard Analyzing Content...")}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">{t("Checking disclosure requirements & prohibited claims.")}</p>
                      </div>
                    ) : safetyReport ? (
                      <div className="space-y-4 animate-in fade-in duration-300">
                        {/* Overall Compliance Score */}
                        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#007AFF]/5 border border-[#007AFF]/15">
                          <div className="flex items-center gap-2">
                            <Sparkles size={14} className="text-primary fill-primary/10" />
                            <div>
                              <p className="text-xs font-bold text-foreground">{t("Compliance Rating")}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">{t("Semantics check results")}</p>
                            </div>
                          </div>
                          <span className={`text-lg font-black px-3 py-1 rounded-xl ${
                            safetyReport.score >= 80 
                              ? "bg-[#34C759]/10 text-[#34C759]" 
                              : safetyReport.score >= 50 
                              ? "bg-[#FF9500]/10 text-[#FF9500]" 
                              : "bg-[#FF3B30]/10 text-[#FF3B30]"
                          }`}>
                            {safetyReport.score}/100
                          </span>
                        </div>

                        {/* Audit Indicators */}
                        <div className="space-y-2">
                          {/* FTC Disclosure Check */}
                          <div className="flex items-center justify-between p-3 bg-secondary/20 rounded-xl text-xs font-medium">
                            <span className="text-muted-foreground">{t("FTC Sponsorship Disclosure")}</span>
                            {safetyReport.isDisclosed ? (
                              <span className="flex items-center gap-1 text-[#34C759] font-bold">
                                <ShieldCheck size={13} /> {t("Present")}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[#FF3B30] font-bold">
                                <ShieldAlert size={13} /> {t("Missing #ad")}
                              </span>
                            )}
                          </div>

                          {/* Prohibited Claims Check */}
                          <div className="flex items-center justify-between p-3 bg-secondary/20 rounded-xl text-xs font-medium">
                            <span className="text-muted-foreground">{t("FDA Prohibited Claims Check")}</span>
                            {!safetyReport.hasProhibitedClaims ? (
                              <span className="flex items-center gap-1 text-[#34C759] font-bold">
                                <ShieldCheck size={13} /> {t("Verified Safe")}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[#FF3B30] font-bold">
                                <ShieldAlert size={13} /> {t("Flagged Claims")}
                              </span>
                            )}
                          </div>

                          {/* Guidelines Alignment */}
                          <div className="flex items-center justify-between p-3 bg-secondary/20 rounded-xl text-xs font-medium">
                            <span className="text-muted-foreground">{t("Campaign Guidelines Check")}</span>
                            {safetyReport.guidelinesCompliant ? (
                              <span className="flex items-center gap-1 text-[#34C759] font-bold">
                                <ShieldCheck size={13} /> {t("Compliant")}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-[#FF9500] font-bold">
                                <AlertTriangle size={13} /> {t("Gap Found")}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Feedback Details */}
                        <div className="space-y-2">
                          <h4 className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">{t("Safety Auditor Comments")}</h4>
                          <ul className="space-y-1.5 text-[10px] text-muted-foreground leading-normal list-none pl-0">
                            <li className="flex items-start gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF] mt-1 shrink-0" />
                              <span>{t(safetyReport.disclosureFeedback)}</span>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF] mt-1 shrink-0" />
                              <span>{t(safetyReport.prohibitedClaimsFeedback)}</span>
                            </li>
                            <li className="flex items-start gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#007AFF] mt-1 shrink-0" />
                              <span>{t(safetyReport.guidelinesFeedback)}</span>
                            </li>
                          </ul>
                        </div>

                        {/* Actions / Fixes */}
                        {safetyReport.flaggedIssues && safetyReport.flaggedIssues.length > 0 ? (
                          <div className="space-y-2.5 pt-2 border-t border-border/10">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">{t("Required Adjustments")}</span>
                            {safetyReport.flaggedIssues.map((issue: any, index: number) => (
                              <div key={index} className="p-3 bg-card border border-border/20 rounded-xl space-y-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    issue.type === "error" ? "bg-[#FF3B30]" : "bg-[#FF9500]"
                                  }`} />
                                  <p className="text-[10px] font-bold text-foreground leading-tight">{t(issue.message)}</p>
                                </div>
                                <p className="text-[9px] text-muted-foreground leading-normal bg-secondary/35 p-2 rounded-lg italic">
                                  <b>{t("Recommended Action:")}</b> {t(issue.fix)}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="p-3.5 rounded-xl bg-[#34C759]/10 border border-[#34C759]/20 text-[#34C759] text-center text-[10px] font-bold leading-normal">
                            🎉 {t("Caption is fully compliant with FTC rules, FDA standards, and your campaign brief guidelines.")}
                          </div>
                        )}

                        <Button 
                          type="button"
                          onClick={runSafetyAudit} 
                          variant="secondary" 
                          size="sm"
                          className="w-full text-[10px] py-2 rounded-xl mt-2 cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <RefreshCw size={11} /> {t("Re-run Compliance Audit")}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-center bg-secondary/15 rounded-3xl border border-dashed border-border/10">
                        <ShieldCheck size={28} className="text-muted-foreground/30 mb-2" />
                        <p className="text-xs font-semibold text-muted-foreground">{t("Audit Campaign Compliance")}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 max-w-[200px]">{t("Run AI checks on your caption before posting.")}</p>
                        <Button 
                          type="button"
                          onClick={runSafetyAudit} 
                          size="sm"
                          className="mt-4 rounded-xl text-[10px] py-1.5 px-4 cursor-pointer"
                        >
                          {t("Audit Caption Content")}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

              </div>

            </div>
          ) : (
            <div className="p-16 rounded-3xl bg-card border border-dashed border-border text-center flex flex-col items-center justify-center h-80">
              <Layers size={36} className="text-muted-foreground/30 mb-4" />
              <h3 className="text-sm font-bold">{t("Awaiting Draft Submissions")}</h3>
              <p className="text-xs text-muted-foreground mt-2 max-w-sm">
                {isBusiness 
                  ? t("This creator has not submitted a content draft review draft yet. Once a draft is uploaded, content previews and annotation tools will appear here.") 
                  : t("You have not submitted a review draft. Select preset images and upload your draft link to trigger the annotation preview dashboard.")
                }
              </p>
            </div>
          )}

        </div>

      </div>
          </motion.div>
        ) : workspaceTab === "analytics" ? (
          <motion.div
            key="analytics-tab-content"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={appleSpring}
            className="pb-12"
          >
            {renderLiveMetrics()}
          </motion.div>
        ) : (
          <motion.div
            key="chat-tab-content"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={appleSpring}
            className="pb-12"
          >
            {renderChatInterface()}
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
