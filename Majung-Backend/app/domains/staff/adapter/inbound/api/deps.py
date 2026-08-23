"""담당자 세션 의존성.

출소자 쪽과 나눠 둔다. **한 의존성이 둘 다 처리하면 언젠가 출소자 토큰으로
관리자 화면이 열린다.** 토큰 저장소가 다르므로 섞일 수 없는 구조가 낫다.
"""

from datetime import UTC, datetime

from fastapi import Header, HTTPException, Request

from app.domains.staff.domain.entity import Staff


def _bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


def require_staff(
    request: Request,
    authorization: str | None = Header(default=None),
) -> Staff:
    """담당자만 통과한다. 관리자 화면의 모든 조회가 이걸 거친다."""
    sessions = getattr(request.app.state, "staff_session_repo", None)
    staff_repo = getattr(request.app.state, "staff_repo", None)
    if sessions is None or staff_repo is None:
        raise HTTPException(
            status_code=503, detail="지금은 이용할 수 없어요. 잠시 후 다시 시도해 주세요."
        )

    token = _bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail="다시 로그인해 주세요.")

    session = sessions.resolve(token, datetime.now(UTC))
    if session is None:
        raise HTTPException(status_code=401, detail="다시 로그인해 주세요.")

    staff = staff_repo.by_id(session.staff_id)
    if not isinstance(staff, Staff):
        raise HTTPException(status_code=401, detail="다시 로그인해 주세요.")
    return staff
