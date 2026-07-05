- source_spec: none
  summary: Majung-Frontend 스캐폴드 (Expo+expo-router 5탭+NativeWind)
  evidence: 사용자 지정 2단계 — 백엔드 스캐폴드(1단계)와 독립 배포 가능 단위라 분리
- source_spec: none
  summary: 화면 구현 — 챗봇→로드맵→지도(폴백)→온보딩 (design-map.md 우선순위)
  evidence: 사용자 지정 3단계 — FE 스캐폴드 완료 후 착수
- source_spec: _bmad-output/implementation-artifacts/spec-majung-backend-scaffold.md
  summary: 인메모리 rate-limit·spend 카운터를 멀티 인스턴스에서 유효하게 (Redis 등)
  evidence: 본선 스케일아웃/오토스케일 시 인스턴스별 카운터가 0에서 시작해 전역 상한이 무력화됨(리뷰 #1)
