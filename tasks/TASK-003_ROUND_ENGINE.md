# TASK-003 — Round Engine 기반 상태 관리

## 목표
현재 각 컴포넌트에 흩어진 더미 상태를 중앙 Round Engine으로 통합한다. 외형은 유지하고 데이터 흐름만 정리한다.

## 참조 문서
- `docs/ROUND_ENGINE_v0.1.md`
- `docs/PLAYER_STATE_v0.1.md`
- `docs/schemas/round.example.json`

## 구현 범위

### 1. 파일 추가

```text
src/
  engine/
    roundReducer.js
    roundActions.js
    roundSelectors.js
    roundStorage.js
  context/
    RoundProvider.jsx
    useRound.js
  data/
    roundSeed.js
```

### 2. RoundProvider
- `useReducer` 기반으로 구현한다.
- `App.jsx`에서 앱 전체를 `RoundProvider`로 감싼다.
- 현재 React 프로토타입에 Redux/Zustand 등 외부 상태 라이브러리를 추가하지 않는다.

### 3. reducer action
최소 다음 action을 구현한다.

- `ROUND_START`
- `ROUND_COMPLETE`
- `HOLE_START`
- `HOLE_SET_STATUS`
- `HOLE_COMPLETE`
- `NEXT_HOLE`
- `PLAYER_SET_STATUS`
- `PLAYER_SET_DISTANCE`
- `PLAYER_SET_SCORE`
- `PTT_START`
- `PTT_STOP`
- `SOUND_PLAYED`

### 4. selector
최소 다음 selector를 구현한다.

- `selectCurrentHole(round)`
- `selectPlayers(round)`
- `selectSpeakingPlayer(round)`
- `selectPlayerById(round, playerId)`
- `selectCurrentHoleScores(round)`

### 5. 기존 컴포넌트 연결
- `RoundScreen.jsx`는 Round Engine에서 현재 홀과 플레이어 목록을 읽는다.
- `PlayerCard.jsx`는 전달받은 player 모델을 표시한다.
- `PTTButton.jsx`는 `PTT_START`, `PTT_STOP`을 dispatch한다.
- `DistanceCard.jsx`는 거리 입력 시 `PLAYER_SET_DISTANCE`를 dispatch한다.
- `ScoreCard.jsx`는 점수 변경 시 `PLAYER_SET_SCORE`를 dispatch한다.
- `GalleryPanel.jsx`는 사운드 재생 성공 시 `SOUND_PLAYED` 이벤트를 기록한다.

### 6. 저장 및 복원
- `localStorage` key는 `fieldtalk.round.active.v1`을 사용한다.
- 상태 변경 시 debounce 없이 MVP 수준으로 저장해도 된다.
- JSON 파싱 실패나 스키마 이상 시 `roundSeed`로 복원한다.
- `ROUND_COMPLETE` 후에도 기록은 남기되 활성 라운드 상태와 구분한다.

### 7. 상태 규칙
- `PTT_START`는 이미 다른 플레이어가 말하고 있으면 거부한다.
- 거부 시 UI 토스트: `"{이름}님이 말하는 중입니다."`
- `NEXT_HOLE`은 현재 홀이 completed일 때만 동작한다.
- 마지막 18번 홀 이후에는 라운드를 completed로 전환한다.
- 거리 입력은 1~1000m 범위만 허용한다.

## 제외 범위
- 실제 음성 전송
- Firebase
- GPS 실측
- 기상 API
- 워치 동기화
- React Router 도입

## 완료 기준
- 기존 UI가 시각적으로 깨지지 않는다.
- 홈에서 라운드 시작 후 7번 홀 데이터가 중앙 상태에서 렌더링된다.
- 재식 PTT 시작 시 재식 카드가 말하는 상태로 변한다.
- 다른 플레이어가 말하는 중일 때 두 번째 PTT 시작이 차단된다.
- 거리와 스코어 변경 후 페이지 새로고침을 해도 복원된다.
- 홀 완료 후 다음 홀로 이동한다.
- `npm run build`가 성공한다.
- 변경된 전체 프로젝트 ZIP을 제공한다.

## 작업 원칙
기존 코드를 전면 재작성하지 말고 필요한 최소 범위만 수정한다. 구현 후 변경 파일 목록과 테스트 결과를 README 또는 별도 `CHANGELOG.md`에 기록한다.
