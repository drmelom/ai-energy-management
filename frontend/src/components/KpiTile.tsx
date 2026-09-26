import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

export function KpiTile({ label, value, sub, tone, loading }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'critical' | 'warning'; loading?: boolean }) {
  return (
    <Card className="min-w-0 gap-0 py-0 overflow-hidden">
      <CardContent className="px-4 pt-3 pb-4 rule-top border-t-foreground/80">
        <div className="eyebrow">{label}</div>
        {loading ? <Skeleton className="h-9 w-28 mt-2" /> :
          <div className={cn('display mt-2 truncate', tone === 'critical' && 'text-critical-ink', tone === 'warning' && 'text-warning-ink')}>{value}</div>}
        {sub && <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5 flex-wrap min-h-5">{sub}</div>}
      </CardContent>
    </Card>
  );
}
