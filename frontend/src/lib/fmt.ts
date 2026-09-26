// Timestamps from the API are ISO naive ("2026-09-12T14:00:00"). Never `new Date(iso)`: browsers differ on TZ.
export const parseNaive = (s: string): number => {
  const [d, t = '00:00:00'] = s.split('T');
  const [y, m, dd] = d.split('-').map(Number);
  const [h = 0, mi = 0, sec = 0] = t.split(':').map(Number);
  return new Date(y, m - 1, dd, h, mi, Math.floor(sec), Math.round((sec % 1) * 1000)).getTime();
};
export const hourOf = (s: string) => Number(s.slice(11, 13));
export const HOUR = 3_600_000;

const nf1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
const pf1 = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
export const fmtNum = (v: number, d = 1) => (d === 0 ? nf0 : nf1).format(v);
export const fmtKwh = (v: number, d = 1) => `${fmtNum(v, d)} kWh`;
export const fmtPct = (v: number) => `${pf1.format(v)} %`;
export const fmtPctAbs = (v: number) => `${nf0.format(v)} %`;
export const fmtPF = (v: number) => v.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtV = (v: number) => `${fmtNum(v, 1)} V`;
export const fmtA = (v: number) => `${fmtNum(v, 0)} A`;

// Manual dd/MM formatting: es-CO in some engines drops the leading zero even with day: '2-digit'.
const p2 = (n: number) => String(n).padStart(2, '0');
const WD = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const fmtDay = (ms: number) => { const d = new Date(ms); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}`; };
export const fmtDayHour = (ms: number) => { const d = new Date(ms); return `${fmtDay(ms)} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
export const fmtTs = (ms: number) => `${WD[new Date(ms).getDay()]} ${fmtDayHour(ms)}`;
export const fmtIso = (iso: string) => fmtDayHour(parseNaive(iso));
export const fmtDur = (s: number) => (s < 1 ? `${Math.round(s * 1000)} ms` : `${s.toLocaleString('es-CO', { maximumFractionDigits: 1 })} s`);

export const relTime = (iso: string) => {
  // server timestamps are UTC naive; compare against now in UTC
  const ms = Date.UTC(...(iso.slice(0, 19).split(/[-T:]/).map(Number) as [number, number, number, number, number, number]).map((v, i) => (i === 1 ? v - 1 : v)) as [number, number, number, number, number, number]);
  const diff = Math.max(0, (Date.now() - ms) / 1000);
  if (diff < 60) return 'hace segundos';
  if (diff < 3600) return `hace ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.round(diff / 3600)} h`;
  return `hace ${Math.round(diff / 86400)} d`;
};
