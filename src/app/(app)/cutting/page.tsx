import type { Metadata } from "next";
import { ForbiddenPanel } from "@/components/layout/forbidden-panel";
import { CuttingDashboard } from "@/components/orders/cutting-dashboard";
import { requireUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Cutting orders · ApparelFlow ERP" };

export default async function CuttingPage() {
  const user = await requireUser();
  if (user.role !== "cutting_supervisor") {
    return <ForbiddenPanel role={user.role} />;
  }
  // The dashboard fetches its data from the API in the browser (PLAN D2).
  return <CuttingDashboard />;
}
