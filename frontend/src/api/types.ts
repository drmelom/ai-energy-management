import type { AnomalyType, MeterStatus, Severity } from '../lib/semantics';

export interface AnomalyRef { id: number; type: AnomalyType; severity: Severity; priority: boolean; status: string; detected_at: string | null }

export interface MeterListItem {
  meter_id: string; name: string; location: string | null; status: MeterStatus;
  total_consumption_kwh: number; avg_daily_kwh: number; last_day_kwh: number; baseline_daily_kwh: number; variation_pct: number;
  last_reading_at: string; anomaly: AnomalyRef | null;
}
export interface MeterList { items: MeterListItem[]; total: number; analysis_run_id: string | null }

export interface BaselineHour { hour: number; kwh: number; kwh_std: number; voltage_v: number; current_a: number; power_factor: number }
export interface MeterDetail {
  meter_id: string; name: string; location: string | null; status: MeterStatus; created_at: string;
  period: { from: string; to: string; readings: number };
  stats: { total_kwh: number; avg_daily_kwh: number; avg_voltage_v: number; min_voltage_v: number; max_voltage_v: number; avg_current_a: number; avg_power_factor: number; min_power_factor: number };
  baseline: { days: number; from: string; to: string; daily_kwh: number; hourly: BaselineHour[] };
  last_day_kwh: number; baseline_daily_kwh: number; variation_pct: number;
  anomalies: AnomalyRef[]; events_count: number;
}

export interface ReadingPoint { timestamp: string; consumption_kwh: number; voltage_v: number; current_a: number; power_factor: number; baseline_kwh: number | null; deviation_pct: number | null }
export interface ReadingsOut { meter_id: string; resolution: 'hourly' | 'daily'; from: string; to: string; points: ReadingPoint[] }

export interface EventOut { id: number; meter_id: string; timestamp: string; type: string; description: string }

export interface Evidence {
  kind: string; weight: 'primary' | 'supporting'; window_from: string; window_to: string;
  observed: number | null; expected: number | null; unit: string | null; deviation_pct: number | null; share_pct: number | null;
  event_id: number | null; text_es: string; text_en: string;
}
export interface EventRef { event_id: number; type: string; timestamp: string; description: string; relation: string }
export interface AiMeta {
  decision_provider: 'jev' | 'rules'; decision_probabilities: Record<string, number> | null; severity_probabilities: Record<string, number> | null;
  priority_probability: number | null; confidence_parts: Record<string, number> | null; explanation_provider: string; fallback_notes: string[]; latency_ms: Record<string, number>; cached: Record<string, boolean>;
}
export interface AnomalySummary {
  id: number; rank: number; meter_id: string; meter_name: string; detected_at: string; type: AnomalyType; severity: Severity;
  confidence: number; priority: boolean; status: string; reason: string; recommended_action: string; providers: { decision: string; explanation: string };
  confidence_parts: Record<string, number> | null;
}
export interface AnomalyDetail extends AnomalySummary {
  window: { from: string; to: string; hours: number }; evidence: Evidence[]; events_matched: EventRef[]; ai_meta: AiMeta; analysis_run_id: string;
}
export interface AnomalyList { run_id: string | null; run_finished_at: string | null; items: AnomalySummary[]; total: number }

export interface StageProgress { key: string; label: string; status: 'pending' | 'running' | 'done' | 'failed'; started_at: string | null; finished_at: string | null; detail: string | null }
export interface RunSummary { anomalies_total: number; priority_count: number; by_type: Record<string, number>; by_severity: Record<string, number>; avg_confidence: number; headline: string }
export interface AnalysisRun {
  id: string; status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'; current_stage: string | null; started_at: string; finished_at: string | null;
  stages: StageProgress[] | null; providers: { decision: string; explanation: string }; force_refresh: boolean; summary: RunSummary | null; error: { code: string; message: string } | null;
}
export interface AnalyzeAccepted { analysis_id: string; status: string; reused: boolean }

export interface DashboardSummary {
  meters: { total: number; by_status: Record<MeterStatus, number> };
  consumption: { total_kwh: number; period_from: string; period_to: string; avg_daily_kwh: number };
  anomalies: { total: number; priority: number; by_severity: Record<string, number>; by_type: Record<string, number>; avg_confidence: number | null; open: number };
  last_analysis: { id: string; status: string; current_stage: string | null; started_at: string; finished_at: string | null; headline: string | null; providers: { decision: string; explanation: string } } | null;
  ai_mode: { decision: string; explanation: string };
}
export interface Health { status: string; db: string; readings: number; providers: { decision: string; explanation: string }; jev_model: string | null; llm_models: string[] }
