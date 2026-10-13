import type {
  AuthOut, ChatRequest, ChatResponse, CodeSaveOut, CodingSession, Problem, Progress, RoadmapDetail,
  RoadmapSummary, SubmissionCreate, SubmissionResult, VisualizeRequest, VisualizeResponse,
} from '../types/api'

export class ApiError extends Error {
  status: number
  code: string
  details?: { field: string; message: string }[]
  retryAfter?: number
  constructor(status: number, code: string, message: string, details?: ApiError['details'], retryAfter?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.retryAfter = retryAfter
  }
}

let csrfToken: string | null = null
let onUnauthorized: (() => void) | null = null

export const setCsrfToken = (t: string | null) => { csrfToken = t }
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn }

const BASE = import.meta.env.VITE_API_BASE_URL ?? '' // same-origin by default (Vite proxies /api in dev)

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken

  let res: Response
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method, headers, credentials: 'include', body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'network_error', 'Cannot reach the server. Check your connection and try again.')
  }
  if (res.status === 204) return undefined as T

  let data: unknown = null
  try { data = await res.json() } catch { /* non-JSON error page */ }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: ApiError['details'] } } | null)?.error
    const retry = Number(res.headers.get('retry-after')) || undefined
    const e = new ApiError(res.status, err?.code ?? 'http_error', err?.message ?? `Request failed (${res.status})`, err?.details, retry)
    if (res.status === 401 && e.code === 'session_invalid') onUnauthorized?.()
    throw e
  }
  return data as T
}

export const api = {
  register: (b: { name: string; email: string; password: string; confirm_password: string }) => request<AuthOut>('POST', '/auth/register', b),
  login: (b: { email: string; password: string }) => request<AuthOut>('POST', '/auth/login', b),
  logout: () => request<void>('POST', '/auth/logout'),
  me: () => request<AuthOut>('GET', '/auth/me'),
  roadmaps: () => request<RoadmapSummary[]>('GET', '/roadmaps'),
  roadmap: (id: string) => request<RoadmapDetail>('GET', `/roadmaps/${encodeURIComponent(id)}`),
  problem: (id: string) => request<Problem>('GET', `/problems/${encodeURIComponent(id)}`),
  openSession: (problem_id: string, roadmap_id?: string | null) =>
    request<CodingSession>('POST', '/sessions', { problem_id, roadmap_id: roadmap_id ?? null }),
  getSession: (id: string) => request<CodingSession>('GET', `/sessions/${id}`),
  saveCode: (id: string, code: string) => request<CodeSaveOut>('PUT', `/sessions/${id}/code`, { code }),
  chat: (b: ChatRequest) => request<ChatResponse>('POST', '/chat', b),
  progress: () => request<Progress>('GET', '/progress'),
  submit: (b: SubmissionCreate) => request<SubmissionResult>('POST', '/submissions', b),
  visualize: (b: VisualizeRequest) => request<VisualizeResponse>('POST', '/visualize', b),
}

/** Turn any thrown value into a message that is safe to show to a student. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 429 && e.retryAfter) return `${e.message} (try again in ${e.retryAfter}s)`
    if (e.code === 'validation_error' && e.details?.length) return e.details.map((d) => d.message).join('. ')
    return e.message
  }
  return 'Something went wrong. Please try again.'
}
