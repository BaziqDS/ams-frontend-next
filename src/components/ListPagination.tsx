"use client";

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
          <button type="button" className="btn btn-xs" onClick={onPrev} disabled={page <= 1}>
            ‹ Prev
          </button>
          <span className="mono pager-current">{page} / {totalPages}</span>
          <button type="button" className="btn btn-xs" onClick={onNext} disabled={page >= totalPages}>
            Next ›
          </button>
        </div>
      )}
    </div>
  );
}
