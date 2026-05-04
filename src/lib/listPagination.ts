import { useEffect, useMemo, useState } from "react";

export function useClientPagination<T>(items: T[], pageSize: number, resetDeps: readonly unknown[] = []) {
  const [page, setPage] = useState(1);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(items.length / pageSize)), [items.length, pageSize]);

  useEffect(() => {
    setPage(1);
  }, resetDeps);

  useEffect(() => {
    setPage(current => Math.min(Math.max(1, current), totalPages));
  }, [totalPages]);

  const pageItems = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return items.slice(startIndex, startIndex + pageSize);
  }, [items, page, pageSize]);

  const pageStart = items.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = items.length === 0 ? 0 : Math.min(items.length, page * pageSize);

  return {
    page,
    setPage,
    totalPages,
    pageItems,
    pageStart,
    pageEnd,
    canPrev: page > 1,
    canNext: page < totalPages,
  };
}
