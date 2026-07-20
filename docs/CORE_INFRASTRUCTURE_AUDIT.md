# Core Infrastructure Audit (Build Phase)

**목적**: 구현이 아니라 감사. 이 문서는 코드를 한 줄도 바꾸지 않고, 현재 코드베이스를 직접 읽고 grep한 결과만으로 작성했다. 판단이 아니라 "이 파일의 이 줄에 이렇게 쓰여 있다"는 사실에 근거한다.

**감사 방법**: `src/` 전체를 대상으로 (1) 실제 기능이 구현된 파일 확인, (2) `fetch`/`WebSocket`/`WebRTC`/`getUserMedia`/`navigator.geolocation` 등 외부 연동에 반드시 필요한 브라우저 API 호출 유무를 grep, (3) 데이터가 상수/하드코딩인지 계산된 값인지 각 파일을 직접 읽어 확인.

---

## 요약 (한 줄씩)

| 영역 | 상태 |
|---|---|
| 1. Golf Course / Course Data | **Mock Only** |
| 2. Round Room / Companion Invitation | **Mock Only** (일부는 UI조차 없음 = Not Implemented) |
| 3. PTT / Network | **Mock Only** (로컬 상태 시뮬레이션, 실제 오디오·네트워크 없음) |
| 4. Wind | **Mock Only** (UI·변환 로직은 완성, 데이터 소스 없음) |

**네 영역 모두 외부 연동이 전혀 없다.** `src/` 전체에서 `fetch(`, `axios`, `XMLHttpRequest`, `WebSocket`, `RTCPeerConnection`, `getUserMedia`, `navigator.geolocation` — 이 중 단 하나도 사용되지 않는다(직접 grep 확인, 아래 각 섹션에 결과 첨부). 지금 있는 건 전부 `useReducer` 기반의 로컬 Round Engine과 `localStorage` 영속성뿐이다.

---

## 1. Golf Course / Course Data — **Mock Only**

### 1) 관련 파일
- `src/data/roundSeed.js` — 코스/홀 데이터의 유일한 출처
- `src/components/HomeScreen.jsx` — 코스 이름이 표시되는 유일한 화면
- `src/components/DistanceCard.jsx` — "그린 구분"/"핀 위치 정보" DEV 컨트롤(핀 좌표 대체용 임시 UI)
- `src/engine/distanceCalculator.js` — 거리 계산(좌표 기반 아님)

### 2) 실제 동작
- `round.course = { id: "course_demo", name: "레이크사이드 CC", totalHoles: 18 }` — 딱 이 3개 필드뿐(`roundSeed.js:184-188`).
- 홀 18개 배열(`buildHoles()`)이 매번 코드로 생성되는데, **7번 홀 하나만** `par`/`courseDistanceM`/`wind` 실값이 있고 나머지 17개는 `par: 4, courseDistanceM: null`인 플레이스홀더(`roundSeed.js:33-73`).
- GPS 거리는 `GPS_BASE_M = 136`(상수) + 플레이어별 고정 오프셋(`DEFAULT_MOCK_OFFSETS_M`)의 단순 덧셈이다(`roundSeed.js:101,120`, `roundStorage.js:50-52`). 실제 위경도 좌표를 이용한 거리 계산(하버사인 등)은 코드 어디에도 없다.

### 3) 목업 / 하드코딩 부분
- 코스 이름 "레이크사이드 CC"는 `roundSeed.js`와 `HomeScreen.jsx` 두 곳에 각각 하드코딩된 문자열(동기화 안 됨 — 하나를 바꿔도 다른 곳은 안 바뀜).
- `pin.latitude`/`pin.longitude`는 시드 전체에서 **항상 `null`**(`roundSeed.js:43-44, 68`) — 한 번도 실제 값이 들어간 적 없음.
- `HomeScreen.jsx`의 "최근 라운드" 목록(`레이크사이드 CC`, `파인밸리 GC`)도 하드코딩 배열(`HomeScreen.jsx:31-32`).
- "그린 구분"/"핀 위치 정보"(단일/좌/우, 모름/예상/정확) DEV 토글은 실제 좌표를 대체하는 임시 시뮬레이션 스위치다(`DistanceCard.jsx`) — 실측 보정 계산(`demo_mock_offset`)조차 좌표가 아니라 플레이어별 **고정 상수**를 쓴다(`distanceCalculator.js:112, 120`).

### 4) 부족한 데이터
- 코스 검색/선택에 필요한 코스 DB(이름, 위치, 홀 레이아웃) 자체가 없음.
- 홀별 실제 PAR/거리/티 좌표/그린 좌표(다중 핀 포지션 포함) 없음.
- 사용자 현재 위치(위경도) — `navigator.geolocation` 호출이 코드에 전혀 없음(grep 결과 0건).
- 코스 데이터 캐시 레이어 없음 — `localStorage`에 저장되는 건 라운드 전체 상태(`fieldtalk.round.active.v1`)와 Gallery 즐겨찾기(`GalleryPanel.jsx`)뿐, 코스 데이터 전용 캐시는 없음.

### 5) 구현 시 위험 요소
- 코스 DB가 생기면 `round.course`의 필드 3개(id/name/totalHoles)로는 부족 — **스키마 확장이 필요**(아래 제안 참고).
- 실제 좌표 기반 거리 계산으로 전환하면 `distanceCalculator.js`의 `demo_mock_offset` 방식(상수 오프셋)을 완전히 대체해야 함 — 지난 GPS Delta Correction 작업(`calculateTeamDistances`)에서 이미 "라이브 GPS + 델타" 패턴을 쓰고 있어서, 좌표 기반으로 갈 때 재사용 가능한 뼈대는 있음.
- 티/그린 다중 좌표(파5 홀 등)까지 가면 `hole.pin`이 단일 객체가 아니라 배열/맵이 되어야 할 수 있음 — `roundReducer.js`의 `HOLE_SET_PIN_LOCATION_STATUS` 액션 shape에 영향.

### 6) 핵심 엔진 영향도
**높음.** `round.course`/`hole.pin`/`hole.wind` 전부 `roundReducer.js`가 소유한 shape라, 실 데이터 연동 시 리듀서 스키마 변경이 불가피함(이번 감사에서는 변경 안 함).

### 최소 데이터 모델 제안 (구현 안 함, 제안만)
```
course: {
  id, name,
  location: { latitude, longitude, address },
  totalHoles,
  holes: [
    {
      number, par, teeBoxes: [{ name, color, distanceM, latitude, longitude }],
      green: { latitude, longitude, frontLatitude, frontLongitude, backLatitude, backLongitude },
      pins?: [{ id, label, latitude, longitude, activeDate }] // 다중 핀 지원 시
    }
  ]
}
```
캐시 레이어는 "코스 상세는 자주 안 바뀌니 로컬(IndexedDB 등)에 캐시 + TTL" 정도의 별도 스토어를 `roundStorage.js`와 분리해서 두는 걸 제안. (제안일 뿐 — 이번엔 안 만듦.)

---

## 2. Round Room / Companion Invitation — **Mock Only**

### 1) 관련 파일
- `src/components/HomeScreen.jsx` — 초대 UI 전부
- `src/data/roundSeed.js` — 플레이어 4명이 하드코딩된 유일한 출처

### 2) 실제 동작
- `HomeScreen.jsx`의 `invited` 상태는 그냥 `useState({ jaegeun: true, gwangcheon: true, haeran: false })`(`HomeScreen.jsx:20`) — 로컬 컴포넌트 상태일 뿐이다.
- `toggleInvite(id)`는 `invited[id]`를 뒤집는 게 전부(`HomeScreen.jsx:22`) — 실제로 아무에게도 아무것도 전송하지 않는다.
- `onStartRound` → `App.jsx`의 `handleStartRound`가 화면을 Round로 전환할 뿐, Room ID를 만들거나 서버에 뭔가를 등록하는 코드는 없음.

### 3) 목업 / 하드코딩 부분
- **"3명 초대 가능"**(`HomeScreen.jsx:71`) — 고정 텍스트. 실제 정원 검증 로직이 코드 어디에도 없음(`grep "players.length\|MAX_PLAYER"` 결과 0건).
- **"초대됨"/"온라인"/"오프라인"** 배지 — `companions` 배열 자체가 `HomeScreen.jsx:23-27`에 인라인 하드코딩(`online: true/false`도 정적 값). 새로고침하면 `invited`는 초기값(재근·광천만 true)으로 리셋됨 — 지속되지 않음.
- `round.players`(Round Engine의 실제 4명)는 `roundSeed.js`에 완전히 고정된 배열 — `HomeScreen.jsx`의 `invited` 상태와 **아무 연결이 없다**. 즉 홈 화면에서 누구를 "초대 취소"해도 라운드 시작하면 4명 다 그대로 들어온다.

### 4) 부족한 데이터
- Room(Session) 개념 자체가 코드에 없음 — `roomId`/`sessionId`로 grep해도 0건.
- Host/Member 구분 필드 없음(`round.players`에 role 유사 필드 없음, `player.role`이 있긴 하나 "host"/"member"라는 문자열이 `roundSeed.js`에 있는지는 있지만 실제 권한 분기 로직은 없음 — 표시용 라벨에 가까움).
- 초대 링크, QR, 최근 동반자 목록(실제 히스토리), 참여 상태(pending/accepted/declined), 연결 상태(realtime), 방 종료 — 전부 미구현.

### 5) 구현 시 위험 요소
- 지금 Round Engine은 "4명이 항상 이미 다 있다"고 가정하고 설계돼 있음(`selectPlayers()`가 빈 배열이나 가변 인원을 특별히 처리하지 않음) — 실제 초대·참여 플로우가 생기면 "아직 안 온 사람"을 나타내는 상태(pending 등)를 Round Engine 스키마에 추가해야 하고, PTT 대상 목록·Player Summary 패널 등 이미 만든 UI들이 전부 "고정 4명" 가정 위에 있어서 영향 범위가 넓음.
- 실시간 참여 상태가 생기면 결국 §3(PTT/Network)과 같은 서버·소켓 인프라가 필요해짐 — 두 영역이 사실상 같은 인프라를 공유하게 될 가능성이 높음.

### 6) 핵심 엔진 영향도
**중간~높음.** 지금은 `HomeScreen.jsx`가 Round Engine과 완전히 분리돼 있어서(진짜 "장식"에 가까움) 그 자체로는 영향도 낮지만, 실제로 연결하려면 `round.players`를 가변 길이로 바꿔야 해서 하위 selector들(특히 `selectPlayerSummary`, PTT 대상 로직)에 영향을 줄 것으로 예상됨.

---

## 3. PTT / Network — **Mock Only**

### 1) 관련 파일
- `src/components/PTTButton.jsx` — 버튼 인터랙션
- `src/utils/radio.js` — 칩톤 효과음(Web Audio API로 직접 합성)
- `src/engine/roundReducer.js` — `PTT_START`/`PTT_STOP` 케이스
- `src/components/RoundScreen.jsx` — "말하는 중" 데모 시뮬레이션

### 2) 실제 동작
- `PTT_START`는 `player.communication.isSpeaking`을 `true`로 바꾸는 게 전부(`roundReducer.js:244-266`). "동시에 한 명만 말할 수 있다"는 가드도 이 로컬 불리언 값끼리 비교하는 것뿐(`roundReducer.js:253-257`).
- `radio.js`의 "칩톤"은 `AudioContext`로 오실레이터 파형을 직접 합성한 것(`radio.js:8`) — 실제 오디오 파일도, 마이크 입력도 아니다.
- `RoundScreen.jsx`의 "해란이 말하는 중" 데모는 `setTimeout`으로 `startPtt("player_haeran")`/`stopPtt(...)`를 스크립트로 호출하는 것 — 실제 원격 신호가 온 게 아니라 코드가 흉내 낸 것.

### 3) 목업 / 하드코딩 부분
- **음성 캡처 없음**: `getUserMedia`/`MediaRecorder`/`MediaStream`을 `PTTButton.jsx` 전체에서 grep하면 0건.
- **원격 전송 없음**: `WebRTC`/`RTCPeerConnection`/`WebSocket`/signaling/STUN/TURN/SFU — `src/` 전체에서 전부 0건.
- **대상 선택(Sprint 3)과 네트워크는 완전히 무관**: `selectedTargets`는 `RoundScreen.jsx`의 로컬 `useState`일 뿐이고, PTT 버튼의 `canTransmit` prop을 게이팅하는 용도로만 쓰인다(`RoundScreen.jsx:137-140, 233-236`). "해란에게만 전송"을 선택해도 실제로 해란에게만 도달하게 만드는 라우팅 계층 자체가 없다 — 버튼이 눌리느냐 마느냐만 결정할 뿐, 그 다음엔 어차피 로컬 `isSpeaking` 플래그 하나만 바뀐다.

### 4) 부족한 데이터
- 실시간 통신 인프라(시그널링 서버, STUN/TURN, 또는 최소한 오디오 중계 서버) 전체.
- 오디오 캡처·인코딩·스트리밍 파이프라인.
- "누가 누구에게 말하고 있는지"를 다른 클라이언트에 전파할 신호 채널.

### 5) 구현 시 위험 요소
- 이건 이번 프로젝트에서 가장 인프라 리스크가 큰 영역이다 — 브라우저 WebRTC를 쓰더라도 최소 시그널링 서버 하나는 필요하고, 4인 이상 동시 음성이면 SFU 없이 P2P 메시(mesh)로는 대역폭이 빠르게 부담스러워진다.
- 지금 대상 선택 UX(Sprint 3)는 "송신 대상을 정하는 UI"까지만 완성돼 있어서, 실제 네트워크가 붙으면 그 선택값을 서버로 넘겨 "이 사람들에게만 오디오를 전달"하는 라우팅 규칙으로 그대로 이어붙일 수 있는 인터페이스는 이미 있다 — 그 점은 유리하다.
- "동시에 한 명만" 규칙(`roundReducer.js`)은 로컬 검증이라, 실제 멀티 유저 환경에선 레이스 컨디션(두 명이 거의 동시에 PTT를 누르는 경우)에 대한 서버 측 중재가 별도로 필요함 — 지금 로직을 그대로 서버로 옮기는 걸로는 부족.

### 6) 핵심 엔진 영향도
**매우 높음.** `communication.isSpeaking`이 로컬 상태에서 "서버가 알려주는 상태"로 바뀌는 순간, PTT 관련 리듀서 케이스 전체(`PTT_START`/`PTT_STOP`)와 이를 구독하는 선택자(`selectSpeakingPlayer`, `selectPlayerCardEvent`)의 데이터 흐름 방향이 바뀐다(로컬 dispatch → 서버 이벤트 수신 → dispatch). 지금 하듯 UI만 건드려서 될 범위가 아니다.

---

## 4. Wind — **Mock Only**

### 1) 관련 파일
- `src/components/RoundScreen.jsx` — 표시 UI + 변환 로직(`describeWind`, 8방위 변환)
- `src/data/roundSeed.js` — 유일한 데이터 소스(하드코딩)

### 2) 실제 동작
- `hole.wind = { speedMps, directionDeg, relativeToPin, source: "mock" }` 구조는 잘 갖춰져 있고, `describeWind()`(`RoundScreen.jsx:29-33`)가 `directionDeg`를 8방위 화살표+라벨로 정확히 변환한다(회전 각도 계산 로직 자체는 정상 동작, 이전 턴에 실측 검증함).
- `source: "mock"`이라는 필드가 이미 있어서, 코드 스스로 "이건 가짜 데이터"라고 표시하고 있다 — 실 API 연동 시 이 필드를 `"api"`로 바꾸기만 하면 되게 설계돼 있음.

### 3) 목업 / 하드코딩 부분
- 시드 18홀 중 **딱 7번 홀 하나만** 실 목업값(`speedMps: 2.3, directionDeg: 225`)이 있고, 나머지 17개는 전부 `null`(`roundSeed.js:52-58` vs `:69-73`) — 다른 홀로 넘어가면 항상 "바람 정보 없음"이 뜬다(이전 감사에서 이미 확인, 버그 아니라 데이터 부재).
- `relativeToPin` 필드는 존재하지만 **어디에서도 읽히지 않는다**(`grep relativeToPin` 결과 정의부 2곳 외 사용처 0건) — "headwind"라는 값이 있어도 그냥 죽은 데이터다. 맞바람/뒷바람 계산 로직 자체가 없다는 뜻.

### 4) 부족한 데이터
- 실제 Weather API 연동 — `fetch` 호출 자체가 없음(재확인, 0건).
- 사용자/코스 위치 — §1과 동일하게 `navigator.geolocation` 없음, 코스 좌표도 없어서 "어느 지역 날씨를 조회할지" 특정할 방법이 없음.
- 핀 좌표 — §1과 동일 이유로 없음, 있어야 "상대 풍향"(맞바람/뒷바람/옆바람) 계산이 가능해짐.
- 상대 풍향 계산 로직 자체 — 필드만 있고 계산 함수가 없음.

### 5) 구현 시 위험 요소
- Weather API 연동은 이 앱이 순수 프론트엔드 프로토타입이라 API 키를 브라우저에서 직접 쓰는 건 프로토타입 단계에서만 허용 가능 — 실 배포 시 백엔드 프록시 필요(이전 감사에서도 동일하게 짚었던 부분).
- 상대 풍향 계산을 하려면 "티→핀 방향"과 "바람 방향"을 비교해야 하는데, 이건 §1의 티/핀 좌표 데이터가 먼저 있어야 함 — **Wind는 사실상 Course Data(§1)에 종속적**이다. Wind만 따로 실 데이터로 만들 수는 있지만(풍속/풍향만), "상대 풍향"까지 제대로 하려면 좌표가 선행돼야 함.

### 6) 핵심 엔진 영향도
**낮음.** `hole.wind`는 이미 완전한 필드 구조를 갖추고 있고 UI 변환 로직도 끝나 있어서, 실 데이터가 들어오면 `source` 값만 바뀌고 리듀서/선택자 구조 변경은 거의 없을 것으로 예상됨 — 네 영역 중 엔진 영향도가 가장 낮다.

---

## 종합 — 다음 구현 순서 제안 (구현 안 함, 순서만 제안)

현재 코드베이스 상태를 기준으로, **의존 관계**와 **엔진 영향도**를 함께 고려하면:

1. **Wind API 연동** — 엔진 영향도 최저, 이미 UI·변환 로직 완성. 가장 빠르게 "Mock Only → Implemented"로 전환 가능한 영역. 단, "상대 풍향"까지 하려면 §2 이전에 최소한의 코스/핀 좌표가 있어야 함 — 풍속/풍향만 먼저 실 데이터로 붙이고 상대 풍향은 좌표 작업 이후로 미루는 단계적 접근을 제안.
2. **Course Data(좌표 포함)** — 이후 모든 영역(정확한 GPS 거리, 상대 풍향, 코스 검색)의 기반이 되는 영역이라 우선순위가 높음. 지금 GPS Delta Correction에서 이미 검증된 "라이브 값 + 델타" 패턴을 좌표 기반으로 확장하는 방향을 제안.
3. **Round Room / Companion Invitation** — Course Data보다 독립적이라 순서를 바꿔도 되지만, PTT/Network(4번)와 인프라(서버, 실시간 상태)를 상당 부분 공유할 가능성이 높아서, 두 영역을 동시에 설계하는 걸 제안(따로 두 번 설계하면 나중에 다시 합쳐야 할 위험).
4. **PTT / Network(실 음성)** — 인프라 리스크와 엔진 영향도가 가장 크다. Round Room 인프라와 함께 설계하되, 구현은 가장 마지막이 안전 — 다른 세 영역과 달리 "로컬 상태 확장"이 아니라 "데이터 흐름의 방향 자체가 바뀌는"(로컬 dispatch → 서버 이벤트) 유일한 영역이라, 나머지가 먼저 안정된 뒤 착수하는 게 리스크 관리 측면에서 유리하다고 판단됨.

이번 감사에서는 코드 변경이나 새 파일(이 문서 제외) 생성 없이 현재 상태 확인만 진행했습니다.
