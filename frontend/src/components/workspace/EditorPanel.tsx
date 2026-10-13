import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { useEffect, useRef, useState } from 'react'
import type { SaveState } from '../../hooks/useWorkspace'

const SAVE_LABEL: Record<SaveState, string> = { saved: 'All changes saved', dirty: 'Unsaved changes', saving: 'Saving…', error: 'Save failed' }
const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = mac ? '⌘' : 'Ctrl'

/** Light editor theme tuned to the app palette: copper keywords, quiet comments, warm active line. */
const defineTheme: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('socratic', {
    base: 'vs', inherit: true,
    rules: [
      { token: 'keyword', foreground: 'A2623F', fontStyle: 'bold' },
      { token: 'comment', foreground: '94A3B8', fontStyle: 'italic' },
      { token: 'string', foreground: '2F7D5B' },
      { token: 'number', foreground: '1F3A5C' },
      { token: 'identifier', foreground: '11233B' },
      { token: 'type.identifier', foreground: '1F3A5C' },
      { token: 'delimiter', foreground: '64748B' },
    ],
    colors: {
      'editor.background': '#FFFFFF', 'editor.foreground': '#11233B',
      'editorLineNumber.foreground': '#B6BFCC', 'editorLineNumber.activeForeground': '#11233B',
      'editor.lineHighlightBackground': '#F7F6F3', 'editor.lineHighlightBorder': '#F7F6F3',
      'editorCursor.foreground': '#B8734D', 'editor.selectionBackground': '#F0DCCF', 'editor.inactiveSelectionBackground': '#F7ECE4',
      'editorIndentGuide.background1': '#EFEDE8', 'editorIndentGuide.activeBackground1': '#D8D4CA',
      'editorBracketMatch.background': '#F0DCCF', 'editorBracketMatch.border': '#B8734D',
    },
  })
}

interface Props {
  code: string
  onChange: (c: string) => void
  onSave: () => void
  onRun: () => void
  saveState: SaveState
  running: boolean
  saveError: string | null
  /** 1-based line to highlight (visualizer), or null */
  highlightLine?: number | null
}

export function EditorPanel({ code, onChange, onSave, onRun, saveState, running, saveError, highlightLine = null }: Props) {
  const [fontSize, setFontSize] = useState(14)
  // Monaco shortcuts are registered once; route them through refs so they always call the latest handlers.
  const handlers = useRef({ onSave, onRun })
  useEffect(() => { handlers.current = { onSave, onRun } })

  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const decorations = useRef<MonacoEditor.IEditorDecorationsCollection | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const ed = editorRef.current
    if (!ed || !ready) return
    decorations.current ??= ed.createDecorationsCollection()
    if (highlightLine && highlightLine <= (ed.getModel()?.getLineCount() ?? 0)) {
      decorations.current.set([{ range: { startLineNumber: highlightLine, startColumn: 1, endLineNumber: highlightLine, endColumn: 1 },
        options: { isWholeLine: true, className: 'trace-line', glyphMarginClassName: 'trace-glyph' } }])
      ed.revealLineInCenterIfOutsideViewport(highlightLine)
    } else decorations.current.clear()
  }, [highlightLine, ready])

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    setReady(true)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => handlers.current.onSave())
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => handlers.current.onRun())
  }

  const tone = saveState === 'dirty' ? 'text-copper-600' : saveState === 'error' ? 'text-bad' : 'text-slate-muted'
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-line bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="mr-1 hidden items-center gap-1.5 rounded-md bg-paper px-2.5 py-1 font-mono text-xs text-slate-muted sm:flex">
            <span aria-hidden className="h-2 w-2 rounded-full bg-copper" />solution.py
          </span>
          <button className="btn-accent !py-1.5" onClick={onRun} disabled={running} title={`Run tests (${MOD}+Enter)`}>{running ? 'Running…' : '▶ Run Code'}</button>
          <button className="btn-ghost !py-1.5" onClick={onSave} disabled={saveState === 'saved' || saveState === 'saving'} title={`Save (${MOD}+S)`}>Save Code</button>
          <span className="ml-1 hidden items-center gap-1.5 text-[11px] text-slate-muted xl:flex" aria-hidden>
            <span className="kbd">{MOD} ↵</span> run <span className="kbd">{MOD} S</span> save
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span data-testid="save-status" role="status" className={`flex items-center gap-1.5 ${tone} ${saveState === 'dirty' ? 'font-medium' : ''}`}>
            {saveState === 'dirty' && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-copper" />}
            {saveState === 'saved' && <span aria-hidden className="text-ok">✓</span>}
            {SAVE_LABEL[saveState]}
          </span>
          <span className="flex items-center gap-1 text-slate-muted" aria-label="Editor font size">
            <button aria-label="Decrease font size" className="rounded-md border border-line px-1.5 py-0.5 hover:bg-navy-50" onClick={() => setFontSize((s) => Math.max(11, s - 1))}>A−</button>
            <button aria-label="Increase font size" className="rounded-md border border-line px-1.5 py-0.5 hover:bg-navy-50" onClick={() => setFontSize((s) => Math.min(24, s + 1))}>A+</button>
          </span>
        </div>
      </div>
      {saveError && <p role="alert" className="border-b border-bad/20 bg-bad-50 px-3 py-1.5 text-xs text-bad">{saveError}</p>}
      <div className="min-h-0 flex-1" data-testid="editor">
        <Editor
          height="100%"
          language="python"
          value={code}
          theme="socratic"
          beforeMount={defineTheme}
          onChange={(v) => onChange(v ?? '')}
          onMount={onMount}
          options={{
            fontSize, minimap: { enabled: false }, lineNumbers: 'on', automaticLayout: true, tabSize: 4, insertSpaces: true,
            autoIndent: 'full', matchBrackets: 'always', bracketPairColorization: { enabled: true }, scrollBeyondLastLine: false,
            // The editor is for the student's own thinking: no AI / inline completions or auto-popups.
            inlineSuggest: { enabled: false }, quickSuggestions: false, suggestOnTriggerCharacters: false,
            wordBasedSuggestions: 'off', parameterHints: { enabled: false }, acceptSuggestionOnEnter: 'off', tabCompletion: 'off',
            padding: { top: 12, bottom: 12 }, glyphMargin: false, renderLineHighlight: 'line', overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true, guides: { indentation: true, highlightActiveIndentation: false },
            scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
            fontFamily: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace', fontLigatures: false,
          }}
        />
      </div>
    </div>
  )
}
