"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ItemBatchesView } from "@/components/ItemModuleViews";

export default function ItemBatchesPage() {
  const params = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <ItemBatchesView itemId={params.id} />
    </Suspense>
  );
}
