import { Fragment, type ReactNode } from 'react'

/**
 * Tiny, dependency-free renderer for the subset of Markdown used by problem statements and tutor replies:
 * paragraphs, "-" lists, fenced code, **bold**, `inline code`. It builds React elements (never HTML strings),
 * so model output or problem text can't inject markup.
 */
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return <code key={i} className="rounded bg-navy-50 px-1 py-0.5 font-mono text-[0.85em]">{part.slice(1, -1)}</code>
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>
    return <Fragment key={i}>{part}</Fragment>
  })
}

export function RichText({ text, className = '' }: { text: string; className?: string }) {
  const blocks: ReactNode[] = []
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  let key = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim().startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++])
      i++
      blocks.push(<pre key={key++} className="my-2 overflow-x-auto rounded-md border border-line bg-paper p-3 font-mono text-xs text-ink"><code>{code.join('\n')}</code></pre>)
    } else if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''))
      blocks.push(<ul key={key++} className="my-2 list-disc space-y-1 pl-5">{items.map((it, n) => <li key={n}>{inline(it)}</li>)}</ul>)
    } else if (line.trim() === '') {
      i++
    } else {
      const para: string[] = []
      while (i < lines.length && lines[i].trim() !== '' && !lines[i].trim().startsWith('```') && !/^\s*[-*]\s+/.test(lines[i])) para.push(lines[i++])
      blocks.push(<p key={key++} className="my-2 first:mt-0 last:mb-0">{inline(para.join(' '))}</p>)
    }
  }
  return <div className={className}>{blocks}</div>
}
