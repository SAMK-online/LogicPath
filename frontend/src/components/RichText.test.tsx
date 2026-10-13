import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RichText } from './RichText'

describe('RichText', () => {
  it('renders bold, inline code, lists and fenced code', () => {
    const { container } = render(<RichText text={'Use **bold** and `x`.\n\n- one\n- two\n\n```\nprint(1)\n```'} />)
    expect(container.querySelector('strong')).toHaveTextContent('bold')
    expect(container.querySelectorAll('code').length).toBe(2)
    expect(container.querySelectorAll('li').length).toBe(2)
    expect(container.querySelector('pre')).toHaveTextContent('print(1)')
  })

  it('never turns model/problem text into HTML', () => {
    const { container } = render(<RichText text={'<img src=x onerror="alert(1)"> <script>alert(2)</script>'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText(/<img src=x/)).toBeInTheDocument()
  })
})
