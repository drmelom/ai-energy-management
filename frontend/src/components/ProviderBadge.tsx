import { Badge } from './Badge';

const label = (kind: 'decision' | 'explanation', provider: string) => {
  if (kind === 'decision') return provider === 'jev' ? 'Decisión · Jev' : 'Decisión · reglas';
  if (provider === 'llm') return 'Explicación · LLM';
  if (provider.startsWith('llm:')) {
    const model = provider.slice(4).split('/').pop()?.replace(':free', '') ?? 'LLM';
    return `Explicación · LLM (${model})`;
  }
  return 'Explicación · plantilla';
};

export function ProviderBadge({ kind, provider, notes = [], latencyMs, cached }: { kind: 'decision' | 'explanation'; provider: string; notes?: string[]; latencyMs?: number; cached?: boolean }) {
  const degraded = notes.length > 0;
  const title = [degraded ? `Fallback: ${notes.join(', ')}` : null, latencyMs != null ? `${latencyMs} ms` : null, cached ? 'respuesta desde caché' : null].filter(Boolean).join(' · ');
  return (
    <Badge tone={degraded ? 'warning' : 'neutral'} icon={degraded ? 'triangle-alert' : 'cpu'} title={title || undefined}>
      {label(kind, provider)}{cached && ' · caché'}
    </Badge>
  );
}
