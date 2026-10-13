import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Snap } from '../../../services/trace'
import { ArrayView } from './ArrayView'
import { ListView } from './ListView'
import { MapView } from './MapView'
import { StackView } from './StackView'
import { buildTree, TreeView } from './TreeView'
import { ViewRenderer } from './ViewRenderer'

const list = (...v: Snap[]): Snap => ({ t: 'list', n: v.length, v })

describe('ArrayView', () => {
  it('draws one cell per item with indexes and pointer markers', () => {
    render(<ArrayView value={list(2, 7, 11)} pointers={[{ name: 'lo', index: 0 }, { name: 'i', index: 0 }, { name: 'hi', index: 2 }]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByLabelText('index 1: 7')).toBeInTheDocument()
    expect(screen.getByText('▲ lo')).toBeInTheDocument()
    expect(screen.getByText('▲ i')).toBeInTheDocument()
    expect(screen.getByText('▲ hi')).toBeInTheDocument()
  })

  it('highlights only the cells that changed', () => {
    render(<ArrayView value={list(1, 9, 3)} prev={list(1, 2, 3)} />)
    expect(screen.getByLabelText('index 1: 9')).toHaveAttribute('data-changed', 'true')
    expect(screen.getByLabelText('index 0: 1')).toHaveAttribute('data-changed', 'false')
  })

  it('notes pointers that are outside the array and truncated lists', () => {
    render(<ArrayView value={{ t: 'list', n: 500, v: [1, 2] }} pointers={[{ name: 'hi', index: -1 }, { name: 'lo', index: 9 }]} />)
    expect(screen.getByText(/Outside the array: hi=-1, lo=9/)).toBeInTheDocument()
    expect(screen.getByText('… 500 total')).toBeInTheDocument()
  })

  it('draws a string as characters and tolerates non-lists', () => {
    const { rerender } = render(<ArrayView value="abc" asString pointers={[{ name: 'i', index: 2 }]} />)
    expect(screen.getByLabelText('index 2: "c"')).toBeInTheDocument()
    rerender(<ArrayView value={5} />)
    expect(screen.getByText(/Not a list right now/)).toBeInTheDocument()
  })
})

describe('ArrayView commands', () => {
  it('draws an arc and says so when two cells swap', () => {
    render(<ArrayView value={list(3, 2, 1)} prev={list(1, 2, 3)} />)
    expect(screen.getAllByTestId('swap-arc')).toHaveLength(1)
    expect(screen.getByTestId('actions')).toHaveTextContent('index 0 and index 2 swap values')
  })

  it('describes pointer moves and value changes without drawing a swap', () => {
    render(<ArrayView value={list(1, 9, 3)} prev={list(1, 2, 3)} pointers={[{ name: 'lo', index: 2 }]} prevPointers={[{ name: 'lo', index: 0 }]} />)
    expect(screen.queryByTestId('swap-arc')).not.toBeInTheDocument()
    expect(screen.getByTestId('actions')).toHaveTextContent('index 1 changes from 2 to 9; lo moves from 0 to 2')
  })

  it('stays quiet on the first step', () => {
    render(<ArrayView value={list(1, 2)} pointers={[{ name: 'i', index: 0 }]} />)
    expect(screen.queryByTestId('actions')).not.toBeInTheDocument()
  })
})

describe('MapView / StackView / ListView', () => {
  it('shows dict rows and highlights new or changed keys', () => {
    const prev: Snap = { t: 'dict', n: 1, v: [[2, 0]] }
    const cur: Snap = { t: 'dict', n: 2, v: [[2, 0], [7, 1]] }
    render(<MapView value={cur} prev={prev} />)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0].className).not.toContain('bg-copper-50')
    expect(rows[1].className).toContain('bg-copper-50')
    expect(within(rows[1]).getByText('7')).toBeInTheDocument()
  })

  it('shows sets as keys only and empty maps', () => {
    const { rerender } = render(<MapView value={{ t: 'set', n: 2, v: [1, 2] }} />)
    expect(screen.queryByText('value')).not.toBeInTheDocument()
    rerender(<MapView value={{ t: 'dict', n: 0, v: [] }} />)
    expect(screen.getByText('Empty')).toBeInTheDocument()
  })

  it('draws the stack with the last item on top', () => {
    render(<StackView value={list('(', '[', '{')} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('"{"')
    expect(items[0]).toHaveTextContent('top')
    expect(items[2]).toHaveTextContent('"("')
    expect(StackView({ value: list() })).toBeTruthy()
  })

  it('draws a linked list ending in None', () => {
    render(<ListView value={list(1, 2)} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('None')).toBeInTheDocument()
  })
})

describe('TreeView', () => {
  it('builds a tree from a level-order list with missing children', () => {
    const root = buildTree([3, 9, 20, null, null, 15, 7])!
    expect(root.label).toBe('3')
    expect(root.left?.label).toBe('9')
    expect(root.right?.left?.label).toBe('15')
    expect(root.left?.left).toBeUndefined()
    expect(buildTree([])).toBeNull()
    expect(buildTree([null])).toBeNull()
  })

  it('renders one circle per node and one edge per parent-child link', () => {
    const { container } = render(<TreeView value={{ t: 'tree', v: [1, 2, 3, null, 4] }} />)
    expect(container.querySelectorAll('circle')).toHaveLength(4)
    expect(container.querySelectorAll('line')).toHaveLength(3)
    expect(screen.getByRole('img')).toHaveAccessibleName(/binary tree with 4 nodes/)
  })

  it('handles empty and non-tree values', () => {
    const { rerender } = render(<TreeView value={{ t: 'tree', v: [] }} />)
    expect(screen.getByText(/Empty tree/)).toBeInTheDocument()
    rerender(<TreeView value={3} />)
    expect(screen.getByText(/Not a tree right now/)).toBeInTheDocument()
  })
})

describe('ViewRenderer', () => {
  it('dispatches by kind and resolves pointer variables from the step', () => {
    render(<ViewRenderer view={{ var: 'nums', kind: 'array', pointers: ['i'] }} step={{ locals: { nums: list(5, 6), i: 1 } }} />)
    expect(screen.getByRole('region', { name: 'nums (array)' })).toBeInTheDocument()
    expect(screen.getByText('▲ i')).toBeInTheDocument()
  })

  it('says so when the variable is not defined yet, and shows scalars', () => {
    const { rerender } = render(<ViewRenderer view={{ var: 'seen', kind: 'map' }} step={{ locals: {} }} />)
    expect(screen.getByText('Not defined yet at this step.')).toBeInTheDocument()
    rerender(<ViewRenderer view={{ var: 'total', kind: 'scalar' }} step={{ locals: { total: 42 } }} />)
    expect(screen.getByText('42')).toBeInTheDocument()
  })
})

describe('linked lists and graphs', () => {
  const step = (locals: Record<string, Snap>) => ({ locals })
  const pairs = (...e: [number, number][]): Snap => ({ t: 'list', n: e.length, v: e.map(([a, b]) => ({ t: 'list', n: 2, v: [a, b] }) as Snap) })

  it('draws a linked list ending in None, and marks one that never ends', () => {
    const { rerender } = render(<ViewRenderer view={{ var: 'head', kind: 'list' }} step={step({ head: { t: 'linked', n: 3, v: [1, 2, 3] } })} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('None')).toBeInTheDocument()
    rerender(<ViewRenderer view={{ var: 'head', kind: 'list' }} step={step({ head: { t: 'linked', n: 1, v: [1], more: true } })} />)
    expect(screen.getByText(/loops back/)).toBeInTheDocument()
  })

  it('draws a graph with the nodes the code is on and the nodes it has marked', () => {
    const view = { var: 'edges', kind: 'graph' as const, pointers: ['node'] }
    render(<ViewRenderer view={view} step={step({
      n: 4, edges: pairs([0, 1], [1, 2]), node: 1, seen: { t: 'set', n: 2, v: [0, 1] },
    })} />)
    const scene = screen.getByTestId('graph-scene')
    expect(scene.querySelectorAll('line')).toHaveLength(2)
    expect(scene.querySelector('[data-node="1"]')).toHaveAttribute('data-state', 'current')
    expect(scene.querySelector('[data-node="0"]')).toHaveAttribute('data-state', 'visited')
    expect(scene.querySelector('[data-node="3"]')).toHaveAttribute('data-state', 'idle') // n = 4 makes node 3 exist even without edges
    expect(screen.getByText(/4 nodes, 2 edges/)).toBeInTheDocument()
  })

  it('reads a list of booleans as marked nodes and an adjacency dict as edges', () => {
    render(<ViewRenderer view={{ var: 'adj', kind: 'graph' }} step={step({
      adj: { t: 'dict', n: 2, v: [[0, { t: 'list', n: 1, v: [1] }], [1, { t: 'list', n: 1, v: [0] }]] }, visited: { t: 'list', n: 2, v: [true, false] },
    })} />)
    const scene = screen.getByTestId('graph-scene')
    expect(scene.querySelectorAll('line')).toHaveLength(1) // an undirected edge is listed twice but drawn once
    expect(scene.querySelector('[data-node="0"]')).toHaveAttribute('data-state', 'visited')
    expect(scene.querySelector('[data-node="1"]')).toHaveAttribute('data-state', 'idle')
  })
})
