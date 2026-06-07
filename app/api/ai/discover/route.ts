import { NextResponse } from "next/server";
import { guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { jsonError } from "@/lib/api/response";
import { AiDiscoverBodySchema } from "@/lib/api/schemas";
import { generateXaiJson } from "@/lib/ai/xai";

interface MatchResponse {
  campaignId: string;
  matchScore: number;
  matchingReason: string;
}

export const GET = () => methodNotAllowed(["POST"]);

export async function POST(request: Request) {
  try {
    const guarded = await guardApiPost(request, {
      schema: AiDiscoverBodySchema,
      rateLimit: "discover",
      routeKey: "ai/discover",
      auth: "influencer",
    });
    if (!guarded.ok) return guarded.response;

    const { creator, campaigns } = guarded.ctx.data;

    try {
      const prompt = `You are the AI Matchmaker for Aether, a premium Apple-designed influencer marketing platform.
We need to evaluate a content creator's profile against a list of campaigns, ranking them by fit, and generating a customized, highly premium "smart matching suggestion" for each card.

Creator Profile:
- Name: ${creator.name}
- Bio: "${creator.bio || "None"}"
- Niches/Category: ${creator.niches.join(", ")}
- Followers: ${creator.followers}
- Avg Engagement Rate: ${creator.engagement}%

Campaigns to evaluate:
${campaigns.map(c => `- Campaign [ID: ${c.id}]: Title: "${c.title}", Description: "${c.description}", Niches: ${c.target_niches.join(", ")}, Budget: $${c.budget_total}`).join("\n")}

For each campaign, calculate a matchScore (integer from 50 to 100) and generate a matchingReason.
The matchingReason must be a short, compelling smart matching suggestion grounded only in the provided creator/campaign fields (e.g. "Your tech content focus aligns with this launch", "Your 4.8% engagement rate makes you a strong candidate", "Your beauty niche matches this brand brief"). Keep the suggestion under 15 words. Do not claim past ROI, rankings, previous campaign results, or performance metrics not present in the profile.

Please respond with a raw JSON array (and nothing else! Do not wrap in markdown \`\`\`json blocks, do not write any introductory or concluding text) that strictly complies with the following TypeScript interface:
interface MatchResponse {
  campaignId: string;
  matchScore: number;
  matchingReason: string;
}[]`;

      const matches = await generateXaiJson<MatchResponse[]>({
        prompt,
        temperature: 0.4,
      });

      if (Array.isArray(matches)) {
        // Merge matching data back into campaigns and sort by matchScore desc
        const matchedCampaigns = campaigns.map(c => {
          const match = matches.find(m => m.campaignId === c.id);
          return {
            ...c,
            matchScore: match ? match.matchScore : 75,
            matchingReason: match ? match.matchingReason : "Matches your content focus niche."
          };
        }).sort((a, b) => b.matchScore - a.matchScore);

        return NextResponse.json({ success: true, campaigns: matchedCampaigns, generatedBy: "grok" });
      }
      if (matches) {
        console.warn("Grok discover call returned invalid response, falling back to local matches.");
      }
    } catch (grokError) {
      console.error("Error in Grok discover matchmaking:", grokError);
    }

    // High quality local fallback logic
    const matchedCampaigns = campaigns.map(c => {
      // Calculate overlap between creator niches and campaign niches
      const overlap = c.target_niches.filter(n => 
        creator.niches.some(cn => cn.toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(cn.toLowerCase()))
      );
      
      let matchScore = 70 + overlap.length * 10;
      if (matchScore > 98) matchScore = 98;
      
      let matchingReason = "";
      const nicheStr = c.target_niches[0] ? c.target_niches[0].toLowerCase() : "niche";

      if (nicheStr.includes("tech") || nicheStr.includes("minimal") || nicheStr.includes("design") || nicheStr.includes("setup")) {
        matchingReason = "Your content focus aligns with this tech campaign.";
      } else if (nicheStr.includes("fashion") || nicheStr.includes("apparel") || nicheStr.includes("beauty") || nicheStr.includes("lifestyle")) {
        matchingReason = "Your style niche matches this brand brief.";
      } else if (nicheStr.includes("fitness") || nicheStr.includes("wellness") || nicheStr.includes("health") || nicheStr.includes("nutrition")) {
        matchingReason = "Your wellness content focus matches this campaign audience.";
      } else {
        matchingReason = `Your ${creator.engagement}% engagement rate supports a strong fit.`;
      }

      return {
        ...c,
        matchScore,
        matchingReason
      };
    }).sort((a, b) => b.matchScore - a.matchScore);

    return NextResponse.json({ success: true, campaigns: matchedCampaigns, generatedBy: "fallback_heuristics" });

  } catch (error) {
    console.error("Error in discover route:", error);
    return jsonError(
      error instanceof Error ? error.message : "Internal Server Error",
      500
    );
  }
}
