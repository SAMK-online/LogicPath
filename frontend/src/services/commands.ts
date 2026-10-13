/**
 * Animation commands for the visualizer.
 *
 * The commands are derived deterministically from two consecutive snapshots of the STUDENT's own trace. Nothing here comes from a
 * model, and nothing describes a better algorithm: a command only says what changed between this step and the one before.
 */
import { fmt, isList, same, type Snap } from './trace'

export type Command =
  | { command: 'CREATE_ARRAY'; id: string; values: Snap[] }
  | { command: 'SET_VALUE'; id: string; index: number; from: Snap; value: Snap }
  | { command: 'SWAP'; id: string; a: number; b: number }
  | { command: 'APPEND'; id: string; index: number; value: Snap }
  | { command: 'REMOVE'; id: string; index: number }
  | { command: 'SET_POINTER'; id: string; name: string; index: number }
  | { command: 'MOVE_POINTER'; id: string; name: string; from: number; to: number }
  | { command: 'REMOVE_POINTER'; id: string; name: string }

export type PointerMap = Record<string, number>

const items = (s: Snap | undefined): Snap[] | undefined => (s !== undefined && isList(s) ? s.v : undefined)

/** What changed in one array between two steps. `prev` is undefined on the first step the array is seen. */
export function diffArray(id: string, prev: Snap | undefined, cur: Snap[], prevPointers: PointerMap | undefined, pointers: PointerMap): Command[] {
  const out: Command[] = []
  const before = items(prev)
  if (!before) {
    out.push({ command: 'CREATE_ARRAY', id, values: cur })
  } else {
    for (let i = before.length; i < cur.length; i++) out.push({ command: 'APPEND', id, index: i, value: cur[i] })
    for (let i = before.length - 1; i >= cur.length; i--) out.push({ command: 'REMOVE', id, index: i })
    const changed: number[] = []
    for (let i = 0; i < Math.min(before.length, cur.length); i++) if (!same(before[i], cur[i])) changed.push(i)
    if (changed.length === 2 && same(before[changed[0]], cur[changed[1]]) && same(before[changed[1]], cur[changed[0]])) {
      out.push({ command: 'SWAP', id, a: changed[0], b: changed[1] })
    } else {
      for (const i of changed) out.push({ command: 'SET_VALUE', id, index: i, from: before[i], value: cur[i] })
    }
  }
  for (const [name, index] of Object.entries(pointers)) {
    const was = prevPointers?.[name]
    if (was === undefined) out.push({ command: 'SET_POINTER', id, name, index })
    else if (was !== index) out.push({ command: 'MOVE_POINTER', id, name, from: was, to: index })
  }
  for (const name of Object.keys(prevPointers ?? {})) if (!(name in pointers)) out.push({ command: 'REMOVE_POINTER', id, name })
  return out
}

/** A plain-language line for one command, or null when there is nothing worth saying. Describes the change, never the reason. */
export function describe(c: Command, length: number): string | null {
  switch (c.command) {
    case 'CREATE_ARRAY': return null
    case 'SET_VALUE': return `index ${c.index} changes from ${fmt(c.from, 20)} to ${fmt(c.value, 20)}`
    case 'SWAP': return `index ${c.a} and index ${c.b} swap values`
    case 'APPEND': return `${fmt(c.value, 20)} is added at index ${c.index}`
    case 'REMOVE': return `index ${c.index} is removed`
    case 'SET_POINTER': return c.index >= 0 && c.index < length ? `${c.name} points at index ${c.index}` : `${c.name} is ${c.index}, outside the array`
    case 'MOVE_POINTER': return c.to >= 0 && c.to < length ? `${c.name} moves from ${c.from} to ${c.to}` : `${c.name} moves from ${c.from} to ${c.to}, outside the array`
    case 'REMOVE_POINTER': return `${c.name} is no longer an index`
  }
}
