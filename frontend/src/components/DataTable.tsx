import type { ReactNode } from 'react';

export interface Col<T> { key: string; header: string; render: (row: T) => ReactNode; align?: 'left' | 'right'; sortable?: boolean; width?: string }

export function DataTable<T>({ columns, rows, rowKey, sort, order, onSort, rowClass, empty = 'Sin resultados' }: {
  columns: Col<T>[]; rows: T[]; rowKey: (r: T) => string | number; sort?: string; order?: 'asc' | 'desc';
  onSort?: (key: string) => void; rowClass?: (r: T) => string; empty?: string;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="dt">
        <thead>
          <tr>
            {columns.map(c => (
              <th key={c.key} style={{ width: c.width, textAlign: c.align ?? 'left' }} aria-sort={sort === c.key ? (order === 'desc' ? 'descending' : 'ascending') : undefined}>
                {c.sortable && onSort ? (
                  <button type="button" onClick={() => onSort(c.key)} className="inline-flex items-center gap-1 hover:text-ink">
                    {c.header}<span className="text-ink-3 text-[10px]">{sort === c.key ? (order === 'desc' ? '▼' : '▲') : '⇅'}</span>
                  </button>
                ) : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={columns.length} className="text-center text-ink-2 py-8">{empty}</td></tr>}
          {rows.map(r => (
            <tr key={rowKey(r)} className={rowClass?.(r)}>
              {columns.map(c => <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
