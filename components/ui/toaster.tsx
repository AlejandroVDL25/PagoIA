'use client'

import { useToast } from '@/hooks/use-toast'
import { useLocale } from '@/components/i18n/locale-provider'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast'

export function Toaster() {
  const { toasts } = useToast()
  // Los avisos se escriben en español de México y se muestran en el idioma elegido.
  const { t } = useLocale()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{typeof title === 'string' ? t(title) : title}</ToastTitle>}
              {description && (
                <ToastDescription>{typeof description === 'string' ? t(description) : description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
