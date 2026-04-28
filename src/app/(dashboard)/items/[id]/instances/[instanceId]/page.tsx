"use client";

import { useParams } from "next/navigation";
import { ItemInstanceDetailView } from "@/components/item-instance/ItemInstanceDetailView";

export default function ItemInstanceDetailPage() {
  const params = useParams<{ id: string; instanceId: string }>();
  return <ItemInstanceDetailView itemId={params.id} instanceId={params.instanceId} />;
}
