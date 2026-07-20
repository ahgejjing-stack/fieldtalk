# Technical Debt

빠른 프로토타입 구현 중 허용한 임시 구조와 출시 전 개선 항목을 기록한다.

## Open

### TD-001 — 브라우저 TTS 품질
- 상태: Open
- 현재: Web Speech API 사용
- 문제: 음질과 사투리 표현이 부족함
- 계획: 상업 이용 가능한 고품질 AI 음성 또는 정식 녹음 파일로 교체

### TD-002 — 실제 오디오 출력 라우팅
- 상태: Open
- 현재: 브라우저 기본 출력 장치
- 계획: iOS/Android/Watch 오디오 세션 구현 시 phone/headphones/watch 정책 적용

### TD-003 — Mock distance offsets
- 상태: Open
- 현재: 플레이어별 고정 offset으로 거리 계산
- 계획: GPS 좌표와 핀 좌표 기반 계산으로 교체

### TD-004 — State persistence migration
- 상태: Open
- 현재: localStorage 스키마 마이그레이션이 제한적
- 계획: schemaVersion별 migration 함수 추가

### TD-005 — Automated tests
- 상태: Open
- 현재: 수동 UI 확인 중심
- 계획: reducer/selectors/audio engine 단위 테스트 추가
