# FIELDTALK Real PTT Architecture & Implementation Plan v1

기준 문서: `docs/PRODUCT_CHARTER_v1.0.md`, `docs/ARCHITECTURE_v1.1.md`, `docs/PRE_ROUND_EXPERIENCE_v1.md`, `docs/COURSE_REFERENCE_IMPLEMENTATION_v0.2.md`. 이번 Sprint는 실제 음성 네트워크를 구현하지 않는다 — "현재 로컬 PTT UX를 유지하면서, 실제 Room 기반 음성 송수신을 어떤 구조로 연결할 것인지 구현 가능한 수준으로 확정"하는 것이 목표다. 코드는 수정하지 않았다.

---

## 1. 현재 PTT 구현 감사

코드베이스 전체를 직접 읽고 grep한 결과다(`getUserMedia|MediaStream|MediaRecorder|RTCPeerConnection|WebSocket|RTCDataChannel`를 `src/` 전체에서 검색 — **0건**).

| 항목 | 상태 | 근거 |
|---|---|---|
| PTTButton이 실제 마이크를 캡처하는가 | **Not Implemented** | `PTTButton.jsx` 전체에 `getUserMedia` 호출 없음(직접 확인) |
| `getUserMedia` 사용 여부 | **Not Implemented** | 위와 동일, `src/` 전체 검색 0건 |
| `MediaStream`/`MediaRecorder` 사용 여부 | **Not Implemented** | 동일 검색 0건 |
| WebRTC 사용 여부 | **Not Implemented** | `RTCPeerConnection` 등 0건 |
| WebSocket/signaling 사용 여부 | **Not Implemented** | `WebSocket` 0건 |
| 실제 원격 기기로 전송되는가 | **Not Implemented** | 전송 계층 자체가 없음 |
| 현재 칩톤·햅틱·애니메이션 범위 | **Implemented**(로컬 연출) | `src/utils/radio.js`가 Web Audio API 오실레이터로 "시작/종료" 칩톤을 직접 합성(외부 음원 없음), `navigator.vibrate()`로 햅틱, `PTTButton.jsx`의 ripple/breathing 애니메이션과 `VoiceLevelBars.jsx`(0.12초마다 `Math.random()`로 막대 높이 갱신 — 실제 오디오 레벨과 무관한 순수 시각 연출) |
| `PTT_START`/`PTT_STOP`이 저장하는 상태 | **Implemented**(로컬 상태만) | `roundReducer.js` — `player.communication.isSpeaking`/`speakingSince`/`lastSpokeAt`만 갱신, 오디오 데이터는 전혀 없음. `PTT_STOP`은 `round.events`에 `PTT_STOPPED` 이벤트도 남김(발화자 ID만, 대상 정보 없음) |
| 송신 대상 선택 상태가 저장되는 위치 | **Local Simulation Only** | `RoundScreen.jsx`의 `useState(() => new Set())` — 컴포넌트 로컬 상태, Round Engine에 dispatch되지 않고 새로고침/언마운트 시 사라짐. `PTTButton`에는 `canTransmit` prop으로만 전달(게이팅 목적) |
| 전체/개별/다중 대상 규칙 | **Local Simulation Only** | `describeTargets()`/`toggleTarget()`(`RoundScreen.jsx`)이 UI 로직으로 전체 구현돼 있으나 전부 로컬 |
| 대상 없음 송신 차단 | **Implemented**(로컬) | `canTransmit={hasTarget}` → `PTTButton.jsx`의 `handleStart()`가 `!canTransmit`이면 `startPtt()` 자체를 호출 안 함(토스트만) |
| "한 명만 송신" 규칙이 로컬에서만 적용되는가 | **Local Simulation Only** | `roundReducer.js`의 `PTT_START` 케이스가 `someoneElseSpeaking` 체크 — **클라이언트 로컬 리듀서 하나**의 판단이라, 실제 다중 기기 환경에서는 두 기기가 동시에 눌렀을 때 각자 로컬에서 "아무도 말 안 함"으로 판단해 둘 다 통과할 수 있음(단일 진실 소스 없음) |
| Room Member ID와 Round Player ID의 연결 상태 | **Implemented**(로컬 매핑만) | `src/room/createRoundPlayersFromRoom.js` — `Player.id = RoomMember.userId` 그대로 사용(1:1 매핑, 실제 네트워크 세션과는 무관) |
| 수신 UI 존재 여부 | **Not Implemented**(진짜 의미로는) | `selectSpeakingPlayer()`/`selectPlayerCardEvent()`(`roundSelectors.js`)가 `communication.isSpeaking`을 **대상 여부와 무관하게 전체 공개**한다 — 즉 재식이 "해란"만 대상으로 선택하고 눌러도, 재근·광천 화면에도 "재식 말하는 중"이 똑같이 뜬다. **대상이 아닌 사람에게는 안 보이는 진짜 수신 UI는 없다.** |
| 음성 데이터 저장 여부 | **Not Implemented** | 캡처 자체가 없으므로 저장할 데이터도 없음 |

**핵심 결론**: 지금은 "PTT가 네트워크를 안 쓴다"가 아니라, **"PTT 버튼을 누르면 로컬 리듀서의 불리언 하나가 바뀌고 칩톤이 난다"**가 정확한 현재 상태다. 대상 선택 UX(Sprint 3)는 완성돼 있지만 그 선택값이 실제로 "누구에게 도달하는지"를 결정하는 코드는 어디에도 없다.

---

## 2. Product Requirements

### 필수
- Room 최대 4명
- Push-to-Talk(버튼을 누르는 동안만 송신)
- 대상 없음 → 송신 안 됨
- 전체 / 1명 / 복수 대상
- 송신자 본인 제외
- 한 Room에서 동시에 1명만 송신
- 송신 시작/종료 피드백(현재 칩톤/햅틱/애니메이션 재사용)
- 수신자에게 송신자 표시
- 짧은 재연결
- 네트워크 불량 표시
- 이어폰/스피커 출력
- 음성 녹음 및 서버 저장 안 함

### MVP 제외
텍스트 채팅, 음성 메시지 저장, 통화 녹음, 라운드 후 음성 재생, 대규모 공개 채널, 4명 초과 그룹, 관전자 채널, AI 음성 분석, 자동 번역.

---

## 2.5 이 문서 전반의 원칙

Final Criteria를 그대로 설계 기준으로 삼는다: PTT는 일반 그룹 통화가 아니라 **짧고 선택적인 전달**이고, **사용자가 대상을 먼저 선택**하며, **음성은 저장하지 않고**, **Room/Round는 음성 스트림을 소유하지 않으며**, **송신권은 서버가 최종 판정**한다.

---

## 3. Communication Model — 상태 머신

### PTT Client State
```
idle ──(대상 선택 + 버튼 누름)──▶ requesting ──(서버 승인)──▶ granted ──▶ transmitting
                                     │                                      │
                                     ├──(서버 거절/timeout)──▶ denied       │
                                     │                                      │
                                     └──(연결 끊김)──▶ reconnecting         │
                                                                            │
transmitting ──(버튼 뗌 또는 timeout)──▶ stopping ──▶ idle                 │
                                                                            │
어느 상태에서든 치명적 오류 ──▶ error ──(재시도/타임아웃)──▶ idle ◀─────────┘
```

| 상태 | 진입 조건 | 탈출 조건 | UI |
|---|---|---|---|
| `idle` | 초기/송신 종료 후 | 대상 선택됨 + 버튼 누름 | "길게 눌러 말하기"(현재와 동일) |
| `requesting` | 버튼 누름, 서버에 송신권 요청 전송 | 승인/거절/timeout | 버튼 눌림 상태 유지, 아직 칩톤 없음 |
| `granted` | 서버 승인 도착 | 즉시 `transmitting`으로 | (매우 짧은 전이 상태, UI 노출 최소) |
| `transmitting` | 승인 확정 | 버튼 뗌 / timeout / 서버 강제 종료 | 현재 "송신중 · 0:00" + ripple + VoiceLevelBars(실제 레벨로 교체) |
| `stopping` | 버튼 뗌 | 서버 ACK 또는 timeout | 짧은 전이, 종료 칩톤 재생 |
| `denied` | 다른 사람이 송신 중일 때 서버가 거절 | 토스트 표시 후 `idle` | "OO님이 말하는 중입니다"(현재 토스트 문구 그대로 재사용) |
| `reconnecting` | signaling/미디어 연결 끊김 | 재연결 성공/실패 | §10 참고 |
| `error` | 예상 못한 실패 | 재시도 또는 `idle` 복귀 | 최소한의 안내, 재시도 버튼 |

### PTT Room State (서버 소유)
```
idle ──(누군가 requesting → 승인)──▶ locked ──(송신 종료/timeout)──▶ releasing ──▶ idle
```
- `idle`: 아무도 송신권 없음, 다음 요청은 즉시 평가.
- `locked`: 정확히 1명이 송신권 보유. 다른 요청은 즉시 거절(`denied`).
- `releasing`: 짧은 전이 상태(ACK 대기) — 이 상태에서 새 요청이 들어오면 거절하거나 큐잉 없이 재시도 안내(§2 "Queue는 MVP 범위 밖" — 이전 Pre-Round 설계 문서에서 이미 같은 판단을 내린 바 있음, 일관성 유지).

### Timeout 정책(제안)
| 항목 | 제안값 | 근거 |
|---|---|---|
| `requesting` → 승인/거절 대기 | 1.5초 | 사람이 버튼을 누르고 "반응 없음"을 느끼기 시작하는 한계 근처 |
| `transmitting` 최대 지속시간(lease) | 60초 | 골프 상황에서 "짧고 선택적인 전달" 원칙과 일치 — 길어지면 서버가 강제 종료(§10) |
| heartbeat 간격(transmitting 중) | 5초 | 연결이 살아있는지 확인, 놓치면 lease 조기 만료 |
| `releasing` 유예 | 300ms | ACK 왕복 여유 |

---

## 4. Routing Policy

```
{
  roomId,
  senderUserId,
  targetUserIds,      // [] | ["all"] | [userId, ...]
  clientRequestId,     // 클라이언트 생성 idempotency key
  requestedAt
}
```

- `targetUserIds`가 빈 배열이면 **요청 자체를 생성하지 않는다** — 지금 `PTTButton.jsx`의 `!canTransmit` 분기가 이미 이 원칙으로 동작 중이고, 그대로 유지한다.
- `all`은 클라이언트가 "누가 all인지" 확정하지 않는다 — **서버가 요청 도착 시점의 joined/online 멤버에서 송신자를 제외하고 확정**한다(클라이언트가 알던 멤버 목록이 오래된 것일 수 있으므로).
- 개별/다중 대상은 서버가 Room Membership을 검증한다 — 클라이언트가 이미 `left`/`declined`된 사용자를 대상에 넣어 보내도 서버가 걸러낸다.
- `offline` 대상은 요청 자체는 성공하되, 그 특정 대상에 대해서만 전달 실패 상태를 반환할 수 있다(§ "일부 대상만 수신 가능"과 연결, §10).
- **네트워크 기준 식별자는 Round Player ID가 아니라 Room User ID**다(§8에서 상세).
- UI 선택값과 실제 전달 결과가 다를 경우: 요청은 항상 클라이언트가 선택한 시점의 **Snapshot**으로 보내고, 서버 응답에 "실제로 전달 시도한 대상"과 "실패한 대상"을 구분해 반환 — 클라이언트는 성공/실패를 대상별로 표시할 수 있다(구현은 Phase 3, §13).

**PTT 대상 선택은 Local UI 상태로 유지**한다(`RoundScreen.jsx`의 현재 `useState` 그대로) — 매 렌더마다 서버에 동기화할 필요 없이, **송신 요청을 보내는 바로 그 순간에만** 위 payload 형태로 스냅샷을 잘라 보낸다. 이 판단은 Course Reference 작업에서 "PTT 대상 선택은 Local UI 의도이며, 실제 송신 라우팅은 Room/Network 계층이 담당"이라고 이미 정해둔 원칙(`docs/ARCHITECTURE_v1.1.md`)과 정확히 같다.

---

## 5. Architecture Options 비교

| | A. WebRTC Mesh | B. WebRTC + SFU | C. WebSocket Audio Streaming | D. Managed Realtime Audio Service |
|---|---|---|---|---|
| 연결 구조 | 참가자끼리 P2P 풀메시 | 중앙 서버가 미디어 라우팅 | 서버가 PCM/Opus 청크 relay | LiveKit/Agora/Twilio 등 |
| Signaling | 직접 구축 필요 | 직접 구축 필요 | 필요(WebSocket 자체가 signaling 겸용 가능) | 대부분 SDK에 포함 |
| STUN/TURN | 필요(NAT 통과) | 필요 | 불필요(서버 relay로 우회) | 대부분 포함(TURN 크레덴셜만 발급) |
| 대상 라우팅 방식 | 각 피어가 개별 연결 열고 닫음 — "특정 대상에게만"이 곧 "그 피어와의 연결만 활성화" | 서버가 트랙 구독을 대상별로 제어 — Routing Policy(§4)를 서버 로직으로 구현하기 자연스러움 | 서버가 청크를 대상 목록에 맞춰 selectively relay | SDK의 Room/Track 구독 API로 대상 라우팅 구현(공급자마다 세부 API 다름) |
| 모바일/브라우저 한계 | 4명이면 이론상 가능하나 각 참가자가 N-1개 연결을 동시에 인코드/디코드 — PTT처럼 "매번 다른 대상 조합"이면 연결을 계속 새로 맺어야 해서 지연 발생 | 서버가 인코드 부담을 흡수, 클라이언트는 1개 연결만 유지 | 클라이언트 구현은 단순하나 오디오 코덱 처리(Opus 인코딩 등)를 직접 다뤄야 함 | SDK가 대부분 처리 |
| 배터리/네트워크 부담 | 참가자 수만큼 부담 증가(4명이면 상대적으로 크지 않지만, 매 PTT마다 대상이 바뀌면 연결 재협상 비용 발생) | 낮음(서버가 흡수) | 중간 | 낮음(SDK 최적화) |
| 구현 난이도 | 대상이 매번 바뀌는 PTT 특성상 signaling/연결 관리가 의외로 복잡 | 중간~높음(SFU 직접 구축 시) | 낮음~중간(단, 오디오 품질/지연 직접 관리) | 낮음(SDK가 껍데기 제공) |
| 운영 복잡도 | signaling 서버 + STUN/TURN 직접 운영 | 위와 동일 + SFU 서버 운영(또는 관리형 SFU) | relay 서버 운영, 오디오 처리 파이프라인 직접 구축 | 낮음(공급자가 인프라 담당), 대신 종속성 발생 |
| 비용 구조 | 자체 인프라 비용만(트래픽 대부분 P2P라 서버 비용 낮음) | 서버 대역폭 비용(모든 미디어가 서버 경유) | 서버 대역폭 + relay 처리 비용 | 사용량 기반 과금(분당/GB당 — **정확한 단가는 공급자 최신 확인 필요**) |

**A(Mesh)가 특히 PTT에 불리한 이유**: 일반 그룹 통화는 "누가 참여했나"가 통화 내내 고정이라 메시가 잘 맞지만, FIELDTALK PTT는 **매번 다른 대상 조합**으로 짧게 여러 번 송신하는 패턴이라 매번 연결을 다시 협상해야 하는 부담이 실제 통화보다 크다. B/D가 이 문제를 서버 쪽 트랙 구독 전환으로 훨씬 가볍게 처리한다.

D(관리형 서비스) 후보 관련, 2026년 7월 기준으로 조사한 내용(공급자 최신 확인 필요, 정확한 가격은 이 문서에서 확정하지 않음):
- **LiveKit**: 오픈소스, 자체 호스팅 가능(WebRTC/SFU 기반), JS/iOS/Android/React Native/Flutter 등 네이티브 SDK 폭넓게 제공. Cloud 관리형 옵션도 있음(무료 티어 존재 — 정확한 조건은 공급자 확인 필요). 자체 호스팅 시 규모가 커질수록 단가 이점이 있다는 자료가 많으나 그만큼 운영 부담이 실제로 발생.
- **Agora**: 자체 SD-RTN 글로벌 네트워크(특히 아시아/동남아 지연시간에 강점이 있다는 평가), 완전 관리형(자체 호스팅 옵션 없음), 사용량 기반 과금.
- **Twilio**: 더 넓은 통신 생태계(SMS/음성/PSTN)와 결합 가능하지만, 순수 음성/화상 유스케이스에서는 상대적으로 비용이 높다는 사례가 여러 자료에서 공통적으로 언급됨.
- 세 서비스 모두 PTT 자체를 "제품"으로 제공하지는 않는다 — Room/Track 구독 API 위에 FIELDTALK가 §3의 상태 머신과 §4의 라우팅 정책을 직접 구현해야 한다.

---

## 6. Recommended MVP Architecture — B(WebRTC + SFU, 관리형 서비스 우선)

**권장**: WebRTC 기반 SFU 방식을, **직접 구축이 아니라 관리형 서비스(D 카테고리, 후보 우선순위는 Founder가 §15에서 최종 결정)**를 통해 도입.

| 항목 | 권장 |
|---|---|
| Signaling | 선택한 관리형 서비스의 SDK가 제공하는 signaling 사용(자체 구축 안 함) |
| Media transport | WebRTC(관리형 서비스가 SFU 운영) |
| STUN/TURN/SFU 필요 여부 | 전부 필요하지만 관리형 서비스가 제공 — 직접 운영하지 않음 |
| Room authorization | FIELDTALK 자체 서버가 Room token을 발급(§11), 관리형 서비스에는 그 token으로만 접속 |
| PTT lock authority | **FIELDTALK 자체 서버**(관리형 서비스가 아니라 우리 도메인 서버) — §3의 Room State(`idle`/`locked`/`releasing`)를 우리가 소유해야 §4의 대상 라우팅 정책과 §2 "동시 1명만" 규칙을 온전히 통제할 수 있음 |
| Target routing | 관리형 서비스의 Track 구독 API 위에 §4 정책을 우리 서버 로직으로 구현 |
| Reconnection | 관리형 SDK의 재연결 기능 + FIELDTALK 서버의 Room 상태 재동기화(§10) |
| Audio codec | Opus(WebRTC 표준, 대부분 관리형 서비스 기본값) |
| Native migration path | 대부분의 관리형 서비스가 iOS/Android/React Native SDK를 이미 제공 — 웹 Prototype에서 네이티브 전환 시 SDK만 교체, §7의 Adapter 경계 덕분에 PTT UX/Round Engine은 무변경 |
| 예상 구현 난이도 | 중간 — signaling/STUN/TURN을 직접 안 만드니 낮아지지만, §3 상태 머신·§4 라우팅 정책·§11 검증 로직은 FIELDTALK가 직접 구현해야 함 |
| 직접 구축 vs 관리형 | **관리형을 권장.** 이유: (1) Room 최대 4명 규모에서 자체 SFU 운영은 투자 대비 효율이 낮음, (2) "초기 개발 인력과 운영 복잡도 최소화" 조건과 직접 부합, (3) §7의 Adapter 경계를 처음부터 강제하면 나중에 자체 SFU로 전환해도 PTT UX·Round Engine 재작성이 필요 없음 — 관리형으로 시작해도 "잠기는" 게 아니라 "미루는" 결정이 됨 |

이 권장의 핵심 전제: **PTT lock authority(누가 지금 말할 권리가 있는가)는 관리형 서비스가 아니라 FIELDTALK 자체 서버가 갖는다.** 관리형 서비스는 "미디어를 어떻게 나를지"만 담당하고, "누가 말해도 되는지"는 Room Engine과 같은 위치(우리 도메인)에 둬야 §2/§3의 규칙(동시 1명, 대상 검증)이 공급자 교체와 무관하게 유지된다.

---

## 7. Domain Boundary

```
RuntimeModeProvider
  → RoomProvider
    → CommunicationProvider   ← 신규
      → RoundProvider
        → App
```

`src/communication/`(신규, Room Engine·Round Engine과 동일한 급의 독립 도메인):
```
communication/
  PttClient.js          — §3 Client State Machine
  PttTransport.js        — 관리형 서비스 SDK를 감싸는 어댑터 인터페이스(§6의 "공급자 교체 가능" 경계)
  PttSignaling.js         — 요청/승인/거절 메시지 교환(Transport 위에서 동작)
  PttSession.js           — 진행 중인 송신 세션의 로컬 표현(대상, 시작 시각, lease 만료)
  PttStateMachine.js       — §3 상태 전이 로직(순수 함수, Round Engine의 reducer 패턴과 동일하게)
  AudioCapture.js          — 마이크 캡처 추상화(§9)
  AudioOutput.js           — 수신 오디오 재생 추상화(§9)
  adapters/
    LiveKitTransport.js (예시) — PttTransport 구현체 하나, 공급자별로 이 폴더에 추가
```

이 구조는 이미 이번 프로젝트에서 두 번 검증된 패턴이다 — `src/course/providers/`(Course Reference Provider Adapter)와 `src/room/`(Room Engine, Round Engine과 분리)이 **정확히 같은 경계 원칙**으로 이미 구현돼 있다. `communication/`도 같은 원칙을 그대로 적용하는 것뿐이다.

### 원칙 재확인
- **Room Engine**은 멤버십과 연결 상태(joinStatus/connectionStatus)를 소유 — 이미 그렇다(`src/room/roomReducer.js`).
- **Communication 계층**은 실제 음성과 송신권을 소유 — 지금 `player.communication.isSpeaking`(Round Engine 소유)에 있는 책임 중 "누가 말할 권리가 있는가" 부분이 여기로 옮겨가야 한다.
- **Round Engine**은 음성 스트림을 소유하지 않는다 — Round Engine에는 "지금 이 사람이 말하는 중이다"라는 **표시용 파생 상태**만 남고(예: `PttStateMachine`이 발행하는 이벤트를 구독해 `communication.isSpeaking`을 갱신), 실제 미디어/권한 로직은 없어야 한다.
- **PTT 버튼 컴포넌트는 특정 SDK를 직접 호출하지 않는다** — `PTTButton.jsx`는 지금처럼 `startPtt()`/`stopPtt()`류의 추상 함수만 호출하고, 그 함수가 내부적으로 `PttClient`를 통해 상태 머신을 굴린다.
- **네트워크 Provider가 바뀌어도 PTT UX와 Round Engine은 유지** — `PttTransport` 인터페이스만 지키면 `adapters/` 폴더에 구현체 하나 추가하는 정도로 공급자 교체가 끝난다(Course Reference의 `CourseReferenceProvider` 패턴과 동일).

---

## 8. Identity Mapping

현재 확인된 관계:

```
RoomMember.userId  ──(1:1, createRoundPlayersFromRoom.js)──▶  RoundPlayer.id
```

`UserProfile.userId`는 `docs/ARCHITECTURE_v1.1.md`에서 MVP Entity로 이미 정의됐지만 **코드에는 아직 구현되지 않았다**(감사 확인 — `src/`에 `UserProfile` 관련 파일 없음). 지금 "나"는 `roundSeed.js`의 `ME_PLAYER_ID = "player_jaesik"` 하드코딩 상수 하나가 사실상 그 역할을 대신하고 있다.

### 정책 제안
- **네트워크 기준 식별자는 `RoomMember.userId`를 그대로 사용하는 것이 맞다** — `RoundPlayer.id`가 이미 그 값을 그대로 물려받고 있으므로(§ 위 매핑), 새 ID 체계를 하나 더 만들 필요가 없다. `PTT senderUserId`/`targetUserIds`도 이 값을 쓴다.
- 다만 **`RoomMember.userId`가 지금은 사실상 영구 고정 값(하드코딩된 4명)**이라, 실제 로그인/UserProfile이 생기면 `userId`가 "이 세션에서 임시로 붙인 값"이 아니라 "그 사람의 영구 식별자"가 되도록 나중에 갈아끼워야 한다 — 지금 구조는 이 전환을 막지 않는다(Room이 `userId`를 그냥 문자열로 다루기 때문).
- **재연결 시 동일 사용자 식별**: `userId`(사람) + `deviceId`(이 세션에서 접속한 기기) + `sessionId`(이 연결 인스턴스) 3단 구분을 제안한다.
  - `userId`: Room 재입장·Round 재접속 전체에 걸쳐 고정.
  - `deviceId`: 같은 사람이 폰+워치로 동시에 들어올 수 있는 미래(§ MVP 이후 확장성)를 막지 않기 위해 필요 — 지금 당장은 "폰 하나"만 있어도 필드 자체는 미리 넣어두는 편을 제안.
  - `sessionId`: 재연결마다 새로 발급 — signaling/미디어 연결이 끊겼다 다시 맺어질 때 "같은 사람의 새 연결"임을 서버가 식별하는 값. `PttSession.js`가 소유.
- MVP 최소 식별 모델(제안, 구현 안 함):
```
{ userId, deviceId, sessionId, roomId, connectedAt }
```
익명/임시 사용자라도 `userId`만 있으면 Room 안에서 충분히 안정적으로 구분된다 — 로그인 붙기 전까지는 `userId`를 Room 참여 시 클라이언트가 로컬 저장(예: `localStorage`)해서 재진입 시 재사용하는 정도로 충분하다.

---

## 9. Audio Capture and Output

| 항목 | 웹 Prototype | 실제 모바일 앱 |
|---|---|---|
| 마이크 권한 요청 시점 | Pre-Round PTT Test 화면(`docs/PRE_ROUND_EXPERIENCE_v1.md` §3에서 이미 설계됨)에서 요청 — Round 중 첫 송신 때 갑자기 권한 팝업이 뜨는 걸 피함 | 동일 원칙, 네이티브 권한 다이얼로그로 |
| Echo cancellation / noise suppression / AGC | `getUserMedia`의 `audio` 제약조건으로 브라우저가 기본 제공(`echoCancellation`/`noiseSuppression`/`autoGainControl: true`) — 웹에서도 가능 | 네이티브 오디오 세션 API가 더 세밀한 제어 제공 |
| 이어폰/Bluetooth 출력 | 브라우저가 OS의 기본 출력 장치를 따름, 세밀한 제어 제한적 | 네이티브가 출력 경로 전환 이벤트를 앱에 알려줄 수 있음(§10 "Bluetooth 연결 해제") |
| 오디오 포커스(다른 앱 음악과 충돌) | 웹에서는 사실상 제어 불가 — 브라우저 탭이 백그라운드면 오디오 자체가 제한될 수 있음 | **네이티브 전환이 필요한 영역** — iOS `AVAudioSession`/Android `AudioFocus` API로 "PTT 송신 중엔 음악 일시 정지" 같은 처리 가능 |
| 화면 잠금 중 PTT | 웹에서는 사실상 불가(탭이 백그라운드로 가면 JS 타이머/오디오가 제한됨) | **네이티브 전환 필요** — 백그라운드 오디오 세션 유지, 잠금화면에서도 버튼 반응은 물리 볼륨 버튼 등 별도 UX 설계가 필요할 수 있음(이번 문서 범위 밖) |
| 백그라운드 유지 | 웹은 사실상 불가 | 네이티브에서 백그라운드 오디오 모드 필요(iOS `UIBackgroundModes: audio`) |
| 전화 수신 중 처리 | 웹에서 제어 불가 | 네이티브 오디오 세션이 자동으로 다른 통화에 포커스를 양보하도록 처리 가능 |
| 마이크 권한 철회 후 재진입 | `getUserMedia`가 실패하면 §10 "권한 거부" 흐름으로 처리 | 동일 원칙, OS 설정 딥링크 제공 가능 |
| 앱 재진입 | 웹은 탭 재활성화 시 권한 재확인 필요할 수 있음(브라우저 정책에 따라 다름) | 네이티브는 세션 유지가 더 안정적 |

**결론**: 마이크 캡처 자체와 기본 노이즈 처리는 웹 Prototype에서도 충분히 시연 가능하다(다음 Sprint 범위, §14). 하지만 **오디오 포커스, 백그라운드, 화면 잠금, 전화 수신 처리는 웹에서 근본적으로 한계가 있어 iOS/Android 네이티브 또는 최소 React Native/Capacitor 같은 하이브리드 전환이 필요**하다 — 이건 Phase 4(§13)의 전제 조건이지 지금 Phase 1~3에서 막힐 이유는 아니다.

---

## 10. Failure and Recovery

| 상황 | UX | 상태 복구 |
|---|---|---|
| 마이크 권한 거부 | "마이크 권한이 필요합니다" 안내, PTT 버튼은 계속 보이되 누르면 다시 안내(막지는 않음 — Score/PAR·Target 선택은 계속 가능, §2 Charter 원칙과 일치) | `PttClient` 상태는 `idle` 유지, 권한 재요청 가능 |
| 송신권 요청 timeout(§3, 1.5초) | "응답이 없습니다, 다시 시도해 주세요" | `requesting` → `idle` 자동 복귀 |
| 다른 사람이 송신 중 | 기존 토스트 문구 그대로("OO님이 말하는 중입니다") | `denied` → `idle`, 재시도는 사용자가 다시 누름 |
| 네트워크 단절(전반) | 상단에 "연결 끊김" 배지 | §10 heartbeat 참고 |
| Signaling 연결 끊김 | `reconnecting` 상태 진입, PTT 버튼 비활성 또는 "재연결 중" 표시 | 자동 재시도(지수 백오프 제안: 1s, 2s, 4s, 최대 3회 후 수동 재시도 안내) |
| 미디어 연결만 끊김(signaling은 살아있음) | "음성 연결 불안정" 표시, 대상 선택/Score 등은 정상 | 미디어만 재협상, Room/Round 상태는 그대로 |
| 일부 대상만 수신 가능 | 송신자에게 "일부 인원에게 전달되지 않았을 수 있습니다"(§4의 서버 응답 기반) | 실패한 대상만 개별 표시, 송신 자체는 계속 진행(전체 취소 안 함) |
| Bluetooth 연결 해제 | "이어폰 연결이 끊겼습니다, 스피커로 전환" | 오디오 출력 경로만 전환, PTT 세션은 유지 |
| PTT 누른 채 앱이 백그라운드로 이동 | 웹에서는 사실상 즉시 종료 처리(§9 한계와 연결) — 네이티브에서는 백그라운드 세션 유지 가능 | 서버가 heartbeat 누락으로 lease 만료 판단, `transmitting` 강제 종료 |
| 송신 종료 이벤트가 서버에 전달 안 됨 | 사용자 화면에는 즉시 `idle`로 보이지만 서버는 lease가 남아있을 수 있음 | **서버 쪽 lease timeout(§3, 60초)이 최종 안전장치** — 클라이언트 ACK 유실과 무관하게 일정 시간 후 자동 해제 |
| 송신자가 강제 종료됨(앱 크래시 등) | 다른 사용자 화면에서 "말하는 중" 표시가 사라짐(heartbeat 끊김 감지) | lease timeout으로 자동 해제, Room State `locked` → `releasing` → `idle` |
| Room은 살아있지만 Round 화면을 다시 연 경우 | PTT 상태를 서버에 재조회해 동기화(§ PRE_ROUND_EXPERIENCE 재연결 원칙과 동일 — "다시 물어보기만 하면 됨", 복잡한 로컬 복구 로직 불필요) | `PttClient`가 마운트 시 현재 Room의 송신자 유무를 1회 조회 |

**heartbeat 구조 제안**: `transmitting` 상태에서 5초마다 클라이언트가 서버에 heartbeat 전송, 서버는 15초(heartbeat 3회분) 동안 못 받으면 lease를 강제 만료시키고 Room State를 `idle`로 되돌린다. 60초 lease 자체는 "정상적으로 길게 말하는 경우"에 대한 상한선이고, heartbeat는 "비정상 종료를 빠르게 감지"하는 역할로 서로 다른 문제를 해결한다.

---

## 11. Privacy and Security

- **Room 참여자만 송수신**: Room token(서버 발급, §6) 없이는 미디어 서버 접속 자체가 불가.
- **송신자/대상 검증**: §4에서 이미 정의 — 서버가 매 요청마다 Room Membership을 재검증(클라이언트가 보낸 `targetUserIds`를 그대로 신뢰하지 않음).
- **음성 서버 저장 금지**: 관리형 서비스 설정에서 recording 기능을 기본 비활성 + 계약/설정 레벨에서 명시(공급자별 설정 방법은 §15에서 확정 필요).
- **로그에는 미디어 내용 저장 금지, PTT 시작/종료 이벤트만 기록**: 최소 로그 필드 제안 — `{roomId, senderUserId, targetUserIds, startedAt, endedAt, durationMs}`(오디오 내용/파형 없음).
- **TURN 자격 증명**: 단기 유효(예: 수 분) 임시 크레덴셜 발급 방식을 관리형 서비스가 기본 제공하는 경우가 많음 — 영구 크레덴셜을 클라이언트에 심지 않는다.
- **초대 링크 유출 대응**: 이번 Sprint(Round Room Foundation)엔 실제 초대 링크가 없어 해당 없음(§ 구현하지 않음) — 링크 기반 초대가 생기면 Room token과 별개로 단기 만료를 적용해야 함.
- **Room 종료 후 token 무효화**: `Room.status = "ended"`가 되는 순간 발급된 모든 token/TURN 크레덴셜을 즉시 폐기.
- **악의적 연속 송신 방지**: §3의 60초 lease + 요청 빈도 제한(예: 사용자당 분당 요청 횟수 상한)을 서버가 강제.
- **`targetUserIds` 조작 대응**: 이미 §4에 명시 — 서버가 항상 재검증하고, 클라이언트가 보낸 값은 "의도"로만 취급.

---

## 12. Cost and Operations

정확한 금액은 추정하지 않는다. 비용을 결정하는 요인만 정리한다.

- 동시 활성 Room 수
- Room당 평균 사용자 수(최대 4명 고정이라 이 축의 변동폭은 작음)
- 평균 송신 시간·빈도(PTT 특성상 "짧고 자주"라 일반 화상통화보다 총 미디어 분(分)은 낮을 가능성 — 검증 필요)
- TURN relay 비율(P2P/SFU 직결 대비 relay를 거치는 비율이 높을수록 비용 상승)
- SFU egress 트래픽(대상이 여러 명이면 서버가 여러 번 내보내야 함)
- Signaling 연결 유지 시간(Room에 머무는 시간 전체 — PTT 안 눌러도 연결 자체는 유지됨)
- 관리형 서비스 사용량 과금 단가(분당/GB당 — 공급자 최신 확인 필요)
- 지역별 서버(TURN/SFU 리전) 분산 필요 여부
- 로그/모니터링 저장 비용(§11의 최소 로그 필드 기준이면 낮음)
- 장애 대응(온콜/모니터링 인력 — 관리형 서비스는 이 부담이 공급자 쪽으로 상당 부분 이전됨)

### 단계별 운영 부담 비교(직접 구축 vs 관리형)

| 단계 | 직접 구축 | 관리형 서비스 |
|---|---|---|
| MVP(내부 테스트) | 초기 셋업 비용·시간이 큼, 소수 Room이라 트래픽 비용은 미미 | 셋업 빠름, 무료/저가 티어로 충분할 가능성 높음(공급자 확인 필요) |
| 소규모 베타 | 운영 인력 필요(TURN/SFU 가용성 관리), 트래픽 비용은 여전히 낮음 | 사용량 기반 과금 시작, 여전히 운영 부담은 낮음 |
| 상용 서비스 | 규모가 커질수록 단가 이점이 생길 수 있다는 자료가 있으나, 그만큼 SRE/네트워크 전문 인력 투자가 전제 | 사용량이 커지면 총 비용이 선형적으로 증가 — 이 시점에 자체 구축 전환을 재검토하는 것이 합리적(§6의 Adapter 경계가 이 전환을 쉽게 만들어줌) |

---

## 13. Implementation Phases

### Phase 1 — Local Media Prototype
- **Deliverable**: 마이크 권한 요청, 실제 `getUserMedia` 캡처, 자기 기기 loopback 또는 로컬 레벨 미터(진짜 오디오 레벨로 `VoiceLevelBars` 교체), 기존 PTT UI와 연결. 네트워크 없음.
- **완료 기준**: 버튼을 누르면 실제 마이크가 켜지고(브라우저 권한 다이얼로그 확인), 레벨 미터가 실제 소리 크기에 반응하며, 놓으면 트랙이 꺼짐.
- **테스트 방식**: 수동 확인(실제 목소리로 레벨 미터 반응 확인), 권한 거부 시나리오 수동 확인.
- **기존 Room/Round 영향**: 없음(§14 TASK 초안이 이 Phase).
- **주요 위험**: 낮음 — 네트워크가 없어 실패 지점이 적음.
- **다음 단계 진입 조건**: 로컬 캡처가 안정적으로 동작하고 기존 PTT UX(칩톤/햅틱/애니메이션/대상 게이팅)가 전부 그대로 유지됨을 확인.

### Phase 2 — Two Device Room
- **Deliverable**: signaling 연결, 2대 실제 기기 간 송수신, "전체" 대상만 우선 지원, 서버 PTT lock(§3 Room State), 기초 재연결(§10의 signaling 재연결만).
- **완료 기준**: 기기 A에서 PTT를 누르면 기기 B에서 실제 음성이 들림, 두 기기가 동시에 누르면 한 대만 허용됨(서버 판정 확인).
- **테스트 방식**: 실제 기기 2대(또는 2개 브라우저 프로필) 수동 테스트, 동시 누름 경쟁 조건 반복 테스트.
- **기존 Room/Round 영향**: `communication.isSpeaking`이 로컬 dispatch가 아니라 서버 이벤트 구독으로 갱신되도록 변경 필요(§7 원칙) — 이 시점에 영향 범위 보고 필요.
- **주요 위험**: signaling 서버 안정성, STUN/TURN 없이 NAT 환경에서 연결 실패 가능성.
- **다음 단계 진입 조건**: 최소 STUN 통과 확인(TURN은 Phase 3~4에서 본격 필요할 수 있음), 서버 lock이 경쟁 조건에서 정확히 1명만 허용함을 반복 검증.

### Phase 3 — Four Member Routing
- **Deliverable**: 개별/다중/전체 대상 라우팅(§4 정책 실제 구현), 4명 Room 실제 테스트, 수신자 표시(대상만 보이는 진짜 수신 UI, §1에서 지적한 현재 공백 해소), 일부 대상 실패 처리.
- **완료 기준**: 대상 3명 중 2명에게만 도달해도 나머지 1명이 실패로 명확히 구분되고, 대상이 아닌 사람 화면에는 "말하는 중" 자체가 안 뜸(§1 감사에서 지적한 문제의 해결 확인).
- **테스트 방식**: 4대 기기(또는 4개 프로필) 동시 테스트, 대상 조합을 바꿔가며 반복.
- **기존 Room/Round 영향**: `RoundScreen.jsx`의 대상 선택 UI 자체는 무변경(§4 원칙), `PlayerCard.jsx`의 "말하는 중" 표시 로직에 "나는 대상인가" 조건 추가 필요.
- **주요 위험**: SFU 트랙 구독 전환 지연시간, 4명 동시 접속 시 리소스.
- **다음 단계 진입 조건**: 4명 Room에서 다양한 대상 조합 시나리오가 전부 의도대로 동작.

### Phase 4 — Mobile Hardening
- **Deliverable**: Bluetooth 출력 전환, 백그라운드 오디오, 화면 잠금 대응, 네트워크 전환(WiFi↔셀룰러) 중 세션 유지, 배터리 소모 측정.
- **완료 기준**: §9에서 "네이티브 전환 필요"로 표시한 항목들이 실제 기기에서 동작.
- **테스트 방식**: 실제 iOS/Android 기기(또는 React Native/Capacitor 빌드) 현장 테스트.
- **기존 Room/Round 영향**: 없음(순수 플랫폼 레이어 추가) — 단, 이 Phase는 §9 결론대로 웹 Prototype만으로는 불가능해 네이티브/하이브리드 전환이 선행 조건.
- **주요 위험**: 플랫폼별 오디오 세션 정책 차이(iOS/Android가 서로 다름), 실제 골프장 네트워크 환경(전파 약한 지역) 재현의 어려움.
- **다음 단계 진입 조건**: 실제 골프장과 유사한 환경(약한 신호, 이동 중)에서 세션이 끊기지 않거나 자연스럽게 재연결됨을 확인.

### Phase 5 — Production Operations
- **Deliverable**: 인증(§8 UserProfile 실 연동), TURN/SFU 운영 체계(직접 또는 관리형 확정), 모니터링, 비용 제한(§12), 장애 대응 절차.
- **완료 기준**: 온콜 대응 문서, 비용 알림 임계치, 장애 시 자동 복구 또는 수동 대응 절차 존재.
- **테스트 방식**: 부하 테스트, 장애 주입 테스트(signaling 서버 강제 종료 등).
- **기존 Room/Round 영향**: 없음(운영 레이어).
- **주요 위험**: 실사용 트래픽 패턴이 테스트와 다를 수 있음.
- **다음 단계 진입 조건**: 해당 없음(최종 단계).

---

## 14. Local Media Capture Prototype v0.1 — TASK 초안 (구현하지 않음)

**목표**: 실제 마이크를 캡처하되 아무 데도 보내지 않는다 — 네트워크가 완전히 빠진 상태에서 "진짜 오디오 파이프라인의 첫 단"만 검증.

### 범위
- 마이크 권한 요청(PTT 버튼 첫 사용 시 또는 별도 진입점 — Pre-Round PTT Test 화면과의 연결은 다음 Sprint에서 결정)
- `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`
- 실제 `MediaStream` 획득
- PTT를 누르는 동안만 오디오 트랙 활성화(`track.enabled = true`), 놓으면 비활성화(`track.enabled = false`) — 스트림 자체를 매번 새로 열고 닫지 않고 트랙만 켜고 끄는 방식을 우선 검토(재시작 지연 최소화)
- 놓으면 트랙 비활성화 **또는** 완전 종료 — 배터리/권한 인디케이터 노출 관점에서 어느 쪽이 나은지 실 기기 확인 후 결정(이 TASK의 완료 기준에 포함)
- `AnalyserNode`(Web Audio API) 기반 실제 입력 레벨 계산 → `VoiceLevelBars.jsx`가 지금의 `Math.random()`이 아니라 이 실제 값을 받아 렌더링하도록 교체
- 녹음/저장 없음(스트림을 어디에도 기록하지 않음)
- 네트워크 전송 없음
- 기존 대상 선택/게이팅 로직(`RoundScreen.jsx`/`PTTButton.jsx`의 `canTransmit`) 완전 유지
- 권한 거부 시 폴백: 거부해도 앱은 정상 동작(§10 정책과 동일), PTT 버튼은 계속 보이되 누르면 "마이크 권한이 필요합니다" 안내로 대체
- 기존 칩톤(`radio.js`)/햅틱/ripple·breathing 애니메이션 전부 그대로 유지 — 이번 TASK는 그 위에 실제 오디오 레벨만 얹는다

### 명시적으로 하지 않는 것
- 서버 전송, signaling, WebRTC 연결 — 전부 없음
- `communication/` 도메인 폴더(§7) 생성 — 이 TASK는 Phase 1이라 아직 도메인 분리 없이 `PTTButton.jsx`/`VoiceLevelBars.jsx`에 최소 변경만 가하는 수준으로 시작하는 편을 제안(§7의 본격 구조는 Phase 2부터)
- Room/Round Engine 변경 — §13 Phase 1 "기존 Room/Round 영향: 없음"과 일치

---

## 15. Founder가 결정해야 할 사항

- **관리형 서비스 후보 확정**(§5/§6) — LiveKit/Agora/Twilio 등 정확한 가격·약관·한국 리전 지연시간은 이 문서에서 확정하지 못했다. 공급자별 최신 확인이 필요하다.
- **PTT lock authority를 자체 서버에 둔다는 전제**(§6)를 그대로 채택할지 — 관리형 서비스 중 일부는 Room 레벨 권한 제어 기능을 자체 제공하기도 하므로, 그걸 활용해 자체 서버 로직을 줄일지 여부는 후보 확정 후 재검토 필요.
- **§14 TASK의 착수 시점** — Course Reference·Room Foundation 이후 바로 진행할지, 아니면 §7의 `communication/` 도메인 구조를 먼저 설계 문서 승인만 받고 Phase 2부터 실제 착수할지.
- **웹 Prototype을 어디까지 유지할지**(§9) — Phase 4(모바일 하드닝)가 사실상 네이티브/하이브리드 전환을 요구하므로, 그 전환 시점과 방식(React Native/Capacitor/완전 네이티브)을 언제 결정할지.
- **UserProfile 실제 도입 시점**(§8) — 지금 `ME_PLAYER_ID` 하드코딩을 실제 로그인 기반 `userId`로 교체하는 작업이 PTT 신원 모델의 전제 조건인데, 이 작업이 Communication Sprint 이전에 필요한지 병행 가능한지.
- **Phase 5 인증·운영 체계의 담당 조직**(§12/§13) — 이번 문서는 기술 구조만 다뤘고, 실제 온콜/모니터링 인력 배치는 범위 밖이다.

이번 Sprint는 감사와 설계 문서 작성까지이며, 코드는 전혀 수정하지 않았습니다.
