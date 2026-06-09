import { expect, test } from "@playwright/test";

test.describe("public pages", () => {
  test("landing page renders", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("login page renders the sign-in form", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(page.locator('input[type="email"]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });
});

test.describe("route protection", () => {
  test("unauthenticated business dashboard redirects to login", async ({ page }) => {
    await page.goto("/business/dashboard");
    await expect(page).toHaveURL(/\/auth\/login\?redirectTo=/);
  });

  test("unauthenticated creator dashboard redirects to login", async ({ page }) => {
    await page.goto("/creator/dashboard");
    await expect(page).toHaveURL(/\/auth\/login\?redirectTo=/);
  });
});

test.describe("test-login auth flow", () => {
  test("creator test login signs in and routes into the creator area", async ({ page }) => {
    const config = await page.request.get("/api/test-login");
    const configJson = (await config.json()) as {
      roles?: string[];
      requiresAccessCode?: boolean;
    };
    test.skip(
      !configJson.roles?.includes("influencer") || configJson.requiresAccessCode === true,
      "test login not configured on this environment"
    );

    const res = await page.request.post("/api/test-login", {
      data: { role: "influencer" },
    });
    expect(res.ok()).toBe(true);
    const body = (await res.json()) as { redirectTo?: string };
    expect(body.redirectTo).toMatch(/^\/creator\//);

    // The login response set Supabase session cookies on this context.
    await page.goto(body.redirectTo!);
    await expect(page).toHaveURL(/\/creator\//);

    // Auth pages now bounce a logged-in user back into the app.
    await page.goto("/auth/login");
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });
});
