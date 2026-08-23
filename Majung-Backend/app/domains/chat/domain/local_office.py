"""사용자가 말한 동의 주민센터 — 순수 Python (Domain).

**있는 데이터를 없다고 말하면 안 된다.** "송파구 오금동 사는데 근처 주민센터
알려줘"에 "가진 자료에 없어요, 인터넷에서 찾아보세요"라고 답한 적이 있다.
그 순간 서버에는 "오금동 주민센터 · 서울특별시 송파구 오금로25길 5"가 있었다.
인터넷에서 찾아보라고 미루는 것이 이 서비스가 없애려던 일이다.

**같은 이름이 전국에 여럿이다.** "중앙동"은 31곳, "남면"은 12곳이다. 그때
서버가 하나를 골라 주면 사용자가 엉뚱한 동네로 찾아간다. **어느 곳인지 되묻는다.**
"""

from dataclasses import dataclass

from app.domains.centers.domain.entity import DistrictOffice

# 되물을 때 보여줄 후보 수. 31곳을 다 늘어놓으면 고르기가 더 어렵다.
_MAX_CHOICES = 8

# 전화번호는 원본(행정안전부 읍면동 하부행정기관 현황)에 없다.
# 지어내지 않고 전국 대표번호로 넘긴다.
_FALLBACK_PHONE = "정부민원안내콜센터 110"


@dataclass(frozen=True)
class LocalOfficeAnswer:
    """주민센터 조회 결과. 답변 프롬프트에 넣을 문장으로 낸다."""

    injection: str
    # 되물어야 하는가. 화면이 이 사실을 알 필요는 없고, 로그·테스트가 본다.
    needs_region: bool = False

    @property
    def found(self) -> bool:
        return bool(self.injection)


def _line(office: DistrictOffice) -> str:
    return f"{office.name} ({office.sido} {office.sigungu}) {office.address}"


def answer_for(dong: str, offices: list[DistrictOffice]) -> LocalOfficeAnswer:
    """찾은 주민센터를 답변에 넣을 형태로.

    한 곳이면 그대로 알려주고, 여러 곳이면 **어느 시·군·구인지 되묻는다.**
    없으면 빈 결과다 — 그때는 지금처럼 "가진 자료에 없다"고 답하는 것이 맞다.
    """
    if not offices:
        return LocalOfficeAnswer(injection="")

    if len(offices) == 1:
        office = offices[0]
        return LocalOfficeAnswer(
            injection=(
                f"[사용자가 말한 동의 주민센터] {_line(office)}\n"
                f"전화번호는 우리 자료에 없다. 필요하면 {_FALLBACK_PHONE}로 안내한다.\n"
                "이 주소를 그대로 알려주고, 지어내서 덧붙이지 않는다."
            )
        )

    # 같은 이름이 여럿이다. 어느 곳인지 사용자만 안다.
    where = sorted({f"{o.sido} {o.sigungu}" for o in offices})
    shown = where[:_MAX_CHOICES]
    more = len(where) - len(shown)
    listed = ", ".join(shown) + (f" 외 {more}곳" if more > 0 else "")
    return LocalOfficeAnswer(
        injection=(
            f"[되물어야 함] '{dong}'이라는 이름의 주민센터가 여러 곳에 있다: {listed}\n"
            "**어느 시·군·구인지 먼저 물어본다.** 임의로 한 곳을 고르면 사용자가 "
            "엉뚱한 동네로 찾아간다. 목록을 짧게 보여주고 고르게 한다."
        ),
        needs_region=True,
    )
