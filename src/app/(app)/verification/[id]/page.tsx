import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ForbiddenPanel } from "@/components/layout/forbidden-panel";
import { VerifierTerminal } from "@/components/verification/verifier-terminal";
import { parseWholeNumber } from "@/domain/validation";
import { requireUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Count sheet · ApparelFlow ERP" };

export default async function VerifierTerminalPage({ params }: PageProps<"/verification/[id]">) {
  const user = await requireUser();
  if (user.role !== "cutting_verifier") {
    return <ForbiddenPanel role={user.role} />;
  }
  const { id } = await params;
  const orderId = parseWholeNumber(id);
  if (orderId.kind !== "number" || orderId.value <= 0) {
    notFound();
  }
  // The order is fetched from the API in the browser (PLAN D2); the name is only for the sign-off text.
  return <VerifierTerminal orderId={orderId.value} verifierName={user.fullName} />;
}
