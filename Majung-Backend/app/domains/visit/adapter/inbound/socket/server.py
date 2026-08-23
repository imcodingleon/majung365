"""담당자 채팅 전송 계층 — Socket.IO (기획서 §7.3).

**전송 방식을 websocket으로 고정하지 않는다.** 배포 환경의 라우터가 업그레이드를
중계하지 못할 수 있어서, polling으로 붙은 뒤 가능하면 승격하는 기본 동작을 그대로
둔다. 공단 시설이나 회사 방화벽이 WebSocket을 막는 경우가 실제로 있다.

이벤트는 셋으로 충분하다.
    new_message   새 메시지
    read_updated  읽음 갱신
    chat_error    전송 실패

**여기서는 규칙을 정하지 않는다.** 누가 들어올 수 있는지, 방이 열려 있는지는
유스케이스가 판정한다. 이 파일은 그 판정을 소켓 사건에 잇는 일만 한다.
"""

import logging
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import socketio

from app.domains.account.domain.entity import Account
from app.domains.staff.domain.entity import Staff
from app.domains.visit.application.chat_usecase import (
    ChatClosed,
    NotInRoom,
    VisitChatUseCase,
)
from app.domains.visit.domain.message import Message, SenderRole

logger = logging.getLogger("majung.chat")

# 방 이름. 소켓 방 이름이 곧 요청 id라 다른 방과 섞일 수 없다.
def _room(visit_id: UUID) -> str:
    return f"visit:{visit_id}"


def _payload(message: Message) -> dict[str, Any]:
    return {
        "id": str(message.id),
        "visitId": str(message.visit_id),
        "senderRole": message.sender_role.value,
        "body": message.body,
        "createdAt": message.created_at.isoformat(),
        # 클라이언트가 임시 말풍선과 짝짓는 값. 없으면 빈 문자열이다.
        "clientMsgId": message.client_msg_id,
    }


def create_socket_app(app: Any) -> socketio.ASGIApp:
    """FastAPI 앱에 붙일 Socket.IO ASGI 앱.

    `app.state`에서 유스케이스와 세션 저장소를 꺼낸다. 저장이 꺼져 있으면 접속
    자체를 거절한다 — 대화를 남기지 못하는 채팅은 열어 두어도 소용이 없다.
    """
    sio = socketio.AsyncServer(
        async_mode="asgi",
        cors_allowed_origins=app.state.cors_origins,
        # 로그에 사용자 입력이 실리지 않게 한다(§9.3).
        logger=False,
        engineio_logger=False,
    )

    def _usecase() -> VisitChatUseCase | None:
        found = getattr(app.state, "visit_chat_usecase", None)
        return found if isinstance(found, VisitChatUseCase) else None

    async def _identify(auth: dict[str, Any] | None) -> tuple[str, Any] | None:
        """핸드셰이크의 토큰으로 누구인지 가린다.

        **출소자와 담당자를 다른 저장소에서 찾는다.** 한 곳에서 둘 다 처리하면
        언젠가 출소자 토큰으로 관리자 화면이 열린다.
        """
        token = (auth or {}).get("token")
        if not isinstance(token, str) or not token.strip():
            return None
        token = token.strip()
        now = datetime.now(UTC)

        staff_sessions = getattr(app.state, "staff_session_repo", None)
        staff_repo = getattr(app.state, "staff_repo", None)
        if staff_sessions is not None and staff_repo is not None:
            session = staff_sessions.resolve(token, now)
            if session is not None:
                staff = staff_repo.by_id(session.staff_id)
                if isinstance(staff, Staff):
                    return ("staff", staff)

        sessions = getattr(app.state, "session_repo", None)
        accounts = getattr(app.state, "account_repo", None)
        if sessions is not None and accounts is not None:
            session = sessions.resolve(token, now.date())
            if session is not None:
                account = accounts.by_id(session.user_id)
                if isinstance(account, Account):
                    return ("user", account)
        return None

    async def connect(sid: str, environ: dict[str, Any], auth: dict[str, Any] | None) -> None:
        """접속 핸드셰이크. **방 참여자가 아니면 입장을 거부한다.**

        토큰이 갱신되면 클라이언트가 소켓 자격증명도 교체해야 한다. 갱신을
        반영하지 않으면 재연결 때마다 만료된 토큰을 넘겨 조용히 채팅이 죽는다.
        """
        if _usecase() is None:
            raise socketio.exceptions.ConnectionRefusedError("지금은 이용할 수 없어요.")
        who = await _identify(auth)
        if who is None:
            raise socketio.exceptions.ConnectionRefusedError("다시 로그인해 주세요.")
        kind, actor = who
        await sio.save_session(sid, {"kind": kind, "actor": actor})

    async def join(sid: str, data: dict[str, Any]) -> dict[str, Any]:
        """방에 들어간다. 들어가면서 지난 대화를 함께 준다 —
        따로 요청하게 하면 화면이 두 번 깜빡인다."""
        usecase = _usecase()
        if usecase is None:
            return {"ok": False, "reason": "지금은 이용할 수 없어요."}
        session = await sio.get_session(sid)
        try:
            visit_id = UUID(str(data.get("visitId")))
        except (ValueError, TypeError):
            return {"ok": False, "reason": "요청을 찾을 수 없어요."}

        try:
            if session["kind"] == "staff":
                visit = usecase.room_for_staff(session["actor"], visit_id)
                role = SenderRole.STAFF
            else:
                visit = usecase.room_for_user(session["actor"].id, visit_id)
                role = SenderRole.USER
        except NotInRoom:
            # 없는 요청인지 남의 것인지 구분해 주지 않는다.
            return {"ok": False, "reason": "요청을 찾을 수 없어요."}
        except ChatClosed as closed:
            return {"ok": False, "reason": closed.reason}

        await sio.enter_room(sid, _room(visit_id))
        session["visit_id"] = visit_id
        session["role"] = role
        await sio.save_session(sid, session)

        usecase.mark_read(visit, role, datetime.now(UTC))
        return {
            "ok": True,
            "messages": [_payload(m) for m in usecase.history(visit)],
        }

    async def send_message(sid: str, data: dict[str, Any]) -> dict[str, Any]:
        """보낸다. **낙관적 UI를 전제한다** — 클라이언트가 임시 말풍선을 먼저 그리고
        `clientMsgId`로 서버 에코와 짝짓는다. 선불폰·저사양 단말에서는 이 부분이
        체감 품질을 좌우한다."""
        usecase = _usecase()
        session = await sio.get_session(sid)
        visit_id = session.get("visit_id")
        if usecase is None or visit_id is None:
            await sio.emit("chat_error", {"reason": "먼저 방에 들어가 주세요."}, to=sid)
            return {"ok": False}

        # 방 상태가 바뀌었을 수 있어 다시 읽는다.
        visit = usecase.visits.by_id(visit_id)
        if visit is None:
            await sio.emit("chat_error", {"reason": "요청을 찾을 수 없어요."}, to=sid)
            return {"ok": False}

        role: SenderRole = session["role"]
        staff_id = session["actor"].id if role == SenderRole.STAFF else None
        try:
            saved = usecase.send(
                visit,
                role,
                str(data.get("body", "")),
                client_msg_id=str(data.get("clientMsgId", "") or ""),
                staff_id=staff_id,
            )
        except ChatClosed as closed:
            await sio.emit("chat_error", {"reason": closed.reason}, to=sid)
            return {"ok": False}
        except Exception:
            # 사용자 입력 원문은 로그에 남기지 않는다(§9.3).
            logger.warning("메시지 전송 실패 — visit=%s", visit_id)
            await sio.emit(
                "chat_error", {"reason": "보내지 못했어요. 다시 시도해 주세요."}, to=sid
            )
            return {"ok": False}

        await sio.emit("new_message", _payload(saved), room=_room(visit_id))
        return {"ok": True, "id": str(saved.id)}

    async def mark_read(sid: str, data: dict[str, Any]) -> dict[str, Any]:
        usecase = _usecase()
        session = await sio.get_session(sid)
        visit_id = session.get("visit_id")
        if usecase is None or visit_id is None:
            return {"ok": False}
        visit = usecase.visits.by_id(visit_id)
        if visit is None:
            return {"ok": False}
        now = datetime.now(UTC)
        usecase.mark_read(visit, session["role"], now)
        await sio.emit(
            "read_updated",
            {"role": session["role"].value, "at": now.isoformat()},
            room=_room(visit_id),
        )
        return {"ok": True}

    async def disconnect(sid: str) -> None:
        session = await sio.get_session(sid)
        visit_id = session.get("visit_id")
        if visit_id is not None:
            await sio.leave_room(sid, _room(visit_id))

    # **데코레이터 대신 명시적으로 등록한다.** `@sio.event`는 타입이 없어
    # 검사기가 핸들러를 통째로 untyped로 취급한다. 이름을 직접 적으면 그 문제가
    # 없고, 어떤 이벤트가 열려 있는지도 한자리에 모인다.
    for name, handler in (
        ("connect", connect),
        ("join", join),
        ("send_message", send_message),
        ("mark_read", mark_read),
        ("disconnect", disconnect),
    ):
        sio.on(name, handler)

    return socketio.ASGIApp(sio, other_asgi_app=app, socketio_path="socket.io")
