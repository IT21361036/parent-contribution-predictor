import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-5xl' }

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  size?: keyof typeof SIZES
}) {
  return (
    <Dialog open={open} onClose={onClose} transition className="relative z-50">
      <div
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-sm transition duration-200 ease-out data-[closed]:opacity-0"
        aria-hidden="true"
      />
      <div className="fixed inset-0 flex items-center justify-center p-4 overflow-y-auto">
        <DialogPanel
          transition
          className={`w-full ${SIZES[size]} bg-white dark:bg-slate-900 rounded-xl shadow-xl transition duration-200 ease-out data-[closed]:opacity-0 data-[closed]:scale-95 max-h-[90vh] overflow-y-auto`}
        >
          <div className="flex items-start justify-between px-6 pt-6">
            <div>
              <DialogTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</DialogTitle>
              {description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md p-1 transition-colors"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="p-6">{children}</div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
