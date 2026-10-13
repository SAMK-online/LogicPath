export type Status = 'not_started' | 'in_progress' | 'completed'
export type ExecutionStatus = 'passed' | 'failed' | 'error' | 'timeout'

export interface User { id: string; name: string; email: string; created_at: string }
export interface AuthOut { user: User; csrf_token: string }

export interface RoadmapSummary {
  id: string; title: string; description: string; difficulty: string
  total_problems: number; available_problems: number; completed_problems: number
  progress_percent: number; next_problem_id: string | null
}
export interface ProblemRef { id: string; title: string; difficulty: string; is_available: boolean; status: Status }
export interface Topic { name: string; completed: number; total: number; problems: ProblemRef[] }
export interface RoadmapDetail extends RoadmapSummary { topics: Topic[] }

export interface ParamDef { name: string; type: string }
export interface FunctionSignature { name: string; params: ParamDef[]; return_type: string }
/** `args`/`expected` may contain {"$gen": ...} specs for large generated inputs (expanded inside the worker). */
export interface TestCase {
  id: number; args: unknown[]; expected: unknown
  /** a constraint-sized test: a correct but slow solution fails it */
  perf?: boolean; label?: string; time_limit_ms?: number; max_accesses?: number
}
export interface Example { input: string; output: string; explanation?: string }
export interface Problem {
  id: string; title: string; description: string; difficulty: string; topic: string
  starter_code: string; function_signature: FunctionSignature; examples: Example[]
  constraints: string[]; comparison: 'exact' | 'sorted'; is_available: boolean; test_cases: TestCase[]
}

export interface ChatMessage {
  id: number; role: 'user' | 'assistant'; kind: 'chat' | 'hint' | 'review'; content: string; created_at: string
}
export interface SubmissionSummary {
  id: number; code_version: number; passed_tests: number; total_tests: number
  execution_status: ExecutionStatus; created_at: string
}
export interface CodingSession {
  id: string; problem_id: string; roadmap_id: string | null; saved_code: string; code_version: number
  updated_at: string; messages: ChatMessage[]; last_submission: SubmissionSummary | null
  hint_level: number; tutor_mode: 'live' | 'mock'
}
export interface CodeSaveOut { code_version: number; changed: boolean; updated_at: string }
export interface FailureDetail { test_id: number; input: string; expected: string; actual: string; error: string }
export interface SubmissionCreate {
  session_id: string; code?: string; passed_tests: number; total_tests: number
  execution_status: ExecutionStatus; failures: FailureDetail[]
}
export interface SubmissionResult {
  submission: SubmissionSummary; code_version: number; completion_status: Status; attempts: number
}
export interface ChatRequest {
  session_id: string; kind: 'chat' | 'hint' | 'review'; message?: string; code?: string
}
export interface ChatResponse {
  user_message: ChatMessage; assistant_message: ChatMessage; code_version: number
  hint_level: number; tutor_mode: 'live' | 'mock'
}
export interface ProgressItem {
  problem_id: string; title: string; difficulty: string; status: Status; attempts: number
  last_attempted_at: string | null; completed_at: string | null; roadmap_id: string | null
}
export interface Progress {
  total_available: number; completed: number; in_progress: number; problems: ProgressItem[]; recent: ProgressItem[]
}

export interface VisualizeRequest {
  session_id: string
  test_case_id: number
  code?: string
  trace: import('../services/trace').CompactTrace
}
export interface VisualizeResponse {
  spec: unknown // validated again on the client with parseSpec()
  cached: boolean
  code_version: number
  tutor_mode: 'live' | 'mock'
  captions_removed: boolean
}
