"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, 
  Search, 
  Filter, 
  Grid, 
  List, 
  DollarSign, 
  ArrowRight, 
  HelpCircle,
  Lock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { 
  getCampaignsAction, 
  updateCampaignStatusAction, 
  subscribeToCampaignChanges 
} from "@/lib/supabase/campaigns";
import { CampaignStatus } from "@/types/database";
import { useTranslation } from "@/lib/translations";

const STATUS_COLUMNS: Array<{ id: CampaignStatus; label: string; color: string; bg: string }> = [
  { id: "draft", label: "Drafts", color: "text-muted-foreground", bg: "bg-muted/10" },
  { id: "open", label: "Open Escrows", color: "text-[#FF9500]", bg: "bg-[#FF9500]/5" },
  { id: "in_progress", label: "In Progress", color: "text-[#007AFF]", bg: "bg-[#007AFF]/5" },
  { id: "completed", label: "Completed", color: "text-[#34C759]", bg: "bg-[#34C759]/5" }
];

export default function CampaignsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNiche, setSelectedNiche] = useState<string>("All");

  const appleSpring = {
    type: "spring" as const,
    stiffness: 300,
    damping: 30,
    mass: 0.8
  };

  async function loadCampaigns() {
    try {
      setLoading(true);
      const res = await getCampaignsAction();
      if (res.success && res.campaigns) {
        setCampaigns(res.campaigns);
      }
    } catch (err) {
      console.error("Failed to load campaigns:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setMounted(true);
    loadCampaigns();

    // Subscribe to realtime database/storage changes
    const unsubscribe = subscribeToCampaignChanges(() => {
      getCampaignsAction().then((res) => {
        if (res.success && res.campaigns) {
          setCampaigns(res.campaigns);
        }
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Update Status directly on Kanban interaction
  const handleUpdateStatus = async (campaignId: string, newStatus: CampaignStatus) => {
    try {
      const res = await updateCampaignStatusAction(campaignId, newStatus);
      if (res.success) {
        toast.success(`${t("Campaign updated to")} ${newStatus}`, {
          description: t("Status sync complete across Supabase ledger.")
        });
        
        // Local state update for immediate visual response
        setCampaigns(prev => prev.map(c => c.id === campaignId ? { ...c, status: newStatus } : c));
      } else {
        toast.error(t("Failed to update campaign"), {
          description: res.error || t("Please try again.")
        });
      }
    } catch (err: any) {
      toast.error(t("An unexpected error occurred"), {
        description: err.message
      });
    }
  };

  // Filter Logic
  const filteredCampaigns = campaigns.filter(camp => {
    const matchesSearch = camp.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (camp.description && camp.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesNiche = selectedNiche === "All" || (camp.target_niches && camp.target_niches.includes(selectedNiche));
    return matchesSearch && matchesNiche;
  });

  // Extract all unique niches present in campaigns for dynamic filters
  const allNiches = ["All", ...Array.from(new Set(campaigns.flatMap(c => c.target_niches || [])))];

  if (!mounted) return null;

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 300,
        damping: 25
      }
    }
  };

  return (
    <div className="flex-1 max-w-7xl w-full mx-auto px-6 py-12 md:py-16">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-12">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-wider block mb-1.5">
            {t("Campaign Hub")}
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("Workspace Pipelines")}</h1>
        </div>
        
        <div className="flex items-center gap-4 w-full sm:w-auto">
          {/* View Toggle */}
          <div className="flex rounded-full bg-secondary/60 p-1 border border-border/10">
            <button
              onClick={() => setViewMode("kanban")}
              className={`p-2.5 rounded-full transition-all cursor-pointer ${
                viewMode === "kanban" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Grid size={15} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2.5 rounded-full transition-all cursor-pointer ${
                viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <List size={15} />
            </button>
          </div>

          <Link href="/business/campaigns/new" className="shrink-0">
            <Button className="rounded-full px-5 py-5 font-semibold text-xs shadow-md bg-primary hover:scale-[1.02] active:scale-[0.98] transition-transform text-white border-0 gap-1.5 cursor-pointer">
              <Plus size={14} /> {t("New Campaign")}
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-card border border-border/40 p-4 rounded-2xl shadow-sm">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder={t("Search campaigns...")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-border bg-background focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
          />
          <Search size={14} className="absolute left-3.5 top-3 text-muted-foreground" />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <Filter size={13} className="text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground font-semibold mr-1.5 shrink-0">{t("Niches:")}</span>
          <div className="flex gap-1.5">
            {allNiches.map((niche) => (
              <button
                key={niche}
                onClick={() => setSelectedNiche(niche)}
                className={`text-xs px-3 py-1.5 rounded-full font-semibold transition-all border ${
                  selectedNiche === niche
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-secondary/40 text-muted-foreground border-transparent hover:bg-secondary/60 hover:text-foreground"
                }`}
              >
                {niche === "All" ? t("All") : niche}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 animate-pulse">
          {[1, 2, 3, 4].map((col) => (
            <div key={col} className="space-y-4">
              <div className="flex justify-between items-center px-2">
                <div className="h-4 w-16 bg-secondary/80 rounded apple-skeleton" />
                <div className="h-4 w-6 bg-secondary/80 rounded-full apple-skeleton" />
              </div>
              <div className="p-4 rounded-3xl bg-secondary/10 border border-border/10 space-y-4 min-h-[440px]">
                {[1, 2].map((card) => (
                  <div key={card} className="p-5 rounded-2xl bg-card border border-border/30 space-y-4 shadow-sm">
                    <div className="h-4 w-[85%] bg-secondary/80 rounded apple-skeleton" />
                    <div className="space-y-1.5">
                      <div className="h-3 w-full bg-secondary/80 rounded apple-skeleton" />
                      <div className="h-3 w-[70%] bg-secondary/80 rounded apple-skeleton" />
                    </div>
                    <div className="flex gap-1.5 pt-1">
                      <div className="h-3.5 w-10 bg-secondary/80 rounded-full apple-skeleton" />
                      <div className="h-3.5 w-12 bg-secondary/80 rounded-full apple-skeleton" />
                    </div>
                    <div className="flex justify-between items-center border-t border-border/10 pt-3 mt-3">
                      <div className="space-y-1">
                        <div className="h-2 w-8 bg-secondary/80 rounded apple-skeleton" />
                        <div className="h-3 w-12 bg-secondary/80 rounded apple-skeleton" />
                      </div>
                      <div className="h-5.5 w-16 bg-secondary/80 rounded-lg apple-skeleton" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-20 rounded-3xl bg-card border border-dashed border-border/60 text-center">
          <HelpCircle size={36} className="text-muted-foreground/45 mb-4" />
          <h3 className="text-lg font-bold">{t("No Campaigns Found")}</h3>
          <p className="text-xs text-muted-foreground mt-2 max-w-sm">
            {t("Launch your marketing campaign wizard to seed escrows and match with micro-influencers.")}
          </p>
          <Link href="/business/campaigns/new" className="mt-6">
            <Button className="rounded-full px-5 py-5 text-xs font-semibold bg-primary text-white cursor-pointer">
              {t("Create First Campaign")}
            </Button>
          </Link>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          
          {/* KANBAN BOARD VIEW */}
          {viewMode === "kanban" && (
            <motion.div
              key="kanban"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start"
            >
              {STATUS_COLUMNS.map((col) => {
                const columnCampaigns = filteredCampaigns.filter(c => c.status === col.id);
                return (
                  <div key={col.id} className="space-y-4">
                    {/* Column Header */}
                    <div className="flex justify-between items-center px-2">
                      <span className={`text-xs font-bold uppercase tracking-wider ${col.color}`}>
                        {t(col.label)}
                      </span>
                      <span className="text-[10px] font-bold bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">
                        {columnCampaigns.length}
                      </span>
                    </div>

                    {/* Column Body */}
                    <div className={`p-4 rounded-3xl ${col.bg} border border-border/10 space-y-4 min-h-[480px]`}>
                      <AnimatePresence>
                        {columnCampaigns.map((camp) => (
                          <motion.div
                            key={camp.id}
                            layoutId={camp.id}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={appleSpring}
                            whileHover={{ y: -3, scale: 1.015 }}
                            className="p-5 rounded-2xl bg-card border border-border/30 shadow-sm cursor-pointer hover:shadow-md relative overflow-hidden group"
                            onClick={() => router.push(`/campaigns/${camp.id}`)}
                          >
                            {/* Inner dynamic content */}
                            <div className="space-y-3">
                              <div className="flex justify-between items-start gap-2">
                                <h4 className="text-xs font-bold text-foreground line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                                  {camp.title}
                                </h4>
                              </div>

                              <p className="text-[10px] text-muted-foreground line-clamp-3 leading-normal">
                                {camp.description}
                              </p>

                              {/* Niches */}
                              <div className="flex flex-wrap gap-1">
                                {camp.target_niches?.map((n: string) => (
                                  <span key={n} className="text-[8px] font-bold bg-secondary text-muted-foreground px-2 py-0.5 rounded-full uppercase">
                                    {n}
                                  </span>
                                ))}
                              </div>

                              {/* Budget & Payout */}
                              <div className="flex justify-between items-center border-t border-border/10 pt-3 mt-3">
                                <div>
                                  <span className="text-[8px] text-muted-foreground uppercase block">{t("Budget")}</span>
                                  <span className="text-xs font-bold text-foreground flex items-center">
                                    <DollarSign size={11} />{Number(camp.budget_total).toLocaleString()}
                                  </span>
                                </div>
                                
                                {/* Status transitions button */}
                                {camp.status === "draft" && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUpdateStatus(camp.id, "open");
                                    }}
                                    className="text-[9px] font-bold bg-[#FF9500]/10 text-[#FF9500] hover:bg-[#FF9500]/25 px-2.5 py-1 rounded-lg transition-colors border-0"
                                  >
                                    {t("Fund Escrow")}
                                  </button>
                                )}
                                {camp.status === "open" && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUpdateStatus(camp.id, "in_progress");
                                    }}
                                    className="text-[9px] font-bold bg-[#007AFF]/10 text-[#007AFF] hover:bg-[#007AFF]/25 px-2.5 py-1 rounded-lg transition-colors border-0"
                                  >
                                    {t("Match Creator")}
                                  </button>
                                )}
                                {camp.status === "in_progress" && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUpdateStatus(camp.id, "completed");
                                    }}
                                    className="text-[9px] font-bold bg-[#34C759]/10 text-[#34C759] hover:bg-[#34C759]/25 px-2.5 py-1 rounded-lg transition-colors border-0"
                                  >
                                    {t("Approve & Payout")}
                                  </button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      
                      {columnCampaigns.length === 0 && (
                        <div className="py-12 text-center text-[10px] text-muted-foreground/60">
                          {t("Empty column")}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}

          {/* LIST TABLE VIEW */}
          {viewMode === "list" && (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              variants={containerVariants}
              className="space-y-4"
            >
              {filteredCampaigns.map((camp) => (
                <motion.div
                  key={camp.id}
                  variants={itemVariants}
                  whileHover={{ y: -2, scale: 1.005 }}
                  className="p-6 apple-card flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer"
                  onClick={() => router.push(`/campaigns/${camp.id}`)}
                >
                  <div className="space-y-2 max-w-md">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        camp.status === "in_progress" 
                          ? "bg-[#007AFF]/10 text-[#007AFF]" 
                          : camp.status === "open"
                          ? "bg-[#FF9500]/10 text-[#FF9500]"
                          : camp.status === "completed"
                          ? "bg-[#34C759]/10 text-[#34C759]"
                          : "bg-secondary text-muted-foreground"
                      }`}>
                        {t(camp.status === "in_progress" ? "In Progress" : camp.status === "open" ? "Open Escrows" : camp.status === "completed" ? "Completed" : "Drafts")}
                      </span>
                      <div className="flex gap-1">
                        {camp.target_niches?.map((n: string) => (
                          <span key={n} className="text-[8px] bg-secondary text-muted-foreground px-2 py-0.5 rounded-full font-semibold">
                            {n}
                          </span>
                        ))}
                      </div>
                    </div>
                    <h3 className="text-base font-bold text-foreground">{camp.title}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-1 leading-normal">{camp.description}</p>
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-12 border-t border-border/10 md:border-t-0 pt-4 md:pt-0">
                    <div className="text-left md:text-right">
                      <span className="text-[8px] text-muted-foreground block uppercase">{t("Escrow Budget")}</span>
                      <span className="text-sm font-bold text-foreground flex items-center mt-0.5">
                        <DollarSign size={13} className="text-primary" />{Number(camp.budget_total).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      {camp.status === "draft" && (
                        <Button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateStatus(camp.id, "open");
                          }}
                          className="rounded-full px-4 py-3 text-[10px] font-bold bg-[#FF9500] text-white h-auto cursor-pointer"
                        >
                          {t("Fund Escrow").split(" ")[0]}
                        </Button>
                      )}
                      {camp.status === "open" && (
                        <Button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateStatus(camp.id, "in_progress");
                          }}
                          className="rounded-full px-4 py-3 text-[10px] font-bold bg-[#007AFF] text-white h-auto cursor-pointer"
                        >
                          {t("Match Creator").split(" ")[0]}
                        </Button>
                      )}
                      {camp.status === "in_progress" && (
                        <Button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateStatus(camp.id, "completed");
                          }}
                          className="rounded-full px-4 py-3 text-[10px] font-bold bg-[#34C759] text-white h-auto cursor-pointer"
                        >
                          {t("Release Payout").split(" ")[0]}
                        </Button>
                      )}

                      <div className="w-9 h-9 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground group-hover:text-primary transition-colors shrink-0">
                        <ArrowRight size={14} />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}

        </AnimatePresence>
      )}
    </div>
  );
}
