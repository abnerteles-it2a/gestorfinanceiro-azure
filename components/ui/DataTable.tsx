import React, { useState, useMemo } from 'react';
import { ArrowUpIcon, ArrowDownIcon, ChevronLeftIcon, ChevronRightIcon } from '../icons';
import { EmptyState } from './EmptyState';
import { LoaderState } from './LoaderState';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyField: keyof T;
  isLoading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.FC<React.SVGProps<SVGSVGElement>>;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  pagination?: boolean;
  rowsPerPage?: number;
  onRowClick?: (item: T) => void;
  className?: string;
  rowClassName?: (item: T) => string;
}

export const DataTable = <T extends Record<string, any>>({
  data,
  columns,
  keyField,
  isLoading = false,
  emptyMessage = 'Nenhum registro encontrado',
  emptyIcon,
  emptyActionLabel,
  onEmptyAction,
  pagination = true,
  rowsPerPage = 10,
  onRowClick,
  className = '',
  rowClassName,
}: DataTableProps<T>) => {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const sortedData = useMemo(() => {
    let sortableItems = [...data];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [data, sortConfig]);

  const paginatedData = useMemo(() => {
    if (!pagination) return sortedData;
    const startIndex = (currentPage - 1) * rowsPerPage;
    return sortedData.slice(startIndex, startIndex + rowsPerPage);
  }, [sortedData, currentPage, pagination, rowsPerPage]);

  const totalPages = Math.ceil(data.length / rowsPerPage);

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  if (isLoading) {
    return (
      <div className="omie-table-container w-full overflow-hidden rounded-xl">
        <LoaderState message="Verificando registros..." />
      </div>
    );
  }

  if (data.length === 0) {
    return (
        <div className="omie-table-container w-full overflow-hidden rounded-xl min-h-[300px]">
            <EmptyState
                title="Nenhum Registro"
                description={emptyMessage}
                variant="no_results"
                icon={emptyIcon ? React.createElement(emptyIcon) : undefined}
                actionLabel={emptyActionLabel}
                onAction={onEmptyAction}
            />
        </div>
    );
  }

  return (
    <div className={`omie-table-container w-full overflow-hidden rounded-xl ${className}`}>
      <div className="overflow-x-auto">
        <table className="omie-table min-w-full">
          <thead>
            <tr>
              {columns.map((col) => {
                const isSorted = sortConfig?.key === col.key;
                const ariaSort = col.sortable
                  ? isSorted
                    ? sortConfig?.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                  : undefined;
                return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={ariaSort}
                  tabIndex={col.sortable ? 0 : undefined}
                  className={`${col.sortable ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0D9488]' : ''} select-none transition-colors ${
                    col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                  style={{ width: col.width }}
                  onClick={() => col.sortable && requestSort(col.key)}
                  onKeyDown={(e) => {
                    if (col.sortable && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      requestSort(col.key);
                    }
                  }}
                >
                  <div className={`group inline-flex items-center ${col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                    {col.header}
                    {col.sortable && (
                      <span className="ml-2 flex-none rounded text-slate-400 group-hover:visible group-focus:visible">
                        {isSorted ? (
                          sortConfig?.direction === 'asc' ? (
                            <ArrowUpIcon className="h-4 w-4" aria-hidden="true" />
                          ) : (
                            <ArrowDownIcon className="h-4 w-4" aria-hidden="true" />
                          )
                        ) : (
                          <div className="h-4 w-4 opacity-0" aria-hidden="true" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((item) => (
              <tr
                key={String(item[keyField])}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={() => onRowClick && onRowClick(item)}
                onKeyDown={(e) => {
                  if (onRowClick && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onRowClick(item);
                  }
                }}
                className={`group ${onRowClick ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0D9488]' : ''} ${rowClassName ? rowClassName(item) : 'hover:bg-slate-50/55 dark:hover:bg-slate-800/30'} transition-colors`}
              >
                {columns.map((col) => (
                  <td
                    key={`${String(item[keyField])}-${col.key}`}
                    className={`whitespace-nowrap ${
                        col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {col.render ? col.render(item) : item[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && totalPages > 1 && (
        <div className="omie-table-summary flex items-center justify-between px-6 py-3">
          <div className="flex flex-1 justify-between sm:hidden">
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="relative inline-flex items-center rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="relative ml-3 inline-flex items-center rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                Mostrando <span className="font-bold text-[#020617] dark:text-white">{Math.min((currentPage - 1) * rowsPerPage + 1, data.length)}</span> a <span className="font-bold text-[#020617] dark:text-white">{Math.min(currentPage * rowsPerPage, data.length)}</span> de <span className="font-bold text-[#020617] dark:text-white">{data.length}</span> resultados
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-full shadow-sm" aria-label="Paginação">
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center rounded-l-full px-2 py-2 text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 focus:z-20 disabled:opacity-50 transition-colors"
                >
                  <span className="sr-only">Anterior</span>
                  <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    type="button"
                    key={page}
                    onClick={() => handlePageChange(page)}
                    aria-current={page === currentPage ? 'page' : undefined}
                    className={`relative inline-flex items-center px-4 py-2 text-[11px] font-black border ${
                      page === currentPage
                        ? 'z-10 bg-[#0D9488] text-white border-[#0D9488]'
                        : 'text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center rounded-r-full px-2 py-2 text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 focus:z-20 disabled:opacity-50 transition-colors"
                >
                  <span className="sr-only">Próxima</span>
                  <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
