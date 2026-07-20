# FIELDTALK Architecture v1
## Foundation Design — "골프장에서 사용하는 무전기"

이 문서는 코드가 아니라 구조 설계다. 지금 있는 Round Engine(`useReducer` + `localStorage`, `docs/ROUND_ENGINE_v0.1.md`)과 `docs/CORE_INFRASTRUCTURE_AUDIT.md`에서 확인한 "지금 실제로 있는 것 / 목업인 것"을 출발점으로 삼는다. 완전히 새로 그리는 설계가 아니라, 지금 구조 위에 무엇을 더 세워야 하는지를 정리한 것에 가깝다.

**원칙**: PTT 하나만 잘 만드는 게 아니라, 거리·GPS·실측·응원·스코어·라운드가 전부 **같은 Room이라는 하나의 컨테이너 위**에서 동작해야 한다. 지금 Round Engine이 이미 "하나의 Round 안에 거리·스코어·이벤트가 다 같이 산다"는 원칙으로 만들어져 있고(`round.players[].distance`, `round.players[].scoreByHole`, `round.events`), 이 문서는 그 원칙을 Room 레벨로 한 단계 넓히는 작업이다.

---

## 1. Domain Model

### 1.1 Entity 목록과 역할

| Entity | 역할 | 지금 코드에서의 대응 |
|---|---|---|
| **User** | 로그인된 실제 사람. Round와 무관하게 존재(계정) | 없음 — 지금은 `player.name`/`cheerName`/`voiceGender`가 Round마다 하드코딩됨(`roundSeed.js`) |
| **Room** | 라운드를 하기 위해 사람들이 모이는 세션 컨테이너. Round의 부모 | 없음 — `HomeScreen.jsx`의 초대 UI는 Room과 완전히 분리된 장식(감사 결과) |
| **Invitation** | Room에 특정 사람을 초대한 기록 | 없음 |
| **Round** | 실제 플레이 세션(18홀 진행) | `roundReducer.js`의 `state` 전체 — 이미 있음 |
| **Player** | 한 User가 특정 Round 안에서 갖는 상태(거리·스코어·연결 상태) | `round.players[]` — 이미 있음 |
| **GolfClub** | 실제 골프장 시설(부지) | 없음 — `round.course.name`이 문자열 하나뿐 |
| **Course** | GolfClub 안의 특정 18홀 레이아웃 | `round.course` — id/name/totalHoles 3필드뿐(목업) |
| **Tee** | Course 안의 티 세트(챔피언/블루/화이트/레드 등) | 없음 |
| **Hole** | Course에 속한 개별 홀(PAR, 핸디캡, 거리) | `round.holes[]` — par/courseDistanceM만 있고 핸디캡·좌표 없음 |
| **Green** | Hole에 속한 그린의 정적 정의(경계, 중심 좌표) | 없음 — `hole.pin`이 그린이 아니라 "핀 위치 상태 플래그"에 가까움(목업) |
| **Pin** | 그날그날 바뀌는 핀 위치(Round-scoped) | `hole.pin.{latitude,longitude,greenSelection,locationStatus}` — 좌표는 항상 null |
| **Wind** | 특정 시점의 풍향/풍속 | `hole.wind` — 필드 구조는 완성, 값은 홀 1개만 목업 |
| **Distance** | 한 Player의 특정 홀 거리 정보(GPS/실측) | `player.distance.{gps,manual}` — 이미 있음, 계산 로직도 있음(GPS Delta Correction) |
| **Score** | 한 Player의 특정 홀 타수 | `player.scoreByHole[holeNumber]` — 이미 있음 |
| **PTT Session** | 한 번의 송신(발화자·대상·시작/종료) | 없음 — 지금은 `player.communication.isSpeaking` 불리언 하나뿐, 대상 개념이 Round Engine에 아예 없음(로컬 UI 상태) |
| **Voice Event** | 종료된 PTT Session의 기록 | `round.events`의 `PTT_STARTED`/`PTT_STOPPED` — 이미 있음(발화자만 기록, 대상은 없음) |
| **Cheer** | 재생된 응원/효과음 1건 | `round.events`의 `SOUND_PLAYED` — 이미 있음 |
| **Gallery** | 응원/효과음 카탈로그(정적 참조 데이터) | `soundCatalog.json` — 이미 있음(번들 파일) |
| **History** | 종료된 Round의 영구 기록 | 없음 — 완료된 Round도 활성 Round와 같은 localStorage 키에 남아있다가 다음 라운드 시작 시 덮어써짐(감사 결과 재확인) |
| **Notification** | 사용자에게 보내는 알림(초대, 재연결 등) | 없음 |

### 1.2 소유 관계 (누가 누구를 갖는가)

```
User ──< Player (한 User는 여러 Round에서 여러 Player가 됨, 시간에 따라 N개)
User ──< Room (Host로서, 또는 Invitation을 통해 Member로서)

GolfClub ──< Course (한 클럽에 코스 여러 개 — 동/서코스 등)
Course ──< Tee (챔피언/블루/화이트/레드 등)
Course ──< Hole (순서 있는 18개, 혹은 9개)
Hole ──< Green (보통 1:1, 드물게 더블그린 1:N)
Hole ──< HoleTee (Hole × Tee 조합별 거리·티박스 좌표 — 다대다를 풀어주는 연결 엔티티)

Room ──1 Course (라운드 시작 전 선택)
Room ──1 Host (Player 중 1명)
Room ──< Member (=Player, Host 포함)
Room ──< Invitation (초대 발송 기록)
Room ──1 Round (Room이 "플레이 중" 상태가 되면 Round 1개 생성 — 1:1)

Round ──1 Course (스냅샷 — Room이 참조하는 Course를 시작 시점에 복사해두는 편을 권장, 아래 3.4 참고)
Round ──< Player (Room의 Member가 Round 시작 시 Player로 전환)
Round ──< Hole (Course의 Hole을 이번 라운드용으로 인스턴스화 — 상태(status)를 가지므로 Course의 Hole과는 별개 객체)
Round ──1 Pin (홀별로, 그날의 핀 위치 — Course의 정적 Green과 분리)
Round ──< PTTSession ──1 VoiceEvent(종료 시)
Round ──< Cheer
Round ──< Score (Player별 × Hole별)
Round ──< Distance (Player별 × Hole별)
Round → History (종료 시 1건 생성)

Gallery (독립, 누구에게도 속하지 않음 — 전역 참조 데이터)
Notification ──1 User (수신자)
```

핵심 판단: **Course는 Room이 참조**하지만, **Round는 그 시점의 Course 스냅샷을 따로 가져야 한다.** 코스 데이터가 나중에 업데이트되거나(핀 위치가 매일 바뀌는 것처럼) 관리자가 홀 정보를 수정해도, 이미 끝난 라운드의 기록(History)이 바뀌면 안 되기 때문이다. 자세한 이유는 §3.4.

---

## 2. Round Lifecycle

```
Home
  │
  ▼
Room Create ─────────── User가 Host가 되어 Room 생성, Course 선택
  │                       생성 데이터: Room{id, hostId, courseId, status:"forming"}
  ▼
Invite ────────────────  Host가 최근 동반자 또는 링크/QR로 초대
  │                       생성 데이터: Invitation[]{roomId, inviteeUserId?, token, status:"pending"}
  ▼
(Member Join) ─────────  각 Member가 수락 → Room에 합류
  │                       생성 데이터: RoomMember{roomId, userId, joinedAt, connectionStatus}
  ▼
Room Ready ────────────  전원(또는 Host 판단으로 일부) 합류 완료
  │                       상태 전이만, 새 엔티티는 생성 안 함
  ▼
Round Start ───────────  Host가 시작 버튼 → Round 생성
  │                       생성 데이터: Round{id, roomId, courseSnapshot, players:[...], holes:[...]}
  │                       (Room.members → Round.players로 전환, 이 시점 이후 Room.members 변경은
  │                        Round에 자동 반영 안 됨 — 아래 §4.5 Reconnect 참고)
  ▼
Playing (홀 반복) ─────  각 홀에서: 거리 공유(Distance), 스코어 입력(Score),
  │                       PTT(VoiceEvent), 응원(Cheer) 전부 발생 가능
  │                       생성 데이터: 홀마다 Distance*N, Score*N, PTTSession*, Cheer*
  ▼
Hole Complete ─────────  "홀 완료·다음 홀" — 현재 Hole.status = completed
  │                       홀 전환마다 반복(18번)
  ▼
Round Complete ────────  마지막 홀 완료 또는 Host의 조기 종료
  │                       생성 데이터: Round.status = "completed", Round.completedAt
  ▼
History ───────────────  Round 전체(스냅샷 + 이벤트 로그)를 User별 기록으로 영구 저장
                          생성 데이터: HistoryEntry{userId, roundId, summary, archivedAt}
                          이 시점에 Room은 닫힘(Room.status = "closed")
```

### 2.1 단계별 데이터 생성 요약

| 단계 | 생성되는 데이터 | 지금 있는가 |
|---|---|---|
| Room Create | `Room` | ❌ 없음 |
| Invite | `Invitation[]` | ❌ 없음(HomeScreen의 로컬 토글뿐) |
| Member Join | `RoomMember[]`, connectionStatus | ❌ 없음 |
| Round Start | `Round`(courseSnapshot 포함), `Player[]` | ✅ 있음(단, Room 없이 바로 하드코딩된 4명으로 시작) |
| Playing | `Distance`, `Score`, `PTTSession`, `Cheer` | ✅ 있음(전부 로컬 상태) |
| Hole Complete | `Hole.status` 전이 | ✅ 있음 |
| Round Complete | `Round.status`, `Round.completedAt` | ✅ 있음(이벤트로 기록됨) |
| History | `HistoryEntry` | ❌ 없음(완료된 Round가 영구 보존되지 않음) |

지금 구조는 사실상 **"Room Ready" 이후부터 시작**하는 셈이다 — Room Create/Invite/Join 세 단계가 통째로 비어있고, 대신 그 자리를 `roundSeed.js`의 고정 4인 데이터가 대신하고 있다.

---

## 3. Course Data

### 3.1 계층 구조

```
GolfClub
 └─ Course (N개, 예: "동코스", "서코스", "동+서 18홀")
     ├─ TeeSet (N개, 예: 챔피언/블루/화이트/레드)
     └─ Hole (순서 있는 9 또는 18개)
         ├─ HoleTee (Hole × TeeSet 조합별 거리 + 티박스 좌표)
         └─ Green (그린 경계/중심 좌표 + 기본 핀 존 정보 + Wind Reference)
```

### 3.2 MVP 최소 필드 제안

```
GolfClub { id, name, address, latitude, longitude }

Course { id, golfClubId, name, holeCount }

TeeSet { id, courseId, name, color, courseRating, slopeRating }

Hole {
  id, courseId, number, par,
  strokeIndex,              // "핸디캡" — 홀 난이도 순위(1~18)
  green: {
    latitude, longitude,           // 그린 중심(정적)
    frontLatitude, frontLongitude, // 그린 앞
    backLatitude, backLongitude,   // 그린 뒤
    windReferenceId                // 가장 가까운 기상 관측점/센서 참조(§3.3)
  }
}

HoleTee {
  holeId, teeSetId,
  distanceM,
  teeLatitude, teeLongitude
}

Pin {                        // Course가 아니라 Round(또는 "오늘의 코스 상태")에 속함 — §1.2 참고
  holeId, roundId?,          // roundId가 없으면 "오늘 전체 코스 공통 핀 배치"로 취급 가능
  latitude, longitude,
  positionLabel,             // 예: "2번 핀"
  setAt, source              // source: "course_staff" | "api" | "manual"
}
```

핸디캡(strokeIndex)은 지금 데이터 모델에 전혀 없다 — 스코어 화면에서 "이 홀이 몇 번째로 어려운 홀인지"를 보여주려면 필요하지만, MVP 우선순위는 낮게 잡아도 될 항목이다.

### 3.3 Wind Reference

`docs/CORE_INFRASTRUCTURE_AUDIT.md`에서 확인했듯, 지금 `hole.wind`는 필드 구조는 완성돼 있지만 실 데이터가 없다. Wind는 Course에 종속적이지 않고(매 순간 바뀌므로) **Hole이 어느 관측점을 참고할지**만 Course Data가 들고 있으면 된다 — `Hole.green.windReferenceId`가 그 역할이다. 실제 풍속/풍향 값 자체는 Round 시작 시(혹은 홀 진입 시) 그 순간 외부 API에서 가져와 `Round.holes[n].wind`에 스냅샷으로 저장하는 편을 제안한다(코스 정적 데이터가 아니라 Round 데이터로).

### 3.4 스냅샷 원칙 — 왜 Round가 Course를 복사해야 하는가

Course Data가 서버에 생기면, 코스 관리자가 나중에 핀 배치를 수정하거나 홀 정보를 고칠 수 있다. 그런데 **이미 끝난 라운드의 기록(History)은 그 라운드를 플레이했던 "그 순간의 코스 상태"를 보존해야 한다** — 나중에 코스 데이터가 바뀌었다고 지난 라운드의 스코어카드에 표시되는 PAR이 바뀌면 안 된다. 그래서:

- `Room.courseId`는 **참조**(라이브 코스 데이터를 계속 가리킴 — 초대 화면에서 최신 코스 정보를 보여줄 때 씀)
- `Round.courseSnapshot`은 **복사본**(Round 시작 시점의 Course/Hole 데이터를 그대로 얼려서 저장)

이 원칙은 이미 지금 구조에도 부분적으로 있다 — `round.holes[]`가 `Course.holes`를 그대로 참조하지 않고 Round 자신의 배열로 따로 갖고 있는 것도 같은 이유(홀마다 `status`라는 Round-only 필드가 있어야 하기 때문)다.

---

## 4. Round Room

### 4.1 역할 구분

| 역할 | 권한 |
|---|---|
| **Host** | Room 생성자. Course 선택, 초대 발송, Round 시작, 조기 종료 권한 |
| **Member** | 초대를 수락해 합류한 사람. 본인 상태(거리·스코어)만 변경 가능(이미 확립된 원칙 — "동반자 점수를 대신 완성해야 하는 구조로 만들지 않는다") |

`role: "host"/"member"` 필드는 이미 `roundSeed.js`의 Player 객체에 존재한다(감사에서 확인) — 지금은 표시용 라벨에 가깝고 실제 권한 분기가 없을 뿐, 필드 자체는 이 설계와 이미 맞아떨어진다.

### 4.2 상태 흐름

```
[Room 없음]
     │ Host: Room Create
     ▼
forming ──────────────── Host가 초대 발송 중, Member 합류 대기
     │
     │ Member: Invitation 수락 → Join
     ▼
forming (Member 수 증가) ─── 전원 합류 전까지 반복
     │
     │ Host 판단(전원 합류 or 일부만으로 시작)
     ▼
ready ──────────────────── Round Start 가능 상태
     │
     │ Host: Round Start
     ▼
in_round ──────────────── Round 진행 중 (Room은 이제 Round의 "컨테이너" 역할)
     │
     │ Round Complete
     ▼
closed ─────────────────── Room 종료, History로 이관
```

### 4.3 Join / Leave

- **Join**: Invitation 토큰 검증 → RoomMember 생성 → 다른 Member에게 "OO님이 참여했습니다" 알림(Notification).
- **Leave**: forming 단계에서는 자유롭게 나갈 수 있음(참가 취소). in_round 단계에서는 "나가기"가 곧 Disconnect와 사실상 같음 — 완전히 나가는 것보다 "일시적 연결 끊김"으로 우선 처리하고, Host가 명시적으로 "이 사람 없이 계속 진행"을 선택할 때만 Round에서 완전히 제외하는 편을 제안한다(골프 특성상 전파가 잠깐 끊기는 게 흔하므로).

### 4.4 Reconnect / Disconnect

- **Disconnect**: 네트워크 문제로 연결이 끊긴 상태. `player.connection = "offline"`(이미 있는 필드값)로 표시. 이미 Player Card의 Event Board가 "연결 끊김"을 최우선으로 보여주는 구조가 있다(`selectPlayerCardEvent`) — 이 판단 로직은 그대로 재사용 가능하고, 지금은 로컬 데모용 값이지만 실제 연결 상태 신호로 갈아끼우기만 하면 되는 형태다.
- **Reconnect**: 재연결 시 그동안 놓친 이벤트를 따라잡아야 한다 — Round의 `events` 로그가 이미 append-only 구조라(`round.events`), "마지막으로 받은 이벤트 ID 이후를 다시 받는" 재동기화 전략과 잘 맞는다. 완전히 새 설계가 필요한 부분이 아니라, 지금 이벤트 로그 구조를 그대로 재사용할 수 있는 지점이다.

### 4.5 Round End

- Host가 "라운드 종료"를 명시적으로 선택하거나, 18번 홀을 완료하면 자동 종료.
- 종료 시 Room.status = "closed", Round → History 이관, 아직 연결돼 있던 Member들에게 "라운드가 종료되었습니다" Notification.
- Room이 닫힌 뒤에는 같은 Room으로 재입장 불가(새 Room을 다시 만들어야 함) — 이렇게 해야 History가 "몇 번째로 만든 Room이었는지"와 무관하게 Round 단위로 깔끔하게 남는다.

---

## 5. PTT

### 5.1 지금 UX와의 연결

Sprint 3에서 만든 대상 선택 UX(전체/개인/다중 선택, PTT 게이팅)는 이미 이 설계가 요구하는 **인터페이스 모양**을 정확히 갖추고 있다 — 감사에서 확인했듯 지금은 그 선택값이 로컬 UI 상태(`selectedTargets`)로 끝나고 실제 라우팅과 연결되지 않을 뿐이다. 즉 **UI를 다시 만들 필요는 없고, 그 선택값을 어디로 보낼지만 새로 생기면 된다.**

### 5.2 PTT Session 모델

```
PTTSession {
  id, roundId, speakerId,
  targets: "all" | playerId[],   // 지금 selectedTargets와 동일한 모양
  startedAt, endedAt,
  status: "active" | "ended"
}
```

- 송신 시작 시 `PTTSession` 생성(status: active) → 서버가 대상자들에게 오디오 스트림 라우팅 시작.
- 종료 시 `status: ended`, `endedAt` 기록 → `VoiceEvent`로 전환되어 `round.events`에 남음(이미 있는 `PTT_STOPPED` 이벤트 타입을 확장하면 됨 — 지금은 대상 정보가 없는데 `targets` 필드만 추가).

### 5.3 전체 / 개인 / 다중 선택

이미 확립된 원칙 그대로: "전체"도 명시적으로 선택하는 하나의 대상이다(브로드캐스트가 기본값이 아님). 서버 라우팅 관점에서는:
- `targets: "all"` → Room의 다른 모든 Member에게 라우팅
- `targets: [playerId, ...]` → 지정된 Player에게만 라우팅

### 5.4 Speaker 상태 / 동시 송신

지금 리듀서의 "동시에 한 명만 말할 수 있다" 규칙(`someoneElseSpeaking` 체크)은 **클라이언트 로컬 검증으로는 근본적으로 불충분**하다 — 두 사람이 거의 동시에 버튼을 누르면 각자의 클라이언트에서는 "아무도 말하고 있지 않다"고 판단해 둘 다 시작 신호를 보낼 수 있다. 서버(또는 Room을 중재하는 신호 채널)가 "이 Room에서 지금 말하고 있는 사람"을 단일 진실 소스로 갖고 있어야 하고, 클라이언트의 기존 체크는 "빠른 피드백용 낙관적 UI"로만 남기는 편을 제안한다(서버 응답을 기다리지 않고 일단 눌렀을 때 반응하되, 서버가 거절하면 되돌림).

### 5.5 Queue

지금은 Queue 개념이 없다(두 번째 사람은 그냥 막힘 — "말하는 중입니다" 토스트). MVP 이후 확장으로, "지금 말하는 사람이 끝나면 자동으로 다음 대기자에게 순서가 넘어가는" 큐를 Room 레벨에 둘 수 있다. 다만 무전기 UX 원칙("빠른 판단, 설명 없는 조작")과 충돌할 수 있어 — 대기 큐가 생기면 "내가 지금 몇 번째인지"를 알려줘야 하는 새로운 UI 부담이 생긴다 — MVP 범위에는 넣지 않는 편을 제안한다.

### 5.6 Reconnect 중 PTT

재연결 도중에는 송신도 수신도 불가능한 게 맞다(§7 Offline 전략과 동일선상). 재연결 완료 후 "지금 Room에서 말하고 있는 사람이 있는지"를 서버에서 한 번 조회해 동기화하면 된다 — 별도의 복잡한 상태 복구 로직 없이, PTTSession이 서버에 살아있는 단일 진실 소스이기 때문에 클라이언트는 그냥 다시 물어보기만 하면 된다.

---

## 6. Data Ownership

| 데이터 | 위치 | 이유 |
|---|---|---|
| **GolfClub / Course / Tee / Hole(정적 부분)** | **Server** | 여러 사용자가 공유하는 참조 데이터, 자주 안 바뀜 |
| **Pin(오늘의 핀 위치)** | **Server**(+ 클라이언트 Cache) | 매일 바뀌지만 Room의 전원이 같은 값을 봐야 함 |
| **Wind** | **Server**(외부 API 경유) → Round에 스냅샷 | 실시간이지만 Round 시작 시점 값으로 고정해야 일관성 있음 |
| **Room / Invitation** | **Server** | 여러 사용자가 동시에 참조·갱신 |
| **Round(진행 중)** | **Realtime**(서버가 중재, 클라이언트는 구독) | 여러 Player가 동시에 같은 Round를 봐야 함 — 지금의 "로컬 useReducer"가 이 자리를 서버 동기화로 대체해야 하는 지점 |
| **Player 실시간 상태(연결·발화 중)** | **Realtime** | Room 내 전원이 즉시 알아야 함 |
| **Distance / Score(입력 순간)** | **Realtime**(입력) + **Server**(영구 저장) | 입력은 즉시 전파, 최종값은 서버가 보존 |
| **PTT 오디오 스트림 자체** | **Realtime**(P2P 또는 SFU 경유, 저장 안 함) | 저장이 목적이 아니라 전달이 목적 |
| **History** | **Server** | 영구 보존, User가 여러 기기에서 조회 가능해야 함 |
| **Gallery(카탈로그)** | **Server**(또는 앱 번들 + 버전 체크) | 전역 공통 참조 데이터, 개인화 없음 |
| **Gallery 즐겨찾기** | **Local**(지금 그대로 유지) | 개인 취향, 동기화 필요성 낮음 — 지금 `GalleryPanel.jsx`의 `localStorage` 방식이 이미 맞는 선택 |
| **Settings(음소거, 사운드 모드 등)** | **Local**(기기별) | 기기마다 다를 수 있음(워치는 무음, 폰은 소리 등) |
| **PTT 대상 선택(`selectedTargets`)** | **Local**(세션 중에만) | "내 다음 송신을 누구에게 보낼지"는 다른 사람이 몰라도 되는 내 의도 — 지금 이미 이렇게 판단해서 로컬로 뒀고(Sprint 3), 이 설계에서도 같은 판단을 유지한다 |

**분류 기준**: "여러 명이 동시에 같은 값을 봐야 하는가"(Realtime), "자주 안 바뀌고 여러 명이 공유하는가"(Server), "이 기기·이 사람만의 것인가"(Local), "서버 값을 잠깐 들고 있는 것뿐인가"(Cache).

---

## 7. Offline 전략

| 기능 | Offline 가능 여부 | 이유 |
|---|---|---|
| Course Data 조회(이미 캐시된 코스) | ✅ 가능 | 자주 안 바뀌는 참조 데이터, 최근 방문 코스는 사전 캐시 가능 |
| 진행 중인 Round의 거리/스코어 입력 | ✅ 가능(로컬 큐잉 후 재연결 시 동기화) | 지금 구조가 이미 "로컬 상태 우선"이라 이 부분은 사실 지금 방식과 가장 가까움 |
| 최근 완료 Round(History) 조회 | ✅ 가능(로컬 캐시본이 있다면) | 이미 본 데이터 재조회일 뿐 |
| Wind(실시간 갱신) | ❌ 불가(마지막으로 받은 값만 표시) | 외부 API 필요 |
| PTT(음성 송수신) | ❌ 불가 | 실시간 네트워크 필수 — 대체 수단 없음 |
| Room 초대/합류 | ❌ 불가 | 서버 중재 필요 |
| 새 Round 시작(코스 미캐시 상태) | ⚠️ 제한적 | 코스 데이터가 미리 캐시돼 있어야만 가능 |

**원칙**: "내가 이미 아는 것"(캐시된 코스, 진행 중인 내 입력)은 오프라인에서도 최대한 버티고, "지금 이 순간 다른 사람과 실시간으로 맞춰야 하는 것"(PTT, Room 합류, 실시간 바람)만 명확히 안 된다고 보여준다. 거리/스코어 입력을 로컬에 큐잉했다가 재연결 시 서버로 동기화하는 전략은, 이미 확립된 "설명 없이 자연스럽게" 원칙과도 맞는다 — 사용자는 오프라인인지 몰라도 입력은 계속 되고, 나중에 조용히 맞춰지면 된다.

---

## 8. MVP 이후 확장성 검토

| 확장 대상 | 지금 구조로 유지 가능한가 | 근거 |
|---|---|---|
| **Watch** | ✅ 가능 | Sprint 2에서 `PlayerCard.jsx`를 `summary` prop만 받는 순수 컴포넌트로 만들어둔 것, `selectPlayerSummary()`가 렌더링 로직과 분리된 selector인 것 — 둘 다 "같은 데이터를 다른 화면에 다르게 그리기" 구조라 워치 레이아웃 추가 시 데이터 계층을 그대로 재사용 가능 |
| **Android / iPhone** | ✅ 가능 | 지금 구조가 React 기반 UI와 순수 JS 상태(리듀서/셀렉터)를 분리해뒀기 때문에, 상태 관리 로직(Round Engine)은 플랫폼 무관하게 재사용 가능한 형태 — 다만 지금은 웹 프로토타입이라 실제 네이티브 전환 시 상태 동기화 계층(현재 Realtime으로 분류한 부분)은 새로 구현 필요 |
| **Tablet** | ✅ 가능(레이아웃만 조정) | 화면 크기 대응은 이미 컴포넌트 단위로 분리돼 있어 큰 구조 변경 없이 가능 |
| **AI Caddie** | ⚠️ 조건부 가능 | Course Data(§3)가 실 좌표 기반으로 갖춰지고 Distance/Wind가 실 데이터가 된 이후에만 의미 있는 조언이 가능 — 지금 이 설계의 §3, §6에서 다루는 "Course/Wind는 Server 소유, Round가 스냅샷"이라는 원칙이 먼저 서야, AI Caddie가 "이 상황에서의 판단"을 할 재료(정확한 거리, 바람, 핸디캡)가 생긴다. 지금 구조를 바꿔야 하는 게 아니라, §3의 확장이 먼저 필요한 **선행 조건** 관계 |

**공통 관찰**: 지금 구조가 확장에 유리한 이유는 하나다 — Round Engine이 처음부터 "리듀서(상태 변경 규칙) + 셀렉터(파생 데이터 계산) + 컴포넌트(렌더링)"를 분리해서 만들어져 왔기 때문. 이 분리 원칙이 없었다면 Watch/AI Caddie 같은 "같은 데이터, 다른 소비 방식" 확장마다 로직을 새로 짜야 했을 것이다. 이번 아키텍처 설계도 이 분리 원칙을 Room/Course 레벨까지 그대로 끌고 올라간 것에 가깝다.

---

## 부록 — 이번 설계에서 의도적으로 다루지 않은 것

- **결제/과금 구조** — MVP 범위 밖으로 판단해 제외.
- **관리자(코스 데이터 입력) 도구** — Course Data가 Server 소유가 된다는 건 정했지만, 누가 어떻게 입력/검증하는지는 별도 설계가 필요.
- **PTT 오디오 코덱/품질 설계** — §5는 "누구에게 라우팅되는가"까지만 다루고, 실제 오디오 처리 파이프라인(인코딩, 지연시간 목표 등)은 `docs/CORE_INFRASTRUCTURE_AUDIT.md` §3의 "구현 시 위험 요소"에서 이미 짚은 별도 영역.

이번 Sprint는 설계 문서 작성까지이며, 코드나 새 컴포넌트는 만들지 않았습니다.
