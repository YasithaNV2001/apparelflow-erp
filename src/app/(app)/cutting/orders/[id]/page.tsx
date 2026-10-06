import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ForbiddenPanel } from "@/components/layout/forbidden-panel";
import { OrderDetail } from "@/components/orders/order-detail";
import { parseWholeNumber } from "@/domain/validation";
import { requireUser } from "@/server/auth/current-user";

export const metadata: Metadata = { title: "Cutting order · ApparelFlow ERP" };

export default async function CuttingOrderPage({ params }: PageProps<"/cutting/orders/[id]">) {
  const user = await requireUser();
  if (user.role !== "cutting_supervisor") {
    return <ForbiddenPanel role={user.role} />;
  }
  const { id } = await params;
  const orderId = parseWholeNumber(id);
  if (orderId.kind !== "number" || orderId.value <= 0) {
    notFound();
  }
  // The order itself is fetched from the API in the browser (PLAN D2).
  return <OrderDetail orderId={orderId.value} />;
}
