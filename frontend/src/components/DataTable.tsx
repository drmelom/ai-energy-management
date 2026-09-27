import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface Col<T> { key: string; header: ReactNode; render: (row: T) => ReactNode; align?: 'left' | 'right'; sortable?: boolean; width?: string }

export function DataTable<T>({ columns, rows, rowKey, sort, order, onSort, rowClass, empty = 'Sin resultados', fixed }: {
  columns: Col<T>[]; rows: T[]; rowKey: (r: T) => string | number; sort?: string; order?: 'asc' | 'desc';
  onSort?: (key: string) => void; rowClass?: (r: T) => string; empty?: string;
  /** table-layout: fixed — columns with `width` keep it, the rest share what is left; content truncates instead of overflowing */
  fixed?: boolean;
}) {
  return (
    <Card className="py-0 overflow-hidden">
      <Table className={cn(fixed && 'table-fixed')}>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            {columns.map(c => (
              <TableHead key={c.key} style={{ width: c.width }} className={cn('text-xs font-semibold whitespace-nowrap', c.align === 'right' && 'text-right')}
                aria-sort={sort === c.key ? (order === 'desc' ? 'descending' : 'ascending') : undefined}>
                {c.sortable && onSort ? (
                  <button type="button" onClick={() => onSort(c.key)} className="inline-flex items-center gap-1 hover:text-foreground">
                    {c.header}{sort === c.key ? (order === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />) : <ArrowUpDown className="size-3 opacity-50" />}
                  </button>
                ) : c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">{empty}</TableCell></TableRow>}
          {rows.map(r => (
            <TableRow key={rowKey(r)} className={cn('h-12', rowClass?.(r))}>
              {columns.map(c => <TableCell key={c.key} className={cn('py-2', fixed && 'overflow-hidden', c.align === 'right' && 'text-right')}>{c.render(r)}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
