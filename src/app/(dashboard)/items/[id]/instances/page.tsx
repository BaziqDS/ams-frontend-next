"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ItemInstancesView } from "@/components/ItemModuleViews";

export default function ItemInstancesPage() {
  const params = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <ItemInstancesView itemId={params.id} />
    </Suspense>
  );
}
