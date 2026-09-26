import type { IconName } from '../lib/semantics';

// Lucide paths (ISC), inlined: no icon dependency.
const PATHS: Record<IconName, string> = {
  'circle-check': 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z M9 12l2 2 4-4',
  'triangle-alert': 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3 M12 9v4 M12 17h.01',
  'octagon-alert': 'M12 16h.01 M12 8v4 M15.31 2a2 2 0 0 1 1.42.59l4.68 4.68A2 2 0 0 1 22 8.69v6.62a2 2 0 0 1-.59 1.42l-4.68 4.68a2 2 0 0 1-1.42.59H8.69a2 2 0 0 1-1.42-.59l-4.68-4.68A2 2 0 0 1 2 15.31V8.69a2 2 0 0 1 .59-1.42l4.68-4.68A2 2 0 0 1 8.69 2z',
  'circle-minus': 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z M8 12h8',
  siren: 'M7 18v-6a5 5 0 1 1 10 0v6 M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2z M21 12h1 M18.5 4.5 18 5 M2 12h1 M12 2v1 M4.929 4.929 5.5 5.5 M12 12v6',
  activity: 'M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2',
  'clipboard-check': 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z m9 14 2 2 4-4',
  'trending-up': 'M16 7h6v6 m22 7-8.5 8.5-5-5L2 17',
  'trending-down': 'M16 17h6v-6 m22 17-8.5-8.5-5 5L2 7',
  zap: 'M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z',
  gauge: 'm12 14 4-4 M3.34 19a10 10 0 1 1 17.32 0',
  shuffle: 'm18 14 4 4-4 4 M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22 m18 2 4 4-4 4 M2 6h1.972a4 4 0 0 1 3.6 2.2 m15.9 6.6a4 4 0 0 0 3.3 1.7H22',
  flag: 'M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528',
  search: 'm21 21-4.34-4.34 M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z',
  list: 'M3 12h.01 M3 18h.01 M3 6h.01 M8 12h13 M8 18h13 M8 6h13',
  play: 'M6 3l14 9-14 9V3z',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18 M6 6l12 12',
  'chevron-left': 'm15 18-6-6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42',
  moon: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  cpu: 'M4 4h16v16H4z M9 9h6v6H9z M9 1v3 M15 1v3 M9 20v3 M15 20v3 M20 9h3 M20 14h3 M1 9h3 M1 14h3',
};

export function Icon({ name, size = 14, className, title }: { name: IconName; size?: number; className?: string; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}
