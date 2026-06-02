# Aether Quality Assurance - End-to-End Test Plan

This document contains the E2E verification plan, manual testing checklist, and Playwright automation scripts for the complete Aether campaign workflow.

---

## 1. Manual Testing Checklist

Follow this checklist to manually run the E2E campaign flow in the development environment.

### Phase 1: Business Campaign Creation & Escrow Funding
- [ ] **Onboarding & Stripe Connect Linkage**
  - Navigate to `/business/onboarding`.
  - Verify that the Stripe Connect button triggers the express onboarding redirect.
  - Complete the onboarding (redirects to callback with status `success` and saves mock stripe ID `acct_mockstripe123`).
- [ ] **Create Campaign Wizard**
  - Navigate to `/business/campaigns/new`.
  - Fill out Step 1 (Title, Description, target Niches e.g., Tech/Design).
  - (Optional) Click **Generate with AI Brief** and verify the Gemini API populates the brief.
  - Complete Steps 2-5 (Audience, Deliverables, Budget, Timeline).
  - Review Step 6 and click **Publish Campaign**.
- [ ] **Secure Escrow Payment**
  - In the Payment overlay, enter test card details (`4242 4242 ...`).
  - Click **Fund Escrow and Publish**.
  - Expect a success notification and check that you are redirected to the business dashboard.
  - Verify that the campaign status shows **in_progress** (or **escrowed**) and the budget is reflected in the spend metrics.

### Phase 2: Influencer Discovery & Application
- [ ] **Switch Account Role**
  - Switch to **Influencer** mode using the role switcher or logging in as `creator@aether.co` / `marcus@aether.co`.
- [ ] **Discover Campaign**
  - Navigate to `/creator/discover`.
  - Verify the newly created campaign appears in the discover feed.
- [ ] **Pitch & Apply**
  - Click on the campaign card to open its detail page at `/campaigns/[id]`.
  - Click **Apply to Campaign**.
  - Enter pitch text (e.g., *"I have the perfect desk setup for this product!"*) and proposed payout rate.
  - Submit the application and verify that the status changes to **applied**.

### Phase 3: Content Submission & Approval
- [ ] **Review Application & Fund Escrow**
  - Switch back to **Business** mode.
  - Navigate to `/campaigns/[id]`.
  - Select the applicant (*Marcus Vance*) from the sidebar.
  - Review their pitch and click **Fund Escrow** (if not already funded during publication).
  - Status updates to **escrowed** / **in_progress**.
- [ ] **Upload Draft Content**
  - Switch to **Influencer** mode.
  - Go to `/campaigns/[id]`.
  - Verify the status bar shows **Awaiting Draft**.
  - Enter a mock post URL (e.g., `https://instagram.com/p/mockpost`) and caption.
  - Click **Submit Draft**.
  - Status updates to **submitted**.
- [ ] **Brand Review & Annotation Pins**
  - Switch to **Business** mode and open `/campaigns/[id]`.
  - Select the participant.
  - Click on the draft mobile preview image to drop comment pins.
  - Enter change feedback (e.g., *"Align keyboard to center"*).
  - Verify the comment pin shows up and the status is updated.
- [ ] **Content Approval & Escrow Release**
  - Click **Approve & Release**.
  - Verify that a confetti celebration triggers.
  - Confirm the status is updated to **released** (or completed).
  - Check that the payout transaction shows up in the transaction ledger.

---

## 2. Playwright E2E Test Scripts

The following script shows a Playwright-style E2E automation run covering the complete campaign lifecycle.

```typescript
import { test, expect } from "@playwright/test";

test.describe("Aether Complete Campaign E2E Flow", () => {
  const testCampaignTitle = `Summer Tech Capsule v-${Date.now()}`;

  test("Should execute business creation → influencer application → business approval → payout release", async ({ page, context }) => {
    // ----------------------------------------------------
    // STEP 1: BUSINESS SETUP & CAMPAIGN CREATION
    // ----------------------------------------------------
    await page.goto("http://localhost:3000/");
    
    // Switch to Business user context
    await page.click('button:has-text("Switch to Business")');
    await page.goto("http://localhost:3000/business/dashboard");
    
    // Check Stripe Connect setup
    await expect(page.locator('text=Sarah Jenkins')).toBeVisible();
    await expect(page.locator('text=Total Escrowed Spend')).toBeVisible();
    
    // Open wizard
    await page.click('a[href="/business/campaigns/new"]');
    await page.waitForURL("**/business/campaigns/new");
    
    // Fill out Step 1: Goal
    await page.fill('input[placeholder="e.g. Summer Tech Capsule Launch"]', testCampaignTitle);
    await page.fill('textarea[placeholder*="Detail your product"]', "Looking for minimal design aesthetics to review the Aether mechanical keyboard.");
    await page.click('button:has-text("Tech")');
    await page.click('button:has-text("Design")');
    await page.click('button:has-text("Next")');
    
    // Fill Step 2: Audience
    await page.fill('input[placeholder="10000"]', "15000");
    await page.click('button:has-text("Next")');
    
    // Fill Step 3: Deliverables
    await page.fill('input[placeholder*="sound review"]', "Instagram carousel showing desk setup aesthetics");
    await page.click('button:has-text("Next")');
    
    // Fill Step 4: Budget
    await page.fill('input[type="number"]', "2500");
    await page.click('button:has-text("Next")');
    
    // Fill Step 5: Timeline
    await page.click('button:has-text("Next")');
    
    // Step 6: Review & Checkout
    await page.click('button:has-text("Publish Campaign")');
    
    // Checkout payment modal
    await expect(page.locator('text=Secure Escrow Contract')).toBeVisible();
    await page.click('button:has-text("Fund Escrow and Publish")');
    
    // Success redirect
    await page.waitForURL("**/business/dashboard");
    await expect(page.locator("text=Campaign Published!")).toBeVisible();

    // ----------------------------------------------------
    // STEP 2: INFLUENCER DISCOVERY & APPLICATION
    // ----------------------------------------------------
    // Swap context to Influencer (Marcus Vance)
    await page.click('button:has-text("Switch to Influencer")');
    await page.goto("http://localhost:3000/creator/discover");
    
    // Verify discover list holds new campaign
    await expect(page.locator(`text=${testCampaignTitle}`)).toBeVisible();
    await page.click(`text=${testCampaignTitle}`);
    
    // Verify campaign details
    await expect(page.locator('text=Campaign Description')).toBeVisible();
    
    // Pitch application
    await page.click('button:has-text("Apply to Campaign")');
    await page.fill('textarea[placeholder*="Detail your content pitch"]', "Hey! Love the minimal layout. I can film a 4K aesthetic reel for this.");
    await page.fill('input[type="number"]', "2500");
    await page.click('button[type="submit"]:has-text("Submit Pitch Application")');
    await expect(page.locator("text=Application submitted successfully!")).toBeVisible();

    // ----------------------------------------------------
    // STEP 3: BRAND DIRECT NEGOTIATION & METRICS
    // ----------------------------------------------------
    // Swap context back to Business
    await page.click('button:has-text("Switch to Business")');
    await page.goto("http://localhost:3000/business/campaigns");
    
    // Check Kanban boards
    await page.click(`text=${testCampaignTitle}`);
    await page.click('text=Marcus Vance');
    
    // Fund / Accept contract escrow
    await page.click('button:has-text("Fund Escrow")');
    await expect(page.locator("text=Escrow Funded successfully!")).toBeVisible();
    
    // ----------------------------------------------------
    // STEP 4: INFLUENCER DRAFT UPLOAD
    // ----------------------------------------------------
    // Swap back to Influencer
    await page.click('button:has-text("Switch to Influencer")');
    await page.goto("http://localhost:3000/creator/campaigns");
    await page.click(`text=${testCampaignTitle}`);
    
    // Submit draft post
    await page.fill('input[placeholder*="instagram.com"]', "https://instagram.com/p/C7W28z2yX8a");
    await page.fill('textarea[placeholder*="Write a draft caption"]', "Elevating workspace focus. #workspace #desk #aether");
    await page.click('button[type="submit"]:has-text("Submit Draft")');
    await expect(page.locator("text=Draft Version 1 submitted!")).toBeVisible();

    // ----------------------------------------------------
    // STEP 5: BRAND REVIEW, COMMENTS, & PAYOUT RELEASE
    // ----------------------------------------------------
    // Swap back to Business
    await page.click('button:has-text("Switch to Business")');
    await page.goto("http://localhost:3000/business/campaigns");
    await page.click(`text=${testCampaignTitle}`);
    
    // Enter live performance metrics
    await page.fill('input[name="clicks"]', "520");
    await page.fill('input[name="conversions"]', "45");
    await page.fill('input[name="attributed_value"]', "6800");
    
    // Watch live ROI updates on Recharts
    await expect(page.locator("text=2.7x")).toBeVisible(); // 6800 / 2500 = 2.7x
    
    // Place interactive annotation comments
    const imageContainer = page.locator(".mobile-preview-container");
    await imageContainer.click({ position: { x: 150, y: 200 } });
    await page.fill('input[placeholder="Drop a pin comment..."]', "Let's increase the contrast on the workspace tray.");
    await page.click('button:has-text("Drop Pin")');
    await expect(page.locator("text=Feedback pin dropped!")).toBeVisible();
    
    // Final Approval and Release of Escrow
    await page.click('button:has-text("Approve & Release")');
    await expect(page.locator("text=Payout Released Instantly!")).toBeVisible();
  });
});
```

---

## 3. RLS Security Verification Commands

To verify Row-Level Security (RLS) is working correctly on Supabase/PostgreSQL, run the following verification checks:

```sql
-- 1. Verify user isolation (emails should not be leaked)
-- As a non-owner authenticated user (simulate auth.uid() = 'attacker-uuid'):
SET LOCAL request.jwt.claims = '{"sub": "attacker-uuid"}';
SELECT email FROM public.users;
-- Expected output: Only returns the record for 'attacker-uuid', other users' emails are hidden.

-- 2. Verify post self-approval trigger protection
-- Attempt to self-approve a post as an influencer:
BEGIN;
SET LOCAL request.jwt.claims = '{"sub": "mock-influencer-uuid"}';
UPDATE public.posts 
SET approved_at = now() 
WHERE participation_id = 'some-participation-id';
-- Expected outcome: Transaction rolls back with:
-- "ERROR: Only the campaign owner can approve or modify post approval status."
ROLLBACK;

-- 3. Verify transaction ownership rules
-- Attempt to read all transaction histories:
SET LOCAL request.jwt.claims = '{"sub": "mock-influencer-uuid"}';
SELECT count(*) FROM public.transactions;
-- Expected outcome: Returns only transactions belonging to the influencer's applications/withdrawals.
```
