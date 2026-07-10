import { Loader2 } from 'lucide-react'

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return <Loader2 className={`animate-spin text-slate-400 dark:text-slate-500 ${className}`} />
}

export function LoadingScreen({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 dark:bg-slate-800/50">
      <Spinner className="size-6" />
      <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  )
}
