import { ItemBatchesView } from "@/components/ItemModuleViews";

export default async function ItemBatchesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ItemBatchesView itemId={id} />;
}
