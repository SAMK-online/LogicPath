import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../services/api'
import { roadmap } from '../test/fixtures'
import { apiMock } from '../test/mockApi'
import { RoadmapPage } from './RoadmapPage'

vi.mock('../services/api', async (orig) => ({ ...(await orig<typeof import('../services/api')>()), api: (await import('../test/mockApi')).apiMock }))

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname + l.search}</div> }
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/roadmaps/dsa-fundamentals']}>
      <Routes>
        <Route path="/roadmaps/:roadmapId" element={<RoadmapPage />} />
        <Route path="/workspace/:problemId" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => { vi.clearAllMocks(); apiMock.roadmap.mockResolvedValue(roadmap) })

describe('roadmap navigation', () => {
  it('shows the title, ordered topics, difficulty, status and progress', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'DSA Fundamentals' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1. Hash maps' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '2. Heap' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Roadmap progress' })).toHaveAttribute('aria-valuenow', '33')
    expect(screen.getByText('1 of 3 completed')).toBeInTheDocument()
    expect(screen.getByLabelText('Completed')).toBeInTheDocument()
    expect(screen.getAllByText('Easy').length).toBe(2)
  })

  it('opens a problem in the workspace carrying the roadmap context', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('link', { name: /Two Sum/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/workspace/two-sum?roadmap=dsa-fundamentals')
  })

  it('"Continue Learning" goes to the next unfinished problem', async () => {
    renderPage()
    await userEvent.click(await screen.findByRole('link', { name: 'Continue Learning' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/workspace/two-sum?roadmap=dsa-fundamentals')
  })

  it('lists unavailable problems as "coming soon" and not as links', async () => {
    renderPage()
    await screen.findByText('Find Median from Data Stream')
    expect(screen.queryByRole('link', { name: /Find Median/ })).not.toBeInTheDocument()
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
  })

  it('shows an error with retry when loading fails', async () => {
    apiMock.roadmap.mockRejectedValueOnce(new ApiError(0, 'network_error', 'Cannot reach the server.'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('heading', { name: 'DSA Fundamentals' })).toBeInTheDocument()
  })
})
