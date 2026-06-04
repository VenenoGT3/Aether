import { NextResponse } from "next/server";
import { guardApiPost, methodNotAllowed } from "@/lib/api/guard";
import { jsonError } from "@/lib/api/response";
import { AiSafetyBodySchema } from "@/lib/api/schemas";
import { generateXaiJson } from "@/lib/ai/xai";

interface SafetyResponse {
  isDisclosed: boolean;
  hasProhibitedClaims: boolean;
  guidelinesCompliant: boolean;
  score: number;
  disclosureFeedback: string;
  prohibitedClaimsFeedback: string;
  guidelinesFeedback: string;
  flaggedIssues: Array<{
    type: "warning" | "error" | "info";
    message: string;
    fix: string;
  }>;
}

export const GET = () => methodNotAllowed(["POST"]);

export async function POST(request: Request) {
  try {
    const guarded = await guardApiPost(request, {
      schema: AiSafetyBodySchema,
      rateLimit: "ai",
      routeKey: "ai/safety",
      auth: true,
    });
    if (!guarded.ok) return guarded.response;

    const { text, platform, guidelines } = guarded.ctx.data;

    try {
      const prompt = `You are the Content Safety, Compliance & Moderation Officer for Aether, a premium Apple-designed influencer marketing platform.
You need to audit a creator's draft social media post caption or description for compliance (FTC disclosures, prohibited claims, FDA restrictions, and brand guidelines).

Draft Content Text to Audit:
"${text}"

Platform: "${platform || "unknown"}"

Campaign Guidelines to Check Against:
${guidelines && guidelines.length > 0 ? guidelines.map((g) => `- ${g}`).join("\n") : "- None specified"}

Please evaluate the content for:
1. Sponsorship Disclosure: Does it contain clear FTC disclosure (e.g., #ad, #sponsored, #brandpartner, or "paid partnership")? (On platforms like Instagram/TikTok, #ad is standard).
2. Prohibited/Restricted Claims: Does it claim the product can cure, prevent, or treat any medical condition or health disease (which is FDA prohibited)? Does it make extreme, unsubstantiated performance claims?
3. Guideline Compliance: Does it follow the campaign guidelines?

Please respond with a raw JSON object (and nothing else! Do not wrap in markdown \`\`\`json blocks, do not write any introductory or concluding text) that strictly complies with the following TypeScript interface:
interface SafetyResponse {
  isDisclosed: boolean;
  hasProhibitedClaims: boolean;
  guidelinesCompliant: boolean;
  score: number; // 0 to 100 general safety/compliance score
  disclosureFeedback: string; // short summary of disclosure check
  prohibitedClaimsFeedback: string; // short summary of prohibited claims check
  guidelinesFeedback: string; // short summary of guidelines compliance
  flaggedIssues: Array<{
    type: "warning" | "error" | "info";
    message: string; // issue description
    fix: string; // how to resolve
  }>;
}`;

      const parsedReport = await generateXaiJson<SafetyResponse>({
        prompt,
        temperature: 0.2,
      });

      if (parsedReport) {
        return NextResponse.json({ success: true, report: parsedReport, generatedBy: "grok" });
      }
    } catch (grokError) {
      console.error("Grok Safety API call failed:", grokError);
    }

    // High quality local fallback heuristic checker
    const lowerText = text.toLowerCase();
    
    // 1. Disclosure Check
    const hasDisclosure = lowerText.includes("#ad") || 
                          lowerText.includes("#sponsored") || 
                          lowerText.includes("paid partnership") ||
                          lowerText.includes("#brandpartner") ||
                          lowerText.includes("sponsored by");
    
    // 2. Prohibited Claims Check (e.g. cures, health, medicine, treats, prevents, disease, insomnia, etc.)
    const prohibitedWords = ["cure", "cures", "prevent", "prevents", "treat", "treats", "disease", "diseases", "insomnia", "cancer", "clinical proof", "fda approved", "heal", "heals"];
    const flaggedWords = prohibitedWords.filter(w => new RegExp(`\\b${w}\\b`).test(lowerText));
    const hasProhibitedClaims = flaggedWords.length > 0;

    // 3. Guideline Check
    // Check if the caption includes brand mentions or typical guideline items
    const hasBrandMention = lowerText.includes("aether");
    const guidelinesCompliant = hasBrandMention;

    const flaggedIssues: Array<{ type: "warning" | "error" | "info"; message: string; fix: string }> = [];

    if (!hasDisclosure) {
      flaggedIssues.push({
        type: "error",
        message: "No sponsorship disclosure detected.",
        fix: "Add #ad or #sponsored to the beginning or end of your post caption to comply with FTC guidelines."
      });
    }

    if (hasProhibitedClaims) {
      flaggedIssues.push({
        type: "error",
        message: `Prohibited health claim detected: use of word "${flaggedWords.join(", ")}".`,
        fix: "Content creators cannot claim a product cures or treats a health condition. Rephrase to describe general comfort or lifestyle benefits."
      });
    }

    if (!hasBrandMention) {
      flaggedIssues.push({
        type: "warning",
        message: "Brand tag or mention '@Aether' is missing.",
        fix: "Include a tag or direct mention of the Aether brand to satisfy primary visual guidelines."
      });
    }

    // Score calculations
    let score = 100;
    if (!hasDisclosure) score -= 35;
    if (hasProhibitedClaims) score -= 45;
    if (!hasBrandMention) score -= 15;
    if (score < 10) score = 10;

    const report: SafetyResponse = {
      isDisclosed: hasDisclosure,
      hasProhibitedClaims,
      guidelinesCompliant,
      score,
      disclosureFeedback: hasDisclosure 
        ? "Clear sponsorship disclosure found." 
        : "FTC violation: missing sponsorship disclosure.",
      prohibitedClaimsFeedback: hasProhibitedClaims
        ? `FDA violation: text makes prohibited claims using: "${flaggedWords.join(", ")}".`
        : "Safe: no prohibited medical or health claims detected.",
      guidelinesFeedback: guidelinesCompliant
        ? "Basic guideline checks passed."
        : "Brand guidelines are partially ignored (missing tag).",
      flaggedIssues
    };

    return NextResponse.json({ success: true, report, generatedBy: "fallback_heuristics" });

  } catch (error) {
    console.error("Error in safety route:", error);
    return jsonError(
      error instanceof Error ? error.message : "Internal Server Error",
      500
    );
  }
}
