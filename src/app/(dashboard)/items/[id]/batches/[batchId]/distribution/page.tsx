import { ItemBatchDistributionView } from "@/components/ItemModuleViews";

export default async function ItemBatchDistributionPage({
  params,
}: {
  params: Promise<{ id: string; batchId: string }>;
}) {
  const { id, batchId } = await params;
  return <ItemBatchDistributionView itemId={id} batchId={batchId} />;
}
