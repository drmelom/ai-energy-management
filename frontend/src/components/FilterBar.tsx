import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

export function FilterBar({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 flex-wrap mb-3">
      {children}
      {right && <div className="ml-auto text-xs text-ink-2">{right}</div>}
    </div>
  );
}

export function SegmentedControl<T extends string>({ name, value, options, onChange, label }: {
  name: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string;
}) {
  return (
    <fieldset className="seg" aria-label={label}>
      {options.map(o => (
        <label key={o.value}>
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [local, setLocal] = useState(value);
  useEffect(() => { const t = setTimeout(() => onChange(local), 250); return () => clearTimeout(t); }, [local, onChange]);
  return (
    <span className="relative inline-flex items-center">
      <Icon name="search" size={14} className="absolute left-2.5 text-ink-3" />
      <input type="search" className="input pl-8 w-56" placeholder={placeholder} value={local} onChange={e => setLocal(e.target.value)} aria-label={placeholder} />
    </span>
  );
}
