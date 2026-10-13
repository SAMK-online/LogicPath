/** A student's own experimental test cases. They live in memory only: never sent to the server, never counted as progress. */
import type { FunctionSignature, TestCase } from '../types/api'

export const MAX_CUSTOM_CASES = 10
export const MAX_FIELD_CHARS = 5000
const JSON_HELP = 'Use JSON: numbers like 5, lists like [1, 2, 3], text in "quotes", and true, false or null.'

type Parsed = { ok: true; value: unknown } | { ok: false; error: string }

/** The test data format uses {"$gen": ...} to ask the worker to generate huge inputs; a hand-typed case must not be able to. */
export function containsGen(v: unknown): boolean {
  if (Array.isArray(v)) return v.some(containsGen)
  if (v !== null && typeof v === 'object') return Object.entries(v).some(([k, x]) => k === '$gen' || containsGen(x))
  return false
}

export function parseField(text: string, type: string): Parsed {
  const t = text.trim()
  if (!t) return { ok: false, error: 'Enter a value.' }
  if (t.length > MAX_FIELD_CHARS) return { ok: false, error: `Too long: keep it under ${MAX_FIELD_CHARS} characters.` }
  let value: unknown
  try {
    value = JSON.parse(t)
  } catch {
    if (type === 'str') return { ok: true, value: text } // a plain word is fine for a text parameter
    return { ok: false, error: `Not valid. ${JSON_HELP}` }
  }
  if (containsGen(value)) return { ok: false, error: 'This format is not allowed here.' }
  return { ok: true, value }
}

export type BuildResult = { case: TestCase; errors?: undefined } | { case?: undefined; errors: Record<string, string> }

/** Turn the form's text fields into a test case. An empty expected field makes it an unjudged experiment. */
export function buildCase(sig: FunctionSignature, texts: Record<string, string>, expectedText: string, id: number): BuildResult {
  const errors: Record<string, string> = {}
  const args: unknown[] = []
  for (const p of sig.params) {
    const r = parseField(texts[p.name] ?? '', p.type)
    if (r.ok) args.push(r.value)
    else errors[p.name] = r.error
  }
  let expected: unknown = null
  const hasExpected = expectedText.trim() !== ''
  if (hasExpected) {
    const r = parseField(expectedText, sig.return_type)
    if (r.ok) expected = r.value
    else errors.expected = r.error
  }
  if (Object.keys(errors).length) return { errors }
  return { case: { id, args, expected, label: `Custom ${-id}`, ...(hasExpected ? {} : { unchecked: true }) } }
}

export const isCustom = (t: Pick<TestCase, 'id'>) => t.id < 0
export const caseName = (t: Pick<TestCase, 'id'>) => (isCustom(t) ? `Custom ${-t.id}` : `#${t.id}`)
