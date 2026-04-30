import { redirect } from "next/navigation";
import { buildItemsWorkspaceHref } from "@/lib/itemsWorkspaceState";

export default async function ItemDistributionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(buildItemsWorkspaceHref({ itemId: id, tab: "distribution" }));
}
