// One place defines how every chart in the app looks, so they all match.
// Colors reference the CSS variables set in index.css, which carry a
// separately validated palette for each theme (light and dark) — recharts
// resolves them at render time, so charts follow the active theme.
export const CHART = {
  brand: '#4665f2',
  brandDark: '#3550d4',
  grid: 'var(--chart-grid)',
  cursor: 'var(--chart-cursor)',
  cursorFill: 'var(--chart-cursor-fill)',
  dotRing: 'var(--chart-dot-ring)',
  tick: { fontSize: 11, fill: 'var(--chart-tick)', fontFamily: 'inherit' } as const,
  tooltip: {
    borderRadius: 10,
    border: '1px solid var(--chart-tooltip-border)',
    background: 'var(--chart-tooltip-bg)',
    boxShadow: '0 4px 12px rgba(15,23,42,0.18)',
    fontSize: 12,
    padding: '6px 10px',
  } as const,
  tooltipLabel: { color: 'var(--chart-tooltip-label)', fontSize: 11 } as const,
  tooltipItem: { color: 'var(--chart-tooltip-item)', fontWeight: 600 } as const,
}

// Role-identity palette for donut slices and per-role bars. The underlying
// values per theme live in index.css (validated for CVD separation and
// contrast against each surface).
export const ROLE_COLORS: Record<string, string> = {
  admin: 'var(--role-admin)',
  parent: 'var(--role-parent)',
  child: 'var(--role-child)',
}
