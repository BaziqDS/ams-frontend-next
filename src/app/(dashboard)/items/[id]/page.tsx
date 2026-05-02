"use client";

import { useParams } from "next/navigation";
import { ItemWorkspaceDetailView } from "@/components/ItemModuleViews";

export default function ItemDistributionPage() {
  const params = useParams<{ id: string }>();
  return <ItemWorkspaceDetailView itemId={params.id} />;
}
