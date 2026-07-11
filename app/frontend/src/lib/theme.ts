// "Aurora Glass" identity (2026-07-10): a vibrant indigo->violet->coral scheme
// on a cool canvas, replacing the earlier Lamplight/teal draft. Indigo #4F46E5
// is the primary action; violet #9333EA is the accent/focus ring; clay #C9553B
// is reserved for risk/alerts. The login uses a frosted glass card over an
// aurora mesh gradient. Tailwind's scanner only sees literal class strings, so
// every class is spelled out here rather than interpolated.
export const BRAND = {
  bg: 'bg-[#4F46E5]',
  bgHover: 'hover:bg-[#4338CA]',
  bgSoft: 'bg-[#EEF2FF] dark:bg-[#1E1B4B]',
  bgSoftHover: 'hover:bg-[#EEF2FF] dark:hover:bg-[#1E1B4B]',
  text: 'text-[#1E1B3A] dark:text-slate-100',
  textSoft: 'text-[#4F46E5] dark:text-[#A5B4FC]',
  border: 'border-[#E5E7F0] dark:border-slate-800',
  ring: 'focus-visible:ring-[#9333EA]',
  ringFocus: 'focus:ring-[#9333EA]',
  gradient: 'bg-gradient-to-r from-[#4F46E5] to-[#6D28D9]',
  // Active nav item on the dark ink rail: a warm lamp wash + gold text.
  activeNav: 'bg-[#9333EA]/15 text-[#C4B5FD]',
  surface: 'bg-[#F4F5FB] dark:bg-[#0E1726]',
}

export const ROLE_BADGE_TONE: Record<string, 'indigo' | 'blue' | 'emerald' | 'violet'> = {
  admin: 'indigo',
  parent: 'emerald',
  child: 'violet',
}

// Per-role accent classes for stat cards (icon tile tint + underline bar).
export type AccentKey = 'blue' | 'indigo' | 'teal' | 'amber' | 'violet'

export const ACCENT: Record<AccentKey, { tile: string; bar: string }> = {
  // "blue" is the app's primary accent slot — now grove teal.
  blue: { tile: 'bg-[#EEF2FF] dark:bg-[#1E1B4B] text-[#4F46E5] dark:text-[#A5B4FC]', bar: 'bg-[#4F46E5]' },
  indigo: { tile: 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300', bar: 'bg-indigo-600' },
  teal: { tile: 'bg-teal-50 dark:bg-teal-500/15 text-teal-600 dark:text-teal-300', bar: 'bg-teal-600' },
  // "amber" is lamp gold — used for the parent role, echoing the guidance motif.
  amber: { tile: 'bg-[#EDE9FE] dark:bg-[#2E1065] text-[#6D28D9] dark:text-[#C084FC]', bar: 'bg-[#9333EA]' },
  violet: { tile: 'bg-violet-50 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300', bar: 'bg-violet-600' },
}

export const ROLE_ACCENT: Record<string, AccentKey> = {
  admin: 'indigo',
  parent: 'amber',
  child: 'violet',
}
