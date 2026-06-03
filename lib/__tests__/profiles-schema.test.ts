import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { PROFILE_PK_COLUMN } from "@/lib/supabase/profile";
import { ProfileSchema } from "@/types/database";

const ROOT = join(__dirname, "../..");
function fileUsesProfilesIdQuery(content: string): boolean {
  return content
    .split("\n")
    .some(
      (line) =>
        line.includes('.from("profiles")') && /\.eq\(["']id["']/.test(line)
    );
}

describe("profiles.user_id schema contract", () => {
  it("exports PROFILE_PK_COLUMN as user_id", () => {
    expect(PROFILE_PK_COLUMN).toBe("user_id");
  });

  it("ProfileSchema uses user_id, not id", () => {
    const shape = ProfileSchema.shape;
    expect(shape.user_id).toBeDefined();
    expect("id" in shape).toBe(false);
  });

  it("canonical migration defines user_id PK with FK comment", () => {
    const sql = readFileSync(
      join(ROOT, "supabase/migrations/20260524000000_aether_init.sql"),
      "utf-8"
    );
    expect(sql).toContain("profiles.user_id is the FK to auth.users.id");
    expect(sql).toContain(
      "user_id UUID PRIMARY KEY REFERENCES public.users(id)"
    );
    expect(sql).toMatch(/auth\.uid\(\) = user_id/);
  });

  it("application source does not query profiles by .id", () => {
    assertNoProfilesIdQueries(join(ROOT, "lib"));
    assertNoProfilesIdQueries(join(ROOT, "app"));
    assertNoProfilesIdQueries(join(ROOT, "components"));
    const proxy = readFileSync(join(ROOT, "proxy.ts"), "utf-8");
    expect(fileUsesProfilesIdQuery(proxy)).toBe(false);
  });
});

function assertNoProfilesIdQueries(dir: string): void {
  for (const name of readdirSync(dir)) {
    if (name === "__tests__" || name === "node_modules") continue;
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      assertNoProfilesIdQueries(full);
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      const content = readFileSync(full, "utf-8");
      expect(fileUsesProfilesIdQuery(content), full).toBe(false);
    }
  }
}
