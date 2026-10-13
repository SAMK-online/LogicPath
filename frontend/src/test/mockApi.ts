import { vi } from 'vitest'

/** Replace only the `api` object of services/api (keep ApiError/errorMessage real). */
export const apiMock = {
  register: vi.fn(), login: vi.fn(), logout: vi.fn(), me: vi.fn(), roadmaps: vi.fn(), roadmap: vi.fn(), problem: vi.fn(),
  openSession: vi.fn(), getSession: vi.fn(), saveCode: vi.fn(), chat: vi.fn(), progress: vi.fn(), submit: vi.fn(), visualize: vi.fn(),
}
