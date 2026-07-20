# FIELDTALK Course Reference Implementation v0.2

이 문서는 Course Reference 관련 Sprint(Prototype v0.1, Integration Hardening v0.2, 이번 Closure v0.1)의 최종 구현 상태를 정리한다. Course Reference 기능 확장은 이 문서 이후 중단하고, Round Room Foundation으로 이동한다.

기준 문서: `docs/PRODUCT_CHARTER_v1.0.md` Principle 8(Minimal Course), `docs/COURSE_REFERENCE_STRATEGY_v1.md`.

---

## 1. 구현된 계층

```
External Provider (Local JSON / Alternate Mock)
        │
        ▼
Provider Adapter (normalizeCourse.js / normalizeAlternateCourse.js)
        │
        ▼
CourseReference Model (정규화, provider 무관)
        │
        ▼
CourseReferenceService (컴포넌트가 유일하게 아는 진입점)
        │
        ▼
Round Snapshot (courseSnapshotAppliedWithHoles → round.courseSnapshot + round.course + round.holes)
```

| 파일 | 역할 |
|---|---|
| `src/course/geoDistance.js` | 순수 haversine 거리 계산 |
| `src/course/normalizeCourse.js` | Provider A 전용 정규화 |
| `src/course/normalizeAlternateCourse.js` | Provider B 전용 정규화(독립) |
| `src/course/providers/CourseReferenceProvider.js` | Provider 계약 |
| `src/course/providers/LocalJsonCourseProvider.js` | Provider A 구현체 |
| `src/course/providers/AlternateMockCourseProvider.js` | Provider B 구현체 |
| `src/course/CourseReferenceService.js` | 컴포넌트 ↔ Provider 사이 유일한 경계 |
| `src/course/courseReferenceServiceInstance.js` | 공유 인스턴스 |
| `src/config/runtimeMode.js`, `src/context/RuntimeModeContext.jsx` | Demo/Production 모드 계층 |
| `src/location/*.js` | LocationProvider 계약 + Mock/Browser 구현체 |
| `src/engine/roundSelectors.js`의 `selectPlayerGps()` | GPS 값을 어디서 가져올지 결정하는 유일한 지점 |
| `src/engine/roundReducer.js`의 `COURSE_SNAPSHOT_APPLIED_WITH_HOLES` | Snapshot → Round Hole 병합 + `round.course` 요약 동기화(Closure §A-1) |

---

## 2. Demo/Production 정책

Round Engine 도메인 상태가 아니라 `RuntimeModeContext`(`RoundProvider` 바깥)가 관리한다. `selectPlayerGps(round, playerId, { runtimeMode })`가 옵션을 생략하면 기본값 Demo — 이전 Sprint의 모든 호출부가 하위 호환된다.

- **Demo**: 실제 좌표 없으면 기존 `GPS_BASE_M` mock으로 폴백.
- **Production**: 실제 좌표 없으면 무조건 `null`. `player.distance.gps`에 마이그레이션이 백필해둔 mock 값이 남아있어도 **절대 읽지 않는다** — 필드 자체가 있는지 없는지가 아니라 모드가 결정한다.

`roundReducer.js`의 `TEAM_DISTANCE_SHARE`는 reducer가 Context를 직접 읽을 수 없어 `runtimeMode`를 액션 payload로 전달받는다 — reducer는 여전히 순수 함수다.

---

## 3. Provider Adapter

두 개의 독립 Provider(Local JSON, Alternate Mock)가 완전히 다른 raw 구조(camelCase 중첩 객체 vs snake_case venue/track/scorecard)를 각자의 정규화 함수로 처리하고 동일한 `CourseReference` 모델을 반환한다. 외부 필드명(`venue_code`, `hole_no` 등)은 정규화 결과에 전혀 남지 않는다 — `src/course/providerComparison.test.js`(7개)로 확인.

---

## 4. CourseReferenceService

컴포넌트(`DistanceCard.jsx`, Room 관련 UI)는 `courseReferenceService.listAvailableCourses()`/`getCourse()`만 호출한다. `new LocalJsonCourseProvider()` 같은 직접 생성은 어디에도 없다 — Provider 교체는 `service.setProvider(...)` 하나로 끝나고, UI/Round Engine은 변경이 필요 없다.

---

## 5. Round Snapshot

`courseSnapshotAppliedWithHoles(courseSnapshot, startHoleNumber)`가:
1. `courseSnapshot`을 깊은 복사로 저장(Provider raw 데이터가 나중에 바뀌어도 이미 시작된 Round는 불변 — 단위 테스트로 검증됨).
2. `round.holes`에 PAR만 병합, `status`/`startedAt`/`completedAt`/`pin`/`wind`는 보존.
3. `round.course`(Closure §A-1로 추가) — `{id, name, golfClubName, totalHoles}` 요약을 courseSnapshot과 항상 같은 값으로 동기화. Provider A/B 각각 START 후 `round.course`가 정확히 그 코스를 가리키고 `totalHoles`가 일치함을 확인했다.

이번 Sprint(Round Room Foundation)부터는 `buildInitialRoundFromRoom.js`가 이 병합 로직을 처음부터 다시 구현한다(패치가 아니라 완전한 Round를 한 번에 생성) — `src/room/buildInitialRoundFromRoom.js` 참고.

---

## 6. GPS 참고 거리 & 기존 Delta 공식과의 연결

Level 2 이상 CourseReference + 플레이어 실제 좌표가 있으면 `selectPlayerGps()`가 haversine 계산 결과를 반환한다. **기존 팀 실측 보정 공식은 한 글자도 안 바뀌었다**:

```
delta = 측정자 실측 - 측정자 GPS(공유 시점)
동반자 보정 거리 = 동반자 GPS(현재) + delta
```

`selectPlayerGps()`가 이 공식에 들어가는 "GPS"의 출처(mock 상수 vs 실제 좌표)만 바꾼다 — `roundReducer.js`의 `TEAM_DISTANCE_SHARE`도 같은 함수를 호출해 스냅샷을 잡으므로 두 경로가 항상 일치한다.

---

## 7. 현재 구현하지 않은 외부 API

- 정부 공공데이터(`data.go.kr`) 연동 — `docs/COURSE_REFERENCE_STRATEGY_v1.md` §3에서 조사만 완료.
- Kakao/Naver/Google 장소 검색 API 연동.
- 상용 코스 데이터 공급자(golfapi.io 등) 연동 — 가격/한국 커버리지 미확인.
- Weather API(바람 실 데이터).
- 코스/홀 자동 감지(GPS 기반).

전부 `CourseReferenceProvider` 계약만 구현하면 연결 가능한 형태로 경계를 만들어뒀다 — 새 Provider 클래스 하나 추가하는 정도.

---

## 8. 남은 기술 부채

| # | 부채 | 내용 |
|---|---|---|
| 1 | 공유 `CourseReferenceService` Singleton의 Provider 변경 방식 | `service.setProvider(...)`가 전역 단일 인스턴스를 직접 바꾼다 — 동시에 여러 Room/화면이 서로 다른 Provider를 참조해야 하는 상황(예: 여러 사용자가 동시에 다른 코스를 탐색)이 생기면 인스턴스를 요청 단위로 분리해야 한다. |
| 2 | DEV 컨트롤이 `DistanceCard.jsx` 안에 존재 | Runtime Mode 토글·Provider A/B 전환·내 위치 가져오기 버튼이 전부 `DistanceCard.jsx`의 DEV 블록에 있다. 화면 책임과 무관한 위치라 별도 DEV 패널로 분리하는 게 정리에 유리하다. |
| 3 | 지속 위치 추적 미구현 | `LocationProvider.getCurrentPosition()`은 1회성이다. `watchPosition` 스타일 구독형 API로 확장 가능한 인터페이스이지만 실제 구현은 없다. |
| 4 | 실제 Course Provider 미연결 | §7의 모든 외부 API가 미연결 — 현재 서비스가 반환하는 코스는 전부 테스트 데이터. |
| 5 | Round START Lifecycle은 Room Sprint에서 구현 | `courseSnapshotAppliedWithHoles`(Course Reference 전용 경로)와 `roundStartFromRoom`(Room 기반 경로) 두 개의 서로 다른 시작 경로가 공존한다 — 전자는 DEV 테스트용으로 남겨뒀고, 실제 서비스 흐름은 후자로 수렴해야 한다. 두 경로를 하나로 합치는 정리는 이번 범위 밖으로 남긴다. |

이번 문서 작성과 `round.course` 동기화 수정 외에 Course Reference 관련 새 기능은 추가하지 않았다.
