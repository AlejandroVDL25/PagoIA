/**
 * Peticiones que el navegador cancela al salir de la página (p. ej. al ir a Stripe) llegan como
 * "Failed to fetch" o AbortError. No son fallas: no se registran como error.
 */
export function isAbortedRequest(error: unknown) {
  const e = error as { name?: string; message?: string; details?: string } | null
  const text = `${e?.name ?? ""} ${e?.message ?? ""} ${e?.details ?? ""}`
  return /AbortError|Failed to fetch|NetworkError|Load failed/i.test(text)
}
