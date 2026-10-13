from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import CodingSession, Problem, Submission, User
from app.schemas.learning import SubmissionCreate, SubmissionOut, SubmissionResult
from app.services import progress as progress_service
from app.services import sessions as sessions_service


def record_submission(db: Session, user: User, body: SubmissionCreate) -> SubmissionResult:
    cs: CodingSession = sessions_service.get_owned_session(db, body.session_id, user.id)
    problem = db.get(Problem, cs.problem_id)
    assert problem is not None
    expected_total = len(problem.test_cases)
    if body.total_tests != expected_total:
        raise AppError(422, "test_count_mismatch", f"This problem has {expected_total} tests, but the run reported {body.total_tests}.")
    # Consistency of the self-reported status. (Still client-reported: this is analytics, not grading.)
    if body.execution_status == "passed" and body.passed_tests != body.total_tests:
        raise AppError(422, "inconsistent_result", "Status 'passed' requires every test to pass.")

    if body.code is not None:
        sessions_service.save_code(db, cs, body.code)  # the run is recorded against the exact code that ran
    sub = Submission(
        coding_session_id=cs.id, code_version=cs.code_version, passed_tests=body.passed_tests, total_tests=body.total_tests,
        execution_status=body.execution_status, failures=[f.model_dump() for f in body.failures],
    )
    db.add(sub)
    prog = progress_service.record_attempt(db, user.id, cs.problem_id,
                                           all_passed=body.execution_status == "passed" and body.total_tests > 0)
    db.commit()
    return SubmissionResult(submission=SubmissionOut.model_validate(sub), code_version=cs.code_version,
                            completion_status=prog.completion_status, attempts=prog.attempts)  # type: ignore[arg-type]
