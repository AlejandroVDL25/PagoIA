/** Traduce los errores más comunes de Supabase Auth para mostrarlos en las pantallas de cuenta. */
export function authErrorMessage(message: string) {
  if (/invalid login credentials/i.test(message)) return "Correo o contraseña incorrectos. Si no recuerdas tu contraseña, usa “¿Olvidaste tu contraseña?”."
  if (/email not confirmed/i.test(message)) return "Confirma tu correo antes de iniciar sesión; revisa tu bandeja de entrada."
  if (/email rate limit/i.test(message)) return "Ya enviamos varios correos en poco tiempo. Espera una hora y vuelve a intentarlo."
  if (/rate limit|too many|security purposes/i.test(message)) return "Demasiados intentos. Espera unos minutos y vuelve a intentarlo."
  if (/user already registered|already been registered/i.test(message)) return "Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña."
  if (/password should be at least|weak password/i.test(message)) return "La contraseña es muy corta o débil. Usa al menos 6 caracteres, mezclando letras y números."
  if (/same as the old password|should be different/i.test(message)) return "La nueva contraseña debe ser distinta de la anterior."
  if (/auth session missing|session.*(expired|missing)|jwt expired/i.test(message)) return "El enlace venció o ya se usó. Pide uno nuevo desde “¿Olvidaste tu contraseña?”."
  if (/unable to validate email|invalid email/i.test(message)) return "Escribe un correo electrónico válido."
  return message
}
