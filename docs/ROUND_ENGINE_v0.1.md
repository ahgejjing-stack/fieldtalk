# FIELDTALK Round Engine v0.1

## 목적
라운드, 홀, 플레이어, 거리, 스코어, PTT, 사운드 이벤트가 서로 독립적으로 흩어지지 않도록 하나의 상태 모델에서 관리한다.

## MVP 원칙
- React 프로토타입에서는 로컬 상태와 localStorage만 사용한다.
- Firebase나 실제 GPS는 아직 연결하지 않는다.
- UI 컴포넌트가 라운드 데이터를 직접 소유하지 않는다.
- 모든 변경은 명시적인 action을 통해서만 발생한다.
- 이후 Flutter/Firebase로 옮겨도 데이터 구조를 유지할 수 있어야 한다.

## Round 상태

```js
{
  id: "round_demo_001",
  status: "active", // setup | active | paused | completed
  course: {
    id: "course_demo",
    name: "레이크사이드 CC",
    totalHoles: 18
  },
  currentHoleNumber: 7,
  startedAt: "2026-07-14T09:00:00+09:00",
  completedAt: null,
  settings: {
    unit: "meter",
    soundMode: "fun", // silent | low | fun
    outputTargets: ["phone", "headphones", "watch"]
  },
  holes: [],
  players: [],
  events: []
}
```

## Hole 상태

```js
{
  number: 7,
  par: 4,
  courseDistanceM: 356,
  status: "playing", // pending | playing | scoring | completed
  pin: {
    latitude: null,
    longitude: null,
    position: "front" // front | center | back | unknown
  },
  wind: {
    speedMps: 2.3,
    directionDeg: 225,
    relativeToPin: "headwind", // headwind | tailwind | cross_left | cross_right | calm | unknown
    source: "mock"
  },
  startedAt: null,
  completedAt: null
}
```

## 핵심 Action
- `ROUND_START`
- `ROUND_PAUSE`
- `ROUND_RESUME`
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

## 상태 전이

### 라운드
`setup -> active -> paused -> active -> completed`

### 홀
`pending -> playing -> scoring -> completed`

`NEXT_HOLE`은 현재 홀이 `completed`일 때만 허용한다.

## 이벤트 로그
모든 중요한 변경은 이벤트로 남긴다.

```js
{
  id: "evt_001",
  type: "DISTANCE_SHARED",
  roundId: "round_demo_001",
  holeNumber: 7,
  actorPlayerId: "player_jaesik",
  createdAt: "2026-07-14T10:12:03+09:00",
  payload: {
    referenceDistanceM: 132
  }
}
```

## localStorage
- Key: `fieldtalk.round.active.v1`
- 앱 재실행 시 활성 라운드를 복원한다.
- 손상된 데이터는 seed 상태로 안전하게 되돌린다.
- 버전 필드를 두어 추후 마이그레이션 가능하게 한다.
