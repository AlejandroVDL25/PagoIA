/**
 * Abre el diálogo de impresión ("Guardar como PDF") con un documento HTML, usando un iframe oculto.
 * Así no depende de ventanas emergentes, que los navegadores suelen bloquear.
 */
export function printHtml(html: string) {
  const content = html.replace(/<script>\s*window\.onload\s*=\s*\(\)\s*=>\s*window\.print\(\)\s*<\/script>/g, "")
  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  iframe.setAttribute("tabindex", "-1")
  Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" })
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    iframe.remove()
    return false
  }
  doc.open()
  doc.write(content)
  doc.close()

  const print = () => {
    win.focus()
    win.print()
    // Se quita después, cuando el diálogo ya se cerró.
    setTimeout(() => iframe.remove(), 60_000)
  }
  if (doc.readyState === "complete") setTimeout(print, 300)
  else win.addEventListener("load", () => setTimeout(print, 300), { once: true })
  return true
}
