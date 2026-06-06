import type { ReactNode } from "react";

import { BusinessRouteShell } from "@/components/business/business-route-shell";

export default function BusinessLayout({ children }: { children: ReactNode }) {
  return <BusinessRouteShell>{children}</BusinessRouteShell>;
}
