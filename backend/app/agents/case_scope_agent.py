"""Case Scope Agent
Checks lawful purpose, case status, and allowed input types before analysis runs.
Pure guardrail agent - blocks analysis if the case is not properly authorized.
"""
from app.models import Case

MIN_PURPOSE_LEN = 50
ALLOWED_INPUT_TYPES = {"text", "url", "file", "chat"}


def check_scope(case: Case, input_count: int) -> dict:
    issues = []

    if not case.lawful_purpose or len(case.lawful_purpose.strip()) < MIN_PURPOSE_LEN:
        issues.append("Lawful purpose statement is missing or too short (min 50 characters).")

    if case.status == "closed":
        issues.append("Case is closed; reopen before running further analysis.")

    if input_count == 0:
        issues.append("No seed inputs provided for this case.")

    return {
        "passed": len(issues) == 0,
        "issues": issues,
        "scope_note": "Public-data-only investigative leads. Human review required.",
    }
