import type { Tone } from '../components/ui/Badge'
import type { RiskBand } from './types'

// Single source of truth for how a risk band looks and reads, so the parent
// and admin surfaces stay consistent.
export const RISK_META: Record<RiskBand, { label: string; tone: Tone; description: string }> = {
  low: { label: 'Low risk', tone: 'emerald', description: 'On track — likely to meet O/L targets.' },
  medium: { label: 'Medium risk', tone: 'amber', description: 'Some warning signs — worth a check-in.' },
  high: { label: 'High risk', tone: 'red', description: 'Several signals are low right now — a good moment to step in and support.' },
}

export const RISK_ORDER: RiskBand[] = ['low', 'medium', 'high']
