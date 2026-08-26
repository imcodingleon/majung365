"""Supabase 저장소 — AccountRepository 구현 (Infrastructure).

**암호화가 여기서 걸린다.** 도메인은 평문을 다루고, 저장 직전에 암호화해 넣고
읽은 직후에 복호화한다. 도메인이 암호문을 들고 다니면 판정 로직이 복호화 여부를
신경 써야 하고, 그러다 한 곳에서 빠뜨린다.

**service_role 키로 접근한다.** 테이블에 RLS가 켜져 있고 정책이 없어서, anon 키로는
아무것도 읽지 못한다. 클라이언트가 DB에 직접 닿는 길이 없다는 뜻이다 — 앱은 우리
API만 부른다. 그래서 service_role 키는 서버에만 두고 절대 클라이언트로 내려보내지 않는다.
"""

import json
import logging
from datetime import date, datetime
from typing import Any
from uuid import UUID

from supabase import Client

from app.domains.account.domain.entity import (
    Account,
    Consent,
    CrimeCategory,
    Place,
    Session,
)
from app.domains.account.domain.tokens import (
    expires_at,
    hash_token,
    new_token,
    utcnow,
)
from app.infrastructure.security.crypto import CryptoError, FieldCipher

logger = logging.getLogger("majung.account")


def _parse_ts(value: str) -> datetime:
    """Postgres timestamptz는 ISO로 온다. Z 표기를 파이썬이 읽는 형태로 바꾼다."""
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _first_row(result: object) -> dict[str, Any] | None:
    """응답에서 첫 행만 꺼낸다.

    supabase-py의 data는 느슨한 JSON 타입이라 여기서 한 번 좁힌다. 형태가 어긋나면
    None을 돌려주고 호출부가 없는 것으로 다룬다 — 예상 밖 응답에 KeyError로 터지느니
    "찾지 못했다"로 넘어가는 편이 낫다.
    """
    data = getattr(result, "data", None)
    if not isinstance(data, list) or not data:
        return None
    row = data[0]
    return row if isinstance(row, dict) else None


class SupabaseAccountRepository:
    def __init__(self, client: Client, cipher: FieldCipher) -> None:
        self._db = client
        self._cipher = cipher

    def _to_place(self, row: dict[str, Any]) -> Place | None:
        """저장된 위치. **읽지 못해도 계정은 살린다.**

        위치는 곁들이는 값이라, 한 줄이 깨졌다고 로그인이 막히면 안 된다. 못 읽으면
        위치를 모르는 상태로 두고 예전처럼 동네 한가운데로 가늠한다.
        """
        raw = row.get("place_enc")
        if not raw:
            return None
        try:
            found = json.loads(self._cipher.decrypt(str(raw)))
        except (CryptoError, ValueError):
            logger.warning("저장된 위치를 읽지 못했다 — 없는 것으로 둔다")
            return None
        if not isinstance(found, dict) or not found.get("sido") or not found.get("district"):
            return None
        # 좌표는 짝으로만 쓴다. 하나만 남아 있으면 없는 것으로 친다.
        lat, lng = found.get("lat"), found.get("lng")
        paired = isinstance(lat, (int, float)) and isinstance(lng, (int, float))
        return Place(
            sido=str(found["sido"]),
            district=str(found["district"]),
            dong=str(found.get("dong") or ""),
            lat=float(lat) if paired else None,  # type: ignore[arg-type]
            lng=float(lng) if paired else None,  # type: ignore[arg-type]
        )

    def _to_account(self, row: dict[str, Any]) -> Account:
        """복호화는 읽기 경로 한곳에서만 한다."""
        at = row.get("place_at")
        return Account(
            id=UUID(str(row["id"])),
            name=self._cipher.decrypt(str(row["name_enc"])),
            birth_date=date.fromisoformat(self._cipher.decrypt(str(row["birth_date_enc"]))),
            release_date=date.fromisoformat(
                self._cipher.decrypt(str(row["release_date_enc"]))
            ),
            created_at=_parse_ts(str(row["created_at"])),
            last_seen_on=date.fromisoformat(str(row["last_seen_on"])),
            place=self._to_place(row),
            place_at=_parse_ts(str(at)) if at else None,
        )

    def save_place(self, user_id: UUID, place: Place, now: datetime) -> None:
        """마지막 위치를 덮어쓴다 (2026-08-26 결정 F-1).

        **이력이 아니라 마지막 한 자리만 남긴다.** 목적은 다시 들어왔을 때 지도가 그
        자리를 기준으로 뜨는 것이고, 그 목적에는 최신 값 하나면 된다. 지나온 자리를
        줄줄이 쌓으면 그것은 동선 기록이 되는데, 이 결정으로 승인된 범위가 아니다.

        좌표는 암호화해 넣는다. 이 값으로 검색하지 않으므로 암호화가 편의를 깎지 않는다.
        """
        payload = {
            "sido": place.sido,
            "district": place.district,
            "dong": place.dong,
            "lat": place.lat,
            "lng": place.lng,
        }
        self._db.table("app_user").update(
            {
                "place_enc": self._cipher.encrypt(json.dumps(payload, ensure_ascii=False)),
                "place_at": now.isoformat(),
            }
        ).eq("id", str(user_id)).execute()

    def create(
        self,
        *,
        name: str,
        birth_date: date,
        release_date: date,
        consents: list[Consent],
    ) -> Account:
        result = (
            self._db.table("app_user")
            .insert(
                {
                    "name_enc": self._cipher.encrypt(name),
                    "birth_date_enc": self._cipher.encrypt(birth_date.isoformat()),
                    "release_date_enc": self._cipher.encrypt(release_date.isoformat()),
                }
            )
            .execute()
        )
        row = _first_row(result)
        if row is None:
            raise RuntimeError("가입 저장에 실패했다")
        account = self._to_account(row)

        if consents:
            # 동의 이력은 평문이다. 무엇에 동의했는지는 식별정보가 아니고,
            # 분쟁이 생겼을 때 그대로 읽혀야 하는 기록이다.
            self._db.table("user_consent").insert(
                [
                    {
                        "user_id": str(account.id),
                        "kind": c.kind,
                        "agreed": c.agreed,
                        "at": c.at.isoformat(),
                    }
                    for c in consents
                ]
            ).execute()
        return account

    def record_consent(self, user_id: UUID, consent: Consent) -> None:
        """가입 이후에 한 동의. 이력이므로 덮어쓰지 않고 한 줄 더 쌓는다."""
        self._db.table("user_consent").insert(
            {
                "user_id": str(user_id),
                "kind": consent.kind,
                "agreed": consent.agreed,
                "at": consent.at.isoformat(),
            }
        ).execute()

    def by_id(self, user_id: UUID) -> Account | None:
        result = (
            self._db.table("app_user")
            .select("*")
            .eq("id", str(user_id))
            .is_("deleted_at", "null")
            .execute()
        )
        row = _first_row(result)
        return self._to_account(row) if row else None

    def touch(self, user_id: UUID, today: date) -> None:
        """이미 오늘로 찍혀 있으면 쓰지 않는다 — 매 요청마다 쓰기가 생기는 것을 막는다."""
        self._db.table("app_user").update({"last_seen_on": today.isoformat()}).eq(
            "id", str(user_id)
        ).neq("last_seen_on", today.isoformat()).execute()

    def delete(self, user_id: UUID) -> None:
        """즉시 파기. 죄목·동의·세션은 on delete cascade로 함께 지워진다."""
        self._db.table("app_user").delete().eq("id", str(user_id)).execute()


class SupabaseCrimeRepository:
    """죄목 전용 저장소. 이 클래스를 주입받지 않은 곳은 죄목에 닿을 수 없다."""

    def __init__(self, client: Client, cipher: FieldCipher) -> None:
        self._db = client
        self._cipher = cipher

    def set(self, user_id: UUID, category: str) -> CrimeCategory:
        result = (
            self._db.table("user_crime")
            .upsert(
                {
                    "user_id": str(user_id),
                    "category_enc": self._cipher.encrypt(category),
                }
            )
            .execute()
        )
        row = _first_row(result)
        if row is None:
            raise RuntimeError("죄목 저장에 실패했다")
        return CrimeCategory(
            user_id=user_id,
            category=category,
            consented_at=_parse_ts(str(row["consented_at"])),
        )

    def by_user(self, user_id: UUID) -> CrimeCategory | None:
        result = (
            self._db.table("user_crime").select("*").eq("user_id", str(user_id)).execute()
        )
        row = _first_row(result)
        if row is None:
            return None
        return CrimeCategory(
            user_id=user_id,
            category=self._cipher.decrypt(str(row["category_enc"])),
            consented_at=_parse_ts(str(row["consented_at"])),
        )

    def revoke(self, user_id: UUID) -> None:
        """동의 철회 — 이 행만 지운다. 계정은 남는다(§9.5)."""
        self._db.table("user_crime").delete().eq("user_id", str(user_id)).execute()


class SupabaseSessionRepository:
    def __init__(self, client: Client) -> None:
        self._db = client

    def issue(self, user_id: UUID) -> str:
        """토큰 원문은 이 반환값으로 딱 한 번 나간다. 서버에는 해시만 남는다."""
        token = new_token()
        now = utcnow()
        self._db.table("user_session").insert(
            {
                "token_hash": hash_token(token),
                "user_id": str(user_id),
                "expires_at": expires_at(now).isoformat(),
            }
        ).execute()
        return token

    def resolve(self, token: str, today: date) -> Session | None:
        """해시로 조회한다 — 원문을 저장하지 않으므로 원문 비교가 불가능하고,
        그게 이 구조의 목적이다."""
        result = (
            self._db.table("user_session")
            .select("user_id, expires_at")
            .eq("token_hash", hash_token(token))
            .execute()
        )
        row = _first_row(result)
        if row is None:
            return None
        session = Session(
            user_id=UUID(str(row["user_id"])),
            expires_at=_parse_ts(str(row["expires_at"])),
        )
        return session if session.is_valid(utcnow()) else None

    def revoke_all(self, user_id: UUID) -> None:
        self._db.table("user_session").delete().eq("user_id", str(user_id)).execute()
