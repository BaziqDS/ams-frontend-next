"use client";

import { useParams } from "next/navigation";
import { ItemDetailDossierView } from "@/components/ItemDetailDossier";

export default function ItemDistributionPage() {
  const params = useParams<{ id: string }>();
  return <ItemDetailDossierView itemId={params.id} />;
}
