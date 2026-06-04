"use server";

import { getGeminiApiKey } from "@/lib/env.server";

interface BriefResponse {
  title: string;
  description: string;
  target_niches: string[];
  target_audience: {
    location: string;
    ageRange: string;
    gender: string;
    minimumFollowers: number;
  };
  deliverables: Array<{
    type: "post" | "video" | "story";
    quantity: number;
    details: string;
  }>;
  budget_total: number;
  timeline: {
    startDate: string;
    endDate: string;
    draftDueDate: string;
  };
  kpis: string[];
  objectives: string[];
  tone_of_voice: string[];
  guidelines: string[];
  key_messaging: string;
}

/**
 * Server Action: Generates a creative brief from a campaign prompt using Gemini.
 * Requires GEMINI_API_KEY — fails clearly when it is not configured (no fallback).
 */
export async function generateCampaignBriefAction(
  prompt: string
): Promise<{ success: boolean; brief?: BriefResponse; error?: string }> {
  try {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: "AI brief generation requires GEMINI_API_KEY. Configure it to enable this feature.",
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const promptText = `
You are the Creative Director and AI Campaign Brief Generator for Aether, a premium Apple-designed influencer marketing platform.
The user wants to generate a professional, fully populated campaign brief based on the following idea:
"${prompt}"

Please respond with a raw JSON object (and nothing else! Do not wrap in markdown \`\`\`json blocks, do not write any introductory or concluding text) that strictly complies with the following TypeScript interface:
interface BriefResponse {
  title: string;
  description: string;
  target_niches: string[];
  target_audience: {
    location: string;
    ageRange: string;
    gender: string;
    minimumFollowers: number;
  };
  deliverables: Array<{
    type: "post" | "video" | "story";
    quantity: number;
    details: string;
  }>;
  budget_total: number;
  timeline: {
    startDate: string;
    endDate: string;
    draftDueDate: string;
  };
  kpis: string[];
  objectives: string[];
  tone_of_voice: string[];
  guidelines: string[];
  key_messaging: string;
}

Ensure that:
1. target_niches contains 1 to 3 strings chosen from: "Tech", "Lifestyle", "Minimal", "Design", "Fashion", "Wellness", "Beauty", "Fitness", "Food", "Travel", "Gaming".
2. budget_total is a realistic number between 1000 and 50000.
3. timeline dates are formatted as YYYY-MM-DD. Set startDate about 7 days from now, draftDueDate about 14 days from now, and endDate about 25 days from now.
4. The brief is extremely descriptive, creative, and written in a premium, professional marketing tone.
5. Provide 2-4 key performance indicators (KPIs) in the kpis array, e.g. "Deliver 100k+ video impressions".
6. Provide 2-4 objectives in the objectives array.
7. Provide 2-4 tone descriptors in the tone_of_voice array.
8. Provide 2-4 specific guidelines in the guidelines array.
9. Provide a strong key_messaging statement.
`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const resJson = await response.json();
    const rawText = resJson.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let text = rawText.trim();
    if (text.startsWith("```json")) {
      text = text.substring(7);
    }
    if (text.endsWith("```")) {
      text = text.substring(0, text.length - 3);
    }
    text = text.trim();

    const parsedBrief = JSON.parse(text) as BriefResponse;
    return { success: true, brief: parsedBrief };
  } catch (error) {
    console.error("Error in generateCampaignBriefAction:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate brief with AI.",
    };
  }
}
