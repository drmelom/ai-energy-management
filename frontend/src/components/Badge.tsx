import type { ReactNode } from 'react';
import { Badge as UiBadge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import { ANOMALY_STATUS, SEVERITY, STATUS, TYPE, type AnomalyType, type IconName, type MeterStatus, type Severity, type Tone } from '../lib/semantics';

const TONE_CLASS: Record<Tone, string> = {
  ok: 'bg-ok-wash text-ok-ink', warning: 'bg-warning-wash text-warning-ink', critical: 'bg-critical-wash text-critical-ink',
  neutral: 'bg-neutral-wash text-neutral-ink', 't-real': 'bg-t-real-wash text-t-real-ink', 't-dq': 'bg-t-dq-wash text-t-dq-ink',
  't-expl': 'bg-t-expl-wash text-t-expl-ink', 't-fp': 'bg-t-fp-wash text-t-fp-ink',
};

export function Badge({ tone, icon, children, compact, title, className }: { tone: Tone; icon?: IconName; children: ReactNode; compact?: boolean; title?: string; className?: string }) {
  return (
    <UiBadge variant="secondary" title={title}
      className={cn('gap-1 rounded-md font-semibold whitespace-nowrap border-0', TONE_CLASS[tone], compact ? 'h-5 px-1.5 text-[11px]' : 'h-[22px] px-2 text-xs', className)}>
      {icon && <Icon name={icon} size={compact ? 11 : 13} />}
      {children}
    </UiBadge>
  );
}

export const StatusBadge = ({ status, compact }: { status: MeterStatus; compact?: boolean }) => {
  const s = STATUS[status];
  return <Badge tone={s.tone} icon={s.icon} compact={compact}>{s.label}</Badge>;
};
export const SeverityBadge = ({ severity, priority, compact }: { severity: Severity; priority?: boolean; compact?: boolean }) => {
  const s = SEVERITY[severity];
  return (
    <Badge tone={s.tone} icon={s.icon} compact={compact} title={priority ? 'Requiere investigación prioritaria' : undefined}>
      {s.label}{priority && <Icon name="flag" size={11} className="text-critical-ink" />}
    </Badge>
  );
};
export const TypeBadge = ({ type, compact, short }: { type: AnomalyType; compact?: boolean; short?: boolean }) => {
  const t = TYPE[type];
  return <Badge tone={t.tone} icon={t.icon} compact={compact}>{short ? t.short : t.label}</Badge>;
};
export const AnomalyStatusChip = ({ status }: { status: string }) => {
  const s = ANOMALY_STATUS[status] ?? { tone: 'neutral' as Tone, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
};
