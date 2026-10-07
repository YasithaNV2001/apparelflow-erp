import type { Metadata } from "next";
import { ForbiddenPanel } from "@/components/layout/forbidden-panel";
import { VerificationQueue } from "@/components/verification/verification-queue";
import { requireUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Verification queue · ApparelFlow ERP" };

export default async function VerificationPage() {
  const user = await requireUser();
  if (user.role !== "cutting_verifier") {
    return <ForbiddenPanel role={user.role} />;
  }
  // The queue is fetched from the API in the browser (PLAN D2).
  return <VerificationQueue />;
}
