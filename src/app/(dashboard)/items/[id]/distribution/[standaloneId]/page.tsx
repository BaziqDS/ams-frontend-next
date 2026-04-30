import { redirect } from "next/navigation";
import { buildItemsWorkspaceHref } from "@/lib/itemsWorkspaceState";

export default async function ItemStandaloneDistributionPage({
  params,
}: {
  params: Promise<{ id: string; standaloneId: string }>;
}) {
  const { id, standaloneId } = await params;
  redirect(buildItemsWorkspaceHref({ itemId: id, tab: "distribution", locationId: standaloneId }));
}
