import { useEffect, useMemo, useRef } from 'react'
import { renderMarkdown } from '../lib/render'

let mermaidCount = 0
const MERMAID_FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif'

function prefersDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

/** Ganze Wochennotiz: Markdown, Folienbilder aus dem Speicher, Mermaid-Diagramme. */
export function NoteBody(props: {
  text: string
  resolveImages: (paths: string[]) => Promise<Record<string, string>>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const html = useMemo(() => renderMarkdown(props.text), [props.text])
  const { resolveImages } = props

  useEffect(() => {
    const root = ref.current
    if (!root) return
    let cancelled = false

    const imgs = [...root.querySelectorAll<HTMLImageElement>('img[data-folie]')]
    if (imgs.length) {
      resolveImages([...new Set(imgs.map((i) => i.dataset.folie!))])
        .then((urls) => {
          if (cancelled) return
          for (const img of imgs) {
            const url = urls[img.dataset.folie!]
            if (url) {
              img.src = url
              img.onclick = () => window.open(url, '_blank', 'noopener')
            } else {
              img.replaceWith(Object.assign(document.createElement('p'), {
                className: 'missing',
                textContent: `Bild nicht gefunden: ${img.alt}`,
              }))
            }
          }
        })
        .catch(() => {
          if (!cancelled) for (const img of imgs) img.alt = `Bild konnte nicht geladen werden: ${img.alt}`
        })
    }

    const diagrams = [...root.querySelectorAll<HTMLDivElement>('div.mermaid[data-src]')]
    if (diagrams.length) {
      // Die Bibliothek ist groß, deshalb erst laden, wenn eine Notiz sie braucht.
      import('mermaid').then(async ({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: prefersDark() ? 'dark' : 'neutral',
          // Gleiche Schrift für Messen und Zeichnen, sonst werden Beschriftungen abgeschnitten
          fontFamily: MERMAID_FONT,
        })
        for (const el of diagrams) {
          if (cancelled) return
          try {
            const { svg } = await mermaid.render(`mermaid-${++mermaidCount}`, el.dataset.src!)
            el.innerHTML = svg
          } catch {
            el.replaceChildren(Object.assign(document.createElement('pre'), { textContent: el.dataset.src }))
          }
        }
      })
    }
    return () => {
      cancelled = true
    }
  }, [html, resolveImages])

  return <div ref={ref} className="md note" dangerouslySetInnerHTML={{ __html: html }} />
}
