import { NextResponse } from "next/server";
import { guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { jsonError } from "@/lib/api/response";
import { AiPitchBodySchema } from "@/lib/api/schemas";
import { getGeminiApiKey } from "@/lib/env.server";

export const GET = () => methodNotAllowed(["POST"]);

export async function POST(request: Request) {
  try {
    const guarded = await guardApiPost(request, {
      schema: AiPitchBodySchema,
      rateLimit: "ai",
      routeKey: "ai/pitch",
      auth: "influencer",
    });
    if (!guarded.ok) return guarded.response;

    const { campaign, creator, tone = "professional" } = guarded.ctx.data;

    const apiKey = getGeminiApiKey();

    // Check if API key exists and is not a placeholder
    const isApiKeyValid = apiKey && !apiKey.startsWith("AIzaSyPlaceholder") && apiKey !== "AIzaSy...";

    if (isApiKeyValid) {
      try {
        const prompt = `Write a highly personalized, compelling sponsorship pitch from a content creator named ${
          creator.name
        } (bio: "${creator.bio || "None"}", niches: ${
          Array.isArray(creator.niches) ? creator.niches.join(", ") : creator.niche || "None"
        }, followers: ${creator.followers || 0}, engagement rate: ${
          creator.engagement || 0
        }%) applying to the campaign "${campaign.title}".
The campaign brief is: "${campaign.description || "None"}".
The tone of the pitch should be ${tone} (e.g. professional, energetic, or creative).
Keep the pitch extremely concise, around 100-120 words. Begin directly with a compelling hook, highlight why the creator's audience and content style fits this campaign, and end with a clear call to action. Do not include any placeholder text like [Name] or [Date] or brackets. Write it as a ready-to-send message.`;

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
                maxOutputTokens: 250,
                temperature: 0.7,
              },
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          const pitch = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (pitch) {
            return NextResponse.json({ pitch: pitch.trim(), generatedBy: "gemini" });
          }
        }
        
        console.warn("Gemini API call failed or returned empty, falling back to template.");
      } catch (geminiError) {
        console.error("Error calling Gemini API:", geminiError);
      }
    }

    // High quality local template fallback
    const creatorName = creator.name || "Marcus Vance";
    const campaignTitle = campaign.title || "sponsorship campaign";
    const creatorNiches = Array.isArray(creator.niches) && creator.niches.length > 0
      ? creator.niches.join(" & ")
      : creator.niche || "Lifestyle & Tech";
    const followersText = creator.followers ? `${(creator.followers / 1000).toFixed(1)}k` : "48k";
    const engagementText = creator.engagement ? `${creator.engagement}%` : "4.8%";
    const brandName = campaign.brandName || "your brand";

    let pitch = "";

    if (tone === "energetic") {
      pitch = `Hey team! 👋\n\nI am absolutely thrilled about your "${campaignTitle}" campaign! As a creator in the ${creatorNiches} space, I live and breathe this aesthetic. My audience of ${followersText} is highly active, and with a ${engagementText} engagement rate, they're always eager to see my next recommendation. Your project fits my visual style perfectly, and I've already got some amazing concepts in mind to showcase it. Let's create something unforgettable together! Ready to jump on this and get started.`;
    } else if (tone === "creative") {
      pitch = `Hello brand team,\n\nEvery piece of content I create is a new story, and your campaign "${campaignTitle}" is the perfect backdrop for my next visual narrative. My work in ${creatorNiches} blends aesthetic styling with authentic storytelling. Backed by ${followersText} loyal supporters and a strong ${engagementText} engagement rate, I know exactly how to craft a campaign that feels organic and visually captivating. I'd love to collaborate on this project and bring a unique creative perspective to your brand. Let's build something beautiful!`;
    } else {
      // Default: professional
      pitch = `Hi team,\n\nI came across your campaign "${campaignTitle}" and immediately saw a perfect alignment. As a creator specializing in ${creatorNiches}, my content focuses heavily on high-quality, aesthetic workspace setups and technology reviews. With an audience of ${followersText} highly engaged followers (averaging ${engagementText} engagement), I produce polished content that drives real trust. For this campaign, I'd love to deliver premium deliverables that showcase your product in a clean, professional light. Looking forward to discussing how we can collaborate!`;
    }

    return NextResponse.json({ pitch, generatedBy: "fallback_template" });
  } catch (error: any) {
    console.error("Error in AI pitch writer route:", error);
    return jsonError(
      error instanceof Error ? error.message : "Internal Server Error",
      500
    );
  }
}
