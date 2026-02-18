import { useState, useMemo } from "react";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function usePagination<T>(items: T[], defaultPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // Reset to page 1 whenever the list length or page size changes
  const safePageSize = pageSize;
  const safePage = Math.min(page, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * safePageSize;
    return items.slice(start, start + safePageSize);
  }, [items, safePage, safePageSize]);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setPage(1);
  };

  return {
    page: safePage,
    setPage,
    pageSize,
    setPageSize: handlePageSizeChange,
    totalPages,
    totalItems: items.length,
    paginatedItems,
    from: items.length === 0 ? 0 : (safePage - 1) * safePageSize + 1,
    to: Math.min(safePage * safePageSize, items.length),
  };
}
