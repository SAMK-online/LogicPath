import { describe, expect, it } from 'vitest'
import { describe as say, diffArray } from './commands'
import type { Snap } from './trace'

const list = (...v: Snap[]): Snap => ({ t: 'list', n: v.length, v })
const vals = (s: Snap) => (s as { v: Snap[] }).v

describe('diffArray', () => {
  it('creates the array and its pointers on the first step', () => {
    const cmds = diffArray('a', undefined, vals(list(1, 2)), undefined, { i: 0 })
    expect(cmds.map((c) => c.command)).toEqual(['CREATE_ARRAY', 'SET_POINTER'])
  })

  it('recognises a swap, a value change, appends and removals', () => {
    expect(diffArray('a', list(1, 2, 3), vals(list(3, 2, 1)), {}, {})).toEqual([{ command: 'SWAP', id: 'a', a: 0, b: 2 }])
    expect(diffArray('a', list(1, 2, 3), vals(list(1, 9, 3)), {}, {})[0]).toMatchObject({ command: 'SET_VALUE', index: 1, from: 2, value: 9 })
    expect(diffArray('a', list(1), vals(list(1, 5)), {}, {})).toEqual([{ command: 'APPEND', id: 'a', index: 1, value: 5 }])
    expect(diffArray('a', list(1, 5), vals(list(1)), {}, {})).toEqual([{ command: 'REMOVE', id: 'a', index: 1 }])
  })

  it('moves, sets and removes pointers', () => {
    const cmds = diffArray('a', list(1, 2, 3), vals(list(1, 2, 3)), { lo: 0, gone: 1 }, { lo: 2, hi: 1 })
    expect(cmds).toEqual([
      { command: 'MOVE_POINTER', id: 'a', name: 'lo', from: 0, to: 2 },
      { command: 'SET_POINTER', id: 'a', name: 'hi', index: 1 },
      { command: 'REMOVE_POINTER', id: 'a', name: 'gone' },
    ])
  })

  it('reports nothing when nothing changed', () => {
    expect(diffArray('a', list(1, 2), vals(list(1, 2)), { i: 1 }, { i: 1 })).toEqual([])
  })
})

describe('describe', () => {
  it('words pointers that leave the array and skips creation', () => {
    expect(say({ command: 'MOVE_POINTER', id: 'a', name: 'hi', from: 0, to: -1 }, 3)).toBe('hi moves from 0 to -1, outside the array')
    expect(say({ command: 'CREATE_ARRAY', id: 'a', values: [] }, 0)).toBeNull()
  })
})
