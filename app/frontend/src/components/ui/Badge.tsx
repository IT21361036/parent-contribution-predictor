import type { ReactNode } from 'react'

export type Tone =
  | 'slate' | 'indigo' | 'blue' | 'emerald' | 'violet' | 'amber' | 'red' | 'green'
  | 'grove' | 'gold' | 'clay'

const TONES: Record<Tone, string> = {
  slate: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
  indigo: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300',
  blue: 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300',
  emerald: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  violet: 'bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300',
  amber: 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300',
  red: 'bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300',
  green: 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-300',
  grove: 'bg-[#EEF2FF] dark:bg-[#1E1B4B] text-[#4338CA] dark:text-[#A5B4FC]',
  gold: 'bg-[#EDE9FE] dark:bg-[#2E1065] text-[#6D28D9] dark:text-[#C084FC]',
  clay: 'bg-[#F7E2DB] dark:bg-[#3A2018] text-[#B0472D] dark:text-[#E08E75]',
}

export function Badge({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${TONES[tone]}`}>
      {children}
    </span>
  )
}
