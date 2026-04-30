import { redirect } from "next/navigation";
import { buildItemsWorkspaceHref } from "@/lib/itemsWorkspaceState";

export default async function ItemBatchesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(buildItemsWorkspaceHref({ itemId: id, tab: "batches" }));
}
