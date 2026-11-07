import katex from 'katex'
import { Marked } from 'marked'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

/** [[BA02.pdf#page=7|BA02 S. 7]] wird zu "BA02 S. 7", [[BA02.pdf#page=7]] zu "BA02". */
export function replaceObsidianLinks(src: string): string {
  return src.replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, label?: string) =>
    (label ?? target.replace(/\\$/, '').replace(/#.*$/, '').replace(/\.pdf$/i, '')).trim(),
  )
}

/** Bilder aus dem privaten Bucket stehen in den Notizen als folien/<Kürzel>/<Bild>.jpg. */
export const FOLIEN_PREFIX = 'folien/'

// $$...$$ über mehrere Zeilen, $...$ in einer Zeile ohne Leerzeichen direkt
// innerhalb der Dollarzeichen (damit "5 $ und 10 $" kein Formelsatz wird).
const MATH = /\$\$([\s\S]+?)\$\$|(?<![\\$])\$(?![\s$])((?:\\\$|[^\n$])+?)(?<!\s)\$/g
const FENCE = /^```([\w-]*)[^\n]*\n([\s\S]*?)^```[ \t]*$/gm
const CALLOUT_START = /^>\s*\[!(\w+)\]([+-]?)[ \t]*(.*)$/

const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    // Rohes HTML im Text nicht ausführen, sondern als Text zeigen.
    html({ text }) {
      return escapeHtml(text)
    },
    image({ href, text }) {
      const alt = escapeHtml(text)
      if (href.startsWith(FOLIEN_PREFIX)) {
        // Die Adresse setzt die App nachträglich mit einem zeitlich begrenzten Link.
        return `<img data-folie="${escapeHtml(href.slice(FOLIEN_PREFIX.length))}" alt="${alt}" loading="lazy">`
      }
      return `<img src="${escapeHtml(href)}" alt="${alt}" loading="lazy">`
    },
  },
})

const CALLOUT_TITLE: Record<string, string> = {
  question: 'Lösung',
  note: 'Hinweis',
  tip: 'Tipp',
  warning: 'Achtung',
  example: 'Beispiel',
}

/** Markdown mit LaTeX, Obsidian-Callouts und Mermaid zu HTML. */
export function renderMarkdown(src: string): string {
  const blocks: string[] = []
  const block = (html: string) => {
    blocks.push(html)
    return `\n\nBLOCKPLACEHOLDER${blocks.length - 1}END\n\n`
  }

  // 1. Codeblöcke zuerst, damit darin weder Formeln noch Callouts erkannt werden
  let text = replaceObsidianLinks(src).replace(FENCE, (_, lang: string, code: string) =>
    lang === 'mermaid'
      ? block(`<div class="mermaid" data-src="${escapeHtml(code)}"></div>`)
      : block(`<pre><code>${escapeHtml(code.replace(/\n$/, ''))}</code></pre>`),
  )

  // 2. Callouts: > [!question]- Titel, darunter Zeilen mit >
  const lines = text.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = CALLOUT_START.exec(lines[i])
    if (!m) {
      out.push(lines[i])
      continue
    }
    const [, type, fold, title] = m
    const inner: string[] = []
    while (i + 1 < lines.length && lines[i + 1].startsWith('>')) {
      inner.push(lines[++i].replace(/^>[ \t]?/, ''))
    }
    const label = escapeHtml(title || CALLOUT_TITLE[type.toLowerCase()] || type)
    const body = renderMarkdown(inner.join('\n'))
    const cls = `callout callout-${escapeHtml(type.toLowerCase())}`
    out.push(
      fold
        ? block(`<details class="${cls}"${fold === '+' ? ' open' : ''}><summary>${label}</summary><div class="callout-body">${body}</div></details>`)
        : block(`<div class="${cls}"><p class="callout-title">${label}</p><div class="callout-body">${body}</div></div>`),
    )
  }
  text = out.join('\n')

  // 3. Formeln herausnehmen, damit marked Unterstriche und Sternchen nicht zerlegt
  const formulas: string[] = []
  text = text.replace(MATH, (_, display?: string, inline?: string) => {
    const tex = display ?? inline ?? ''
    formulas.push(
      katex.renderToString(tex.trim(), {
        displayMode: display !== undefined,
        throwOnError: false,
        output: 'html',
      }),
    )
    return `MATHPLACEHOLDER${formulas.length - 1}END`
  })

  return md
    .parse(text, { async: false })
    .replace(/<p>BLOCKPLACEHOLDER(\d+)END<\/p>|BLOCKPLACEHOLDER(\d+)END/g, (_, a?: string, b?: string) =>
      blocks[Number(a ?? b)],
    )
    .replace(/MATHPLACEHOLDER(\d+)END/g, (_, i: string) => formulas[Number(i)])
}
