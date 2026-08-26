- source_spec: none
  summary: Majung-Frontend 스캐폴드 (Expo+expo-router 5탭+NativeWind)
  evidence: 사용자 지정 2단계 — 백엔드 스캐폴드(1단계)와 독립 배포 가능 단위라 분리
- source_spec: none
  summary: 화면 구현 — 챗봇→로드맵→지도(폴백)→온보딩 (design-map.md 우선순위)
  evidence: 사용자 지정 3단계 — FE 스캐폴드 완료 후 착수
- source_spec: _bmad-output/implementation-artifacts/spec-majung-backend-scaffold.md
  summary: 인메모리 rate-limit·spend 카운터를 멀티 인스턴스에서 유효하게 (Redis 등)
  evidence: 본선 스케일아웃/오토스케일 시 인스턴스별 카운터가 0에서 시작해 전역 상한이 무력화됨(리뷰 #1)
- source_spec: _bmad-output/specs/spec-majung-2nd/majung365_리뉴얼_개발플로_기획안_v2.md
  summary: 보관 기간 파기 배치 — 마지막 접속일 +1년(§9.4), 방문 기록 +3개월(§9.5)
  evidence: |
    마이그레이션 주석이 "파기 배치가 이 조건으로 지운다"고 적고 있으나 그 배치가 없다
    (0005_visit_message.sql:54, 0006_visit_shared_answers.sql:9). last_seen_on은 갱신되지만
    읽는 사람이 없다. 즉시 파기(DELETE /api/me)와 죄목 철회는 구현되어 있어 사용자가
    요구하면 지워지지만, **자동 파기는 아무도 하지 않는다.** 해커톤 시연에는 영향이 없고
    실서비스 1년차부터 법적 요구를 어긴다. 코드 리뷰 2026-08-24.
