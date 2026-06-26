'use client';

import { useEffect, useState } from 'react';

const PAGE_SIZES = [10, 50, 100, 500, 1000];

export default function DataTable({
  columns,
  rows,
  keyExtractor = (row) => row.id,
  onEdit,
  onDelete,
  emptyMessage = 'No data',
  paginate = true,
  showSerial = true,
}) {
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(0);
  const total = rows?.length || 0;

  // Reset to first page when the dataset size or page size changes
  // (e.g. a filter was applied or rows per page switched).
  useEffect(() => { setPage(0); }, [total, pageSize]);

  if (!rows?.length) {
    return (
      <div className="rounded-lg border border-admin-border bg-admin-card p-8 text-center text-admin-muted">
        {emptyMessage}
      </div>
    );
  }

  const pageCount = paginate ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const start = paginate ? safePage * pageSize : 0;
  const visible = paginate ? rows.slice(start, start + pageSize) : rows;
  const hasActions = onEdit || onDelete;

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-admin-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-admin-card border-b border-admin-border text-admin-muted">
            <tr>
              {showSerial && <th className="px-4 py-3 font-medium w-16">S.No</th>}
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3 font-medium">
                  {col.label}
                </th>
              ))}
              {hasActions && (
                <th className="px-4 py-3 font-medium w-28">Actions</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-admin-border">
            {visible.map((row, i) => (
              <tr key={keyExtractor(row)} className="hover:bg-admin-card/50">
                {showSerial && (
                  <td className="px-4 py-3 text-admin-muted tabular-nums">{start + i + 1}</td>
                )}
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-slate-200">
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
                {hasActions && (
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {onEdit && (
                        <button
                          type="button"
                          onClick={() => onEdit(row)}
                          className="text-admin-accent hover:underline"
                        >
                          Edit
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          onClick={() => onDelete(row)}
                          className="text-red-400 hover:underline"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paginate && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <div className="flex items-center gap-2 text-sm text-admin-muted">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-lg bg-admin-card border border-admin-border px-2 py-1 text-slate-200"
            >
              {PAGE_SIZES.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
            <span className="ml-1">{start + 1}–{Math.min(start + pageSize, total)} of {total}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(safePage - 1)}
              disabled={safePage <= 0}
              className="rounded-lg border border-admin-border px-3 py-1.5 text-sm text-slate-200 hover:bg-admin-card disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="text-sm text-admin-muted">Page {safePage + 1} / {pageCount}</span>
            <button
              type="button"
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= pageCount - 1}
              className="rounded-lg border border-admin-border px-3 py-1.5 text-sm text-slate-200 hover:bg-admin-card disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
