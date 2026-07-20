# FIELDTALK Two Device PTT Foundation v0.1

기준: "동일 Room에 접속한 두 브라우저 사이에서, 서버가 송신권을 승인한 한 사람의 실제 마이크 음성이 상대방에게 실시간으로 전달되는 최소 경로를 만든다." **핵심 질문에 대한 답: 예.** 재식(Browser A)이 재근(Browser B)을 대상으로 선택해 PTT를 누르면, B의 화면에 "재식님 음성 수신 중"이 뜨고, B의 원격 오디오 분석기가 **실제로 0이 아닌 레벨(0.36~0.41)**을 측정했다 — 재생이 "실패 없이 실행됐다"가 아니라 **실제 오디오 데이터가 도착했다**는 걸 객관적으로 확인했다.

---

## Part A — Background Re-entry Hotfix

**버그**: `CommunicationProvider`가 visibilitychange로 송신을 강제 종료해도 `PttPressController.pointerHeld`는 그대로 `true`로 남을 수 있었다 — 브라우저/OS가 `pointercancel`을 안 보내면, 앱 복귀 후 `handleStart()`의 `if (controller.pointerHeld) return;`에 걸려 **다음 PTT 입력이 조용히 차단**될 수 있었다.

**수정**: `PTTButton.jsx`의 외부-종료 동기화 effect(`!communication.isTransmitting && pressedRef.current`)에 `controllerRef.current.endPress()` 호출을 추가했다. 언마운트 cleanup에도 동일하게 추가했다. 6단계 시나리오(long press → hidden → 마이크/Round 종료 확인 → visible → 재press → 정상 송신)를 실제 Chromium으로 확인했고, `PttPressController.test.js`에 3개 테스트를 추가했다(external stop 후 pointerHeld=false, background stop 후 다음 beginPress 정상, unmount 후 pointerHeld=false).

Local Media 구조는 이 Hotfix 외에 변경하지 않았다.

---

## Part B — Two Device PTT Foundation

### 1. 구현 범위

요청하신 필수 항목 전부 구현: 2개 브라우저(Playwright의 독립 `BrowserContext` 2개로 검증 — 진짜 별도 OS 프로세스 수준의 격리), 같은 Room ID, 송신자 1명, 수신자 1명, PTT 누르는 동안만 전달, 서버 기반 단일 송신권, 손 떼면 즉시 종료, 수신자 화면 표시, 재연결 최소 처리(연결 종료 시 서버가 lock 자동 해제), 녹음/저장 없음.

### 2. 기술 선택

`docs/REAL_PTT_ARCHITECTURE_v1.md` §6의 권장 방향(Signaling+PTT lock은 자체 서버, PTT lock authority는 관리형 서비스가 아니라 FIELDTALK 서버)을 그대로 따랐다. 이번 2인 Prototype은 **WebRTC Mesh**를 썼다 — 2명뿐이라 mesh와 SFU의 차이가 드러나지 않는 규모다. **이 선택이 4인 MVP의 최종 아키텍처가 Mesh로 확정됐다는 뜻은 아니다** — §17에서 이 판단의 근거를 다시 짚는다.

**중요한 제약**: 이 개발 샌드박스는 npm 레지스트리에 네트워크 접근이 안 된다(`npm install ws` → 403). `ws` 패키지 대신 Node 내장 모듈(`http`/`crypto`)만으로 RFC 6455 WebSocket 서버를 직접 구현했다(`server/miniWebSocketServer.js`) — **이건 이 샌드박스 환경에 대한 임시 조치이지, 실제 운영에 권장하는 방식이 아니다.** 실제 배포에서는 `ws` 같은 검증된 라이브러리를 쓰는 게 맞다. STUN도 같은 이유로 이 환경에서는 공개 STUN 서버(예: Google STUN)에 접근할 수 없어 **빈 `iceServers: []`로 테스트했다** — 같은 머신/같은 네트워크의 두 브라우저는 STUN 없이도 호스트 후보로 연결에 성공했지만, 실제 배포에서 서로 다른 네트워크의 두 기기를 연결하려면 STUN(그리고 대칭 NAT 환경에서는 TURN)이 반드시 필요하다.

### 3. 서버 PTT Lock

`server/pttLockManager.js` — Room당 정확히 1명만 lock을 가질 수 있다. 같은 사용자의 중복 요청은 idempotent(lease만 갱신), 다른 사용자의 요청은 즉시 거부(`room_locked`). Lease 기본값 **60초**(`docs/REAL_PTT_ARCHITECTURE_v1.md` §3에서 제안한 값과 동일한 근거 — "짧고 선택적 전달"이라 60초면 충분히 넉넉한 상한선) — `PTT_LEASE_DURATION_MS` 환경변수로 구성 가능, 하드코딩 아님. `server/roomRegistry.js`가 Room membership을 검증해서 `targetUserIds`에 비멤버가 섞여 있어도 서버가 걸러낸다.

### 4. Communication Adapter

`PTTButton.jsx` → `CommunicationProvider` → `PttClient`(`LocalPttClient` 또는 `NetworkPttClient`) 경계를 그대로 유지했다. `CommunicationProvider`가 `communicationMode` prop(`"local"` 기본값, `"network"`)으로 어느 구현체를 만들지 결정한다 — **App.jsx의 메인 `CommunicationProvider`는 여전히 기본값(local)만 쓰고, 이번 Sprint로 단 한 줄도 동작이 안 바뀐다**(회귀 테스트로 확인). `NetworkPttClient`는 `LocalPttClient`와 정확히 같은 public 인터페이스(`prepare/requestTransmit/stopTransmit/release/getState/subscribe`)를 구현한다 — `PTTButton.jsx`는 이번에도 전혀 안 바뀌었다. WebSocket/WebRTC를 직접 아는 파일은 `PttSignalingClient.js`/`WebRtcTransport.js` 둘뿐이고, `NetworkPttClient.js`가 그 둘을 조합한다.

### 5. Two Device Identity

이번 Sprint에서는 **기존 앱의 Round Engine `meId`(`ME_PLAYER_ID` 하드코딩)를 건드리지 않기로 판단**했다 — Round Player 식별 체계를 탭마다 바꾸는 건 훨씬 깊고 위험한 리팩터라, "최소 경로 검증"이라는 이번 Sprint 목표에 비해 비용이 컸다. 대신 **완전히 격리된 새 DEV 화면**(`TwoDeviceTestScreen.jsx`)을 만들어 자체 `CommunicationProvider(communicationMode="network")`를 쓴다 — 신원 선택(재식/재근), `roomId`/`userId`/`displayName`/`deviceSessionId` 최소 식별 모델을 그대로 구현했다. 동일 `userId`의 중복 세션은 `roomRegistry.js`에서 "나중 연결이 이긴다"로 단순화했다(문서화된 그대로, 강제 종료는 안 함).

### 6~9. Signaling / Media Flow / Receiver UI / Audio Output

`server/signalingServer.js`가 요청하신 12개 메시지 타입을 전부 구현한다(`room_join/room_joined/member_online/member_offline/offer/answer/ice_candidate/ptt_request/ptt_granted/ptt_denied/ptt_release/ptt_released/speaker_changed/connection_state/ptt_expired`). Offer/answer/ICE는 `senderUserId`를 클라이언트가 보낸 값이 아니라 **그 소켓이 실제로 room_join한 값**으로 서버가 덮어써서 스푸핑을 막는다.

미디어 흐름은 §7 순서 그대로다: 마이크 트랙은 room join 직후 warm 상태로 미리 획득해 offer/answer에 이미 실려 있지만, `track.enabled`는 **서버가 `ptt_granted`를 보낸 뒤에만** `true`가 된다 — 거부되면 트랙은 한 번도 켜지지 않는다. 수신 쪽은 `NetworkPttClient`가 `speaker_changed`를 받을 때마다 `actualTargetUserIds.includes(내 userId)`를 확인해서, 대상이 아니면 `isReceiving`이 절대 `true`가 안 된다 — 대상 아닌 브라우저는 음성 재생도, "말하는 중" 표시도 없다(§8 요구사항 그대로).

### 10. Failure Handling

signaling 연결 실패, 상대 offline, PTT denied/timeout, lease 만료(`ptt_expired`), 연결 종료 시 자동 lock 해제 — 전부 구현하고 실제 두 브라우저로 확인했다. 실패·취소 시 마이크와 상태가 항상 `idle`/`ready`로 수렴한다(§4 불변조건과 같은 원칙을 네트워크 경로에도 그대로 적용).

---

## 변경 파일 목록

**전혀 건드리지 않음**(타임스탬프 확인): `distanceCalculator.js`, `roundStorage.js`, `ScoreCard.jsx`, `roomReducer.js`, `RoundScreen.jsx`, `RoomOverlay.jsx` — 거리/스코어/Room UI/기존 Round PTT 흐름은 이번 Sprint 범위 밖.

**Part A 수정**: `PTTButton.jsx`(2곳에 `endPress()` 추가), `PttPressController.test.js`(테스트 3개 추가).

**Part B 새 파일**:
- `src/communication/`: `NetworkPttClient.js`, `PttSignalingClient.js`, `WebRtcTransport.js`, `NetworkPttClient.test.js`, `communicationRoundInvariants.test.js`(이전 Sprint 파일, 무변경 재확인)
- `src/config/communicationMode.js`
- `src/components/TwoDeviceTestScreen.jsx`
- `server/` 전체(6개 파일: `miniWebSocketServer.js`, `roomRegistry.js`, `pttLockManager.js`, `signalingServer.js`, `server.test.js`, `package.json`)

**Part B 수정**: `CommunicationProvider.jsx`(communicationMode 분기 추가, 기본값 동작 무변경), `LocalPttClient.js`/`NetworkPttClient.js`(레벨 루프 `unref()` 방어 코드), `HomeScreen.jsx`(DEV 진입점 버튼 1개), `App.jsx`(새 화면 라우팅 1개), `app.css`(새 클래스 추가).

---

## 테스트 결과

- 서버 단위 테스트(`server/server.test.js`): 8개 전부 통과(§12의 7개 시나리오 + lease expiry 콜백 확인).
- 클라이언트 단위 테스트(`NetworkPttClient.test.js`): 7개 전부 통과(§12의 6개 시나리오 + no-target 가드).
- 기존 테스트 전부 재확인 무회귀: `LocalPttClient.test.js`(10), `PttPressController.test.js`(13, Hotfix 3개 포함), `communicationRoundInvariants.test.js`(5) — 누적 43개.
- **실제 통합 검증**(Playwright 2개 독립 `BrowserContext`, 실제 signaling 서버 + 실제 WebRTC): Room join, 송신자 화면, **원격 오디오 레벨 0.36~0.41로 실제 수신 확인**, denied(잠긴 상태에서 두 번째 요청), 연결 종료 시 lock 자동 해제 및 재획득 가능 — 전부 확인.

## 음성 저장이 없다는 근거

- `BrowserAudioCapture.js`: `MediaRecorder`/`Blob` 생성 코드 자체가 없다(grep으로 재확인, v0.1부터 유지).
- `server/`: 미디어 페이로드(SDP/ICE 자체는 텍스트 제어 정보이지 오디오 데이터가 아님)를 그 어디에도 파일/DB에 쓰는 코드가 없다 — `signalingServer.js`의 `log()`는 `console.log`뿐이고, 로그에 남는 필드는 `{roomId, userId, requestId, granted}` 같은 제어 정보뿐, 오디오 내용은 서버를 거치지도 않는다(WebRTC는 P2P로 미디어가 직접 흐르고, 서버는 offer/answer/ICE **텍스트**만 중계).
- `NetworkPttClient.js`의 원격 오디오 분석기(`_setupRemoteAnalyser`)는 레벨 측정용 `AnalyserNode`일 뿐 — `destination`에 연결되지 않고, 어디에도 기록하지 않는다(§9 loopback 금지 원칙과 동일하게 "측정은 하되 저장은 안 함").

## 알려진 제한 사항

- **STUN/TURN 미검증**: 이 샌드박스는 공개 STUN에도 네트워크 접근이 안 돼 `iceServers: []`로만 테스트했다. 같은 머신의 두 브라우저는 이걸로 충분했지만, 실제로 다른 네트워크의 두 기기를 연결하려면 STUN(및 대칭 NAT 환경에서 TURN)이 필요하고 **이번 Sprint에서 검증하지 못했다**.
- **`ws` 패키지 대신 자체 구현**: `miniWebSocketServer.js`는 이 샌드박스의 네트워크 제약에 대한 임시 조치다. 실제 서비스에는 검증된 라이브러리 사용을 권장한다.
- **Round Engine과 미연결**: `TwoDeviceTestScreen.jsx`는 의도적으로 완전히 격리돼 있다 — 실제 Round 화면에서 재식이 재근에게 말하는 통합은 이번 범위 밖이다(§17에서 다음 단계로 명시).
- **4인 미검증**: 이번 Prototype은 2인만 검증했다. Mesh 구조로 4인을 그대로 확장하면 각 참가자가 최대 3개의 동시 `RTCPeerConnection`을 유지해야 한다 — §17 참고.
- **재연결 세부 정책 단순화**: 동일 userId 중복 세션은 "나중 연결이 이긴다"로만 처리했고, 원래 연결을 정중히 종료하거나 사용자에게 알리는 절차는 없다.
- **인증 없음**: 누구나 `roomId`/`userId`를 알면 join할 수 있다 — Room token 같은 인증은 Production 단계로 명시적으로 남겨뒀다(§ 구현 제한과 동일).

## §17 다음 4인 Routing 단계 영향 분석

- **Mesh는 4인부터 부담이 커진다**: 각 참가자가 나머지 3명과 개별 `RTCPeerConnection`을 유지해야 하므로(N-1 연결), 이번 2인 Prototype에서 확인한 "connectionState 관리·재연결·offer/answer 흐름"이 **참가자 수만큼 반복**돼야 한다. `WebRtcTransport`가 이미 `Map<userId, transport>` 형태로 여러 피어를 다룰 수 있게 설계돼 있어서(이번엔 최대 1개만 채워졌지만) 구조 자체를 갈아엎을 필요는 없지만, `docs/REAL_PTT_ARCHITECTURE_v1.md` §6에서 권장한 대로 **4인부터는 SFU로 전환하는 게 맞다** — 이번 Prototype이 그 판단을 재확인해준 셈이다.
- **서버 PTT Lock은 그대로 재사용 가능**: `pttLockManager.js`의 "Room당 1명" 규칙은 참가자 수와 무관하게 그대로 쓸 수 있다 — 4인이든 2인이든 서버 로직 변경이 필요 없다.
- **`targetUserIds` 다중 대상은 이미 구조적으로 준비돼 있다**: `speaker_changed` 메시지와 `NetworkPttClient`의 `actualTargetUserIds` 처리는 이미 배열을 받는 구조라, 4인 중 2명을 대상으로 선택하는 것도 서버/클라이언트 로직 변경 없이 동작한다 — SFU 전환 시 "누구에게 트랙을 라우팅할지"만 SFU 쪽에 위임하면 된다.
- **Round Engine 통합은 이번처럼 미루면 안 된다**: 4인 MVP에서는 `TwoDeviceTestScreen.jsx` 같은 격리된 테스트 화면이 아니라 실제 `PTTButton.jsx`+Round Player 식별자가 네트워크 신원과 맞아떨어져야 한다 — `docs/REAL_PTT_ARCHITECTURE_v1.md` §8에서 이미 "RoomMember.userId를 네트워크 기준으로" 쓰기로 정했으니, 이번 Sprint의 `identity.userId`도 같은 값을 쓰도록 다음 Sprint에서 `ME_PLAYER_ID` 하드코딩을 실제 UserProfile로 교체하는 작업과 함께 정리해야 한다.

이번 결과는 Production PTT가 아니다 — TURN 운영, 관리형 SFU, 4인 라우팅, 모바일 네이티브, 백그라운드/화면 잠금, Bluetooth, 인증/보안 강화, 비용/모니터링은 전부 후속 단계다.
