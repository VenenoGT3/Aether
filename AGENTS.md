<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Merging branches

Before merging any branch, check the repo root for a `MERGE-NOTES-<branch>.md`
file (e.g. `MERGE-NOTES-FABLE.md`). It lists exactly what that branch needs at
merge/deploy time — migrations, edge-function deploys, secrets to set or NOT
set — plus pre-merge verification commands. Complete every step, then delete
the file as part of the merge.

# Aether Agent Guidelines & Developer Standards

This project follows premium Apple Sequoia & iOS 18 design patterns and modern Next.js 16 App Router architecture.

## 1. Directory Structure Conventions
All new features must conform to this structure:
*   **App Routes**: `app/[role]/[feature]/page.tsx`
*   **Shared Components**: `components/` (or `components/ui/` for primitive shadcn controls)
*   **Server Utilities**: `lib/` (e.g. `lib/supabase/server.ts`)
*   **Zod Types**: `types/`

## 2. Next.js 16 + React 19 Best Practices
*   **RSC by Default**: All components inside `app/` are React Server Components by default. Keep them that way unless interactivity is required.
*   **"use client" Boundary**: Place the `"use client"` directive only at the leaf nodes (e.g., interactive forms, toggles, charts) to keep the initial page bundle light.
*   **Server Actions**: Use inline or `lib/actions/` files for server-side logic (e.g. database updates, mutations).
*   **Metadata**: Export the standard metadata object from page layouts or leaf pages statically, rather than dynamically computing in layout files where possible.

## 3. Styling & Theming (Tailwind v4)
We use Tailwind v4's CSS-first theme configuration.
*   Modify core theme properties in `app/globals.css` using CSS custom properties under `@theme`.
*   Avoid adding arbitrary layout helper utilities in CSS. Use Tailwind inline classes where applicable.
*   **Border Radii**: Prefer `rounded-2xl` (16px) or `rounded-3xl` (24px) for premium look and feel.
*   **Typography**: Always use standard sans-serif system stacks (`font-sans` maps to San Francisco / Inter).

## 4. Interaction Principles (Framer Motion)
*   Micro-interactions must feel organic, using spring properties.
*   Avoid linear or cubic easing for physical object motion (buttons, modal reveals, hover actions).
*   Standard Spring Configuration:
    ```typescript
    export const appleSpring = {
      type: "spring",
      stiffness: 300,
      damping: 30,
      mass: 0.8
    };
    ```

## 5. Supabase Auth and Client Setup
*   **SSR Context**: When writing Server Components, use `@supabase/ssr` with Next.js headers / cookies context.
*   **Real services only**: `lib/supabase/` talks to a real Supabase project — there is no mock/demo fallback. When updating database calls, always verify schema interfaces inside `types/`.
