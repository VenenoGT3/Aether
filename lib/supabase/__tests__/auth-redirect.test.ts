import { afterEach, describe, expect, it } from "vitest";
import { appOrigin, authCallbackUrl } from "@/lib/supabase/auth-redirect";

describe("Supabase auth redirect URLs", () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  afterEach(() => {
    if (originalAppUrl === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL;
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    }
  });

  it("prefers the configured app origin over protected deployment origins", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://aether-blue-alpha.vercel.app";

    expect(appOrigin("https://aether-preview-123-fatturage-technologies.vercel.app")).toBe(
      "https://aether-blue-alpha.vercel.app"
    );
  });

  it("keeps localhost origins for local signup testing", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://aether-blue-alpha.vercel.app";

    expect(appOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("builds callback URLs with a sanitized next path", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://aether-blue-alpha.vercel.app/";

    expect(authCallbackUrl("//evil.example", "https://preview.example")).toBe(
      "https://aether-blue-alpha.vercel.app/auth/callback?next=%2Fdashboard"
    );
  });
});
