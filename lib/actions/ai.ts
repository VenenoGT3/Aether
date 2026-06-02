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
 * Server Action: Generates a creative brief from a campaign prompt using Gemini,
 * falling back to simulated generation if the API key is not configured.
 */
export async function generateCampaignBriefAction(prompt: string): Promise<{ success: boolean; brief?: BriefResponse; error?: string }> {
  try {
    const apiKey = getGeminiApiKey();
    const isMock = !apiKey || apiKey.startsWith("AIzaSyPlaceholder") || apiKey === "AIzaSy...";

    if (isMock) {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      const lowerPrompt = prompt.toLowerCase();
      
      // Smart fallbacks based on keywords
      if (lowerPrompt.includes("keyboard") || lowerPrompt.includes("desk") || lowerPrompt.includes("keychron") || lowerPrompt.includes("mouse")) {
        return {
          success: true,
          brief: {
            title: "Nordic Minimalist Mechanical Keyboard Review",
            description: "An aesthetic campaign showcasing the premium sound profile, custom keycaps, and ergonomic desk integration of the upcoming Aether Elements mechanical keyboard. Focus on warm oak desk setups, typing sounds (ASMR), and cozy desk vibes.",
            target_niches: ["Tech", "Design", "Minimal"],
            target_audience: {
              location: "United States & Europe",
              ageRange: "18-34",
              gender: "All",
              minimumFollowers: 15000
            },
            deliverables: [
              { type: "video", quantity: 1, details: "1x TikTok/Reel dedicated sound profile review with custom keycap assembly (ASMR style)" },
              { type: "post", quantity: 1, details: "1x Instagram Carousel high-res photograph showing workspace layout featuring the keyboard" }
            ],
            budget_total: 2800,
            timeline: getSimulatedTimeline(),
            kpis: [
              "Generate 150,000+ total views across video deliverables",
              "Achieve a 4.5% CTR on Instagram carousel link clicks",
              "Collect 250+ comments inquiring about keyboard sound profiles"
            ],
            objectives: [
              "Showcase the premium materials, sound dampening foam, and customizable layout.",
              "Position the Elements keyboard as the centerpiece of modern minimalist desks.",
              "Drive pre-orders via customized creator discount links."
            ],
            tone_of_voice: ["Minimalist", "Aesthetic", "Cozy", "ASMR-friendly", "Premium"],
            guidelines: [
              "The keyboard's acoustics must be highlighted with a clean, high-gain mic (no background music during typing demonstration).",
              "Visuals should employ natural oak tones, warm desk lighting, and zero clutter.",
              "Include your custom 10% discount code and link in your primary bio."
            ],
            key_messaging: "Nordic engineering meets cozy workspace aesthetics: find your typing flow."
          }
        };
      }
      
      if (lowerPrompt.includes("fitness") || lowerPrompt.includes("gym") || lowerPrompt.includes("workout") || lowerPrompt.includes("wellness") || lowerPrompt.includes("meditation") || lowerPrompt.includes("app")) {
        return {
          success: true,
          brief: {
            title: "Aether Mindfulness App Launch",
            description: "Promoting Aether Mind, a serene iOS meditation and digital detox companion app. Creators will document a '7-Day Screen Time Reset' challenge using the app's minimalist widget and Apple Health sleep dashboard integrations.",
            target_niches: ["Wellness", "Lifestyle", "Design"],
            target_audience: {
              location: "Global",
              ageRange: "21-40",
              gender: "All",
              minimumFollowers: 10000
            },
            deliverables: [
              { type: "video", quantity: 1, details: "1x Short-form vlog (TikTok/Reel) showing morning routine featuring the Aether Mind app" },
              { type: "story", quantity: 3, details: "3x Instagram Stories documenting progress of the 7-day challenge with swipe-up links" }
            ],
            budget_total: 3500,
            timeline: getSimulatedTimeline(),
            kpis: [
              "Reach 200,000+ total impressions on lifestyle stories",
              "Drive 1,200+ app store referral installations via custom URLs",
              "Ensure 80% audience sentiment score in comments section"
            ],
            objectives: [
              "Demonstrate app features including the minimalist lock-screen widget and mood tracking.",
              "Inspire creators' audiences to join the 7-Day Screen Time Reset challenge.",
              "Build broad mental wellness alignment around the Aether brand."
            ],
            tone_of_voice: ["Serene", "Mindful", "Inspiring", "Calming", "Authentic"],
            guidelines: [
              "Content must show the actual phone screen demonstrating the clean UI (warm desk settings, no harsh white lights).",
              "Share personal, authentic reflections about screen-time distraction in the caption.",
              "Prompt viewers to download using the App Store links provided in your bio."
            ],
            key_messaging: "Reclaim your focus: a mindful digital companion for everyday serenity."
          }
        };
      }
      
      if (lowerPrompt.includes("fashion") || lowerPrompt.includes("clothes") || lowerPrompt.includes("apparel") || lowerPrompt.includes("bag") || lowerPrompt.includes("shoes")) {
        return {
          success: true,
          brief: {
            title: "Aether Atelier Essential Capsule",
            description: "Showcasing Aether's organic wool and linen travel-capsule collection. Highlight the versatility, packaging-efficiency, and timeless design of a 5-piece premium travel capsule. Focus on aesthetic lookbooks and natural lighting.",
            target_niches: ["Fashion", "Lifestyle", "Travel"],
            target_audience: {
              location: "Europe & Japan",
              ageRange: "22-38",
              gender: "All",
              minimumFollowers: 20000
            },
            deliverables: [
              { type: "post", quantity: 2, details: "2x Instagram Carousel posts featuring 5 outfits styled from the capsule wardrobe" },
              { type: "video", quantity: 1, details: "1x aesthetic travel packing vlog showing garments folded inside luggage" }
            ],
            budget_total: 5500,
            timeline: getSimulatedTimeline(),
            kpis: [
              "Deliver 300,000+ total reach on fashion lookbooks",
              "Achieve 8,000+ total post saves and shares on Instagram carousels",
              "Generate a 3.2x ROI in attributed affiliate apparel sales within 30 days"
            ],
            objectives: [
              "Highlight capsule garments styled in diverse settings (workwear, casual travel, evening styling).",
              "Demonstrate organic linen wrinkles and high-quality double-stitch tailoring.",
              "Drive travel-focused conversions for the summer packing season."
            ],
            tone_of_voice: ["Elegant", "Timeless", "Understated", "Aesthetic", "Sophisticated"],
            guidelines: [
              "Shoot lookbooks during golden hour (soft natural light) or clean architecturally interesting settings.",
              "Show close-up textures of the linen/wool fabric.",
              "State your height and sizing details clearly in the caption for audience convenience."
            ],
            key_messaging: "Travel light, look timeless: 5 essential items for the aesthetic voyager."
          }
        };
      }

      // Default generic dynamic brief fallback
      return {
        success: true,
        brief: {
          title: `Aether Launch: ${prompt.length > 25 ? prompt.substring(0, 25) + "..." : prompt}`,
          description: `A professional collaboration brief inspired by the concept: "${prompt}". Focus on premium visual assets, organic integration into modern lifestyles, and authentic alignment with Aether design standards.`,
          target_niches: ["Lifestyle", "Design"],
          target_audience: {
            location: "United States",
            ageRange: "18-35",
            gender: "All",
            minimumFollowers: 12000
          },
          deliverables: [
            { type: "post", quantity: 1, details: "1x Premium static Instagram post with aesthetic lighting and caption alignment" },
            { type: "story", quantity: 2, details: "2x Stories highlighting the product value and direct call-to-actions" }
          ],
          budget_total: 1800,
          timeline: getSimulatedTimeline(),
          kpis: [
            "Achieve 50,000+ total impressions on main grid posts",
            "Drive 500+ referral link clicks via Story link stickers",
            "Maintain post engagement rate above 3.5%"
          ],
          objectives: [
            "Introduce the brand's new campaign pillars to modern, style-conscious audiences.",
            "Generate premium, reusable visual assets aligned with aesthetic design codes."
          ],
          tone_of_voice: ["Clean", "Minimalist", "Design-centric", "Polished"],
          guidelines: [
            "Maintain a decluttered environment for all product frames.",
            "Include custom discount codes and link to website in the bio section."
          ],
          key_messaging: "Refining daily rituals through thoughtful, minimal design."
        }
      };
    }

    // Call actual Gemini API betalanguage endpoint
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
3. timeline dates are formatted as YYYY-MM-DD. Calculate them starting from today (today is May 24, 2026). Set startDate about 7 days from now, draftDueDate about 14 days from now, and endDate about 25 days from now.
4. The brief is extremely descriptive, creative, and written in a premium, professional marketing tone.
5. Provide 2-4 key performance indicators (KPIs) in the kpis array, e.g. "Deliver 100k+ video impressions".
6. Provide 2-4 objectives in the objectives array.
7. Provide 2-4 tone descriptors in the tone_of_voice array.
8. Provide 2-4 specific guidelines in the guidelines array.
9. Provide a strong key_messaging statement.
`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: promptText,
              },
            ],
          },
        ],
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
    return {
      success: true,
      brief: parsedBrief
    };

  } catch (error: any) {
    console.error("Error in generateCampaignBriefAction:", error);
    return { success: false, error: error.message || "Failed to generate brief with AI." };
  }
}

// Helper to generate dates relative to May 24, 2026
function getSimulatedTimeline() {
  const today = new Date("2026-05-24");
  
  const start = new Date(today);
  start.setDate(today.getDate() + 7);
  
  const draft = new Date(today);
  draft.setDate(today.getDate() + 14);
  
  const end = new Date(today);
  end.setDate(today.getDate() + 25);
  
  return {
    startDate: start.toISOString().split("T")[0],
    draftDueDate: draft.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0]
  };
}
