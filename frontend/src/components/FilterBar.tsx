import { useEffect, useState, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export function FilterBar({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {children}
      {right && <div className="ml-auto text-xs text-muted-foreground">{right}</div>}
    </div>
  );
}

export function SegmentedControl<T extends string>({ value, options, onChange, label, size = 'sm' }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; size?: 'sm' | 'default';
}) {
  return (
    <ToggleGroup variant="outline" size={size} value={[value]} onValueChange={(v: unknown[]) => { const next = v[0]; if (typeof next === 'string' && next !== value) onChange(next as T); }} aria-label={label}>
      {options.map(o => <ToggleGroupItem key={o.value} value={o.value} className="px-3 data-[state=on]:bg-muted data-[state=on]:text-foreground">{o.label}</ToggleGroupItem>)}
    </ToggleGroup>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { const t = setTimeout(() => onChange(local), 250); return () => clearTimeout(t); }, [local, onChange]);
  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <Input type="search" className="pl-8 w-60" placeholder={placeholder} value={local} onChange={e => setLocal(e.target.value)} aria-label={placeholder} />
    </div>
  );
}
