import type { Metadata } from "next";
import { ForbiddenPanel } from "@/components/layout/forbidden-panel";
import { requireUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Cutting orders · ApparelFlow ERP" };

export default async function CuttingPage() {
  const user = await requireUser();
  if (user.role !== "cutting_supervisor") {
    return <ForbiddenPanel role={user.role} />;
  }

  return (
    <section className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold text-ink">Cutting orders</h1>
      <p className="text-ink-muted">Order creation and tracking arrive in the next phase.</p>
    </section>
  );
}
