import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { ANOMALY_STATUS, SEVERITY, STATUS, TYPE, type AnomalyType, type IconName, type MeterStatus, type Severity, type Tone } from '../lib/semantics';

export function Badge({ tone, icon, children, compact, title }: { tone: Tone; icon?: IconName; children: ReactNode; compact?: boolean; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-[6px] font-semibold whitespace-nowrap bg-${tone}-wash text-${tone}-ink ${compact ? 'h-5 px-1.5 text-[11px]' : 'h-[22px] px-2 text-xs'}`}>
      {icon && <Icon name={icon} size={compact ? 11 : 13} />}
      {children}
    </span>
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

// Tailwind v4 needs the class names to appear literally somewhere for generation:
// bg-ok-wash text-ok-ink bg-warning-wash text-warning-ink bg-critical-wash text-critical-ink bg-neutral-wash text-neutral-ink
// bg-t-real-wash text-t-real-ink bg-t-dq-wash text-t-dq-ink bg-t-expl-wash text-t-expl-ink bg-t-fp-wash text-t-fp-ink
