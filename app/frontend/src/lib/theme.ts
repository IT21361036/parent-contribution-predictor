// Blue SaaS palette (`#4665f2` primary) shared by every page including Login —
// replaced the earlier warm-brown scheme on 2026-07-08 per the user's dashboard
// mockup. Tailwind's scanner only picks up class names it can see as literal
// strings, so every class is spelled out here rather than built with template
// interpolation.
export const BRAND = {
  bg: 'bg-[#4665f2]',
  bgHover: 'hover:bg-[#3550d4]',
  bgSoft: 'bg-[#eef2fe] dark:bg-[#1c2a63]',
  bgSoftHover: 'hover:bg-[#eef2fe] dark:hover:bg-[#1c2a63]',
  text: 'text-slate-900 dark:text-slate-100',
  textSoft: 'text-[#4665f2] dark:text-[#93a8ff]',
  border: 'border-[#e2e8f0] dark:border-slate-800',
  ring: 'focus-visible:ring-[#4665f2]',
  ringFocus: 'focus:ring-[#4665f2]',
  gradient: 'bg-gradient-to-r from-[#4665f2] to-[#3550d4]',
  activeNav: 'bg-[#eef2fe] dark:bg-[#1c2a63] text-slate-900 dark:text-slate-100',
  surface: 'bg-[#f8fafc] dark:bg-slate-950',
}

export const ROLE_BADGE_TONE: Record<string, 'indigo' | 'blue' | 'emerald' | 'violet'> = {
  admin: 'indigo',
  parent: 'emerald',
  child: 'violet',
}

// Per-role accent classes for stat cards (icon tile tint + underline bar).
// Hex values are the validated categorical palette in charts/chartTheme.ts.
export type AccentKey = 'blue' | 'indigo' | 'teal' | 'amber' | 'violet'

export const ACCENT: Record<AccentKey, { tile: string; bar: string }> = {
  blue: { tile: 'bg-[#eef2fe] dark:bg-[#1c2a63] text-[#4665f2] dark:text-[#93a8ff]', bar: 'bg-[#4665f2]' },
  indigo: { tile: 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300', bar: 'bg-indigo-600' },
  teal: { tile: 'bg-teal-50 dark:bg-teal-500/15 text-teal-600 dark:text-teal-300', bar: 'bg-teal-600' },
  amber: { tile: 'bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300', bar: 'bg-amber-600' },
  violet: { tile: 'bg-violet-50 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300', bar: 'bg-violet-600' },
}

export const ROLE_ACCENT: Record<string, AccentKey> = {
  admin: 'indigo',
  parent: 'amber',
  child: 'violet',
}
