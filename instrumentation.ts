/**
 * PagoIA opera solo en México. Vercel corre en UTC, así que se fija la zona horaria de la Ciudad de México
 * para que "hoy", el mes en curso y los vencimientos se calculen con la hora local de los usuarios.
 */
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") process.env.TZ = "America/Mexico_City"
}
