import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorMessage } from '../services/api'
import { getPythonRunner, type PythonRunner, type RunResult } from '../services/pythonRunner'
import type { ChatMessage, CodingSession, FailureDetail, Problem } from '../types/api'

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export function failuresFrom(result: RunResult): FailureDetail[] {
  return result.cases
    .filter((c) => !c.passed)
    .slice(0, 5)
    .map((c) => ({ test_id: c.id, input: clip(c.input, 500), expected: clip(c.expected, 500), actual: clip(c.actual, 500), error: clip(c.error ?? '', 800) }))
}

export interface Workspace {
  problem: Problem | null
  session: CodingSession | null
  loadError: string | null
  reload: () => void
  code: string
  setCode: (c: string) => void
  saveState: SaveState
  saveError: string | null
  save: () => Promise<boolean>
  savedCode: string
  markSaved: (code: string) => void
  running: boolean
  runResult: RunResult | null
  runNotice: string | null
  run: () => Promise<void>
  messages: ChatMessage[]
  sending: boolean
  chatError: string | null
  hintLevel: number
  sendChat: (text: string) => Promise<boolean>
  requestHint: () => Promise<void>
  reviewApproach: () => Promise<void>
}

export function useWorkspace(problemId: string, roadmapId: string | null, runner: PythonRunner = getPythonRunner()): Workspace {
  const [problem, setProblem] = useState<Problem | null>(null)
  const [session, setSession] = useState<CodingSession | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [code, setCodeState] = useState('')
  const [savedCode, setSavedCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<RunResult | null>(null)
  const [runNotice, setRunNotice] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [hintLevel, setHintLevel] = useState(0)
  const [nonce, setNonce] = useState(0)

  // Latest values for callbacks wired into Monaco shortcuts (which would otherwise capture stale closures).
  // The runner is infrastructure, not state: it stays out of effect dependencies so a new reference can never reload the session.
  const codeRef = useRef(code)
  const savedRef = useRef(savedCode)
  const runnerRef = useRef(runner)
  useEffect(() => { codeRef.current = code; savedRef.current = savedCode; runnerRef.current = runner })

  useEffect(() => {
    let cancelled = false
    setProblem(null); setSession(null); setLoadError(null); setRunResult(null); setRunNotice(null); setChatError(null); setSaveError(null)
    Promise.all([api.problem(problemId), api.openSession(problemId, roadmapId)])
      .then(([p, s]) => {
        if (cancelled) return
        setProblem(p); setSession(s); setCodeState(s.saved_code); setSavedCode(s.saved_code)
        setMessages(s.messages); setHintLevel(s.hint_level)
      })
      .catch((e) => { if (!cancelled) setLoadError(errorMessage(e)) })
    runnerRef.current.warmUp()
    return () => { cancelled = true }
  }, [problemId, roadmapId, nonce])

  const setCode = useCallback((c: string) => setCodeState(c), [])

  const save = useCallback(async () => {
    if (!session) return false
    const current = codeRef.current
    if (current === savedRef.current) return true
    setSaving(true); setSaveError(null)
    try {
      await api.saveCode(session.id, current)
      setSavedCode(current)
      setSession((s) => (s ? { ...s, saved_code: current } : s))
      return true
    } catch (e) {
      setSaveError(errorMessage(e))
      return false
    } finally {
      setSaving(false)
    }
  }, [session])

  const run = useCallback(async () => {
    if (!session || !problem) return
    const current = codeRef.current
    setRunning(true); setRunNotice(null)
    try {
      const result = await runnerRef.current.run({ code: current, signature: problem.function_signature, tests: problem.test_cases, comparison: problem.comparison })
      setRunResult(result)
      try {
        // The run is recorded against the exact code that ran; the server stores that code like a save.
        await api.submit({ session_id: session.id, code: current, passed_tests: result.passed, total_tests: result.total,
          execution_status: result.status, failures: failuresFrom(result) })
        setSavedCode(current)
      } catch (e) {
        setRunNotice(`Your results are shown, but they could not be recorded: ${errorMessage(e)}`)
      }
    } catch (e) {
      setRunResult(null)
      setRunNotice(e instanceof Error ? e.message : 'The Python runtime failed to start.')
    } finally {
      setRunning(false)
    }
  }, [session, problem])

  const ask = useCallback(async (body: { kind: 'chat' | 'hint' | 'review'; message?: string }) => {
    if (!session) return false
    setSending(true); setChatError(null)
    const current = codeRef.current
    try {
      // Only send code when the editor differs from what the server has, so it can sync before the tutor reads it.
      const res = await api.chat({ session_id: session.id, ...body, ...(current !== savedRef.current ? { code: current } : {}) })
      setSavedCode(current)
      setMessages((m) => [...m, res.user_message, res.assistant_message])
      setHintLevel(res.hint_level)
      return true
    } catch (e) {
      setChatError(errorMessage(e))
      return false
    } finally {
      setSending(false)
    }
  }, [session])

  const saveState: SaveState = saving ? 'saving' : saveError ? 'error' : code !== savedCode ? 'dirty' : 'saved'

  return {
    problem, session, loadError, reload: () => setNonce((n) => n + 1),
    code, setCode, saveState, saveError, save, savedCode, markSaved: setSavedCode, running, runResult, runNotice, run,
    messages, sending, chatError, hintLevel,
    sendChat: (text) => ask({ kind: 'chat', message: text }),
    requestHint: async () => { await ask({ kind: 'hint' }) },
    reviewApproach: async () => { await ask({ kind: 'review' }) },
  }
}
