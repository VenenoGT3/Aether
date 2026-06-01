import { redirect } from "next/navigation";
import { getServerRole } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardRoot() {
  const role = await getServerRole();
  
  // Clean Server-side redirection based on active role cookie
  redirect(`/${role}/dashboard`);
}
