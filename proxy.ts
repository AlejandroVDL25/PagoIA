// proxy.ts — Next.js 16.2+ (reemplaza a middleware.ts). Corre en el runtime de Node.js.
// Cualquier excepción sin atrapar aquí tumba TODAS las rutas con MIDDLEWARE_INVOCATION_FAILED,
// por eso la renovación de sesión va dentro de try/catch y, si falla, la petición sigue
// (el layout del dashboard vuelve a validar al usuario con getUser()).
import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest): Promise<NextResponse> {
  let response: NextResponse
  try {
    response = await updateSession(request)
  } catch (error) {
    console.error('[proxy] No se pudo renovar la sesión de Supabase:', error)
    response = NextResponse.next({ request })
  }
  response.headers.set('x-request-id', crypto.randomUUID())
  return response
}

export const config = {
  matcher: [
    // Excluye estáticos, el service worker, el webhook de Stripe (no lleva cookies) y el cron.
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|api/stripe/webhook|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|txt|xml)$).*)',
  ],
}
