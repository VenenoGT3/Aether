"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { getMockUser, Profile } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight, DollarSign, Calendar, Layers } from "lucide-react";

interface CampaignItem {
  id: string;
  title: string;
  partner: string;
  budget: number;
  status: "in_progress" | "escrowed" | "completed";
  dueDate: string;
  progress: number;
}

const mockCampaignsBusiness: CampaignItem[] = [
  {
    id: "camp_1",
    title: "Summer Tech Capsule",
    partner: "Marcus Vance (@marcusv)",
    budget: 2500,
    status: "in_progress",
    progress: 65,
    dueDate: "June 12, 2026"
  },
  {
    id: "camp_2",
    title: "Aether Lifestyle Launch",
    partner: "Sofia Chen (@sofiac)",
    budget: 4500,
    status: "escrowed",
    progress: 30,
    dueDate: "June 25, 2026"
  },
  {
    id: "camp_3",
    title: "Minimalist Workspace Review",
    partner: "Dave Miller (@davem)",
    budget: 1200,
    status: "completed",
    progress: 100,
    dueDate: "May 20, 2026"
  }
];

const mockCampaignsCreator: CampaignItem[] = [
  {
    id: "camp_1",
    title: "iPad Pro Creator Flow",
    partner: "Apple Premium Reseller",
    budget: 1800,
    status: "in_progress",
    progress: 80,
    dueDate: "June 18, 2026"
  },
  {
    id: "camp_2",
    title: "Aether Lifestyle Launch",
    partner: "Aether Labs",
    budget: 4500,
    status: "escrowed",
    progress: 30,
    dueDate: "June 25, 2026"
  }
];

export default function CampaignsPage() {
  const [user, setUser] = useState<Profile | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);

  useEffect(() => {
    setUser(getMockUser());
    setCampaigns(getMockUser().role === "business" ? mockCampaignsBusiness : mockCampaignsCreator);

    const handleRoleChange = () => {
      const updatedUser = getMockUser();
      setUser(updatedUser);
      setCampaigns(updatedUser.role === "business" ? mockCampaignsBusiness : mockCampaignsCreator);
    };

    window.addEventListener("role-change", handleRoleChange);
    return () => window.removeEventListener("role-change", handleRoleChange);
  }, []);

  if (!user) return null;

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
    <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-12 md:py-16">
      <div className="flex justify-between items-center mb-10">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-wider block mb-1.5">
            Contract Management
          </span>
          <h1 className="text-3xl font-bold tracking-tight">Campaign Contracts</h1>
        </div>
        {user.role === "business" && (
          <Button className="rounded-full px-5 py-5 text-xs font-semibold cursor-pointer gap-1.5 shadow-sm">
            <Plus size={14} /> New Contract
          </Button>
        )}
      </div>

      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 rounded-3xl bg-card border border-dashed border-border/60 text-center">
          <Layers size={36} className="text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold">No campaigns found</h3>
          <p className="text-sm text-muted-foreground mt-1.5 max-w-xs">
            Start a negotiation with a brand or creator to launch a secure escrow campaign contract.
          </p>
        </div>
      ) : (
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-4"
        >
          {campaigns.map((camp) => (
            <motion.div
              key={camp.id}
              variants={itemVariants}
              whileHover={{ y: -3, scale: 1.008 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
            >
              <Link href={`/campaigns/${camp.id}`} className="block group">
                <div className="p-6 apple-card flex flex-col md:flex-row md:items-center justify-between gap-4 relative cursor-pointer">
                  
                  {/* Details */}
                  <div className="space-y-1 z-10">
                    <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      camp.status === "in_progress" 
                        ? "bg-[#007AFF]/10 text-[#007AFF]" 
                        : camp.status === "escrowed"
                        ? "bg-[#FF9500]/10 text-[#FF9500]"
                        : "bg-[#34C759]/10 text-[#34C759]"
                    }`}>
                      {camp.status.replace("_", " ")}
                    </span>
                    <h3 className="text-lg font-bold text-foreground pt-2">{camp.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {user.role === "business" ? "Creator Partner: " : "Brand Client: "}
                      <span className="font-semibold text-foreground">{camp.partner}</span>
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="hidden md:flex flex-col gap-1 w-44 z-10">
                    <div className="flex justify-between text-[10px] font-semibold text-muted-foreground">
                      <span>Task Progress</span>
                      <span>{camp.progress}%</span>
                    </div>
                    <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="bg-primary h-full rounded-full" 
                        style={{ width: `${camp.progress}%` }} 
                      />
                    </div>
                  </div>

                  {/* Pricing & Actions */}
                  <div className="flex items-center justify-between md:justify-end gap-6 pt-4 md:pt-0 border-t border-border/10 md:border-t-0 z-10">
                    <div className="text-left md:text-right">
                      <span className="text-[10px] text-muted-foreground block uppercase">Total Contract Value</span>
                      <span className="text-lg font-bold text-foreground flex items-center mt-0.5">
                        <DollarSign size={15} />{camp.budget.toLocaleString()}
                      </span>
                    </div>
                    
                    <div className="w-10 h-10 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:bg-primary/10 transition-all">
                      <ArrowRight size={16} />
                    </div>
                  </div>

                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
