import { NextResponse } from "next/server";
import { guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { jsonError } from "@/lib/api/response";
import { AiPredictBodySchema } from "@/lib/api/schemas";
import { getGeminiApiKey } from "@/lib/env.server";

interface PredictResponse {
  predictedROI: number;
  predictedConversions: number;
  predictedClicks: number;
  predictedViews: number;
  predictedRevenue: number;
  pacingStatus: "underperforming" | "on_track" | "overperforming";
  analysis: string;
  recommendations: string[];
}

export const GET = () => methodNotAllowed(["POST"]);

export async function POST(request: Request) {
  try {
    const guarded = await guardApiPost(request, {
      schema: AiPredictBodySchema,
      rateLimit: "ai",
      routeKey: "ai/predict",
      auth: true,
    });
    if (!guarded.ok) return guarded.response;

    const { campaign, metrics, creator } = guarded.ctx.data;

    const apiKey = getGeminiApiKey();
    const isMock = !apiKey;

    if (!isMock) {
      try {
        const prompt = `You are the AI Performance Predictor & Growth Officer for Aether, a premium Apple-designed influencer marketing platform.
Your task is to calculate a future performance projection and ROI prediction by analyzing a campaign's current tracking metrics and setup details.

Campaign Details:
- Campaign Title: "${campaign.title}"
- Total Budget: $${campaign.budget}
- Objectives: ${campaign.brief?.objectives?.join(", ") || "General Brand Awareness & Conversion"}

Creator Metrics (if available):
- Followers: ${creator?.followers || "Unknown"}
- Engagement Rate: ${creator?.engagement || "Unknown"}%
- Niches: ${creator?.niches?.join(", ") || "Unknown"}

Current Performance Metrics:
- Budget Spent so far: $${metrics.budget_spent}
- Views / Impressions: ${metrics.views}
- Clicks: ${metrics.clicks}
- Conversions: ${metrics.conversions}
- Attributed Sales Revenue: $${metrics.attributed_value}

Please calculate the following projections when the full budget ($${campaign.budget}) is spent:
1. Predicted ultimate ROI (Attributed Sales / Total Budget)
2. Predicted ultimate conversions count
3. Predicted ultimate clicks count
4. Predicted ultimate views count
5. Predicted ultimate sales revenue ($)
6. Campaign pacing status ("underperforming" | "on_track" | "overperforming" based on current ROI and conversion velocity)

Please respond with a raw JSON object (and nothing else! Do not wrap in markdown \`\`\`json blocks, do not write any introductory or concluding text) that strictly complies with the following TypeScript interface:
interface PredictResponse {
  predictedROI: number; // Expected final ROI multiplier (e.g. 3.4)
  predictedConversions: number; // Expected final conversions
  predictedClicks: number; // Expected final clicks
  predictedViews: number; // Expected final views
  predictedRevenue: number; // Expected final revenue ($)
  pacingStatus: "underperforming" | "on_track" | "overperforming";
  analysis: string; // 2-3 sentences explaining the pacing, current ROI efficiency, and expected results.
  recommendations: string[]; // Array of 3 actionable optimization steps for the brand or creator.
}`;

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
                temperature: 0.3,
              },
            }),
          }
        );

        if (response.ok) {
          const resData = await response.json();
          const rawText = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          
          let cleanText = rawText.trim();
          if (cleanText.startsWith("```json")) {
            cleanText = cleanText.substring(7);
          }
          if (cleanText.endsWith("```")) {
            cleanText = cleanText.substring(0, cleanText.length - 3);
          }
          cleanText = cleanText.trim();

          const parsedReport: PredictResponse = JSON.parse(cleanText);
          return NextResponse.json({ success: true, prediction: parsedReport, generatedBy: "gemini" });
        }
        console.warn("Gemini Predict API returned error status, falling back to heuristic predictions.");
      } catch (geminiError) {
        console.error("Gemini Predict API call failed:", geminiError);
      }
    }

    // Heuristics Fallback Engine
    const spent = metrics.budget_spent || 1;
    const totalBudget = campaign.budget || 2500;
    const completionRatio = Math.min(1.0, spent / totalBudget);
    
    // Scale current metrics to 100% completion with a logarithmic diminishing returns / learning rate boost factor
    // Scale factor: if completion ratio is very low, make it conservative.
    const scalingFactor = completionRatio > 0.05 ? (1.0 / completionRatio) : 20.0;
    
    let pacingStatus: "underperforming" | "on_track" | "overperforming" = "on_track";
    const currentROI = metrics.attributed_value / spent;
    
    if (currentROI < 1.2) {
      pacingStatus = "underperforming";
    } else if (currentROI > 2.8) {
      pacingStatus = "overperforming";
    }

    // Calculate predictions
    const predictedViews = Math.round(metrics.views * scalingFactor);
    const predictedClicks = Math.round(metrics.clicks * scalingFactor);
    const predictedConversions = Math.round(metrics.conversions * scalingFactor);
    const predictedRevenue = Math.round(metrics.attributed_value * scalingFactor);
    const predictedROI = parseFloat((predictedRevenue / totalBudget).toFixed(2));

    // Generate analytical text and recommendations based on pacing
    let analysis = "";
    let recommendations: string[] = [];

    if (pacingStatus === "overperforming") {
      analysis = `This campaign is demonstrating exceptional momentum, pacing at a ${currentROI.toFixed(1)}x return on current spend. The click-through rate and conversion velocity are significantly exceeding initial industry benchmarks for this niche, indicating strong alignment with the creator's audience.`;
      recommendations = [
        "Recommend expanding campaign budget to capture additional high-intent audience segments before fatigue set in.",
        "Repurpose the highest-performing organic assets into paid social advertising immediately to boost CPA efficiency.",
        "Consider securing an exclusivity option with the creator for subsequent product launches in this vertical."
      ];
    } else if (pacingStatus === "underperforming") {
      analysis = `The campaign is currently pacing below initial projections with a ${currentROI.toFixed(1)}x return. High cost-per-click and a lower-than-average conversion rate suggest the creative content is not resonating sufficiently, or the landing page is experiencing conversion friction.`;
      recommendations = [
        "Incorporate a stronger, clearer Call to Action (CTA) overlay within the first 3 seconds of the creator's video draft.",
        "Revise the tracking URL landing page to offer a dedicated, high-converting checkout experience for referrals.",
        "Adjust the hooks in the caption description to emphasize the primary value proposition more aggressively."
      ];
    } else {
      analysis = `The campaign performance is stable and tracking closely to expectations, delivering a solid ${currentROI.toFixed(1)}x ROI on spent budget. Steady conversion pacing indicates that the target audience is showing healthy engagement with the deliverable.`;
      recommendations = [
        "Maintain current budget pacing while monitoring daily conversion frequency for any signs of fatigue.",
        "Prompt the creator to engage with comments on the post to boost organic algorithm reach and engagement metrics.",
        "Ensure the UTM code integration is functioning correctly across all secondary story slides."
      ];
    }

    const prediction: PredictResponse = {
      predictedROI,
      predictedConversions,
      predictedClicks,
      predictedViews,
      predictedRevenue,
      pacingStatus,
      analysis,
      recommendations
    };

    return NextResponse.json({ success: true, prediction, generatedBy: "heuristics" });

  } catch (error) {
    console.error("Error in predict route:", error);
    return jsonError(
      error instanceof Error ? error.message : "Internal Server Error",
      500
    );
  }
}
