import { useCallback, useRef, useState } from 'react'
import type { CaseResult, PythonRunner } from '../services/pythonRunner'
import { MAX_CUSTOM_CASES } from '../services/customCases'
import type { Problem, TestCase } from '../types/api'

export interface CustomCases {
  cases: TestCase[]
  results: Record<number, CaseResult>
  running: boolean
  notice: string | null
  canAdd: boolean
  add: (build: (id: number) => TestCase) => void
  remove: (id: number) => void
  run: (ids?: number[]) => Promise<void>
}

/**
 * Experimental cases the student types in. Everything stays in memory and runs in the browser: nothing is saved,
 * recorded as a submission or counted toward progress. Negative ids keep them apart from the problem's own tests.
 */
export function useCustomCases(problem: Problem | null, runner: PythonRunner, getCode: () => string): CustomCases {
  const [cases, setCases] = useState<TestCase[]>([])
  const [results, setResults] = useState<Record<number, CaseResult>>({})
  const [running, setRunning] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const nextId = useRef(-1)
  const casesRef = useRef(cases)
  casesRef.current = cases

  const add = useCallback((build: (id: number) => TestCase) => {
    if (casesRef.current.length >= MAX_CUSTOM_CASES) return
    const id = nextId.current--
    setCases((c) => [...c, build(id)])
  }, [])

  const remove = useCallback((id: number) => {
    setCases((c) => c.filter((t) => t.id !== id))
    setResults((r) => { const { [id]: _gone, ...rest } = r; return rest })
  }, [])

  const run = useCallback(async (ids?: number[]) => {
    if (!problem) return
    const tests = casesRef.current.filter((t) => !ids || ids.includes(t.id))
    if (tests.length === 0) return
    setRunning(true); setNotice(null)
    try {
      const res = await runner.run({ code: getCode(), signature: problem.function_signature, tests, comparison: problem.comparison })
      setResults((r) => ({ ...r, ...Object.fromEntries(res.cases.map((c) => [c.id, c])) }))
      if (res.error) setNotice(res.error)
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'The Python runtime failed to start.')
    } finally {
      setRunning(false)
    }
  }, [problem, runner, getCode])

  return { cases, results, running, notice, canAdd: cases.length < MAX_CUSTOM_CASES, add, remove, run }
}
