import { NextResponse } from "next/server";
import { guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { jsonError } from "@/lib/api/response";
import { AiPitchBodySchema } from "@/lib/api/schemas";
import { generateXaiText } from "@/lib/ai/xai";

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

      const pitch = await generateXaiText({
        prompt,
        temperature: 0.7,
        maxOutputTokens: 250,
      });

      if (pitch) {
        return NextResponse.json({ pitch: pitch.trim(), generatedBy: "grok" });
      }
    } catch (grokError) {
      console.error("Error calling Grok API:", grokError);
    }

    // High quality local template fallback
    const campaignTitle = campaign.title || "sponsorship campaign";
    const creatorNiches = Array.isArray(creator.niches) && creator.niches.length > 0
      ? creator.niches.join(" & ")
      : creator.niche || "your category";
    const audienceProof = [
      creator.followers ? `an audience of ${(creator.followers / 1000).toFixed(1)}k` : null,
      creator.engagement ? `${creator.engagement}% engagement` : null,
    ].filter(Boolean).join(" and ");
    const audienceSentence = audienceProof
      ? ` Backed by ${audienceProof}, I can turn that fit into focused creator content.`
      : " I can turn that fit into focused creator content built around the brief.";

    let pitch = "";

    if (tone === "energetic") {
      pitch = `Hey team,\n\nI am excited about your "${campaignTitle}" campaign. As a creator in the ${creatorNiches} space, I understand how to package this kind of brief into content that feels natural and easy to act on.${audienceSentence} I already have concepts in mind to showcase the offer clearly and keep the content native to the platform. Ready to jump in and get started.`;
    } else if (tone === "creative") {
      pitch = `Hello brand team,\n\nEvery piece of content I create starts with a clear story, and "${campaignTitle}" gives me a strong creative direction to build from. My work in ${creatorNiches} blends visual framing with authentic delivery.${audienceSentence} I would love to bring a distinct creator perspective to the campaign and produce content that feels polished without losing the native feel of the platform.`;
    } else {
      pitch = `Hi team,\n\nI came across your campaign "${campaignTitle}" and saw a clear alignment with my content in ${creatorNiches}.${audienceSentence} For this campaign, I would focus on a clean concept, a strong opening hook, and a delivery style that makes the product easy to understand. I would be glad to collaborate and create content that supports the brief with a professional creator-led execution.`;
    }

    return NextResponse.json({ pitch, generatedBy: "fallback_template" });
  } catch (error) {
    console.error("Error in AI pitch writer route:", error);
    return jsonError(
      error instanceof Error ? error.message : "Internal Server Error",
      500
    );
  }
}
