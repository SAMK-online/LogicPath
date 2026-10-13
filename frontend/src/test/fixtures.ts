import type { CodingSession, Problem, RoadmapDetail } from '../types/api'

export const problem: Problem = {
  id: 'two-sum', title: 'Two Sum', description: 'Find **two** indices.\n\n- uses `nums`', difficulty: 'Easy', topic: 'Hash maps',
  starter_code: 'def two_sum(nums, target):\n    pass\n',
  function_signature: { name: 'two_sum', params: [{ name: 'nums', type: 'List[int]' }, { name: 'target', type: 'int' }], return_type: 'List[int]' },
  examples: [{ input: 'nums = [2, 7], target = 9', output: '[0, 1]', explanation: 'because' }], constraints: ['`2 <= len(nums)`'],
  comparison: 'sorted', is_available: true,
  test_cases: [{ id: 1, args: [[2, 7], 9], expected: [0, 1] }, { id: 2, args: [[3, 3], 6], expected: [0, 1] }],
}

export const session: CodingSession = {
  id: 'sess-1', problem_id: 'two-sum', roadmap_id: 'dsa-fundamentals', saved_code: problem.starter_code, code_version: 1,
  updated_at: '2026-01-01T00:00:00Z', messages: [], last_submission: null, hint_level: 0, tutor_mode: 'live',
}

export const roadmap: RoadmapDetail = {
  id: 'dsa-fundamentals', title: 'DSA Fundamentals', description: 'Learn patterns.', difficulty: 'Intermediate',
  total_problems: 3, available_problems: 2, completed_problems: 1, progress_percent: 33, next_problem_id: 'two-sum',
  topics: [
    { name: 'Hash maps', completed: 1, total: 2, problems: [
      { id: 'contains-duplicate', title: 'Contains Duplicate', difficulty: 'Easy', is_available: true, status: 'completed' },
      { id: 'two-sum', title: 'Two Sum', difficulty: 'Easy', is_available: true, status: 'not_started' },
    ] },
    { name: 'Heap', completed: 0, total: 1, problems: [
      { id: 'find-median', title: 'Find Median from Data Stream', difficulty: 'Hard', is_available: false, status: 'not_started' },
    ] },
  ],
}

import type { Snap, Trace, TraceStep } from '../services/trace'

const list = (...v: Snap[]): Snap => ({ t: 'list', n: v.length, v })
const step = (line: number, locals: Record<string, Snap>, extra: Partial<TraceStep> = {}): TraceStep => ({ line, event: 'line', depth: 1, locals, ...extra })

/** A tiny hand-made trace of a two-pointer-ish run: args, a moving pointer, a growing dict. */
export const trace: Trace = {
  status: 'ok', truncated: false, error: null, args: ['nums', 'target'], stdout: '', result: list(0, 1), expected: list(0, 1),
  steps: [
    step(1, { nums: list(2, 7, 11), target: 9 }, { event: 'call' }),
    step(2, { nums: list(2, 7, 11), target: 9, seen: { t: 'dict', n: 0, v: [] } }),
    step(3, { nums: list(2, 7, 11), target: 9, seen: { t: 'dict', n: 0, v: [] }, i: 0 }),
    step(4, { nums: list(2, 7, 11), target: 9, seen: { t: 'dict', n: 1, v: [[2, 0]] }, i: 0 }),
    step(3, { nums: list(2, 7, 11), target: 9, seen: { t: 'dict', n: 1, v: [[2, 0]] }, i: 1 }),
    step(5, { nums: list(2, 7, 11), target: 9, seen: { t: 'dict', n: 1, v: [[2, 0]] }, i: 1 }, { event: 'return', ret: list(0, 1) }),
  ],
}
