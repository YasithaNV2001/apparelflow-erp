import type { Metadata } from "next";
import { ForbiddenPanel } from "@/components/layout/forbidden-panel";
import { SewingBoard } from "@/components/sewing/sewing-board";
import { requireUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Sewing queue · ApparelFlow ERP" };

export default async function SewingPage() {
  const user = await requireUser();
  if (user.role !== "sewing_supervisor") {
    return <ForbiddenPanel role={user.role} />;
  }
  // The lists are fetched from the API in the browser (PLAN D2), which only ever sends verified batches.
  return <SewingBoard />;
}
