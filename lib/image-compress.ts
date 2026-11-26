/** Opciones de compresión para fotos tomadas con el celular. */
export type CompressOptions = {
  /** Lado más largo en píxeles. */
  maxDimension?: number
  /** Calidad JPEG entre 0 y 1. */
  quality?: number
}

export type CompressResult = {
  blob: Blob
  /** Tipo MIME final ("image/jpeg" para fotos, el original para PDF). */
  type: string
  originalBytes: number
  finalBytes: number
}

const DEFAULTS: Required<CompressOptions> = { maxDimension: 1600, quality: 0.82 }

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality))
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // imageOrientation respeta la rotación EXIF de las fotos verticales del celular.
      return await createImageBitmap(file, { imageOrientation: "from-image" })
    } catch {
      // Safari antiguo: se cae al <img> de abajo.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = "async"
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Redimensiona y recomprime una foto en el navegador con <canvas> (máx. 1600 px, JPEG 0.82),
 * para que una foto de 3–10 MB quede por debajo de ~800 KB antes de subirla.
 * Los PDF se devuelven sin cambios. Si el navegador no puede decodificar la imagen,
 * se devuelve el archivo original para no bloquear al usuario.
 */
export async function compressImage(file: File, options: CompressOptions = {}): Promise<CompressResult> {
  const { maxDimension, quality } = { ...DEFAULTS, ...options }

  if (file.type === "application/pdf" || !file.type.startsWith("image/")) {
    return { blob: file, type: file.type, originalBytes: file.size, finalBytes: file.size }
  }

  let source: ImageBitmap | HTMLImageElement
  try {
    source = await decode(file)
  } catch {
    return { blob: file, type: file.type, originalBytes: file.size, finalBytes: file.size }
  }

  const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width
  const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height
  const scale = Math.min(1, maxDimension / Math.max(width, height))

  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return { blob: file, type: file.type, originalBytes: file.size, finalBytes: file.size }
  }
  // Fondo blanco: los PNG con transparencia se verían negros al pasar a JPEG.
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  if ("close" in source && typeof source.close === "function") source.close()

  const blob = await canvasToBlob(canvas, quality)
  // Si la compresión no ayudó (imagen ya pequeña), se conserva el archivo original.
  if (!blob || blob.size >= file.size) {
    return { blob: file, type: file.type, originalBytes: file.size, finalBytes: file.size }
  }
  return { blob, type: "image/jpeg", originalBytes: file.size, finalBytes: blob.size }
}
