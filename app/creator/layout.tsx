import type { ReactNode } from "react";

import { CreatorRouteShell } from "@/components/creator/creator-route-shell";

export default function CreatorLayout({ children }: { children: ReactNode }) {
  return <CreatorRouteShell>{children}</CreatorRouteShell>;
}
