/** Error de un proveedor de IA con un mensaje en español apto para mostrar al usuario. */
export class AiProviderError extends Error {
  /** Mensaje que ve el usuario. */
  readonly userMessage: string
  /** Código HTTP sugerido para la respuesta de la API. */
  readonly status: number

  constructor(userMessage: string, detail: string, status = 502) {
    super(detail)
    this.name = "AiProviderError"
    this.userMessage = userMessage
    this.status = status
  }
}
