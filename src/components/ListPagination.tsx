"use client";

import { Button } from "@/components/ui/button";

interface ListPaginationProps {
  summary: string;
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  standalone?: boolean;
}

export function ListPagination({ summary, page, totalPages, onPrev, onNext, standalone = false }: ListPaginationProps) {
  return (
    <div className={"table-card-foot" + (standalone ? " listing-pagination-foot" : "")}>
      <div className="eyebrow">{summary}</div>
      {totalPages > 1 && (
        <div className="pager">
          <Button type="button" variant="outline" size="xs" onClick={onPrev} disabled={page <= 1}>
            ‹ Prev
          </Button>
          <span className="mono pager-current">{page} / {totalPages}</span>
          <Button type="button" variant="outline" size="xs" onClick={onNext} disabled={page >= totalPages}>
            Next ›
          </Button>
        </div>
      )}
    </div>
  );
}
