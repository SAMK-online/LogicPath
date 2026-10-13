import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { RichText } from '../RichText'
import type { ChatMessage } from '../../types/api'

interface Props {
  messages: ChatMessage[]
  sending: boolean
  error: string | null
  hintLevel: number
  tutorMode: 'live' | 'mock'
  hasUnsavedChanges: boolean
  onSend: (text: string) => Promise<boolean>
  onHint: () => void
  onReview: () => void
}

const STARTERS = ['Where do I start?', 'What does this problem really ask?', "My code doesn't pass. What should I check?"]

export function TutorPanel({ messages, sending, error, hintLevel, tutorMode, hasUnsavedChanges, onSend, onHint, onReview }: Props) {
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }) }, [messages.length, sending])

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    const t = text.trim()
    if (!t || sending) return
    if (await onSend(t)) setText('') // keep the draft if the request failed
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Socratic tutor</h2>
          <span className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tutorMode === 'live' ? 'border-ok/25 bg-ok-50 text-ok' : 'border-warn/25 bg-warn-50 text-warn'}`}>
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tutorMode === 'live' ? 'bg-ok' : 'bg-warn'}`} />{tutorMode === 'live' ? 'AI' : 'Mock'}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-slate-muted">Asks questions and gives hints. It won't hand you the solution.</p>
        {tutorMode === 'mock' && (
          <p role="note" className="mt-2 rounded-md border border-warn/25 bg-warn-50 px-2.5 py-1.5 text-xs text-warn">
            Development mock mode: replies are canned and not from an AI model.
          </p>
        )}
      </div>

      <div className="scroll-quiet min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite" aria-label="Conversation">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-slate-muted">Ask a question about the problem or your code, or press <strong className="text-navy">Request Hint</strong> when you're stuck. Your latest code is shared with the tutor when you send a message.</p>
            <div className="flex flex-wrap gap-2" aria-label="Conversation starters">
              {STARTERS.map((s) => (
                <button key={s} className="rounded-full border border-line bg-white px-3 py-1.5 text-xs text-navy shadow-card transition-colors hover:border-copper/50 hover:bg-copper-50"
                  onClick={() => { setText(s); inputRef.current?.focus() }}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            {m.role === 'assistant' ? (
              <div className="tutor-voice rise max-w-[94%] border-l-2 border-copper py-0.5 pl-3.5 text-navy">
                <RichText text={m.content} />
              </div>
            ) : (
              <div className="max-w-[88%] rounded-lg bg-navy px-3.5 py-2 text-sm text-white">
                {m.kind !== 'chat' ? <em className="opacity-90">{m.content}</em> : <span className="whitespace-pre-wrap">{m.content}</span>}
              </div>
            )}
          </div>
        ))}
        {sending && (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-muted">
            <span aria-hidden className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-copper motion-reduce:animate-none" style={{ animationDelay: `${i * 160}ms` }} />)}</span>
            Tutor is thinking…
          </p>
        )}
        <div ref={endRef} />
      </div>

      {error && <p role="alert" className="mx-4 mb-2 rounded-lg border border-bad/20 bg-bad-50 px-3 py-2 text-xs text-bad">{error}</p>}

      <div className="shrink-0 border-t border-line bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={onHint} disabled={sending}>
            Request Hint{hintLevel > 0 && <span className="text-slate-muted"> (used {hintLevel}/5)</span>}
            <span aria-hidden className="flex gap-0.5">{[1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= hintLevel ? 'bg-copper' : 'bg-line'}`} />)}</span>
          </button>
          <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={onReview} disabled={sending}>Review My Approach</button>
        </div>
        <form onSubmit={submit} className="flex items-end gap-2">
          <label htmlFor="tutor-input" className="sr-only">Message the tutor</label>
          <textarea id="tutor-input" ref={inputRef} rows={2} maxLength={2000} className="input resize-none" placeholder="Ask about the problem or your code…"
            value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} disabled={sending} />
          <button className="btn-primary" disabled={sending || !text.trim()}>Send</button>
        </form>
        <p className="mt-1.5 text-[11px] text-slate-muted">
          {hasUnsavedChanges ? 'Your unsaved edits will be included and saved when you send. ' : ''}<span className="kbd">Enter</span> to send · <span className="kbd">Shift ↵</span> for a new line
        </p>
      </div>
    </div>
  )
}
