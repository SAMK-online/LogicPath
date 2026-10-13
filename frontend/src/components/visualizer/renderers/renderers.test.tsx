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
    expect(screen.getByText('▲ lo,i')).toBeInTheDocument()
    expect(screen.getByText('▲ hi')).toBeInTheDocument()
  })

  it('highlights only the cells that changed', () => {
    render(<ArrayView value={list(1, 9, 3)} prev={list(1, 2, 3)} />)
    expect(screen.getByLabelText('index 1: 9').className).toContain('bg-copper-50')
    expect(screen.getByLabelText('index 0: 1').className).not.toContain('bg-copper-50')
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
