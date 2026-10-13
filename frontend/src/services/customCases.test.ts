import { describe, expect, it } from 'vitest'
import type { FunctionSignature } from '../types/api'
import { buildCase, caseName, containsGen, parseField } from './customCases'

const twoSum: FunctionSignature = { name: 'two_sum', params: [{ name: 'nums', type: 'List[int]' }, { name: 'target', type: 'int' }], return_type: 'List[int]' }
const anagram: FunctionSignature = { name: 'is_anagram', params: [{ name: 's', type: 'str' }, { name: 't', type: 'str' }], return_type: 'bool' }

describe('parseField', () => {
  it('reads JSON values', () => {
    expect(parseField('[1, 2, 3]', 'List[int]')).toEqual({ ok: true, value: [1, 2, 3] })
    expect(parseField(' 7 ', 'int')).toEqual({ ok: true, value: 7 })
    expect(parseField('null', 'Optional[int]')).toEqual({ ok: true, value: null })
  })
  it('accepts a bare word for a text parameter only', () => {
    expect(parseField('listen', 'str')).toEqual({ ok: true, value: 'listen' })
    expect(parseField('listen', 'int')).toMatchObject({ ok: false })
  })
  it('rejects empty, oversized and generator input', () => {
    expect(parseField('  ', 'int')).toMatchObject({ ok: false })
    expect(parseField('1'.repeat(6000), 'int')).toMatchObject({ ok: false, error: expect.stringContaining('Too long') })
    expect(parseField('{"$gen": "range", "n": 100000000}', 'List[int]')).toMatchObject({ ok: false })
    expect(parseField('[[{"$gen": "x"}]]', 'List[int]')).toMatchObject({ ok: false })
  })
})

describe('containsGen', () => {
  it('finds the key at any depth and ignores lookalike values', () => {
    expect(containsGen({ a: [{ $gen: 1 }] })).toBe(true)
    expect(containsGen(['$gen', { b: '$gen' }])).toBe(false)
  })
})

describe('buildCase', () => {
  it('builds a judged case when expected is given', () => {
    const r = buildCase(twoSum, { nums: '[2, 7]', target: '9' }, '[0, 1]', -1)
    expect(r.case).toEqual({ id: -1, args: [[2, 7], 9], expected: [0, 1], label: 'Custom 1' })
  })
  it('builds an unjudged experiment when expected is empty', () => {
    const r = buildCase(anagram, { s: 'abc', t: 'cab' }, '  ', -2)
    expect(r.case).toMatchObject({ args: ['abc', 'cab'], unchecked: true, label: 'Custom 2' })
  })
  it('reports every bad field at once', () => {
    const r = buildCase(twoSum, { nums: '[1,', target: '' }, 'x', -1)
    expect(Object.keys(r.errors ?? {}).sort()).toEqual(['expected', 'nums', 'target'])
  })
})

it('names cases', () => {
  expect(caseName({ id: -3 })).toBe('Custom 3')
  expect(caseName({ id: 4 })).toBe('#4')
})
