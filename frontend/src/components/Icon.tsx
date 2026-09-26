import {
  Activity, Check, ChevronLeft, ChevronRight, CircleCheck, CircleMinus, ClipboardCheck, Cpu, Flag, Gauge,
  LayoutGrid, List, LogOut, Moon, OctagonAlert, Play, Search, Shuffle, Siren, Sun, TrendingDown, TrendingUp, TriangleAlert, X, Zap,
  type LucideIcon,
} from 'lucide-react';
import type { IconName } from '../lib/semantics';

// Semantic names (used as data in semantics.ts) → lucide-react components. No hand-copied paths.
const ICONS: Record<IconName, LucideIcon> = {
  'circle-check': CircleCheck, 'triangle-alert': TriangleAlert, 'octagon-alert': OctagonAlert, 'circle-minus': CircleMinus,
  siren: Siren, activity: Activity, 'clipboard-check': ClipboardCheck, 'trending-up': TrendingUp, 'trending-down': TrendingDown,
  zap: Zap, gauge: Gauge, shuffle: Shuffle, flag: Flag, search: Search, bolt: Zap, grid: LayoutGrid, list: List, play: Play,
  check: Check, x: X, 'chevron-left': ChevronLeft, 'chevron-right': ChevronRight, sun: Sun, moon: Moon, logout: LogOut, cpu: Cpu,
};

export function Icon({ name, size = 14, className, title }: { name: IconName; size?: number; className?: string; title?: string }) {
  const Cmp = ICONS[name];
  return <Cmp size={size} className={className} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined} aria-label={title} />;
}
