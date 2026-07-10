import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, X, XCircle } from 'lucide-react'

interface Toast {
  id: number
  message: string
  tone: 'success' | 'error'
}

interface ToastContextValue {
  success: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (message: string, tone: Toast['tone']) => {
      const id = nextId++
      setToasts((ts) => [...ts, { id, message, tone }])
      setTimeout(() => dismiss(id), 4000)
    },
    [dismiss]
  )

  const value: ToastContextValue = {
    success: (message) => push(message, 'success'),
    error: (message) => push(message, 'error'),
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2 rounded-lg shadow-lg border px-4 py-3 text-sm bg-white dark:bg-slate-900 animate-toast-in ${
              t.tone === 'success' ? 'border-emerald-200 dark:border-emerald-500/30' : 'border-red-200 dark:border-red-500/30'
            }`}
          >
            {t.tone === 'success' ? (
              <CheckCircle2 className="size-4 mt-0.5 shrink-0 text-emerald-600" />
            ) : (
              <XCircle className="size-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
            )}
            <span className="flex-1 text-slate-700 dark:text-slate-300">{t.message}</span>
            <button onClick={() => dismiss(t.id)} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
