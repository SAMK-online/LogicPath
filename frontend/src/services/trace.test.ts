import { describe, expect, it } from 'vitest'
import { trace } from '../test/fixtures'
import {
  captionAt, changedVars, compactTrace, fmt, fromJson, inferViews, kindOfSnap, MAX_COMPACT_STEPS, parseSpec, varKinds, type Snap, type Trace,
} from './trace'

describe('formatting and conversion', () => {
  it('formats snapshots like Python', () => {
    expect(fmt(null)).toBe('None')
    expect(fmt(true)).toBe('True')
    expect(fmt({ t: 'list', n: 2, v: [1, 'a'] })).toBe('[1, "a"]')
    expect(fmt({ t: 'list', n: 99, v: [1] })).toBe('[1, …]')
    expect(fmt({ t: 'dict', n: 1, v: [[2, 0]] })).toBe('{2: 0}')
    expect(fmt({ t: 'tree', v: [1, null, 2] })).toBe('Tree(1, None, 2)')
    expect(fmt({ t: 'list', n: 5, v: [1, 2, 3, 4, 5] }, 8)).toHaveLength(8)
  })

  it('converts raw test data and tree inputs', () => {
    expect(fromJson([1, [2]])).toEqual({ t: 'list', n: 2, v: [1, { t: 'list', n: 1, v: [2] }] })
    expect(fromJson([3, null, 4], 'Optional[TreeNode]')).toEqual({ t: 'tree', v: [3, null, 4] })
    expect(fromJson({ a: 1 })).toEqual({ t: 'dict', n: 1, v: [['a', 1]] })
    expect(kindOfSnap(3)).toBe('int'); expect(kindOfSnap(3.5)).toBe('float'); expect(kindOfSnap({ t: 'tuple', n: 0, v: [] })).toBe('list')
  })

  it('detects which variables changed between steps', () => {
    const [, s1, s2, s3] = trace.steps
    expect([...changedVars(undefined, s1)].sort()).toEqual(['nums', 'seen', 'target'])
    expect([...changedVars(s1, s2)]).toEqual(['i'])
    expect([...changedVars(s2, s3)]).toEqual(['seen'])
  })
})

describe('view inference', () => {
  it('maps lists→array, dicts→map and attaches pointer variables to the first array', () => {
    const views = inferViews(trace)
    expect(views.map((v) => [v.var, v.kind])).toEqual([['nums', 'array'], ['seen', 'map']])
    expect(views[0].pointers).toEqual(['i'])
    expect(varKinds(trace)).toMatchObject({ nums: 'list', target: 'int', seen: 'dict', i: 'int' })
  })

  it('recognises strings, stacks and trees, and caps at six views', () => {
    const t: Trace = { ...trace, args: ['s'], steps: [{ line: 1, event: 'line', depth: 1, locals: {
      s: 'abc', stack: { t: 'list', n: 0, v: [] }, root: { t: 'tree', v: [1] }, a: { t: 'list', n: 0, v: [] }, b: { t: 'list', n: 0, v: [] },
      c: { t: 'list', n: 0, v: [] }, d: { t: 'list', n: 0, v: [] }, k: 1 } }] }
    const views = inferViews(t)
    expect(views[0]).toMatchObject({ var: 's', kind: 'string', pointers: ['k'] })
    expect(views.find((v) => v.var === 'stack')?.kind).toBe('stack')
    expect(views.find((v) => v.var === 'root')?.kind).toBe('tree')
    expect(views.length).toBe(6)
  })

  it('a later non-None value decides the kind', () => {
    const t: Trace = { ...trace, steps: [
      { line: 1, event: 'line', depth: 1, locals: { best: null } }, { line: 2, event: 'line', depth: 1, locals: { best: 3 } }] }
    expect(varKinds(t).best).toBe('int')
  })
})

describe('compactTrace (what is sent to the AI)', () => {
  it('keeps small traces whole, with short values', () => {
    const c = compactTrace(trace)
    expect(c.steps).toHaveLength(6)
    expect(c.steps[2]).toEqual({ i: 2, line: 3, vars: { nums: '[2, 7, 11]', target: '9', seen: '{}', i: '0' } })
    expect(c.total_steps).toBe(6)
    expect(c.result).toBe('[0, 1]')
    expect(c.var_kinds.nums).toBe('list')
  })

  it('downsamples long traces to ≤60 steps, always keeping the first and last, and bounds variables', () => {
    const many: Trace = { ...trace, steps: Array.from({ length: 500 }, (_, i) => ({
      line: i % 7 + 1, event: 'line' as const, depth: 1,
      locals: { ...Object.fromEntries(Array.from({ length: 12 }, (_, k) => [`v${k}`, 'x'.repeat(200)])), nums: { t: 'list' as const, n: 1, v: [i] } } })) }
    const c = compactTrace(many)
    expect(c.steps.length).toBeLessThanOrEqual(MAX_COMPACT_STEPS)
    expect(c.steps[0].i).toBe(0)
    expect(c.steps.at(-1)!.i).toBe(499)
    expect(c.total_steps).toBe(500)
    expect(Object.keys(c.steps[3].vars).length).toBeLessThanOrEqual(8)
    expect(Object.values(c.steps[3].vars).every((v) => v.length <= 60)).toBe(true)
    expect(Object.keys(c.steps[3].vars)).toContain('nums') // arguments are prioritised
    expect(Object.keys(c.var_kinds).length).toBeLessThanOrEqual(12)
  })

  it('never sends non-identifier variable names', () => {
    const t: Trace = { ...trace, steps: [{ line: 1, event: 'line', depth: 1, locals: { 'bad name': 1, ok: 2 } }] }
    expect(Object.keys(compactTrace(t).steps[0].vars)).toEqual(['ok'])
  })
})

describe('parseSpec (defence in depth for the AI spec)', () => {
  const good = { views: [{ var: 'nums', kind: 'array', pointers: ['i'] }, { var: 'seen', kind: 'map' }], captions: [{ step: 2, text: 'i moved.' }], summary: 'Short.' }
  const known = new Set(['nums', 'seen', 'i', 'target'])

  it('accepts a valid spec', () => {
    expect(parseSpec(good, known)).toEqual(good)
  })

  it.each([
    ['not an object', 'x'], ['no views', { views: [] }], ['too many views', { views: Array.from({ length: 7 }, () => ({ var: 'a', kind: 'array' })) }],
    ['unknown kind', { views: [{ var: 'nums', kind: 'hologram' }] }], ['bad identifier', { views: [{ var: 'a b', kind: 'array' }] }],
    ['too many captions', { views: good.views, captions: Array.from({ length: 41 }, () => ({ step: 0, text: 'x' })) }],
    ['bad caption shape', { views: good.views, captions: [{ step: 'one', text: 'x' }] }],
  ])('rejects: %s', (_n, raw) => expect(parseSpec(raw, known)).toBeNull())

  it('drops unknown variables and pointers, and returns null if nothing is left', () => {
    expect(parseSpec({ views: [{ var: 'ghost', kind: 'array' }, { var: 'nums', kind: 'array', pointers: ['ghost', 'i'] }] }, known)?.views).toEqual([{ var: 'nums', kind: 'array', pointers: ['i'] }])
    expect(parseSpec({ views: [{ var: 'ghost', kind: 'array' }] }, known)).toBeNull()
  })

  it('drops captions/summary/titles that contain markup instead of rendering them', () => {
    const s = parseSpec({ views: [{ var: 'nums', kind: 'array', title: '<b>x</b>' }], summary: '<script>x</script>',
      captions: [{ step: 0, text: '<img src=x>' }, { step: 1, text: 'fine' }, { step: 2, text: 'a'.repeat(161) }, { step: 3, text: 'use ```code```' }] }, known)!
    expect(s.captions).toEqual([{ step: 1, text: 'fine' }])
    expect(s.summary).toBeUndefined()
    expect(s.views[0].title).toBeUndefined()
  })

  it('captionAt returns the latest caption at or before a step', () => {
    const spec = parseSpec({ views: good.views, captions: [{ step: 1, text: 'one' }, { step: 4, text: 'four' }] })!
    expect([0, 1, 3, 4, 9].map((i) => captionAt(spec, i))).toEqual([null, 'one', 'one', 'four', 'four'])
    expect(captionAt(null, 3)).toBeNull()
  })
})

describe('snapshots stay plain data', () => {
  it('survives a JSON round trip', () => {
    const s: Snap = { t: 'dict', n: 1, v: [['a', { t: 'list', n: 1, v: [1] }]] }
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
  })
})
