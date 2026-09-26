export type Tone = 'ok' | 'warning' | 'critical' | 'neutral' | 't-real' | 't-dq' | 't-expl' | 't-fp';
export type AnomalyType = 'REAL_ANOMALY' | 'DATA_QUALITY' | 'EXPLAINABLE_ANOMALY' | 'FALSE_POSITIVE';
export type Severity = 'HIGH' | 'MEDIUM' | 'LOW';
export type MeterStatus = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';

export const STATUS: Record<MeterStatus, { tone: Tone; label: string; icon: IconName }> = {
  NORMAL: { tone: 'ok', label: 'Normal', icon: 'circle-check' },
  WARNING: { tone: 'warning', label: 'Alerta', icon: 'triangle-alert' },
  CRITICAL: { tone: 'critical', label: 'Crítico', icon: 'octagon-alert' },
  UNKNOWN: { tone: 'neutral', label: 'Sin analizar', icon: 'circle-minus' },
};

export const SEVERITY: Record<Severity, { tone: Tone; label: string; icon: IconName }> = {
  HIGH: { tone: 'critical', label: 'Alta', icon: 'octagon-alert' },
  MEDIUM: { tone: 'warning', label: 'Media', icon: 'triangle-alert' },
  LOW: { tone: 'neutral', label: 'Baja', icon: 'circle-minus' },
};
export const SEVERITY_RANK: Record<Severity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export const TYPE_ORDER: AnomalyType[] = ['REAL_ANOMALY', 'DATA_QUALITY', 'EXPLAINABLE_ANOMALY', 'FALSE_POSITIVE'];
export const TYPE: Record<AnomalyType, { tone: Tone; label: string; short: string; icon: IconName }> = {
  REAL_ANOMALY: { tone: 't-real', label: 'Anomalía real', short: 'Real', icon: 'siren' },
  DATA_QUALITY: { tone: 't-dq', label: 'Calidad de dato', short: 'Calidad', icon: 'activity' },
  EXPLAINABLE_ANOMALY: { tone: 't-expl', label: 'Explicable', short: 'Explicable', icon: 'clipboard-check' },
  FALSE_POSITIVE: { tone: 't-fp', label: 'Falso positivo', short: 'Falso +', icon: 'circle-minus' },
};

export const ANOMALY_STATUS: Record<string, { tone: Tone; label: string }> = {
  OPEN: { tone: 'neutral', label: 'Abierta' },
  ACKNOWLEDGED: { tone: 'warning', label: 'En revisión' },
  RESOLVED: { tone: 'ok', label: 'Resuelta' },
};

export const EVENT_RELATION: Record<string, { label: string; tone: Tone }> = {
  explains: { label: 'Explica la desviación', tone: 'ok' },
  reported_no_explanation: { label: 'No explica nada', tone: 'neutral' },
  corroborates_dq: { label: 'Corrobora la calidad de dato', tone: 't-dq' },
  unrelated: { label: 'Sin relación', tone: 'neutral' },
};

export type IconName =
  | 'circle-check' | 'triangle-alert' | 'octagon-alert' | 'circle-minus' | 'siren' | 'activity' | 'clipboard-check'
  | 'trending-up' | 'trending-down' | 'zap' | 'gauge' | 'shuffle' | 'flag' | 'search' | 'bolt' | 'grid' | 'list'
  | 'play' | 'check' | 'x' | 'chevron-left' | 'chevron-right' | 'sun' | 'moon' | 'logout' | 'cpu';
