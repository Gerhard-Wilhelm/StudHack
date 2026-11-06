import katex from 'katex'
import { Marked } from 'marked'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

/** [[BA02.pdf#page=7|BA02 S. 7]] wird zu "BA02 S. 7", [[BA02.pdf#page=7]] zu "BA02". */
export function replaceObsidianLinks(src: string): string {
  return src.replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, label?: string) =>
    (label ?? target.replace(/#.*$/, '').replace(/\.pdf$/i, '')).trim(),
  )
}

// $$...$$ über mehrere Zeilen, $...$ in einer Zeile ohne Leerzeichen direkt
// innerhalb der Dollarzeichen (damit "5 $ und 10 $" kein Formelsatz wird).
const MATH = /\$\$([\s\S]+?)\$\$|(?<![\\$])\$(?![\s$])((?:\\\$|[^\n$])+?)(?<!\s)\$/g

const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    // Rohes HTML im Text nicht ausführen, sondern als Text zeigen.
    html({ text }) {
      return escapeHtml(text)
    },
  },
})

/** Markdown mit LaTeX zu HTML. */
export function renderMarkdown(src: string): string {
  const formulas: string[] = []
  const withPlaceholders = replaceObsidianLinks(src).replace(
    MATH,
    (_, display?: string, inline?: string) => {
      const tex = display ?? inline ?? ''
      formulas.push(
        katex.renderToString(tex.trim(), {
          displayMode: display !== undefined,
          throwOnError: false,
          output: 'html',
        }),
      )
      return `MATHPLACEHOLDER${formulas.length - 1}END`
    },
  )
  const html = md.parse(withPlaceholders, { async: false })
  return html.replace(/MATHPLACEHOLDER(\d+)END/g, (_, i: string) => formulas[Number(i)])
}
