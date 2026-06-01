import { NextResponse } from "next/server";
import { guardApiPost } from "@/lib/api/guard";
import { AiDiscoverBodySchema } from "@/lib/api/schemas";
import { getGeminiApiKey } from "@/lib/env.server";

interface CampaignItem {
  id: string;
  title: string;
  description: string;
  businessName: string;
  budget_total: number;
  target_niches: string[];
  deliverables: any[];
  timeline: any;
  payout_speed: string;
  days_left: number;
  image_url: string;
}

interface CreatorProfile {
  name: string;
  bio: string;
  niches: string[];
  followers: number;
  engagement: number;
}

interface MatchResponse {
  campaignId: string;
  matchScore: number;
  matchingReason: string;
}

export async function POST(request: Request) {
  try {
    const guarded = await guardApiPost(request, {
      schema: AiDiscoverBodySchema,
      rateLimit: "apply",
      routeKey: "ai/discover",
      auth: true,
    });
    if (!guarded.ok) return guarded.response;

    const { creator, campaigns } = guarded.ctx.data;

    const apiKey = getGeminiApiKey();
    const isMock = !apiKey;

    if (!isMock) {
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
The matchingReason must be a short, extremely compelling, third-person smart matching suggestion (e.g. "This creator has delivered 3.2× ROI for similar beauty campaigns", "Your 4.8% ER in Tech setups makes you a top 5% candidate for this product launch", "This creator has delivered 2.8× ROI on minimal desk campaigns", etc.). Keep the suggestion under 15 words.

Please respond with a raw JSON array (and nothing else! Do not wrap in markdown \`\`\`json blocks, do not write any introductory or concluding text) that strictly complies with the following TypeScript interface:
interface MatchResponse {
  campaignId: string;
  matchScore: number;
  matchingReason: string;
}[]`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: prompt,
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.4,
              },
            }),
          }
        );

        if (response.ok) {
          const resData = await response.json();
          const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          
          let text = rawText.trim();
          if (text.startsWith("```json")) {
            text = text.substring(7);
          }
          if (text.endsWith("```")) {
            text = text.substring(0, text.length - 3);
          }
          text = text.trim();

          const matches: MatchResponse[] = JSON.parse(text);
          if (Array.isArray(matches)) {
            // Merge matching data back into campaigns and sort by matchScore desc
            const matchedCampaigns = campaigns.map(c => {
              const match = matches.find(m => m.campaignId === c.id);
              return {
                ...c,
                matchScore: match ? match.matchScore : 75,
                matchingReason: match ? match.matchingReason : "Matches your content focus niche."
              };
            }).sort((a: any, b: any) => b.matchScore - a.matchScore);

            return NextResponse.json({ success: true, campaigns: matchedCampaigns, generatedBy: "gemini" });
          }
        }
        console.warn("Gemini discover call returned invalid response, falling back to local matches.");
      } catch (geminiError) {
        console.error("Error in Gemini discover matchmaking:", geminiError);
      }
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
        matchingReason = `This creator has delivered 3.2× ROI for similar tech campaigns`;
      } else if (nicheStr.includes("fashion") || nicheStr.includes("apparel") || nicheStr.includes("beauty") || nicheStr.includes("lifestyle")) {
        matchingReason = `This creator has delivered 3.2× ROI for similar beauty campaigns`;
      } else if (nicheStr.includes("fitness") || nicheStr.includes("wellness") || nicheStr.includes("health") || nicheStr.includes("nutrition")) {
        matchingReason = `This creator has delivered 2.8× ROI for similar wellness campaigns`;
      } else {
        matchingReason = `Based on your ${creator.engagement}% engagement rate, you are a strong candidate`;
      }

      return {
        ...c,
        matchScore,
        matchingReason
      };
    }).sort((a, b) => b.matchScore - a.matchScore);

    return NextResponse.json({ success: true, campaigns: matchedCampaigns, generatedBy: "fallback_heuristics" });

  } catch (error: any) {
    console.error("Error in discover route:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
