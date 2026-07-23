# RC4 상태(State) 구조 — Room / Round 분리

Founder 요청: "기능보다 상태를 먼저 정리한다."
현재 `HOME → TEAM CONNECT → ROOM → NETWORK → ROUND`가 섞여 있어
Round Start / Leave Room / Host Transfer가 함께 꼬이는 문제를 해결하기 위한
목표 상태도와, 현재 코드의 어느 값이 각 상태를 나타내는지 정리한다.

---

## 1. 목표 상태도

```
HOME
 └─(방 만들기)─────────────► CREATE ROOM
                                 │ (room 생성 완료)
                                 ▼
                            ROOM READY  ◄────────────┐
                                 │                    │
        ┌────────────────────────┼──────────────┐     │
        │(Round Start)           │(Leave Room)  │     │(Round End)
        ▼                        ▼              │     │
      ROUND                   LEAVE ROOM        │     │
        │                        │              │     │
        │(Round End)             ▼              │     │
        └────────────────────► HOME             └─────┘
```

Guest는 CREATE ROOM을 거치지 않는다:

```
초대 링크 ──► 이름 확인 ──► ROOM READY   (초대 성공 = 팀 연결 완료)
```

---

## 2. 두 개의 독립된 상태축

핵심 원칙: **Room 상태와 Round 상태는 서로 다른 축이며 섞이지 않는다.**

### 축 A — Room (참가/멤버십)
| 상태 | 판별 | 의미 |
|---|---|---|
| `NO_ROOM` | `room == null` | 방 없음. 홈 로컬 라운드만 가능 |
| `ROOM_READY` | `room != null && room.status !== "in_round"` | 방 존재, 라운드 준비 중 |
| `ROOM_IN_ROUND` | `room.status === "in_round"` | 이 방이 라운드 진행 중 |

Room을 소유한 것: 참가자 목록(`room.members`), `room.hostUserId`, `room.code`.
**서버가 authoritative**이며 클라이언트는 미러링만 한다.

### 축 B — Round (플레이)
| 상태 | 판별 | 의미 |
|---|---|---|
| `NO_ROUND` | `round.isNetworkBaseline === true && players.length === 0` | 클린 베이스라인(로딩) |
| `ROUND_ACTIVE` | `round.status === "active" && players.length > 0` | 라운드 진행 중 |
| `ROUND_COMPLETE` | `round.status === "completed"` | 종료됨 |

Round가 소유한 것: 홀/스코어/이벤트/플레이어 스냅샷.

### 축 C — Transport (네트워크)
| 상태 | 판별 |
|---|---|
| `LOCAL` | `networkCommunicationEnabled === false` |
| `NETWORK` | `networkCommunicationEnabled === true` |

**규칙: `room != null` 이면 반드시 `NETWORK` 여야 한다.**
이 불변식이 깨진 것이 실기기의 `networkEnabled=false + room 존재` 상태이며,
Room 관련 기능(라운드 생성/로스터 동기화/room_leave)이 전부 무력화된 원인이다.

---

## 3. 이벤트 → 상태 전이표

| 이벤트 | Room | Round | Transport | 화면 |
|---|---|---|---|---|
| 방 만들기 | NO_ROOM → ROOM_READY | 변화 없음 | LOCAL → NETWORK | home(overlay) |
| 초대 참가(Guest) | NO_ROOM → ROOM_READY | 변화 없음 | LOCAL → NETWORK | home(overlay) |
| Round Start(Host) | ROOM_READY → ROOM_IN_ROUND | NO_ROUND → ROUND_ACTIVE | 유지 | round |
| round_started 수신(Guest) | ROOM_IN_ROUND | NO_ROUND → ROUND_ACTIVE | 유지 | round |
| **홈으로 이동** | 유지 | 유지 | 유지 | round → home |
| **라운드 종료** | ROOM_IN_ROUND → ROOM_READY | ROUND_ACTIVE → ROUND_COMPLETE | 유지 | round → home |
| **방 나가기** | ROOM_* → NO_ROOM | → NO_ROUND(리셋) | NETWORK → LOCAL | → home |
| Host 이탈(타 기기) | hostUserId 갱신 | 유지 | 유지 | 유지 |

세 개의 종료 동작이 **서로 다른 열 조합**을 갖는다는 점이 핵심이다.
(테스트 K가 이 분리를 강제한다.)

---

## 4. 현재 코드 매핑

| 개념 | 코드 |
|---|---|
| Room 상태 | `useRoom().room` (roomReducer) |
| Round 상태 | `useRound().round` (roundReducer) |
| Transport | `useRuntimeMode().networkCommunicationEnabled` |
| 화면 | `App.jsx`의 `screen` |
| 서버 권위 로스터 | `communication.members` → 미러 이펙트 |
| 서버 권위 host | `communication.hostUserId` → `roomSetHost` |

전이 핸들러(App.jsx):
- `handleGoHome` — 화면만
- `handleLeaveRoom` — Room 해체 + Transport off + Round 리셋
- `handleEndRound` — Round만 완료, Room 유지

---

## 5. 남은 리팩터링 (RC5 제안)

1. **불변식 강제**: `room != null ⇒ NETWORK`를 한 곳(Provider)에서 보장.
   현재는 RoomOverlay의 안전망으로 응급 처치되어 있음.
2. **용어 통일**: "팀 연결" 제거 완료 → Host는 "방 만들기", 공통 화면은 "라운드 준비".
3. **참가 방식 확장**: MVP는 초대 링크 + Room Code.
   추후 Room Name + Join Code를 위해 `roomJoinByCode`에 인증 파라미터 자리를 남겨둠.
4. **screen을 상태에서 파생**: 현재 `screen`은 독립 useState라 Room/Round와 어긋날 수 있음.
   `deriveScreen(room, round)` 형태로 단일화하면 P0-1류 불일치가 구조적으로 불가능해진다.
