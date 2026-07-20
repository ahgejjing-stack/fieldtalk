# TASK-004 — Shot & Smart Distance Engine

## 목표

현재 FIELDTALK 프로젝트의 Round Engine 위에 Shot 상태와 팀 거리 전송 기능을 구현한다. 기존 UI, PTT, Audio Engine, Score 기능은 유지한다.

실제 GPS는 구현하지 않는다. 이번 작업은 더미 offset을 이용해 데이터 흐름과 UX를 검증하는 단계다.

## 수정/추가 대상

```text
src/
  engine/
    roundActions.js
    roundReducer.js
    roundSelectors.js
    distanceCalculator.js      # 신규
  data/
    roundSeed.js
  components/
    DistanceCard.jsx
    PlayerCard.jsx
    RoundScreen.jsx

docs/
  SHOT_DISTANCE_ENGINE_v0.1.md
  TECHNICAL_DEBT.md
  schemas/shot.example.json
```

## 1. 상태 스키마 확장

Round state에 다음 필드를 추가한다.

```js
shots: [],
lastDistanceShare: null
```

각 Player에 프로토타입 전용 필드 추가:

```js
mockDistanceOffsetM: number
```

seed 값:
- 재식: 0
- 재근: 10
- 광천: -4
- 해란: 1

## 2. Action 추가

```js
SHOT_CREATE
SHOT_START
SHOT_COMPLETE
SHOT_CANCEL
TEAM_DISTANCE_SHARE
```

Action creator도 함께 작성한다.

### teamDistanceShare payload

```js
{
  referencePlayerId,
  referenceDistanceM,
  source: "manual" | "watch" | "laser" | "gps"
}
```

## 3. distanceCalculator.js

순수 함수로 구현한다.

```js
calculateTeamDistances({ players, referencePlayerId, referenceDistanceM })
```

반환:

```js
[
  {
    playerId,
    distanceM,
    offsetM,
    calculationMode
  }
]
```

규칙:
- 기준 거리값은 반올림
- 1~1000m 범위로 clamp
- reference player는 offset 0
- 다른 플레이어는 `mockDistanceOffsetM` 적용
- 입력이 유효하지 않으면 명시적인 오류 결과 반환 또는 예외가 아닌 안전한 실패 처리
- React나 DOM에 의존하지 않는 순수 함수

## 4. Reducer

`TEAM_DISTANCE_SHARE` 처리 시:

1. 계산기를 호출한다.
2. 모든 플레이어의 distance를 한 번의 reducer update로 변경한다.
3. `lastDistanceShare`를 저장한다.
4. 이벤트 2개를 기록한다.
   - DISTANCE_SHARE_CREATED
   - TEAM_DISTANCES_UPDATED
5. 플레이어별 distance 필드:

```js
{
  valueM,
  source,
  updatedAt,
  referencePlayerId
}
```

6. 계산 실패 시 state를 변경하지 않는다.

## 5. Shot reducer 동작

### SHOT_CREATE
- round/hole/player 유효성 확인
- 같은 player/hole에서 sequence 자동 증가
- 기본 status는 planned
- 이벤트 SHOT_CREATED 기록

### SHOT_START
- status를 active로 변경
- 플레이어 activity를 `shot_preparing` 또는 적절한 enum으로 변경
- 이벤트 SHOT_STARTED 기록

### SHOT_COMPLETE
- status를 completed로 변경
- completedAt 기록
- 플레이어 activity를 shot_complete로 변경
- 이벤트 SHOT_COMPLETED 기록

### SHOT_CANCEL
- status를 cancelled로 변경
- 이벤트 SHOT_CANCELLED 기록

MVP에서는 UI에 샷 입력 화면을 새로 만들지 않는다. Engine과 간단한 개발용 데모 흐름만 연결한다.

## 6. DistanceCard UX

현재 입력 UI를 유지하면서 다음을 구현한다.

- 기준 플레이어: 기본 재식
- 기준 거리 입력
- 버튼 문구: `📡 팀 거리 전송`
- 누르면 `teamDistanceShare()` dispatch
- 성공 시 모든 PlayerCard 거리 갱신
- 거리 숫자는 300~500ms 동안 부드럽게 강조 애니메이션
- 성공 토스트 예:
  - `재식 기준 132m를 팀에 전송했습니다.`
- 잘못된 값은 전송하지 않고 안내
- 전송 중 중복 클릭 방지(최소 500ms)

## 7. PlayerCard

- 거리값이 있으면 `132m` 형태로 표시
- 기준 플레이어가 아닌 계산 결과에는 작은 라벨 `팀 계산` 표시
- 마지막 거리 갱신 직후 카드에 짧은 파란 강조 효과
- 기존 말하는 사람 빨간 테두리 로직과 충돌하지 않도록 우선순위:
  1. speaking 빨강
  2. distance update 파랑
  3. 기본 상태색

## 8. Selector 추가

최소 다음 selector를 추가한다.

```js
selectShotsForCurrentHole(state)
selectLatestShotForPlayer(state, playerId)
selectLastDistanceShare(state)
selectTeamDistances(state)
```

## 9. 저장 호환성

기존 localStorage 저장 데이터에 `shots` 또는 `lastDistanceShare`가 없어도 앱이 열려야 한다.

RoundProvider 또는 storage hydration 과정에서 기본값을 보완한다.

## 10. 완료 기준

- 기존 앱이 정상 실행된다.
- 재식 기준 132m 전송 시:
  - 재식 132m
  - 재근 142m
  - 광천 128m
  - 해란 133m
- 입력값 변경 시 같은 offset 규칙으로 재계산된다.
- 새로고침 후 거리 결과가 유지된다.
- PTT, 사운드, 스코어 기능이 깨지지 않는다.
- `npm run build`가 성공한다.
- 변경된 전체 프로젝트를 ZIP으로 제공한다.

## 하지 말 것

- 실제 GPS API 추가
- 지도 라이브러리 추가
- Firebase 추가
- 외부 상태관리 패키지 추가
- UI 전체 재디자인
- 별도의 새 프로젝트 생성
