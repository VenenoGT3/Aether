"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { 
  DollarSign, 
  Calendar, 
  ArrowRight, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  FileCheck2,
  FolderLock,
  Layers,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getClientProfile, isMockMode, supabase } from "@/lib/supabase/client";
import { Profile } from "@/types";
import { toast } from "sonner";
import { useTranslation } from "@/lib/translations";

interface CampaignParticipation {
  participationId: string;
  campaignId: string;
  title: string;
  brandName: string;
  proposedPayout: number;
  status: "applied" | "offered" | "accepted" | "declined" | "escrowed" | "submitted" | "released" | "completed" | "cancelled" | "in_progress";
  appliedAt: string;
  dueDate: string;
  deliverableType: string;
}

const defaultMockParticipations = [
  {
    id: "part_1",
    campaign_id: "camp_1",
    influencer_id: "mock-influencer-uuid",
    status: "applied",
    proposed_payout: 2500,
    applied_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days ago
  },
  {
    id: "part_2",
    campaign_id: "camp_2",
    influencer_id: "mock-influencer-uuid",
    status: "escrowed",
    proposed_payout: 4500,
    applied_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() // 5 days ago
  },
  {
    id: "part_3",
    campaign_id: "camp_3",
    influencer_id: "mock-influencer-uuid",
    status: "released",
    proposed_payout: 1200,
    applied_at: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString() // 12 days ago
  }
];

export default function InfluencerCampaignsPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<Profile | null>(null);
  const [participations, setParticipations] = useState<CampaignParticipation[]>([]);
  const [activeTab, setActiveTab] = useState<"applied" | "active" | "completed">("active");
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const profile = await getClientProfile();
      setUser(profile);
      const influencerId = profile?.id || "mock-influencer-uuid";

      if (isMockMode) {
        // Seed default mock participations if not in LocalStorage
        let storedPartsStr = localStorage.getItem("aether-mock-participations");
        let partsList = [];
        if (!storedPartsStr) {
          localStorage.setItem("aether-mock-participations", JSON.stringify(defaultMockParticipations));
          partsList = defaultMockParticipations;
        } else {
          partsList = JSON.parse(storedPartsStr);
        }

        // Fetch mock campaigns to join names & niches
        let storedCampsStr = localStorage.getItem("aether-mock-campaigns");
        let campsList = storedCampsStr ? JSON.parse(storedCampsStr) : [];

        // Map and synchronize with detailed campaign state
        const mappedList: CampaignParticipation[] = partsList
          .filter((p: any) => p.influencer_id === influencerId)
          .map((part: any) => {
            const campaign = campsList.find((c: any) => c.id === part.campaign_id) || {
              title: "Aether Lifestyle Launch",
              businessName: "Aether Labs",
              deliverables: [{ type: "instagram_reel" }]
            };

            // SYNCHRONIZATION WITH CAMPAIGN DETAIL STATES
            // Check individual negotiation logs/statuses (e.g. standard details page keys)
            let status = part.status;
            let proposedPayout = part.proposed_payout;
            
            const detailedKey = `aether-campaign-state-${part.campaign_id}`;
            const detailedStateStr = localStorage.getItem(detailedKey);
            if (detailedStateStr) {
              try {
                const detailed = JSON.parse(detailedStateStr);
                status = detailed.status;
                proposedPayout = detailed.budget;
              } catch (e) {}
            }

            return {
              participationId: part.id,
              campaignId: part.campaign_id,
              title: campaign.title,
              brandName: campaign.businessName || "Acme Brand",
              proposedPayout: proposedPayout,
              status: status,
              appliedAt: part.applied_at || new Date().toISOString(),
              dueDate: "June 25, 2026",
              deliverableType: campaign.deliverables?.[0]?.type || "instagram_reel"
            };
          });

        setParticipations(mappedList);
      } else {
        // Supabase Live Mode
        const { data, error } = await supabase
          .from("participations")
          .select(`
            *,
            campaign:campaign_id (*)
          `)
          .eq("influencer_id", influencerId);
        
        if (error) throw error;

        const formatted: CampaignParticipation[] = (data || []).map((p: any) => ({
          participationId: p.id,
          campaignId: p.campaign_id,
          title: p.campaign?.title || "Sponsorship Campaign",
          brandName: "Brand Client",
          proposedPayout: Number(p.proposed_payout),
          status: p.status,
          appliedAt: p.applied_at || new Date().toISOString(),
          dueDate: "June 25, 2026",
          deliverableType: p.campaign?.deliverables?.[0]?.type || "instagram_reel"
        }));

        setParticipations(formatted);
      }
    } catch (err: any) {
      console.error("Error loading creator campaigns:", err);
      toast.error(t("Failed to load campaign contracts."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Listen to changes from detail chat pages or discover updates
    const handleSync = () => {
      loadData();
    };
    window.addEventListener("storage", handleSync);
    window.addEventListener("role-change", handleSync);
    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("role-change", handleSync);
    };
  }, []);

  // Tabs splitting logic
  const appliedList = participations.filter(
    (p) => p.status === "applied" || p.status === "offered" || p.status === "declined"
  );
  const activeList = participations.filter(
    (p) => p.status === "accepted" || p.status === "in_progress" || p.status === "escrowed" || p.status === "submitted"
  );
  const completedList = participations.filter(
    (p) => p.status === "completed" || p.status === "released" || p.status === "cancelled"
  );

  const currentList = 
    activeTab === "applied" ? appliedList :
    activeTab === "active" ? activeList : completedList;

  // Segmented Pill animations
  const appleSpring = {
    type: "spring" as const,
    stiffness: 380,
    damping: 30
  };

  // Helper to determine active stage step in milestone
  const getMilestoneStep = (status: string) => {
    switch (status) {
      case "applied": return 1;
      case "accepted":
      case "escrowed": return 2;
      case "submitted": return 3;
      case "released":
      case "completed": return 4;
      default: return 1;
    }
  };

  // Colors based on status
  const getStatusBadgeStyles = (status: string) => {
    switch (status) {
      case "applied":
        return "bg-[#007AFF]/10 text-[#007AFF] border-[#007AFF]/25";
      case "offered":
        return "bg-[#5856D6]/10 text-[#5856D6] border-[#5856D6]/25 animate-pulse";
      case "escrowed":
      case "accepted":
      case "in_progress":
        return "bg-[#FF9500]/10 text-[#FF9500] border-[#FF9500]/25";
      case "submitted":
        return "bg-indigo-500/10 text-indigo-500 border-indigo-500/25";
      case "released":
      case "completed":
        return "bg-[#34C759]/10 text-[#34C759] border-[#34C759]/25";
      case "declined":
      case "cancelled":
        return "bg-destructive/10 text-destructive border-destructive/25";
      default:
        return "bg-secondary text-muted-foreground border-border/10";
    }
  };

  return (
    <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-10 md:py-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-10">
        <div>
          <span className="text-xs font-semibold text-[#34C759] uppercase tracking-wider block mb-1.5">
            {t("Aether Creator Hub")}
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight">{t("My Campaigns")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("Manage pipeline applications, secure escrows, and track active deliverables.")}</p>
        </div>
        
        <Link href="/influencer/discover">
          <Button className="rounded-full px-5 py-5 text-xs font-semibold cursor-pointer gap-1.5 shadow-sm">
            {t("Discover Campaigns")} <ArrowRight size={13} />
          </Button>
        </Link>
      </div>

      {/* Segmented Control Selector (App Store style) */}
      <div className="flex justify-center sm:justify-start mb-8">
        <div className="bg-secondary/40 border border-border/20 p-1 rounded-full flex gap-1 relative max-w-md w-full sm:w-auto">
          {/* Active Tab Sliding Pill */}
          <div className="absolute inset-y-1 left-1 right-1 pointer-events-none">
            <motion.div
              layoutId="activeCampaignTabPill"
              className="bg-card shadow-sm border border-border/30 rounded-full h-full"
              initial={false}
              animate={{
                x: activeTab === "applied" ? "0%" : activeTab === "active" ? "100%" : "200%",
                width: "33.33%"
              }}
              transition={appleSpring}
            />
          </div>

          <button
            onClick={() => setActiveTab("applied")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-6 py-2 text-xs font-semibold rounded-full relative z-10 transition-colors cursor-pointer select-none ${
              activeTab === "applied" ? "text-foreground font-bold" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("Applied ({count})").replace("{count}", appliedList.length.toString())}
          </button>
          
          <button
            onClick={() => setActiveTab("active")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-6 py-2 text-xs font-semibold rounded-full relative z-10 transition-colors cursor-pointer select-none ${
              activeTab === "active" ? "text-foreground font-bold" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("Active ({count})").replace("{count}", activeList.length.toString())}
          </button>

          <button
            onClick={() => setActiveTab("completed")}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-6 py-2 text-xs font-semibold rounded-full relative z-10 transition-colors cursor-pointer select-none ${
              activeTab === "completed" ? "text-foreground font-bold" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("Completed ({count})").replace("{count}", completedList.length.toString())}
          </button>
        </div>
      </div>

      {/* Campaigns Feed List */}
      {loading ? (
        <div className="space-y-6">
          {[1, 2].map((i) => (
            <div key={i} className="p-6 rounded-3xl bg-card border border-border/30 shadow-sm space-y-6 animate-pulse">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/10 pb-4">
                <div className="space-y-2">
                  <div className="h-4 w-20 bg-secondary/80 rounded apple-skeleton" />
                  <div className="h-5 w-56 bg-secondary/80 rounded apple-skeleton" />
                  <div className="h-3.5 w-40 bg-secondary/80 rounded apple-skeleton" />
                </div>
                <div className="space-y-1">
                  <div className="h-2 w-16 bg-secondary/80 rounded apple-skeleton" />
                  <div className="h-5 w-24 bg-secondary/80 rounded apple-skeleton" />
                </div>
              </div>
              <div className="space-y-3 pt-1">
                <div className="flex justify-between">
                  <div className="h-3 w-28 bg-secondary/80 rounded apple-skeleton" />
                  <div className="h-3 w-36 bg-secondary/80 rounded apple-skeleton" />
                </div>
                <div className="h-1.5 w-full bg-secondary/40 border border-border/5 rounded-full apple-skeleton" />
                <div className="grid grid-cols-4 text-center">
                  <div className="h-2.5 w-10 bg-secondary/80 rounded mx-auto apple-skeleton" />
                  <div className="h-2.5 w-14 bg-secondary/80 rounded mx-auto apple-skeleton" />
                  <div className="h-2.5 w-12 bg-secondary/80 rounded mx-auto apple-skeleton" />
                  <div className="h-2.5 w-10 bg-secondary/80 rounded mx-auto apple-skeleton" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : currentList.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 rounded-3xl bg-card border border-dashed border-border/60 text-center">
          <Layers size={36} className="text-muted-foreground/35 mb-4" />
          <h3 className="text-lg font-bold">{t("No campaigns found")}</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            {activeTab === "applied" && t("You haven't submitted any campaign pitches yet.")}
            {activeTab === "active" && t("No active contracts. Express interest in live briefs to get hired!")}
            {activeTab === "completed" && t("Completed collaborations will show up here after payout release.")}
          </p>
          {activeTab !== "completed" && (
            <Link href="/influencer/discover" className="mt-5 block">
              <Button variant="outline" size="sm" className="rounded-full text-xs cursor-pointer">
                {t("Explore Discover Feed")}
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 gap-4"
        >
          <AnimatePresence mode="popLayout">
            {currentList.map((item) => {
              const currentStep = getMilestoneStep(item.status);
              
              return (
                <motion.div
                  key={item.participationId}
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  whileHover={{ y: -3, scale: 1.004 }}
                  transition={{ type: "spring", stiffness: 350, damping: 25 }}
                  className="apple-card group"
                >
                  <Link href={`/campaigns/${item.campaignId}`} className="block">
                    <div className="p-6 flex flex-col gap-6">
                      
                      {/* Top Header Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/10 pb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                            <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${getStatusBadgeStyles(item.status)}`}>
                              {item.status === "applied" ? t("Pitch Submitted") : t(item.status.replace("_", " "))}
                            </span>
                            
                            {item.status === "offered" && (
                              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-[#FF9500]/10 text-[#FF9500] border-[#FF9500]/25 flex items-center gap-0.5 select-none">
                                <Sparkles size={9} /> {t("Offer Received")}
                              </span>
                            )}
                          </div>
                          
                          <h3 className="text-lg font-bold text-foreground leading-snug group-hover:text-[#007AFF] transition-colors">
                            {item.title}
                          </h3>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {t("Brand Client:")} <span className="font-semibold text-foreground">{item.brandName}</span>
                          </p>
                        </div>

                        {/* Payout Metric */}
                        <div className="text-left sm:text-right">
                          <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wider">{t("Proposed Payout")}</span>
                          <span className="text-lg font-extrabold text-foreground flex items-center mt-0.5">
                            <DollarSign size={15} />{item.proposedPayout.toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {/* Milestone Progress Bar (Apple Stock style timeline indicator) */}
                      {item.status !== "declined" && item.status !== "cancelled" && (
                        <div className="space-y-3 pt-1">
                          <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            <span>{t("Contract Pipeline Status")}</span>
                            <span className="text-foreground">
                              {item.status === "applied" && t("Awaiting Brand Review")}
                              {item.status === "offered" && t("Review Brand Offer")}
                              {item.status === "escrowed" && t("Content Creation Stage")}
                              {item.status === "submitted" && t("Deliverable Under Review")}
                              {(item.status === "released" || item.status === "completed") && t("Collaboration Completed")}
                            </span>
                          </div>

                          {/* Progress Line */}
                          <div className="relative w-full h-1 bg-secondary rounded-full overflow-hidden">
                            <div 
                              className="bg-primary h-full rounded-full transition-all duration-500" 
                              style={{ width: `${((currentStep - 1) / 3) * 100}%` }}
                            />
                          </div>

                          {/* Steps text */}
                          <div className="grid grid-cols-4 text-[9px] font-semibold text-muted-foreground text-center">
                            <div className={`text-left ${currentStep >= 1 ? "text-primary font-bold" : ""}`}>
                              {t("Applied")}
                            </div>
                            <div className={currentStep >= 2 ? "text-primary font-bold" : ""}>
                              {t("Escrow Locked")}
                            </div>
                            <div className={currentStep >= 3 ? "text-primary font-bold" : ""}>
                              {t("Draft Sent")}
                            </div>
                            <div className={`text-right ${currentStep >= 4 ? "text-[#34C759] font-bold" : ""}`}>
                              {t("Paid Out")}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Bottom Info Bar */}
                      <div className="flex items-center justify-between pt-4 border-t border-border/5 text-xs text-muted-foreground">
                        <div className="flex gap-4">
                          <span className="flex items-center gap-1"><Calendar size={13} /> {t("Applied:")} {new Date(item.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          <span className="flex items-center gap-1 capitalize"><FolderLock size={13} /> {t("Deliverable:")} {t(item.deliverableType.replace("_", " "))}</span>
                        </div>

                        <div className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-all">
                          <ArrowRight size={15} />
                        </div>
                      </div>

                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
