import { ItemInstancesView } from "@/components/ItemModuleViews";

export default async function ItemInstancesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ItemInstancesView itemId={id} />;
}
