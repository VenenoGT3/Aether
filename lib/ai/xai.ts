import "server-only";
import { getXaiApiKey, getXaiModel } from "@/lib/env.server";

const XAI_CHAT_COMPLETIONS_URL = "https://api.x.ai/v1/chat/completions";

type XaiRole = "system" | "user" | "assistant";

interface XaiMessage {
  role: XaiRole;
  content: string;
}

interface XaiTextOptions {
  system?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
}

interface XaiChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

export function stripJsonFences(text: string): string {
  let cleanText = text.trim();
  if (cleanText.startsWith("```json")) {
    cleanText = cleanText.substring(7);
  }
  if (cleanText.endsWith("```")) {
    cleanText = cleanText.substring(0, cleanText.length - 3);
  }
  return cleanText.trim();
}

export async function generateXaiText({
  system,
  prompt,
  temperature,
  maxOutputTokens,
}: XaiTextOptions): Promise<string | null> {
  const apiKey = getXaiApiKey();
  if (!apiKey) return null;

  const messages: XaiMessage[] = system
    ? [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ]
    : [{ role: "user", content: prompt }];

  const body: {
    model: string;
    messages: XaiMessage[];
    stream: false;
    temperature?: number;
    max_tokens?: number;
  } = {
    model: getXaiModel(),
    messages,
    stream: false,
  };

  if (temperature !== undefined) {
    body.temperature = temperature;
  }
  if (maxOutputTokens !== undefined) {
    body.max_tokens = maxOutputTokens;
  }

  const response = await fetch(XAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `xAI API returned status ${response.status}${
        detail ? `: ${detail.slice(0, 300)}` : ""
      }`
    );
  }

  const data = (await response.json()) as XaiChatCompletionResponse;
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("xAI API returned an empty response.");
  }

  return text;
}

export async function generateXaiJson<T>(options: XaiTextOptions): Promise<T | null> {
  const text = await generateXaiText(options);
  if (!text) return null;
  return JSON.parse(stripJsonFences(text)) as T;
}
