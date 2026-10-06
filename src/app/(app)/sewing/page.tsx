import type { Metadata } from "next";
import { ForbiddenPanel } from "@/components/layout/forbidden-panel";
import { requireUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Sewing queue · ApparelFlow ERP" };

export default async function SewingPage() {
  const user = await requireUser();
  if (user.role !== "sewing_supervisor") {
    return <ForbiddenPanel role={user.role} />;
  }

  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold text-ink">Sewing queue</h1>
      <p className="text-ink-muted">Verified batches will appear here in a later phase.</p>
    </section>
  );
}
