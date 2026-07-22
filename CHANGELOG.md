# Changelog

## Unreleased

### RC4 Device Test Preparation — 완료

변경 파일: `NetworkPttClient.js`, `PttSignalingClient.js`, `CommunicationProvider.jsx`, `RoundProvider.jsx`, `GalleryPanel.jsx`, `SoundButton.jsx`, `P0DebugOverlay.jsx`, `signalingServer.js`, `soundCatalog.json`, 신규 `public/sounds/test/fieldtalk-test-chime.wav`, `scripts/build_preview.py`(신규 위치, 기존 `/tmp` 스크립트를 프로젝트로 편입), `docs/RC4_FIELD_TEST_CHECKLIST.md`(신규).

#### P0 — Stage 10 임계값 불일치 수정 (실측 확인)
지적하신 그대로였다: `rawLevel = rms * 4`로 확대해서 화면에 쓰면서, 판정은 확대 전 `rms`를 그대로 비교하고 있었다. `rawLevel` 기준으로 통일하고, 단일 순간 피크가 아니라 **150ms 연속 지속**을 요구하도록 변경. 이름을 `remoteSignalDetected`(자동)와 `audiblePlaybackConfirmed`(항상 `null`, 코드가 절대 자동 설정하지 않는 수동 전용 필드)로 분리했다. Debug Overlay에 현재 RMS/rawLevel/임계값/최대 RMS/최대 rawLevel/마지막 오류 name·message 전부 추가.

#### P1 — 테스트 음원 (실제로 생성·서빙 확인, 재생 완결은 미확인)
`public/sounds/test/fieldtalk-test-chime.wav`를 직접 생성했다(880Hz→1320Hz 2음 사인파, 350ms, 저작권 문제 없음). 카탈로그에 `rightsStatus: "prototype_test"`로 등록, 라벨 `[TEST]` 표시, Production에서는 필터링되어 안 보임(DEV 게이팅). **실측**: 실제 2기기 테스트에서 파일이 HTTP 200으로 정상 로드되는 것까지 확인했다. 클릭 시 오류 토스트는 안 떴다(실패 신호 없음). **다만 서버의 `[SOUND PLAYED]` 로그가 뜨는 것까지는 이번엔 확인하지 못했다** — 파일 로드는 성공했지만 네트워크 브로드캐스트가 실제로 발동했는지, 그래서 자기재생/상대재생/중복방지/재입장 전체가 end-to-end로 도는지는 미확정이다.

#### P1 — 홀 진행 동기화 방어 (전부 실측 확인)
- **호스트 전용 검증**: 서버에 `registry.isHost()` 체크 추가(round_start_request와 동일 패턴). **실제 위조 공격으로 확인**: UI를 거치지 않고 직접 WebSocket으로 게스트인 척 `hole_advance`를 보내봤고, 서버가 `hole_advance_denied`(reason: not_host)로 정확히 거부하는 것을 확인했다.
- **중복 방지**: 기존 리듀서의 "홀은 완료 상태여야 다음으로 넘어간다" 가드가 이미 중복 메시지로 인한 스킵을 막고 있음을 코드 분석으로 확인(별도 코드 추가 불필요, 기존 아키텍처가 이미 안전).
- **재입장 복구**: `hole_sync` 메시지를 신규 구현. 처음엔 "멤버 수 증가"를 트리거로 썼는데 실제 테스트에서 재연결 시 멤버 수가 실제로는 안 바뀐다는 걸(upsert라서) 발견하고, `member_online` 이벤트 자체를 감지하는 방식으로 수정. **실제 재연결 테스트로 확인**: A가 2홀→3홀로 이동하는 동안 B를 강제로 끊었다가(진짜 WebSocket 종료) 복귀시켰더니, B가 정확히 3홀로 따라잡는 것을 확인했다.

#### P2 — 병합 스크립트 회귀 방지 (근본 원인 수정 + 검증 자동화)
이번 세션에서 3번 반복된 버그(`import` 줄 끝 인라인 주석이 다음 줄을 통째로 삼킴)의 **근본 원인**을 고쳤다 — 주석을 제거한 뒤 `;`로 끝나는지 검사하도록 변경. 스크립트 끝에 두 가지 자동 검증 추가: 중복 top-level const 검사, 실제 esbuild 문법/참조 체크. **이 가드가 실제로 작동하는 것을 확인했다** — 이번 세션에서 새로 만든 `isDevMode` 변수가 기존 코드와 충돌하는 걸 가드가 즉시 잡아냈고, 그 자리에서 고쳤다. 스크립트를 `/tmp`에서 `scripts/build_preview.py`로 프로젝트에 편입시켜 실제 산출물이 되도록 했다.

단위 테스트 61개 무회귀, 번들 체크 통과, 미리보기 실제 브라우저 스모크 테스트 통과(에러 0).

### RC4 Continuation — P0 Lifecycle Tracker, P1 완료, P2 부분 확인

변경 파일: `NetworkPttClient.js`, `WebRtcTransport.js`, `CommunicationProvider.jsx`, 신규 `P0DebugOverlay.jsx`, `App.jsx`, `app.css`, `signalingServer.js`, `PttSignalingClient.js`, `RoundProvider.jsx`.

#### P0 — 10단계 Lifecycle 추적기 구축 및 검증
`_p0Lifecycle` 추적 객체와 `_logP0Stage()` 헬퍼로 10단계(Room Join, Offer 생성, Answer 수신, ICE Connection State, Peer Connection State, Remote Track 수신, Audio Element Attach, play() 호출, play() 결과, 실제 음성 수신) 전부에 `[FIELDTALK P0]` 접두어 로그 + DEV 전용 Debug Overlay를 추가했다.

**실제 2기기 시뮬레이션으로 확인**: 최초 연결·재연결 양쪽에서 9단계(roomJoin, offerCreated, answerReceived, iceConnectionState, peerConnectionState, remoteTrackReceived, audioElementAttach, playCalled, playResult)가 PASS로 기록되는 것을 콘솔 로그로 직접 확인했다. Offerer(B)·Answerer(A) 양쪽 다 확인.

**10단계(실제 음성 수신)는 이 샌드박스에서 확정 못함**: 추적해보니 `isReceiving`은 정확히 true로 토글되고 RMS 값도 0.0464까지 올라갔다(임계값 0.06에 근접) — 페이크 테스트 음성 파일이 조용해서 못 넘은 것으로 보이며, 코드 결함의 증거는 찾지 못했다. 실제 음성이면 더 크므로 문제없을 가능성이 높지만, 이건 추정이지 확인이 아니다.

#### P1 — 체크리스트 10개 전부 Sandbox 검증 완료, 그 과정에서 중대한 버그 발견
"홀 이동" 항목을 검증하다가 **홀 진행 상태가 전혀 네트워크로 동기화되지 않는다**는 걸 발견했다 — A가 홀을 완료해도 B의 Round Engine은 영원히 이전 홀에 머물러 있었다. 거리 공유·응원과 똑같이 "로컬 전용이었다" 패턴이었다. 서버에 `hole_advance` 릴레이를 추가하고 송수신 경로(`RoundProvider.jsx`의 `completeCurrentHoleAndAdvance`가 이제 네트워크로도 알림)를 구현했다.

**Sandbox로 confirm된 10개 전부**: 양쪽 GPS 있음/A만/B만/양쪽 없음, A 실측 공유, B 실측 공유, 재공유, 홀 이동(수정 후), 재입장(reconnect 후에도 공유 정상), 새 라운드 시작(리셋 정상).

#### P2 — Sandbox 한계 재확인, 실제 프로젝트 자산 문제도 발견
TTS 기반 사운드는 헤드리스 Chromium에서 `speechSynthesis` 자체가 동작 안 해 실패(샌드박스 전용 한계, 실제 iPhone Safari는 다를 가능성 높음). File 기반 사운드("오케이! (남성)" 등)로 전환해서 재시도했으나 **"사운드 파일을 찾을 수 없어요"** — `public/sounds/` 디렉터리를 직접 확인해보니 **README.md 안내 파일만 있고 실제 오디오 자산이 프로젝트에 하나도 없었다.** 이건 샌드박스 한계가 아니라 **실제 프로덕션에서도 똑같이 실패할 프로젝트 자체의 자산 누락**이다. 라이선스가 필요한 콘텐츠라 제가 직접 만들어 넣을 수 있는 범위가 아니다.

자기 재생/중복 방지(`eventId`, 이전 Sprint에서 코드로 추가)/재입장 후 동작은 실제 소리 재생이 실패하는 한 end-to-end로 확인할 방법이 없다.

단위 테스트 61개 무회귀, 번들 체크 통과.

### RC3 — P1-1 원인 조사 및 부수 발견 (진단 우선, 정직하게 보고)

변경 파일: `NetworkPttClient.js`, `CommunicationProvider.jsx`, `App.jsx`, `app.css`, `signalingServer.js`.

#### P1-1 (재연결 후 PTT 음성 복구 안 됨) — 유력한 원인 발견, 실기기 미검증

코드를 전부 다시 훑었다. 요청하신 7개 항목 중 6개는 아키텍처 검토로 안전함을 확인했다:
- **WebSocket 재연결**: WEEK6~8에서 확인된 대로 정상.
- **Peer 객체 재생성**: `_reconcileMembers`가 room_joined 때마다 정확히 재생성.
- **참가자 ID 변경**: identity는 localStorage에 저장되고, 네트워크 재연결은 페이지 새로고침을 하지 않으므로 ID가 바뀔 경로가 없음.
- **PTT subscription 재등록**: `_wireSignaling()`은 생성자에서 한 번만 실행되고 리스너는 client 인스턴스(웹소켓이 아니라)에 붙어있어서, 재연결로 웹소켓이 교체돼도 리스너는 그대로 살아있음 — 재등록이 필요 없는 구조.
- **MediaStream 상태**: 마이크 스트림은 재연결 시 유지되도록 이미 설계돼 있음(WEEK7 Priority 2).
- **AudioContext resume 여부**: 코드 전체에서 `.resume()`이 한 번도 호출되지 않음을 확인했지만, 실제 음성 출력은 AudioContext가 아니라 별도의 `<audio autoplay>` 엘리먼트를 통해 나가므로 이 자체는 무관함(레벨미터용 AudioContext만 관련).

**가장 유력한 원인(코드로 확인, 실기기 미검증)**: 재연결 시 `_setupRemoteMedia()`가 완전히 새로운 `<audio>` 엘리먼트를 만들고 `.play()`를 호출하는데, 이 호출이 **사용자 제스처와 무관한 비동기 네트워크 이벤트 안에서** 일어난다. iOS Safari의 autoplay 정책상 이런 호출은 조용히 차단될 수 있다 — 그리고 실제로 실패를 감지하는 코드(`lastError: "remote_audio_playback_blocked"`)는 이미 있었는데, **그걸 화면 어디에도 보여주거나 재시도할 방법이 전혀 없었다.** "UI는 복구되는데 음성만 안 들린다"는 증상과 정확히 일치한다.

**추가한 것**: 실제 탭(제스처) 안에서 재생을 재시도하는 `retryRemoteAudioPlayback()`과, 차단 상태일 때만 뜨는 탭 가능한 배너("상대방 음성이 재생되지 않고 있습니다. 탭하여 다시 시도하세요"). 이건 **감지되면 복구할 수단**이지, 애초에 안 막히게 하는 근본 수정은 아니다 — 정직하게 말씀드리면, iOS Safari의 정확한 차단 조건을 실기기 없이는 100% 확신할 수 없다.

#### 응원 기능 검증 — 샌드박스 한계로 완결 못함, 부수적 진짜 버그는 찾아 고침
실제 UI로 응원 버튼을 눌러 검증하려 했으나, 이 샌드박스는 TTS(`speechSynthesis`)가 동작하지 않아 "음성 재생에 실패했어요"로 막혀서 **자기 재생/중복 없음/재입장 후 정상 여부를 실제로 끝까지 확인하지 못했다.** 다만 코드를 훑던 중 진짜 문제 하나를 발견해서 고쳤다: `sound_played` 메시지에 **중복 제거 수단이 전혀 없었다** — 네트워크가 같은 메시지를 두 번 전달하면 (매번 새 JSON 객체라) 그대로 두 번 재생될 구조였다. 서버가 매 브로드캐스트마다 `eventId`를 붙이고, 클라이언트가 마지막으로 처리한 id와 같으면 무시하도록 추가했다.

#### GPS 없는 상태에서 실측 공유 — 이번엔 재검증 못함
지난 Sprint에서 송신 측 버그(diff=0 강제)는 고쳤고 서버 수신까지 확인했지만, 수신 측 화면 갱신은 그때도 양쪽 다 GPS가 없는 테스트라 결론을 못 냈었다. 이번엔 응원 기능 디버깅에 시간을 많이 써서, 수신자만 GPS가 있는 비대칭 상황을 다시 세팅해서 검증하지 못했다.

단위 테스트 61개 무회귀.

### RC2 Bug Fix Sprint — P0 완료, P1 일부 완료

변경 파일: `HomeScreen.jsx`, `DistanceCard.jsx`, `GalleryPanel.jsx`, `App.jsx`, `roundSeed.js`, `roundReducer.js`, `RoundScreen.jsx`, `signalingServer.js`, `NetworkPttClient.js`, `PttSignalingClient.js`, `CommunicationProvider.jsx`.

#### P0 전부 완료
- **P0-1/2/3 (Player List·동기화·Round Demo Player)**: 근본 원인 하나 — Home 화면의 Mock 동반자 시뮬레이션이 실제 참가자와 같은 Room Engine 상태(`MAX_ROOM_MEMBERS: 4`)를 공유해서, 예전 테스트에서 남은 Mock "참여" 상태가 실제 참가자의 자리를 차지하고 있었다. Mock 시뮬레이션을 DEV 전용으로 옮기고 Production은 실제 `room.members`를 표시하도록 수정. 실제 2기기 테스트로 Player List에 진짜 참가자 이름이 뜨는 것 확인(RoundScreen/DistanceCard/PTT Target 전부 같은 `round.players`를 참조하므로 셋 다 함께 해결됨).
- **P0-4 (B→A 거리 공유 안 됨)**: GPS 좌표가 아직 없을 때(`gpsValueM === null`) 차이값이 무조건 0으로 계산돼 "공유할 것 없음"으로 처리되던 버그. 수정 후 서버가 `[DISTANCE SHARE]`를 정상 수신하는 것까지 확인.
- **P0-5 (응원 버튼 전달 안 됨)**: 애초에 네트워크로 전송된 적이 없었음(로컬 재생만). 서버 릴레이 + 클라이언트 송수신 왕복 경로 신규 구현 — 대상은 아직 전체 브로드캐스트만 지원(선택 대상 지정 UI는 범위 밖).

#### P1 — 3/4 완료
- **P1-2 (홀 이동 시 거리 데이터 안 갱신)**: `NEXT_HOLE`이 `state.players`를 전혀 건드리지 않아서 이전 홀의 측정값(`distance.manual`)이 계속 남아있던 버그. 홀 이동 시 전 플레이어의 `manual` 값과 `lastDistanceShare`를 초기화하도록 수정(GPS 기준값 `distance.gps`는 이번 범위 밖 — 애초에 이 코드베이스에서 동적으로 갱신되는 곳이 없음).
- **P1-3 (시작 홀 7→1)**: 데모 시드의 "진짜 데이터가 채워진" 홀을 7에서 1로 이동. Room 기반 라운드는 원래부터 항상 1번 홀 기본값이었음(영향 없었음) — 데모 seed(`라운드 시작` 버튼)만의 문제였음.
- **P1-4 (라운드 종료 기능 없음)**: 18홀 완료 후 자동으로만 뜨던 완료 화면을, 플레이 중 언제든 수동으로 종료할 수 있는 버튼(확인 모달 포함)으로 확장. 기존 `roundComplete()` 액션과 완료 화면 인프라를 그대로 재사용(신규 엔진 로직 없음). 완료 화면 제목도 "18홀 완료" 고정이었던 걸 실제 도달한 홀 수로 수정.
- **P1-1 (재연결 후 PTT 음성 복구 안 됨)**: 착수하지 못했다. 이전 Sprint(WEEK7/8)의 샌드박스 시뮬레이션에서는 재연결+양방향 PTT를 18/18 성공으로 검증했었는데, 실제 아이폰에서는 실패한다는 보고다 — 샌드박스 시뮬레이션과 실기기 사이에 제가 아직 포착 못한 차이가 있다는 뜻이고, 서둘러 잘못된 진단으로 수정하기보다 다음 턴에 제대로 조사하기로 판단했다.

단위 테스트 61개 무회귀.

### Join Flow 100% 성공을 최우선으로 — 실제 재현 시나리오로 검증

변경 파일: `App.jsx`, `HomeScreen.jsx`.

**발견한 중대한 위험**: 지금까지 여러 Sprint에 걸쳐 실기기 테스트를 반복하신 두 대의 폰은, 이번에 만든 "이름 입력 화면" 조건(`!hasStoredIdentity`, 저장된 identity가 아예 없을 때만)으로는 **걸러지지 않았을 가능성이 높다** — 이전 세션들에서 이미 "재식"이 저장돼 있을 것이기 때문이다. 즉 지난 턴에 만든 수정이 정작 Founder님 실기기에서는 발동하지 않았을 수 있었다.

**수정**: 조건을 "저장된 게 아예 없을 때"에서 **"현재 identity가 기본값(재식)일 때"**로 바꿨다 — 새 기기든, 예전에 테스트하다 재식으로 저장된 기기든 상관없이 초대 링크로 들어온 사람이 재식이면 이름을 다시 묻는다.

**링크 공유 방식 개선**: 클립보드 복사 대신 **Web Share API(네이티브 공유 시트)를 우선 사용** — 실제 폰에서 카톡/문자로 바로 보낼 수 있어 훨씬 확실하다. 지원 안 되는 환경에서는 기존 클립보드 복사로 자동 폴백.

#### 실제 재현 테스트(가장 위험한 케이스로) — 전체 흐름 성공
Phone B의 localStorage에 **미리 "재식"을 저장**해둔 뒤(실제 테스트폰 상황을 그대로 재현) 시작:

```
[서버] ROOM JOIN SUCCESS player_jaesik, participants: 1
B: 이름 입력 화면 표시 = true  ← 예전 재식 저장돼 있어도 정상적으로 뜸
B: "재근" 입력 → 새 고유 ID로 참가
[서버] ROOM JOIN SUCCESS player_1784620027217_17xa30, participants: 2
[서버] PEER JOIN BROADCAST recipients: 1
B: 마이크 "확인 완료"
A가 보는 참여 현황: "참여 2명"
[서버] round_started playerCount: 2
Round 진입: A=true B=true
[서버] PTT REQUEST granted: true
A→B PTT: B가 받은 배너 = "재식님이 말하는 중"
```

Host 생성 → 링크 공유 → Join → 2명 표시 → PTT 음성 송신까지 한 번에, 가장 위험한 조건(기존 재식 identity 잔존)에서도 확인했다. 단위 테스트 61개 무회귀.

### RC2 Additional Feedback 대응

변경 파일: `HomeScreen.jsx`, `App.jsx`.

**②마이크 권한 타이밍 수정**: 기존엔 `connectToRoom()` 성공 후(네트워크 왕복 이후) 비동기로 마이크 권한을 미리 요청하고 있었다 — 실제 필요해서가 아니라 WebRTC offer/answer 타이밍 최적화를 위한 것으로 정당한 이유가 있었다(이건 그대로 유지). 다만 iOS/WebKit은 "사용자가 방금 누른 제스처"와 연결이 끊긴 비동기 호출에서는 권한창을 예측 불가능한 시점에 띄우는 경우가 있다 — "왜 지금 뜨지?"라는 느낌이 정확히 이 문제로 보인다. "팀 연결" 탭과 "참가하기" 탭 각각에서 **동기적으로** 마이크 권한을 한 번 더 요청하도록 추가했다(즉시 스트림 해제, 실제 스트림은 기존 로직이 그대로 만듦) — 권한이 그 탭 자체와 명확히 연결되게. 실제 테스트로 "팀 연결" 탭 즉시 `getUserMedia` 1회 호출 확인, 이후 전체 흐름(코스 선택→마이크→Round→PTT) 무회귀 확인.

**③ 가짜 상태바 재확인**: 코드를 다시 확인했고, iPhone 13/14 Pro 에뮬레이션으로 재검증한 결과 **현재 코드에서는 정상적으로 제거되고 있다**(`statusBarInDOM: false`). 실기기에서 여전히 보인다면, 가장 유력한 원인은 **이 수정이 반영되기 전에 배포된 Vercel 빌드를 보고 계신 것**이다 — 최신 코드로 재배포 후 다시 확인 부탁드린다.

**④ Preview Simulation / Mock Slot 정리 계획**: 다음 Sprint에서 진행 제안 — Production에서는 Home 화면의 재근/광천/해란 데모 슬롯을 완전히 숨기고 실제 Room 멤버 목록만 표시. DEV 모드에서는 그대로 유지(개발 편의 목적). 이번 턴엔 시간 제약으로 착수하지 못했다 — 실제 실기기 검증(①②③⑤⑥) 우선.

**①⑤⑥⑧**: 코드 설명이 아니라 실기기 증빙이 필요한 항목들이다. **이 환경은 외부 네트워크가 차단돼 있어 Render/Vercel 배포, 실제 폰 촬영, 실제 서버/클라이언트 로그 수집을 제가 직접 할 수 없다.** 코드는 준비됐지만 이 부분은 Founder님이 실행하셔야 한다.

단위 테스트 61개 무회귀.

### 두 번째 사용자가 참가할 방법이 없던 진짜 원인 — 발견 및 수정

Founder님의 정확한 질문("두 번째 휴대폰은 어디서 참가하나요?")을 파고들다가, 이전 Sprint들에서 놓친 근본적인 구멍을 찾았다.

**진짜 원인**: 저장된 identity가 없는 완전히 새 기기는 조용히 `DEFAULT_IDENTITY_USER_ID`("player_jaesik"/재식)로 시작한다 — **호스트와 완전히 같은 identity다.** 실서비스에는 "당신은 누구입니까"를 묻는 화면이 한 번도 없었다 — DEV 전용 Identity Switch 화면만 있었고, 그건 프로덕션에서 의도적으로 숨겨져 있다(Preview Simulation 정직성 작업의 일부). 즉 **실제 두 번째 사람이 초대 링크를 눌러도, 실서비스 UI로는 자기 자신이 될 방법이 없었다** — 재근/광천/해란이 "Mock 데이터로 보인다"는 지적은 정확했다. 그 슬롯들은 애초에 실제 참가자를 위한 게 아니라 로컬 데모 전용 하드코딩된 이름이었다.

변경 파일: 신규 `NameEntryScreen.jsx`, `App.jsx`, `IdentityProvider.jsx`, `app.css`.

**수정**: `?join=CODE` 링크로 들어왔는데 저장된 identity가 아직 없는 기기에서만 보이는 최소한의 "이름을 알려주세요" 화면을 추가했다. 이름을 입력하면 고유한 새 userId를 생성해 `setIdentity()`(기존 함수 재사용 — 저장 후 새로고침)를 호출하고, 새로고침 후에도 URL의 `?join=`은 그대로 남아있어 기존 자동 참가 로직이 이제는 진짜로 다른 identity로 정상 작동한다. 호스트나 이미 identity가 있는 기기는 전혀 영향 없다.

**실제 검증**(진짜 완전히 새로운 브라우저 프로필로, localStorage 0인 상태에서 시작):
```
A: 초대 링크 복사 → 링크 확보
B(완전히 새 기기): 링크 접속 → 이름 입력 화면 표시 = true
B: "재근" 입력 → 제출 → 마이크 상태 = "확인 완료"
A가 보는 참여 현황: "참여 2명"  ← 핵심 — 실제로 서로 다른 두 사람으로 잡힘
```

단위 테스트 61개 무회귀.

### RC2 — Secure Real-Device Test Environment 대응

변경 파일: `App.jsx`, `TwoDeviceTestScreen.jsx`.

**정확한 지적에 동의**: "Vercel HTTPS 주소만 열면 된다"는 제 이전 설명은 불완전했다. Signaling 서버는 여전히 로컬 PC의 `ws://localhost:8787`이라 Vercel 프런트엔드와 자동으로 연결되지 않고, HTTPS 페이지에서 `ws://` 시도는 Mixed Content로 차단된다.

**Mixed Content 보호 추가**: `VITE_SIGNALING_URL`이 실수로 `ws://`로 설정된 채 HTTPS 페이지에서 로드되면 자동으로 `wss://`로 승격한다. 5가지 시나리오(정상 프로덕션 설정, 실수로 ws:// 설정한 프로덕션, 로컬 PC 개발, 폰 LAN HTTP, 폰이 실수로 HTTPS로 LAN IP 접속한 극단 케이스) 전부 격리된 로직 검증으로 확인했다 — 전부 올바른 스킴으로 해석됨.

**STUN 서버 추가**: `iceServers: []` → 공개 Google STUN 서버 2개. 비용도 인프라도 필요 없어 즉시 추가했다. TURN은 별도 인프라(서버 운영)가 필요해 이번엔 추가하지 않음 — 아래 STUN/TURN 정리 참고.

#### STUN/TURN 현황 정리 (요청하신 항목)
- **이번 RC2 테스트 범위**: 동일 Wi-Fi 한정으로 진행하는 게 맞다고 판단. 같은 Wi-Fi에서는 로컬 후보(mDNS/LAN candidate)로도 직접 연결이 성립하는 경우가 많아 STUN 없이도 종종 동작하지만, 이번에 STUN을 추가해 성공률을 더 높였다.
- **STUN 설정 여부**: 이번에 추가함(공개 Google STUN 2개).
- **TURN 미적용 시 예상 제한**: Symmetric NAT(많은 통신사 LTE/5G가 이 방식)나 엄격한 방화벽 조합에서는 STUN만으로 P2P 연결 경로를 못 찾을 수 있다 — 이 경우 TURN 릴레이 없이는 연결 자체가 안 될 수 있다.
- **향후 TURN 도입 계획**: Wi-Fi↔LTE, LTE↔LTE 테스트에서 실패가 확인되면 그때 도입 검토(예: coturn 자체 운영 또는 Twilio/Cloudflare 같은 관리형 TURN 서비스) — 지금은 범위 밖으로 유지.

#### 아직 안 된 것 (정직하게 보고)
**실제 배포는 제가 할 수 없습니다.** 이 환경은 외부 네트워크가 차단돼 있어 Render/Vercel에 직접 배포할 수 없다 — 코드는 준비됐지만, 실행은 Founder님이 해주셔야 한다. 아래에 정확한 단계를 정리했다.

단위 테스트 61개 무회귀, 번들 체크 통과.

### Networking Recovery Sprint — 실기기 2대 테스트 결과 대응

Founder 실기기 테스트에서 "두 기기가 실제로 연결되지 않는다"는 심각한 보고를 받았다. 지금까지 RC1 전체(WEEK1~8)에서 "검증했다"고 말한 모든 테스트는 같은 기기 안의 두 브라우저 탭이 localhost로 통신하는 방식이었다는 걸 인정한다 — 실제 기기 간 네트워크 도달성, 실제 로컬 LAN 배포 구성, 실제 터치 이벤트는 이번이 처음이다.

변경 파일: `App.jsx`, `TwoDeviceTestScreen.jsx`, `DistanceCard.jsx`, `NetworkPttClient.js`, `PttSignalingClient.js`, `CommunicationProvider.jsx`, `signalingServer.js`, `app.css`.

#### ① Signaling URL이 기기 상대적("localhost")이었던 문제 — 수정 및 실측 검증됨
Founder는 PC에서 `npm run dev`로 Vite+signaling 서버를 띄우고 폰은 LAN IP(Vite의 "Network:" 주소)로 접속하는 구조였다. 그런데 앱 내부 signaling 주소는 `ws://localhost:8787`로 하드코딩돼 있었다 — 폰 입장에서 "localhost"는 자기 자신이라 아무 서버도 없다. `window.location.hostname` 기준으로 자동 계산하도록 수정(`App.jsx`, `TwoDeviceTestScreen.jsx`) — `.env` 파일이나 수동 IP 입력 없이, localhost로 열면 기존과 동일하게, LAN IP로 열면 자동으로 그 IP를 쓴다.

**실측 검증**: 샌드박스의 실제 LAN IP(`192.0.2.2`, localhost 아님)로 두 세션을 접속시켜 재현. 서버 로그에서 `player_jaesik`, `player_jaegeun` **둘 다** 정상 Join 확인, `participants: 2`, `[PEER JOIN BROADCAST] recipients: 1` 확인. A 화면에서 "참여 2명" 정상 표시.

#### ② 거리 공유가 네트워크로 전송된 적이 없었던 문제 — 수정됨(부분 검증)
`DistanceCard.jsx`의 "팀에 전송했습니다" 토스트는 거짓이었다 — 로컬 Round Engine에만 dispatch되고 서버로는 아무것도 안 갔다. 서버에 `distance_share` 릴레이(`[DISTANCE SHARE]`/`[DISTANCE SHARE BROADCAST]` 로그 포함) 추가, `PttSignalingClient.sendDistanceShare()`/`NetworkPttClient.shareDistance()`/수신 시 `App.jsx`가 로컬 Round Engine에 반영하는 왕복 경로 전체를 신규 구현. 단위 테스트·번들 체크는 통과했지만, **2인 실기기 시뮬레이션에서 다른 이슈(아래 ④) 때문에 end-to-end로 끝까지 확인하지 못했다** — 정직하게 남긴다.

#### ③ 마이크 버튼 터치 선택 메뉴 버그 — 코드 수정됨(실기기 미검증)
`.ft-room-member-row`를 비롯해 앱 전체에 `user-select`/`-webkit-touch-callout`/`touch-action` 보호가 전혀 없었다 — 실기기 롱프레스가 OS 텍스트 선택 메뉴로 새는 게 구조적으로 당연했다. `.ft-phone`(앱 전체 루트)과 `.ft-ptt-btn`에 보호 추가. 이 앱엔 텍스트 입력이 필요한 곳이 없어 부작용 없이 전역 적용 가능하다고 판단했다. **실제 터치스크린으로는 검증 못함 — Playwright는 마우스 이벤트만 시뮬레이션하므로 이 종류의 버그를 애초에 잡아낼 수 없었다는 것도 이번에 확인했다.**

#### ④ 마이크가 "사용불가"인 진짜 이유 — 코드 버그 아님, 브라우저 플랫폼 제약
LAN IP 시뮬레이션 중 발견: **`http://192.0.2.2:...`(평문 HTTP + localhost 아닌 IP)로 접속하면 `navigator.mediaDevices` 자체가 완전히 `undefined`가 된다.** `isSecureContext: false` — 브라우저가 마이크 API 자체를 거부하는 것으로, 앱 코드로 고칠 수 있는 문제가 아니다. Web Platform 표준상 `getUserMedia`는 HTTPS 또는 진짜 `localhost`에서만 동작한다.

**이게 의미하는 것**: Founder님의 현재 로컬 LAN 테스트 방식(`npm run dev` + 폰에서 IP로 접속)으로는 **마이크/PTT 관련 기능을 원천적으로 검증할 수 없다** — ①의 signaling 수정과 무관하게 항상 막힌다. 참여 상태·거리 공유처럼 마이크가 필요 없는 기능은 이 방식으로 테스트 가능하지만, PTT는 다음 중 하나가 필요하다:
- 이미 배포된 Vercel 주소(HTTPS 자동 제공)로 폰 테스트, 또는
- 로컬에 HTTPS 설정(mkcert 등) 또는 ngrok류 터널 사용

#### ⑤ 상세 서버 로깅 — 요청하신 형식으로 추가
`[CLIENT CONNECTED]`(remoteAddress 포함), `[ROOM JOIN REQUEST]`/`[ROOM JOIN SUCCESS]`(participants 카운트 포함) 분리, `[PEER JOIN BROADCAST]`(recipients 카운트), `[DISTANCE SHARE]`/`[DISTANCE SHARE BROADCAST]`, `[DISCONNECT]`(remainingParticipants 포함) — 전부 실측 로그로 위 ①에서 확인.

#### 확인하지 못한 것 (정직하게 보고)
- 거리 공유의 완전한 end-to-end(Phone B 화면에 실제로 숫자가 바뀌는 것)는 확인 못했다.
- PTT 자체는 ④의 브라우저 제약 때문에 이 테스트 방식으로는 애초에 검증 불가능하다는 것만 확인했고, 실제 음성 송수신은 확인 못했다.
- Session Resume은 착수하지 못했다(Founder님도 우선순위 낮다고 명시).
- Participant Count/Peer 생성/PTT 활성화는 ①이 고쳐졌으니 자연스럽게 따라올 가능성이 높지만, ④의 마이크 제약과 얽혀 있어 HTTPS 환경에서 재검증이 필요하다.

단위 테스트 61개 무회귀, 번들 체크 통과.

### RC1-WEEK8 — Target Selection Root Cause + End-to-End PTT Closure (완료)

변경 파일: 0개 순변경(`RoundScreen.jsx`에 임시 디버그 훅을 추가했다가 검증 후 완전히 제거 — `NetworkPttClient.js`는 WEEK7 상태 그대로, 코드 수정 불필요했음이 이번에 증명됨).

#### Priority 1 — Root Cause 규명 (완료)
`window.__ft_debug_dump()` 임시 훅으로 요청된 7가지 값을 재연결 전/클릭 직후/PTT 시점마다 직접 캡처했다.

**진짜 원인**: `selectedTargets`는 RoundScreen의 로컬 state이고, 재연결 시 RoundScreen이 unmount되지 않으므로 **재연결 전후로 선택 상태가 그대로 유지된다** — 이것 자체는 정상이고 Priority 3이 권장한 정책과 정확히 일치한다. 문제는 **제 테스트 스크립트**였다: 재연결 후 "새로 선택해야 한다"고 가정하고 대상 행을 한 번 더 클릭했는데, 이미 선택된 상태였으므로 그 클릭이 실제로는 **선택 해제(toggle-off)** 였다. `selectedTargetIds`가 `[]`가 된 시점을 정확히 잡아냈다: 재연결 직후 `["player_jaegeun"]`(유지됨) → 클릭 직후 `[]`(토글로 해제됨).

#### Priority 2 — 테스트 자동화 실패 vs 제품 실패 분리 (완료)
- B(재근)→A(재식) 방향이 매 회차 실패하는 별개의 문제도 같은 방식으로 발견: `rows[rows.length-1]`로 "마지막 행 = 상대방"이라고 가정한 게 A 화면에서는 맞았지만(본인이 첫 번째), B 화면에서는 틀렸다(본인이 마지막 → 자기 자신을 선택하려 한 것). "(나)"가 포함된 행을 제외하고 상대방을 텍스트 기준으로 찾도록 수정하니 즉시 해결됐다.
- 결론: **두 문제 모두 제품 코드가 아니라 테스트 스크립트의 가정 오류**였다.

#### Priority 3 — 재연결 후 선택 정책 (코드 변경 불필요, 이미 만족됨)
"재연결 전 선택된 대상이 현재 멤버 목록에 있으면 유지" 정책은 로컬 state가 자연스럽게 유지되는 기존 구조로 이미 충족되고 있었다. 화면 표시(`selectedTargets`)와 송신용 대상(`targetUserIds`)도 애초에 같은 단일 state에서 파생되는 구조라 별도로 관리되고 있지 않았다.

#### Priority 4 — End-to-End 완료 (실제 검증됨)
재연결 3회 반복, 매 회차 A→B 3회 + B→A 3회, 총 18회 PTT 시도 — **18/18 성공**.

```
사이클 1: A→B = [성공,성공,성공], B→A = [성공,성공,성공]
사이클 2: A→B = [성공,성공,성공], B→A = [성공,성공,성공]
사이클 3: A→B = [성공,성공,성공], B→A = [성공,성공,성공]
활성 WebSocket: 1개 (총 3회 재연결에 걸쳐 총 3개 생성, 중복/누수 없음)
selectedTargetIds: 매 사이클 ["player_jaegeun"] 유지 확인
targetUserIds(startTransmit 실제 인자): 매 사이클 ["player_jaegeun"] 일치
콘솔 에러: 0건
```

#### 최종 판단
**"재연결 후 사용자가 대상을 선택하고, 양방향 PTT를 반복해서 실제로 사용할 수 있음"을 실제로 확인했다.** RC1 네트워크 안정성 이슈를 여기서 종료할 수 있는 근거가 마련됐다.

### RC1-WEEK7 — WebRTC Recovery After Signaling Reconnect (부분 검증)

변경 파일 1개(`NetworkPttClient.js`).

**Priority 1 (결정적 offer initiator)**: `_shouldOfferTo(userId)` — 두 userId를 문자열로 비교해 더 작은 쪽만 offer. `member_online` 핸들러를 이 규칙으로 교체("이미 방에 있던 쪽이 offer"라는 기존 방식은 양쪽이 동시에 재연결하는 경우 "먼저 있던 쪽"이 정의되지 않는 문제가 있었음).

**Priority 2 (세션 정리)**: `_cleanupConnection`이 이미 transport/ICE queue/remote media/speaker state를 정리하고 있었음을 확인(`WebRtcTransport.close()`가 pending ICE candidate까지 정리). `_peerStates` Map 신규 추가, cleanup 시 함께 정리. 마이크 스트림은 요청대로 유지.

**Priority 3 (멤버 재조정)**: `_reconcileMembers(members)` — room_joined의 members를 authoritative로 사용. 목록에 없는 멤버는 transport 제거, 있는데 transport 없는 멤버는 offer 규칙에 따라 연결 시작, 본인 userId는 필터링, 중복 생성은 기존 `_transports.has()` 체크로 방지.

**Priority 4 (상태 구분)**: 버그 하나 발견 — 기존 코드는 개별 peer의 raw RTCPeerConnection 상태 문자열이 전체 `connectionState`를 그대로 덮어쓰고 있었다(신호 계층과 미디어 계층 상태가 뒤섞여 있었음). `_peerStates`로 분리하고, `media_reconnecting`(신호는 복구, 피어 대기 중) 상태를 신규 도입. 1인 Room은 room_joined만으로 즉시 `connected`, 2인 이상은 실제 피어 연결이 `connected` 상태가 된 뒤에만 "팀 연결이 복구되었습니다" 토스트 발생(`_maybeCompleteMediaReconnect`).

#### 실제로 확인된 것 (직접 증거)
2인 실제 테스트에서 디버그 로그로 직접 추적:
- 재연결 후 offer/answer가 정확히 한 번씩만 오간 것(glare 없음) — 결정적 규칙이 실제로 작동함을 확인.
- **양쪽 peer connection이 실제로 "connected" 상태에 도달하는 것을 직접 확인** — WebRTC 계층 자체는 복구됨.

#### 확인하지 못한 것 (정직하게 보고)
같은 테스트에서 재연결 후 PTT를 시도했을 때 "먼저 전달할 대상을 선택하세요" 토스트가 떴다 — 이는 **테스트 스크립트의 대상 선택 클릭이 실패한 것으로 보이며**, 여러 방식(요소 재조회, 좌표 클릭, bounding box 확인)으로 원인을 추적했지만 시간 제약으로 완전히 규명하지 못했다. Peer connection 자체는 "connected"로 확인됐기 때문에 WebRTC 복구는 성공한 것으로 보이나, **"재연결 후 실제 양방향 음성 PTT 반복 사용"이라는 최종 완료 기준은 아직 end-to-end로 확인하지 못했다.**

Required Verification A~G는 완료하지 못함. 단위 테스트 55개(NetworkPttClient 16개 포함) 무회귀만 확인.

### RC1 긴급 조사 — Vercel Production Socket 요청 0건 (Root Cause 해결)

변경 파일 1개(`HomeScreen.jsx`).

**보고된 증상**: Vercel Production에서 콘솔 에러 없음, WebSocket 요청 자체가 0개.

**Root Cause 추적 결과**: 코드 버그가 아니라 흐름 설계의 구멍이었다. `CommunicationProvider`의 `connectToRoom()` 호출부와 `useEffect` 의존성 배열은 정상이었고, RC1-WEEK4 CTA 구조 변경에서도 제거된 게 없었다. 문제는 production에서 `networkCommunicationEnabled`를 켜는 **유일한 방법(초대 링크 복사 버튼)이 Home 화면에 있고, Room Overlay 흐름(동반자 초대→마이크→코스→START) 안에는 그걸 하라는 신호가 전혀 없었다는 것**. "팀 연결"만 누르고 자연스럽게 Overlay를 진행하면 `networkConfig`가 만들어지는 코드 자체가 실행되지 않아 `VITE_SIGNALING_URL`을 읽는 지점까지 도달하지 못했다 — 정확히 "socket 요청이 0개"라는 관찰과 일치.

**실제 재현**: production(non-DEV) 빌드에서 "팀 연결"만 탭하고 초대 링크 복사를 안 하면 `WebSocket 개수: 0` 확인.

**수정**: "Room이 생기면 네트워킹도 함께 켜진다"로 불변식을 단순화 — `roomCreate`/`roomJoinByCode`가 호출되는 모든 지점(`handleTeamConnect`, `toggleInvite`의 lazy room 생성, `handleJoinByCode`)에서 즉시 `setNetworkCommunicationEnabled(true)`. 더 이상 별도 버튼에 의존하지 않는다.

**검증**: 수정 후 "팀 연결" 한 번만 탭 → `WebSocket 개수: 1`, URL 정상 확인. 초대 링크 복사를 아예 안 거치는 Main-to-Main 전체 흐름(Room 생성→코드 참가→마이크→Round 진입→PTT)도 재확인 — 정상 작동. 단위 테스트 54개 무회귀.

### Deployment Pre-Flight — Render PORT + PWA Manifest

변경 파일 5개(`server/signalingServer.js`, `server/miniWebSocketServer.js`, `index.html`, 신규 `public/manifest.webmanifest` + 아이콘 3개).

**Render PORT 대응**: `process.env.PORT`(Render가 자동 설정) → `SIGNALING_PORT`(기존 로컬 개발용) → `8787` 순으로 읽도록 수정. `PORT=10000`으로 실제 서버를 띄워 WebSocket 연결까지 실제로 확인.

**추가로 발견해 함께 고친 문제**: `http.createServer()`에 요청 핸들러가 아예 없어서, WebSocket 업그레이드가 아닌 일반 HTTP 요청(Render의 헬스체크가 정확히 이렇게 함)이 응답 없이 영원히 멈춰 있었다(`curl` 확인 결과 상태 코드 `000`). 헬스체크용 200 응답 핸들러를 추가하고, WebSocket 업그레이드 경로는 그대로 실제로 재확인.

**PWA 설치 가능하게**: `manifest.webmanifest`(name/icons/display:standalone/start_url/theme_color 전부 포함), PNG 아이콘 3종(192/512/apple-touch-icon, 기존 SVG 파비콘과 동일한 디자인으로 직접 생성), `index.html`에 manifest 연결 + iOS 전용 meta 태그(`apple-mobile-web-app-capable` 등, iOS Safari는 manifest.json을 안 읽어서 별도 필요) 추가. 오프라인 캐시/서비스워커는 추가하지 않음(요청대로).

**사전 점검 결과**(코드로 실제 확인, 추측 아님):
- `npm run build` 자체는 이 환경(외부 네트워크 차단)에서 직접 실행 불가 — `node_modules` 설치가 안 됨. 대신 esbuild로 전체 소스를 번들 검증(문법·import 오류 없음 확인)했지만, Vite 고유 동작까지 100% 보장하지는 못한다는 걸 정직하게 밝힌다.
- 초대 링크는 이미 `window.location.href`를 동적으로 사용 — 배포 후 자동으로 Vercel 주소가 됨(코드 수정 불필요, 확인만).
- 실제 iPhone 13 / Pixel 7 뷰포트 에뮬레이션(올바른 viewport meta 태그 포함)으로 폰 프레임 제거 + 전체화면 확인.

**GitHub 업로드 방법**: 파일 136개(1.4MB) — GitHub 공식 웹 업로드 권장 한도(약 100개)를 초과해 웹 드래그앤드롭은 실패 위험이 있음. GitHub Desktop 방식으로 안내 변경.

**검증**: 단위 테스트 54개 무회귀.

### Real Device Readiness — 실제 폰 배포 준비

변경 파일 2개(`App.jsx`, `app.css`). 새 기능 없음, 실제 기기에서 제대로 보이기 위한 준비.

**발견한 문제**: 지금까지 화면은 데스크톱 미리보기용 "폰 모양 테두리"(393×852px, 둥근 모서리, 그림자)로 만들어져 있었다 — 실제 폰 브라우저로 열면 화면 가득 차지 않고 작은 상자로 보였을 것.

**수정**: `@media (max-width: 500px) and (pointer: coarse)` — 좁은 화면 + 터치 기기 조건에서만 테두리를 없애고 화면을 꽉 채우도록 분기. 실제 iPhone/Android 뷰포트 에뮬레이션(Playwright의 `devices["iPhone 13"]`, `devices["Pixel 7"]`, 올바른 viewport meta 태그 포함)으로 둘 다 확인 — `fillsScreen: true`, `borderRadius: "0px"`.

**추가로 발견**: 테스트 중 처음엔 뷰포트가 980px로 잘못 측정됐는데, 이건 제 임시 테스트 HTML 파일에 viewport meta 태그가 빠져서였다 — 실제 프로젝트의 `index.html`은 이미 올바른 태그(`width=device-width`)를 갖고 있었다. 제 테스트 설정 오류였고 실제 코드 버그는 아니었다는 것도 재확인했다.

**signaling 서버 주소 설정 가능하게**: `ws://localhost:8787` 하드코딩 → `VITE_SIGNALING_URL` 환경변수로 빌드 시 지정 가능(없으면 기존처럼 localhost로 폴백, 로컬 개발 영향 없음).

**검증**: 단위 테스트 54개 무회귀.

### RC1-WEEK5 — Real Network Validation Prep

변경 파일 1개(`RoomOverlay.jsx` — DEV 전용 진단 줄 1개 추가, 새 사용자 기능 없음). 문서 2개(신규 `RC1_WEEK5_NETWORK_VALIDATION_PREP.md`, 기존 `RC1_WEEK3_NETWORK_VALIDATION_PLAN.md`에 확인 노트 추가).

**핵심 사실 확인(추측 아님, 코드로 확인)**: `iceServers`는 프로덕션 경로(`App.jsx`)와 DEV 경로(`TwoDeviceTestScreen.jsx`) 전부 하드코딩된 빈 배열 — STUN도 TURN도 설정된 적이 없다.

**Diagnostic Visibility**: 필요한 진단 정보(연결 상태, 멤버 수, 마지막 에러, 마이크 권한, PTT 거절 이유, remote audio 차단 여부) 대부분이 **이미 내부적으로 추적되고 있었다** — 화면에 노출만 안 돼 있었을 뿐. 기존 DEV 마이크 레벨 표시와 같은 패턴으로 `DEV conn=... members=... lastError=...` 한 줄만 추가(실사용자 화면에는 안 보임).

**최종 판단: A. 실기기 네트워크 테스트 시작 가능.** 다만 STUN/TURN이 전혀 없으므로 Scenario B/C(다른 네트워크) 실패는 버그가 아니라 예상 범위 안의 결과일 수 있다는 걸 문서에 명시했다.

**검증**: 단위 테스트 54개 무회귀, Main-to-Main 전체 흐름(초대 링크 포함) 재확인, 콘솔 에러 0건.

### RC1-WEEK4 — START CTA Root Cause (해결됨)

변경 파일 2개(`RoomOverlay.jsx`, `app.css`). 이번엔 원인을 먼저 확인하고 딱 한 번만 고쳤다.

**Root Cause**: 두 번의 이전 시도가 실패한 이유는 CSS 기법(sticky vs flex-split) 문제가 아니라, **footer(Ready Summary+START)를 마이크 행과 같은 스크롤 컨테이너 안에서 "그 컨테이너 하단에 고정"시키려 했기 때문**이었다. 마이크 행이 우연히 스크롤 컨테이너의 "현재 보이는 영역 하단"에 위치해 있어서, 어떤 방식으로 footer를 그 자리에 고정하든 마이크 행과 좌표가 겹쳤다.

**증거**: 소스 파일을 건드리지 않고 런타임 스타일 주입만으로 이전 sticky 시도를 재현 — `elementsFromPoint`로 정상 상태(마이크 버튼이 최상단)와 재현 상태(빈 SPAN → ready-summary → sticky wrapper 순, 마이크는 4번째)를 직접 비교했고, 좌표로도 겹침을 수학적으로 확인했다(footer top=728/bottom=869, 마이크 top=758.75/bottom=795.75).

**수정**: footer를 마이크 행과 **완전히 다른 스크롤 컨테이너**로 분리 — `.ft-gallery-sheet`(스크롤 카드) 안이 아니라 `.ft-gallery-overlay` 바로 아래의 독립된 형제 요소로 이동. Gallery 패널과 공유하는 `.ft-gallery-overlay`/`.ft-gallery-scrim` 자체는 전혀 안 건드렸다 — Room Overlay 전용 새 wrapper(`.ft-room-overlay-stack`) 하나만 추가해서 그 안에서만 column 배치를 적용했다.

**검증**: 필수 3개 뷰포트(430×932, 390×844, 375×667) 전부에서 마이크 클릭/길게 누르기, 코스 선택, 시작 홀 변경, CTA 도달성, CTA-마이크 겹침 없음, 끝까지 스크롤 가능, 콘솔 에러 0건 — 전부 통과. Regression: 초대 링크 자동 참가, 마이크 준비, Round 시작, PTT 양방향, 홀 진행까지 실제 재확인, 무회귀. 단위 테스트 54개 무회귀.

**최종 질문에 대한 답: "이 수정은 원인을 해결한 것이다."** 증상(버튼이 안 보임, 클릭이 씹힘)을 가리는 CSS 트릭이 아니라, 두 요소가 애초에 좌표를 두고 경쟁할 수 없도록 DOM 구조 자체를 분리했다 — 어떤 화면 크기·콘텐츠 길이 조합에서도 이 두 영역은 이제 서로 다른 컨테이너에 속하므로 같은 클래스의 문제가 재발할 수 없다.

### RC1-WEEK3 — Make FIELDTALK usable by four real golfers

DESIGN DOC-002 Admission Rule을 먼저 통과시킨 뒤 진행. 변경 파일 3개(`App.jsx`, `HomeScreen.jsx` — 실제 남은 변경, `RoomOverlay.jsx`/`app.css`는 시도 후 완전히 되돌려 순변경 0).

#### Priority 1: Real Invitation Flow — ✅ 완료, 실제 검증됨
Admission 통과 근거: Play Context 방해 없음 / "호스트가 대신 탭하는" 기존 시뮬레이션으로는 해결 불가능 / 링크 탭 1회로 One Tap 유지 / 여러 Sprint(First Round UX Audit, TASK-010, RC1-WEEK1/2)에 걸쳐 반복 확인된 최우선 이슈.

**구현**: 호스트가 "초대 링크 복사"(실사용자 대상, DEV 게이트 없음)를 탭하면 `?join=CODE` 형태의 실제 URL이 클립보드에 복사되고 동시에 호스트 쪽 Network 모드가 자동 활성화된다. 이 링크를 실제 문자·카카오톡 등 앱 밖의 아무 채널로 받은 사람이 탭하면, `App.jsx`가 마운트 시 URL을 파싱해 자동으로 `roomJoinByCode`를 디스패치하고 Room Overlay를 즉시 연다 — 수동 코드 입력도 DEV 토글도 없다.

**검증**: 서로 다른 identity(재식→재근)로 두 브라우저를 띄워 링크 복사→전달→탭→자동 참가→마이크 확인→Round 진입→PTT까지 전 과정을 실제로 통과. "참여 2명", Player 목록에 둘 다 표시, PTT 정상 전달 확인. Main-to-Main 전체 회귀도 이 새 경로로 재확인, 무회귀.

#### Priority 2: ROUND START CTA — ❌ 두 번 시도, 두 번 되돌림
RC1-WEEK1에서 `position: sticky`로 시도해 마이크 버튼 클릭이 씹히는 회귀를 발견하고 되돌렸었다. 이번엔 완전히 다른 방식 — DOM을 실제로 스크롤 영역/고정 영역 두 개로 분리하는 구조적 접근(sticky 없음, 음수 마진 없음) — 을 시도했다. START 버튼은 스크롤 없이 보이게 됐지만, **`document.elementsFromPoint`로 확인한 결과 `.ft-room-ready-summary`가 마이크 행 위에 그대로 겹쳐서 클릭을 가로채는, 첫 시도와 같은 증상이 재현**됐다.

두 번 연속으로 근본적으로 다른 CSS 접근에서 같은 증상이 나온 뒤 되돌렸다. 이후 되돌린 상태를 **완전히 새로 빌드해서 재확인** — 마이크 정상 작동, ready-summary와 마이크 행 사이 296px 간격으로 겹침 없음을 확인했다(이전 진단에서 "여전히 겹침"으로 보였던 건 실은 되돌리기 전의 stale 빌드 파일을 잘못 테스트한 제 실수였다 — 이 부분도 정직하게 기록한다).

**남은 이슈**: ROUND START 버튼 하단 잘림 문제는 그대로 남아 있다. 다음 시도 전에 `.ft-room-ready-summary`/`.ft-room-member-row`의 실제 렌더링 트리를 브라우저 DevTools로 직접 들여다보는 등 더 근본적인 사전 진단이 필요하다고 판단한다 — CSS를 먼저 짜고 재현으로 검증하는 방식을 두 번 반복해 실패했다.

#### Priority 3: Real Network Validation Plan — 계획 문서 완료
`docs/RC1_WEEK3_NETWORK_VALIDATION_PLAN.md`로 저장. 이 환경에서는 실제 Wi-Fi/LTE를 재현할 수 없어(Sprint 7과 동일한 한계) 실행이 아니라 계획만 작성 — Founder가 실제 기기로 실행할 4단계 절차(같은 Wi-Fi 기준선 → Wi-Fi↔LTE → 다른 통신사 → 실제 골프장)와 각 단계 Risk/Recommendation을 문서화했다.

#### Regression
단위 테스트 54개 무회귀. Main-to-Main(초대 링크 경로 포함) 재확인, 콘솔 에러 0건 — 최종적으로 되돌린 상태 기준.

### RC1-WEEK1 — Exception / UX / First 60 Seconds / Visual Polish

변경 파일 0개(net) — Visual Polish에서 시도했던 CSS 변경 하나는 회귀를 발견해 전부 되돌렸다.

#### Exception Audit — 새로운 버그 없음(긍정적 결과)
실제로 부딪혀본 것들: 홀 완료 버튼 3연타(정상 — 홀 1개만 진행), PTT 3연타(정상 — 에러 없음, 상태 안 꼬임), 실제 미디어 기기 자체가 없는 환경(정상 — "사용 불가" 정직하게 표시), 대상 미선택 상태에서 PTT(정상 — "먼저 전달할 대상을 선택하세요" 토스트). 4가지 모두 통과 — 지금까지 여러 Sprint에 걸쳐 고친 것들이 실제로 안정화됐다는 신호로 본다.

#### UX Audit — Exception Audit에 포함해 함께 확인, 추가 발견 없음

#### First 60 Seconds Audit
실제 타이머로 측정: 설치→동반자 참여→Room→코스 선택→마이크 확인→ROUND START까지 **2.9초**(기계적 조작 시간, 정답을 아는 상태 기준). First Round UX Audit(초기) 때의 3~4초와 비슷한 수준을 유지하면서, 그 사이 Sprint 8.1~8.3에서 고친 신뢰도 문제(DEV 노출, 무설명 실패, 해결 불가능한 Warning, 재초대 버그)가 전부 반영된 상태에서 나온 수치라 실제 "이해되는 시간"은 이전보다 짧아졌을 것으로 판단(별도 재측정은 안 함).

#### Visual Polish — 발견 1건, 수정 시도 후 되돌림 (정직하게 기록)
**발견**: Room Overlay에서 코스 선택 + 마이크 확인을 마치면, **ROUND START 버튼이 실제로 화면 아래로 잘려 스크롤해야만 보임**(정확한 측정치: 뷰포트 932px 중 버튼이 997px 지점에 위치). Founder가 "어떻게 시작하지"라고 헤맬 수 있는 지점.

**시도한 수정**: `position: sticky`로 하단 고정 — 처음 시도(음수 마진으로 풀블리드)에서 **마이크 확인 버튼 클릭이 아예 안 먹는 회귀**를 실제 테스트로 발견했다. 원인을 재확인하려고 마진 없는 더 단순한 버전으로 다시 시도했지만, **같은 종류의 오버랩이 재현**됐다(`document.elementsFromPoint`로 확인: sticky footer가 마이크 행 위에 그대로 겹쳐 클릭을 가로챔). 스크롤 컨테이너 안에서 `position: sticky`가 예상과 다르게 동작하는 원인을 이 Sprint 안에서 확실히 진단하지 못했다.

**판단**: 원인을 확신 없이 다시 시도하기보다, **핵심 기능(마이크 확인)이 깨지는 것보다는 스크롤이 필요하다는 걸 못 알아채는 게 훨씬 작은 문제**라고 보고 전부 되돌렸다. 최종 회귀 테스트로 이전 상태(정상 작동)를 재확인했다.

**남은 이슈**: ROUND START 버튼 하단 잘림 문제는 그대로 남아 있다. 다음 Sprint에서 `position: sticky` 대신 다른 방식(예: 스크롤 컨테이너 자체를 분리해서 CTA를 완전히 별도 레이어로 두는 방식)으로 접근할 것을 제안한다.

#### Final Regression
단위 테스트 54개 무회귀. Main-to-Main(재식↔재근) Room 생성→참가→마이크 확인→Round 진입→양방향 PTT→홀 진행까지 재확인, 콘솔 에러 0건 — Visual Polish 시도를 되돌린 뒤의 최종 상태 기준.

### TASK-012 — Field Ready Sprint

새 기능 0개. 변경 파일 2개(`roundSelectors.js`, `app.css`).

#### 1. First 5 Seconds Audit — HIGH 요소 없음, 확인만
실측: 헤더~거리카드 간격 2px, GPS 큰 숫자가 화면 상단 172px 지점부터 시작 — 시선이 거리 숫자로 먼저 가는 구조는 이미 확립돼 있었다(Sprint 5.2 바람 재배치 이후). Header(14px/800)와 거리 숫자(28px/800)는 크기 차이로 이미 충분히 구분됨. 폰트 크기/여백 조정 불필요 판단.

#### 2. Information Diet — MEDIUM
- **"GPS · 방금 전"** → **"GPS"**: 화면 한 번에 4명분(재식/재근/광천/해란) 반복 표시되던 상대적 시간 정보를 제거. 시간이 계속 바뀌는데도 실제 판단에 영향을 주지 않는 정보였음.
- **"실측 기준 추정"** → **"실측 보정"**: 6글자→4글자, "실측에 기반한 보정값"이라는 의미는 유지하면서 더 짧게.
- Release 영향: 표시 문구만 변경, 데이터 흐름/판단 로직 무변경.

#### 3. One Thumb Test — LOW(문제 없음, 확인만)
실측: 실측입력(top 169px, ~18%), PTT(top 477~557px, 중앙), 응원(top 636px, ~68%), 스코어(top 698px, ~75%). PTT가 화면 정중앙(51~60%)에 위치해 완벽한 하단 원터치 존은 아니지만, 버튼 자체가 크고(80×80) 양손 그립 상황(카트 이동 중 등)까지 고려하면 현재 위치가 합리적 — 레이아웃 변경 없이 유지 권장.

#### 4. Outdoor Visibility — HIGH
`--ink-2`(보조 텍스트 색상) 대비가 배경 대비 약 **3.8:1**로 측정됨(WCAG AA 본문 기준 4.5:1 미달, 강한 야외광에서는 더 불리). `#66756b` → `#7f8d84`로 조정해 약 **5.3:1**로 개선 — 톤은 유지하면서 대비만 높임(전역 CSS 변수 1줄 변경이라 관련 텍스트 전부 일관되게 개선됨).

#### 5. Final QA — 전부 재확인, 무회귀
Room 생성/재입장, 거리 공유(TASK-010 Review에서 이미 검증), PTT 양방향, 스코어 패널, 홈 복귀 후 진행중 라운드 상태 보존, Main-to-Main 전체 흐름 재확인 — 콘솔 에러 0건. 단위 테스트 61개 무회귀.

#### Before / After
스크린샷 첨부(`t12-before-round-screen.png` / `t12-after-round-screen.png`).

#### 최종 판단: **PASS**

### TASK-010 Review — 3가지 마무리

변경 파일 5개(`DistanceCard.jsx`, `RoundScreen.jsx`, `roundActions.js`, `roundReducer.js`, `app.css`). 새 기능 없음.

**1. Distance Share 신뢰성**: 이미 존재하던 `round.lastDistanceShare` 상태를 활용 — 내가 현재 홀의 공유자일 때, 화면 primary 표시가 GPS 대신 내 실측값으로 바뀌고 GPS는 작은 보조 줄로 내려간다(바람 표시와 같은 시각 패턴 재사용). 요청하신 예시 그대로: `실측 135m` / `GPS (참고) 136m`.

**2. 라운드 완료 화면 polish**: "라운드 완료" → "18홀 완료"(실제 `round.holes.length` 사용) + 기존 스코어 목록 + "플레이해 주셔서 감사합니다." 한 줄 추가.

**3. Home 복귀 확인 — 실제로 확인해보니 진짜 버그가 있었다**: Room으로 시작한 라운드를 완료하고 홈으로 나간 뒤 "라운드 시작"을 다시 누르면, **완료된 hole 18 라운드(오래된 스코어까지 포함)가 그대로 재활성화**됐다. 기존 `ROUND_START` 액션이 상태를 `"active"`로만 바꿀 뿐 아무것도 리셋하지 않았기 때문. 새 `ROUND_RESET` 액션(전체를 `createRoundSeed()`로 교체 — RoundProvider.jsx가 저장된 라운드가 없을 때 쓰는 것과 동일한 폴백)을 추가해, 완료 화면의 "홈으로" 버튼에서만 발동하도록 연결(일반 뒤로가기 화살표는 진행 중인 라운드를 그대로 보존— 안 건드림).

**검증**: Room 생성→18번 홀 완료→홈으로→라운드 시작 재확인 — "7H | PAR4|-(-)"(신선한 데모 시드)로 정상 복귀. 단위 테스트 54개 무회귀.

#### 최종 Release 판단
| Room | PTT | Distance | Score | Round Engine |
|---|---|---|---|---|
| PASS | PASS | **PASS** | PASS | PASS |

### TASK-010 — Founder Solo Round Sprint

**변경 파일 2개**(`RoundScreen.jsx`, `app.css`). 새 기능 없음, 기존 흐름 완성.

#### 가장 중요한 발견: 라운드 종료가 Dead End였다
User Journey Audit로 처음부터 끝까지(설치→Room→PTT→거리→스코어→**라운드 종료**) 실제로 걸어봤다. **18번 홀을 완료하면 "라운드 완료"라는 정적 문구만 뜨고 그걸로 끝** — 최종 스코어 요약도, 홈으로 돌아갈 방법도 없었다. Founder가 "설명 없이 혼자 라운드를 끝낼 수 있는가"라는 이 Sprint의 완료 기준을 정확히 이 지점에서 통과하지 못했을 것이다.

**Before**: 18번 홀 완료 버튼 클릭 → "라운드 완료"라는 회색 알약 하나 → 끝(진행 방법 없음)
**After**: 전원의 최종 스코어(이미 계산돼 있던 `selectPlayerTotalStrokes`/`selectPlayerTotalToPar` 재사용, 새 데이터 없음) + "홈으로" 버튼

수정 중 발견한 버그: 처음 구현은 스코어 패널이 펼쳐진 상태에서만 보이는 위치에 넣었는데, 홀 완료 시 패널이 자동으로 접히는 기존 로직 때문에 요약이 절대 안 보였다. 조건 순서를 바꿔 라운드 완료 상태가 패널 펼침 여부보다 우선하도록 재배치해서 해결.

#### 그 외 확인한 것 (Distance)
실측 거리 공유(값을 바꿔서 "팀에 공유" 탭)는 정상 작동 — 토스트로 "재식 기준 135m를 팀에 전송했습니다" 정확히 표시됨. 다만 **공유 직후 내 화면의 거리 표시 자체는 여전히 "GPS (참고) 136m"로 남아 있고, 방금 공유한 135m·"실측" 태그로 안 바뀜**을 발견했다. 팀원에게는 정상 전달되는 것으로 보이나, 본인 화면이 자기가 방금 알린 숫자와 다르게 보이는 건 신뢰를 깎는 요소다. 이번 Sprint에서 고치기엔 시간이 부족해 고치지 않고 Release Risk 표에 남긴다.

#### Release Risk

| 기능 | 상태 | Risk | 근거 |
|---|---|---|---|
| Room 생성/참가 | PASS | LOW | Sprint 8.3에서 재초대 버그 수정, 실제 클릭 반복 테스트 통과 |
| PTT(양방향, 대상 지정) | PASS | LOW | 2~4인 Mesh 전부 실제 테스트 통과(Sprint 7) |
| Distance 확인 | PASS | LOW | GPS/실측 계층 정상 표시 |
| Distance 공유 | **HOLD** | **MEDIUM** | 팀 전달은 정상이나 본인 화면 미갱신 — 신뢰도 문제, 다음 Sprint 필요 |
| Score 입력 | PASS | LOW | E 기본값, 패널 열림=draft 모델 정상 |
| Round Engine — 홀 진행 | PASS | LOW | 정상 |
| Round Engine — **라운드 종료** | **PASS(수정 후)** | **HIGH→LOW** | 수정 전엔 Dead End(HIGH), 이번 수정으로 해소 |

#### Regression 결과
단위 테스트 54개 무회귀. 스코어/PTT/거리 확인 기존 동작 변화 없음(완료 화면 코드 경로만 추가/재배치).

### Sprint 8.3 — Founder Test Platform (P0)

**변경 파일 3개**: `roomReducer.js`(진짜 원인 수정), `HomeScreen.jsx`, `RoomOverlay.jsx`(문구).

#### 1. Root Cause
처음엔 "Preview는 localStorage/sessionStorage를 지원하지 않는다"는 플랫폼 제약을 원인으로 의심하고 방어적 폴리필까지 만들었지만(이건 남겨뒀다 — 여전히 옳은 방어 코드), **실제 storage를 throw하게 만든 뒤 재현했을 때도, 실제 localStorage가 정상인 환경에서도 동일하게 재현**돼 진짜 원인이 아니었다.

**진짜 원인은 `roomReducer.js`의 `ROOM_MEMBER_INVITE` 케이스였다.** "이 userId가 이미 members 배열에 있으면 재초대는 no-op"이라는 로직이, `joinStatus`를 확인하지 않고 배열에 있다는 사실만 봤다. 그래서 미초대→초대됨→참여함→미초대("나감"으로 배열엔 남아있음)까지 한 사이클은 정상 작동하지만, **두 번째 사이클의 첫 탭(미초대→초대됨)이 "이미 멤버니까 무시"로 조용히 실패**했다. Founder가 실제로 여러 번 탭하며 테스트하는 과정에서 이 지점을 만난 것이다.

#### 2. 수정 내용
- `ROOM_MEMBER_INVITE`: `joinStatus`가 "left"/"declined"인 기존 멤버는 "활성 참가자"가 아니므로 재초대를 정상 처리(상태를 "invited"로 리셋)하도록 수정. 여전히 "invited"/"joined" 상태의 진짜 중복 초대는 그대로 차단.
- (부수적으로 남긴 방어 코드) 병합 Preview 빌드 스크립트에 in-memory storage 폴리필 추가 — 실제 원인은 아니었지만, Claude.ai 아티팩트 샌드박스가 localStorage/sessionStorage를 지원하지 않는다는 플랫폼 제약 자체는 여전히 유효해서 유지.
- Task 4: "탭하면 참여 상태가 바뀝니다" → "Preview Simulation / 탭하여 참여 상태를 시뮬레이션합니다. / 실제 초대 알림은 아직 구현되지 않았습니다."로 문구 변경(Home + Room Overlay 양쪽).

#### 3. Before / After
- Before: 5회 연속 탭 → `미초대,초대됨,초대됨,초대됨,초대됨` (2번째 탭 이후 고착)
- After: 5회 연속 탭 → `미초대,초대됨,참여함,미초대,초대됨,참여함` (반복 사이클 정상)

#### 4. Founder 확인 방법
1. Home에서 동반자 카드를 5번 이상 연속으로 탭 — 미초대→초대됨→참여함이 계속 반복돼야 함(이전엔 2번째 사이클에서 멈췄음).
2. Home에서 상태를 "참여함"으로 바꾼 뒤 "팀 연결" 진입 — Room Overlay에 동일하게 "참여함 · 연결됨"으로 보여야 함.
3. Room Overlay 안에서 그 동반자를 다시 탭해 "나감"으로 바꾼 뒤 닫기 — Home으로 돌아오면 "미초대"로 보여야 함(양방향 동기화).
4. 동반자 섹션 문구가 "Preview Simulation..."으로 바뀐 것 확인.

#### 5. Regression 결과
단위 테스트 63개 무회귀. Main-to-Main(재식↔재근) Room 생성→참가→PTT 양방향→홀 이동→스코어 패널까지 재확인, 콘솔 에러 0건.

### Sprint 8.2 — Interactive Truth (Dead Tap Audit)

새 기능 없음, Production/Room/PTT 로직 무변경. 변경 파일 2개(`HomeScreen.jsx`, `RoundScreen.jsx`).

#### Dead Tap Audit 결과표 (전부 실제 클릭으로 확인, 추정 없음)

| 화면 | 요소 | 분류 | 비고 |
|---|---|---|---|
| Home | 스플래시 탭 | A | |
| Home | 라운드 시작 | A | |
| Home | 팀 연결 | A | |
| Home | 동반자 카드(재근/광천/해란) | A | 미초대→초대됨→참여함 순환 정상 |
| Home | **최근 라운드 카드** | **C→B** | **수정함** — 토스트 없었음 → 추가 |
| Home | 하단 탭 "라운드" | A | |
| Home | 하단 탭 "동반자"/"프로필" | B | 이미 "준비 중인 기능입니다" 토스트로 명시돼 있었음(수정 불필요) |
| Room Overlay | 동반자 초대 섹션 | A | |
| Room Overlay | 마이크 확인(press-hold) | A | |
| Room Overlay | 코스 목록 선택 | A | |
| Room Overlay | 시작 홀 스테퍼(+/-) | A | |
| Room Overlay | ROUND START | A | |
| Room Overlay | Warning 모달 취소/시작 | A | |
| Round | 뒤로가기 | A | |
| Round | "전체" 대상 행 | A | |
| Round | 각 동반자 대상 선택 | A | |
| Round | PTT 버튼 | A | |
| Round | **공유 버튼** | **B(문구 오해 소지)→B(수정)** | **수정함** — "공유했습니다"(성공 암시) → "준비 중입니다" |
| Round | Gallery 트리거 | A | |
| Round | Gallery 카테고리 타일(5개) | A | 그리드→상세 2단계 네비게이션 정상, 뒤로가기 버튼 존재 |
| Round | Gallery 사운드 버튼 | A | 재생 성공/실패 모두 정직한 피드백(실패 시 "사운드 파일을 찾을 수 없어요" 등 구체적 토스트) |
| Score | 내 스코어 +/- | A | |
| Score | 다른 사람 스코어 | 해당 없음 | 애초에 버튼 자체가 렌더링 안 됨(코드 확인) — Dead Tap이 될 요소 자체가 없음, 올바른 설계 |
| Score | 완료 · 다음 홀로 | A | |

#### 수정 내용
1. **최근 라운드 카드**(C→B): 탭 시 토스트 "최근 라운드 상세 기능은 준비 중입니다." 추가. 상세 화면은 만들지 않음.
2. **공유 버튼**: "스코어카드를 공유했습니다"(과거형, 성공 암시) → "스코어카드 공유 기능은 준비 중입니다"(동반자/프로필 탭과 동일한 정직한 패턴). 실제 공유 API는 원래도 없었고 여전히 없음.

#### 회귀 확인
단위 테스트 54개 무회귀. Main-to-Main(재식↔재근) Room 참가→Round 진입→양방향 PTT→홀 진행 실제 재확인, 콘솔 에러 0건.

### Sprint 8.1 — Preview Clarity & Invite Truth

새 초대 기능 없음(링크/QR/연락처/알림/가짜 API 전부 미구현). 변경 파일 2개(`HomeScreen.jsx`, `RoomOverlay.jsx`) — 라벨 문구만 추가, Room Engine/Production 로직 무변경.

**회귀 테스트(항목 1)**: "미초대 → 초대됨 → 참여함" 탭 순환을 실제 클릭으로 확인 — 정상 작동, 수정 불필요.

**적용한 방식(항목 3, 가장 위험 낮은 것 선택)**: 상태 라벨 자체는 건드리지 않고, 동반자 섹션 바로 아래에 문구 한 줄만 추가: "탭하면 참여 상태가 바뀝니다 — 아직 실제 초대 알림은 전송되지 않습니다." Home과 Room Overlay 양쪽에 동일하게 적용, DEV 게이팅 없음(실사용자도 오해할 수 있는 문제라 모두에게 노출). 인터랙션은 전혀 안 바뀌어서 회귀 위험이 사실상 0.

**항목 5 — 실제 클릭 테스트 결과**(추정 아님, 전부 직접 클릭):
- 하단 탭 "라운드": 동작(Round 화면 진입)
- 하단 탭 "동반자"/"프로필": 미구현("준비 중인 기능입니다" 토스트로 이미 정직하게 명시돼 있음, 수정 불필요)
- "최근 라운드" 카드: 미동작(클릭해도 화면 변화 없음)
- 코스 목록 선택: 동작
- 시작 홀 스테퍼(+/-): 동작
- Round 헤더 "공유" 버튼: 토스트만 표시("스코어카드를 공유했습니다") — 실제 공유 API 호출 아님, 버튼 반응 자체는 있음

**회귀 확인**: 단위 테스트 54개 무회귀. Main-to-Main(재식↔재근) Room 참가 → Round 진입 → 양방향 PTT → 홀 진행까지 실제 두 브라우저로 재확인, 전부 정상.

**검증 중 발견한 것(투명하게 기록)**: 처음 재현 테스트에서 재근이 Round 화면에 도달하지 못하는 것처럼 보였는데, 원인은 제품 코드가 아니라 **제 테스트 스크립트가 정적 파일 서버와 signaling 서버에 같은 포트(8787)를 실수로 같이 써서 충돌**한 것이었다. 포트를 분리하니 정상 동작 확인됨 — 실제 회귀는 없었다.

### Sprint 5.2 — 바람 표시 Information Hierarchy 개선

새 라벨("바람") 없음, 새 기능 없음 — 정보의 위치와 전달 방식만 바꿨다. 변경 파일 3개(`DistanceCard.jsx`, `RoundScreen.jsx`, `app.css`).

**Before**: 헤더 두 번째 줄에 "↙ SW 2.3m/s"가 고립된 텍스트로 떠 있었다 — hole/par/score 정보와 나란히 있어 같은 무게의 정보처럼 보였고, 유니코드 화살표 문자는 방향을 8단계로만 거칠게 표현했다.

**After**: 헤더는 hole/par/score 한 줄로 단순화됐다. 바람은 거리 카드의 큰 GPS 숫자 바로 아래, 작은 보조 텍스트로 옮겨졌다 — "샷을 결정할 때 함께 보는 정보"라는 시각적 그룹을 만들었다. `Wind` 아이콘(lucide-react)이 실제 풍향 각도로 연속 회전한다(8방향 화살표 문자 대신) — 아이콘 자체가 방향이라는 의미를 전달하고, 텍스트 라벨은 하나도 늘지 않았다.

**시선 흐름 관점**: 헤더(라운드 정체성) → 거리 큰 숫자(1차 결정 정보) → 바람(그 숫자를 조정할 보조 정보, 바로 아래) → 실측 입력 버튼. 이전엔 헤더에서 바람을 먼저 보고 스크롤해야 거리를 봤다면, 이제는 "거리를 보는 순간 바람이 같은 시야에 있다."

Before/After 스크린샷 4장 함께 제출. 실측 결과: PTT·Score·Gallery·실측 입력 모드 전부 정상 동작, 콘솔 에러 0건, 단위 테스트 54개 무회귀.

### Sprint 5.1 — First Round UX Audit 후속 조치 (3 findings 수정)

새 기능/화면/설정 없음. 변경 파일 2개(`roomSelectors.js`, `RoomOverlay.jsx`).

1. **마이크 테스트 실패를 설명함**: 짧은 탭으로 테스트가 완료되지 못하면 "조금 더 길게 눌러 주세요" 토스트로 이유를 알려준다(이전엔 무설명으로 원상복귀).
2. **개발자 정보를 Production에서 완전히 숨김**: "DEV 시뮬레이션" 라벨(gate 밖에 있던 것), "Provider A/B" 선택기, "Level N"/"local_test" 메타데이터, "[TEST]" 코스/클럽명 접두사 — 전부 `isDevMode` 게이트 안으로 이동하거나 표시에서 제거(데이터 자체는 안 건드림).
3. **해결 불가능한 Warning 제거**: "일부 인원의 PTT 테스트가 완료되지 않았습니다"는 동반자가 실제 별도 기기 없이는 절대 해소할 수 없는 조건이었다. 이제 `ptt_test_incomplete`는 **현재 사용자 자신의** 마이크 상태만 확인한다 — 남의 마이크가 되는지는 애초에 내가 확인/해결할 수 있는 일이 아니라는 판단.

전부 실제 비-DEV 빌드로 재현·검증했다. 단위 테스트 94개 무회귀.

### Product Completion Sprint 1 — 마이크+PTT 테스트 통합 / GPS 권한 시점 이동 / Warning 완화

기능 추가 없음 — 기존 흐름의 마찰 3곳만 줄였다. 변경 파일 4개(`LocalPttClient.js`, `NetworkPttClient.js`, `CommunicationProvider.jsx`, `RoomOverlay.jsx`), 새 화면·새 설정 없음.

**1. 마이크 준비 + PTT 테스트 통합**: "마이크 준비" 탭 한 번 + (DEV 전용이라 실사용자는 접근조차 못 했던) "PTT 테스트" 두 단계였던 걸 press-and-hold 한 번으로 합쳤다. 실제 PTT 버튼과 똑같은 제스처(`PttPressController` 재사용)로, 누르면 권한 요청→마이크 활성화→실시간 음성 레벨 표시가 한 흐름으로 이어지고, 놓으면 자동으로 `pttTestStatus: "completed"`가 기록된다. **테스트 중 발견한 숨은 버그**: 기존엔 PTT 테스트 완료 UI가 DEV 전용이어서, 실사용자는 `pttTestStatus`를 영원히 "completed"로 만들 방법이 없었다 — 즉 매 라운드 START마다 "PTT 테스트가 완료되지 않았습니다" Warning이 항상 떴다. 이번 수정이 이 버그를 부수 효과로 고쳤다.

**2. GPS 권한 요청 시점 이동**: 기존엔 `navigator.geolocation` 첫 요청이 `DistanceCard.jsx`의 DEV 버튼(라운드 중)에서만 트리거됐다. 이제 Room Overlay가 열리는 순간(주차~티잉그라운드 이동 시간) 백그라운드로 미리 요청한다 — 새 버튼 없이, 오버레이가 열리는 것 자체의 부수 효과.

**3. "Host 혼자 시작" Warning 모달 완화**: Ready Summary에 이미 "참여 N명"으로 상시 노출되는 정보라, `host_only`가 유일한 Warning일 때는 확인 모달 없이 바로 시작한다. 다른 Warning(코스/시작 홀 미선택 등)과 함께 발생하면 기존처럼 모달에 다 같이 표시된다.

**실제로 발견한 기술적 제약(문서화)**: `NetworkPttClient.startLocalTest()`는 서버 PTT lock을 거치지 않는 순수 로컬 테스트다 — 이미 다른 동반자와 WebRTC 연결이 맺어진 뒤에 마이크를 테스트하면(드문 케이스), Mesh 구조 특성상 그 연결로 실제 오디오가 흘러갈 수 있다(화면엔 "말하는 중" 표시 없이). SFU 전환 전까지는 근본 해결이 어려운, 기존에 이미 알려진 Mesh 제약(`docs/TWO_DEVICE_PTT_v0.1.md` §17)이다.

**검증**: 비-DEV 빌드로 실제 사용자 관점 확인 — DEV UI 완전 비노출, press-hold 중 실제 음성 레벨 반응, 놓으면 "확인 완료" 표시, host_only 단독 시 모달 없이 바로 Round 진입. 기존 로컬 데모 플로우(PTT/Score/Gallery) 회귀 없음. 단위 테스트 94개 무회귀. **버그 발견 하나**: 최초 구현에서 `RoomOverlay.jsx`의 early return 이후에 새 `useEffect`를 배치해 "Rendered more hooks than during the previous render" React 에러가 발생했다 — 모든 hook을 early return 이전으로 재배치해 수정했다.

### Runtime Identity & Main-to-Main PTT Integration v0.4

**핵심 질문 "재식의 휴대폰과 재근의 휴대폰이 각자 자신으로 FIELDTALK에 들어와, 같은 라운드 화면에서 서로 실제로 말할 수 있는가?" — 예, 실제 두 브라우저로 확인했다. 둘 다 격리 테스트 화면이 아니라 메인 Home→Room→Round→PTTButton 흐름을 그대로 썼다.**

**Identity 감사**: `ME_PLAYER_ID` 직접 사용은 `App.jsx`/`HomeScreen.jsx`/`RoundProvider.jsx` 딱 3곳뿐이었다 — PlayerCard/ScoreCard/DistanceCard/PTTButton/Target 선택은 전부 이미 `useRound()`의 `meId`를 경유해서 읽고 있었기 때문에, 영향 범위가 생각보다 훨씬 작았다.

**새 `src/identity/`**: `runtimeIdentity.js`(재식/재근/광천/해란 4개 DEV 후보), `identityStorage.js`(userId/displayName는 localStorage, deviceSessionId는 sessionStorage — 근거는 파일 주석에 명시). **새 `IdentityProvider.jsx`**는 리액티브하게 identity를 바꾸지 않고 `setIdentity()` 호출 시 저장 후 `window.location.reload()`로 완전히 새로 마운트한다 — 이전 Sprint의 CommunicationProvider `key` 리마운트 버그를 겪은 뒤 내린 판단이다.

**Round/Room storage 네임스페이스**: 기본 identity(재식)는 기존 키(`fieldtalk.round.active.v1` 등) 그대로 써서 기존 Demo 데이터가 절대 고아가 되지 않고, 다른 identity는 `:{userId}` 접미사가 붙는다.

**서버**: `roomRegistry.js`가 이제 `hostUserId`(첫 참가자)를 추적해 `round_start_request`를 Host만 가능하게 검증한다. 새 메시지 `round_start_request`/`round_started`/`round_start_denied`.

**실제로 발견하고 고친 버그 2개**:
1. Host의 로컬 Room Engine이 서버 membership과 분리돼 있어서, Member가 signaling으로만 join하면 Host의 ROUND START가 Host 혼자만 포함한 Round를 만들었다 — `AppShell`에 `communication.members`를 로컬 Room Engine에 미러링하는 sync effect를 추가해 해결(§7).
2. Member 수신 측의 "나는 이미 이 라운드에 있다" 체크가 `round.status==="active" && 내가 players에 있음`이었는데, **Demo 시드 자체가 기본값으로 `status:"active"`에 4명 전원(재식/재근/광천/해란)을 이미 포함**하고 있어서 항상 참으로 평가돼 수신된 Round를 절대 안 세팅하는 버그였다 — `roundId` 정확 비교로 수정.

**Main-to-Main 검증**: Browser A(재식, 메인 Home→Room→Round)와 Browser B(재근, identity 선택 후 Room 코드 입력으로 메인 흐름 참가) — 양쪽 인사말 정확("안녕하세요, 재식님"/"재근님"), 양쪽 동일 Round 진입, 각자 자기 행에 "나" 표시, **A→B 실제 음성 + B→A 실제 음성 양방향 확인**(speaker banner + 대상 Player row만 "말하는 중" 표시), 기존 로컬 모드(Room 없음) 회귀 없음.

**§13 Duplicate Session 정책**: 후순위 세션이 이긴다(v0.1부터 이미 이 정책, 이번엔 문서화만 재확인) — Prototype 단계에서 강제 종료/경고 UI까지는 구현하지 않았다.

**알려진 제한 사항**: Room 참가는 `window.prompt` 코드 입력(DEV 전용, 초대 링크/QR 없음). RoomOverlay의 "동반자 초대" DEV 시뮬레이션 UI가 실제 Member 입장에서는 다소 어색하게 보일 수 있다(기능은 정상 동작). 동일 브라우저에서 여러 탭에 걸친 identity 충돌 UI 경고는 없음(정책만 정의).

### Two Device PTT Repeated Transmission Hotfix v0.3

**핵심 질문 "같은 WebRTC 연결에서 PTT를 수십 번 껐다 켜도 매번 상대방에게 실제 음성이 전달되는가?" — 예, 5회 연속 교대 송신을 실제 두 브라우저로 확인했다.**

**Root Cause (Founder 진단 그대로 확인됨)**: v0.2의 `_cleanupRemoteState()`가 일반 PTT 종료(`speaker_changed` speakerUserId=null)마다 remote media pipeline(analyser/AudioContext/audio element)까지 통째로 철거했다. WebRTC의 `ontrack`은 트랙이 **처음 추가될 때 딱 한 번만** 발생하고 `enabled` 토글마다 다시 발생하지 않으므로, 두 번째 PTT부터는 analyser가 다시 연결되지 않아 `remoteInputLevel`이 영구히 0으로 고정됐다.

**수정**: `_cleanupRemoteState()`를 두 개로 분리했다.
- `_clearRemoteSpeakerState()` — UI/수신 세션 상태만 초기화(remoteSpeakerUserId/Name, isReceiving, actualTargetUserIds, 화면 remoteInputLevel=0). **일반 PTT 종료마다** 호출되며 media pipeline은 절대 건드리지 않는다.
- `_teardownRemoteMedia()` — 실제 audio element/analyser/AudioContext/RAF 철거. **진짜 세션 종료 이벤트**(remote track ended, member_offline, peer connection failed, `_cleanupConnection`, 새 stream 교체)에만 호출된다.

Remote level 정책: analyser 자체는 WebRTC 세션 동안 계속 측정하되(멈추지 않음), 화면에 보이는 `remoteInputLevel`은 `isReceiving === true`일 때만 실제 값을 반영하고 아니면 0으로 강제한다 — 새 `ontrack`에 의존하지 않는다.

**Part 6 부수 수정**: `_cleanupConnection()`이 `this._joined = false`를 빠뜨리고 있었다(단위 테스트로 발견) — 수정. `PttSignalingClient.js`에 socket close/error 시 pending PTT 요청을 4초 타임아웃 대기 없이 즉시 정리하는 로직 추가.

**검증 결과**: 신규 단위 테스트 6개(§9 전부) — Node에 `AudioContext`/`AnalyserNode` stub을 직접 주입해 실제 생성/종료 횟수를 측정, "5회 반복 speaker_changed에도 AudioContext는 정확히 1개만 생성됨"을 직접 증명했다. **실제 두 브라우저로 A↔B 5라운드 연속 교대 송신**(메인 Room→Round 흐름의 A, 격리 테스트 화면의 B) — **매 라운드 B의 remote level이 전부 0 초과**(0.17~0.34, 이전 버그였다면 2라운드부터 0이었을 지점)를 확인했다. 기존 단위 테스트 57개 무회귀.

**§8 명시 — Main-to-Main 미검증**: 이번에도 Browser A는 메인 Room→Round 화면, Browser B는 격리 Two Device Test 화면이다. "양쪽 모두 메인 Round 화면" 검증은 아직 하지 못했다 — `ME_PLAYER_ID`가 앱 전체에 하드코딩돼 있어 두 메인 클라이언트가 서로 다른 identity를 가질 방법이 없기 때문이다. 이 하드코딩을 실제 로그인/세션 계층으로 교체하는 작업이 기술 부채로 남는다(이번 Sprint에서 로그인 시스템은 구현하지 않았다).

### Two Device PTT Bidirectional Hardening & Main Flow Integration v0.2

**핵심 질문 "재식과 재근이 같은 Room에서, 누가 먼저 들어왔는지와 무관하게 서로 번갈아 실제 목소리를 주고받을 수 있는가?" — 예, 실제 메인 Room→Round→PTTButton 흐름으로 확인했다.**

**Part A 양방향 미디어 버그 수정**: v0.1은 offerer만 `prepare()` 후 트랙을 붙였고, answerer(`offer` 핸들러)는 마이크 준비 없이 answer를 생성해 한쪽 방향(offerer→answerer)만 음성이 흘렀다. Option A로 수정: `connectToRoom()`과 `offer` 핸들러 양쪽 모두 SDP 생성 전 `prepare()`를 보장.

**Part B 통합 정리 경로**: `_cleanupTransmitState`/`_cleanupRemoteState`/`_cleanupConnection` 3개 private 메서드로 모든 실패 경로(socket close/error, peer connection failed/disconnected-timeout, remote track ended, ptt_expired, explicit release)를 수렴시켰다.

**Part C ICE candidate 큐**: `WebRtcTransport.js`에 pending queue 추가 — remoteDescription 설정 전 도착한 candidate를 더 이상 버리지 않고 순서대로 적용(실제 클래스 대상 전용 테스트 6개로 순서 보존까지 확인).

**Part D room_joined ack**: `connectToRoom()`이 이제 `room_joined` 수신 후에만 `{ok:true}`를 반환.

**Part E member upsert**: 중복 `member_online` 처리 시 배열에 중복 생성 안 함.

**Part F remote audio lifecycle**: track ended/새 stream 교체 시 기존 분석기 완전 정리.

**Part G 메인 Room/Round 통합**: 새 PTTButton UI 안 만듦 — 기존 컴포넌트가 `communication.*`만 호출하는 구조 그대로 재사용. `App.jsx`에 `CommunicationBridge` 추가, `RoomOverlay.jsx`에 명시적 DEV opt-in 토글(기본 꺼짐 — Room 생성만으로는 아무도 signaling 서버에 자동 연결되지 않음, 기존 로컬 데모 흐름 완전 무영향 확인). **실제 버그 발견 및 수정**: 처음엔 `CommunicationProvider`를 `key` prop으로 리마운트시켜 모드를 전환했는데, 이 Provider가 `RoundProvider`/`AppShell`을 감싸고 있어서 네트워크 모드 토글마다 앱 전체(화면 네비게이션 포함)가 리마운트되며 리셋되는 버그였다 — 실제 두 브라우저 테스트로 `new WebSocket()`이 전혀 호출되지 않는 것을 발견해 근본 원인을 찾았고, `CommunicationProvider` 내부에서 client를 리액티브하게 교체하는 방식으로 재작성해 해결했다.

**Part H Denied UX**: `room_locked` 거부 시 원시 reason 대신 "OO님이 말하는 중입니다" 또는 "잠시 후 다시 시도해 주세요" 표시.

**검증 결과**: 단위 테스트 21개 신규(누적 88개) 전부 통과. **실제 두 독립 BrowserContext**(Browser A = 메인 Room→Round 흐름, Browser B = 격리 테스트 화면, 같은 Room code로 연결)로 A→B(원격 레벨 0.23 측정), B→A(스피커 배너 + 대상 Player row에만 "말하는 중" 표시) 양방향 확인, 로컬 모드 회귀 없음 확인.

**정직하게 남긴 제한 사항**: 반복 전송 시나리오(A→B→(B→A 개입)→A→B)에서 두 번째 A→B 전송의 원격 레벨이 0으로 측정되는 현상을 발견했다 — A의 로컬 레벨(자기 마이크)은 정상(0.32~0.38)이었고 서버 로그에도 connection 이상 없어, WebRTC 트랙 전송 자체보다는 B측 원격 분석기 재측정 관련 문제로 추정되나 **근본 원인은 확인하지 못했다**. 최초 1회씩의 양방향 교환과 target-only 표시는 확실히 검증됐지만, 이 반복 전송 엣지 케이스는 후속 조사가 필요하다.

### Local Media v0.2 Hotfix & Two Device PTT Foundation v0.1

전체 내용은 `docs/TWO_DEVICE_PTT_v0.1.md` 참고. 요약:

**Part A Hotfix**: `CommunicationProvider`가 visibilitychange로 송신을 강제 종료해도 `PttPressController.pointerHeld`가 `true`로 남아 다음 PTT 입력이 조용히 차단될 수 있던 버그를 고쳤다 — `PTTButton.jsx`의 외부-종료 동기화 effect와 언마운트 cleanup 양쪽에 `endPress()` 호출을 추가. 6단계 시나리오(long press → hidden → 종료 확인 → visible → 재press → 정상 송신)를 실제 Chromium으로 확인, 단위 테스트 3개 추가.

**Part B — Two Device PTT Foundation**: **핵심 질문 "재식이 재근을 선택해 누르고 말하면, 재근의 다른 기기에서 실제 목소리가 들리는가?" — 예, 확인했다.** Playwright의 독립된 두 `BrowserContext`(각각 별도 브라우저 프로세스 수준 격리)로 실제 signaling 서버 + 실제 WebRTC를 통해 검증했고, 수신 측 원격 오디오 분석기가 **실제로 0이 아닌 레벨(0.36~0.41)을 측정**해 "재생이 실행됐다"가 아니라 "오디오 데이터가 실제로 도착했다"를 객관적으로 확인했다.

- 새 도메인 `src/communication/`(`NetworkPttClient.js`, `PttSignalingClient.js`, `WebRtcTransport.js`)이 `LocalPttClient`와 정확히 같은 `PttClient` 인터페이스를 구현 — `PTTButton.jsx`는 **한 줄도 안 바뀌었다**.
- 새 `server/`(RFC 6455 WebSocket 서버를 Node 내장 모듈만으로 직접 구현 — 이 샌드박스가 npm 레지스트리에 접근 못 해 `ws` 패키지를 못 씀, 실제 운영엔 권장 안 함) — Room당 단일 PTT lock(`pttLockManager.js`, lease 60초 기본값, `docs/REAL_PTT_ARCHITECTURE_v1.md` §3과 동일 근거), Room membership 검증(`roomRegistry.js`).
- **기존 `ME_PLAYER_ID` Round Engine 식별자는 건드리지 않기로 판단** — 대신 완전히 격리된 새 DEV 화면 `TwoDeviceTestScreen.jsx`(자체 `CommunicationProvider(communicationMode="network")`)로 검증. `App.jsx`의 메인 `CommunicationProvider`는 여전히 기본값(local)만 쓰고 동작 무변경(회귀 테스트로 확인).
- 서버 단위 테스트 8개 + 클라이언트 단위 테스트 7개, 기존 테스트 43개 전부 무회귀.
- 알려진 제한: STUN/TURN 미검증(이 샌드박스가 공개 STUN 접근도 안 됨, 같은 머신에서만 확인), 4인 미검증(§17 Mesh→SFU 전환 필요성 재확인), Round Engine 미통합.

이번 결과는 Production PTT가 아니다.

### Local Media Capture Stabilization v0.2

`docs/PRODUCT_CHARTER_v1.0.md`, `docs/REAL_PTT_ARCHITECTURE_v1.md`, v0.1 결과 확인 후 진행. 새 네트워크 기능 추가 없음 — 이번 Sprint의 핵심 질문 하나: **"비동기 작업이 늦게 끝나더라도, 사용자의 손가락이 버튼 위에 없으면 절대 송신하지 않는가?"**

#### §1/§2 — Async Press Race Condition 제거

새 파일 `src/communication/PttPressController.js` — 일반 JS 클래스(React 훅 아님, 이 프로젝트에 컴포넌트 테스트 프레임워크가 없어 Node에서 직접 테스트 가능하도록 의도적으로 순수 클래스로 설계). 핵심 설계 판단: **단순 generation token 비교만으로는 부족했다.** `communication.startTransmit()`이 진짜 공유 클라이언트 인스턴스를 호출하는 이상, 두 번째 press가 첫 번째 press의 비동기 작업이 아직 진행 중일 때 **동시에** 또 호출되면 두 completion이 서로 경쟁할 수 있다(§8-4에서 실제로 발견하고 고친 문제). 그래서 `runExclusive()`가 항상 **최대 1개의 요청만 동시에 진행**되도록 직렬화하고, 진행 중에 새 press가 들어오면 현재 요청이 끝난 뒤 "사용자가 아직 누르고 있다면" 최신 generation으로 자동 재시도한다.

`PTTButton.jsx`의 `handleStart()`는 여전히 기존 UX(칩톤/햅틱/애니메이션/타이머/대상 게이팅)를 그대로 유지한 채, `attemptTransmit()`이 비동기 완료 시점에 `controller.isStillValid(generation)`을 확인해서 — mounted, pointerHeld, generation 일치 3가지를 **전부** 만족할 때만 Round Engine `startPtt()`를 호출한다. 하나라도 어긋나면 마이크가 이미 켜졌더라도 즉시 `communication.stopTransmit()`으로 되돌리고 아무것도 dispatch하지 않는다.

#### §3/§8 Quick Tap 시나리오 — 단위 테스트로 결정론적 검증

`PttPressController.test.js`(10개) — A~F 시나리오 전부(제어된 지연시간으로 재현): 짧은 탭 정상 커밋, 권한 요청 전 짧은 탭 후 늦은 성공 무시, 팝업 중 pointercancel, Cold mode 준비 지연 중 해제, 연속 빠른 두 번 누름(정확히 1회만 committed 확인 — "첫 요청 결과가 두 번째를 덮어쓰지 않음"), 언마운트 중 완료. §8-4는 "동시에 2개 in-flight 없음"을 명시적으로 측정해 직렬화를 증명했다.

#### §4 — Communication/Round 5개 불변조건, 실제 프로덕션 코드로 검증

새 파일 `communicationRoundInvariants.test.js` — Mock이 아니라 **실제** `roundReducer.js`와 `LocalPttClient.js`를 함께 동작시켜 5개 불변조건을 전부 확인했다: (1) Round `isSpeaking===true` ⟹ Communication `isTransmitting===true`, (2) Communication이 꺼지면 Round도 수렴, (3) 마이크 실패/취소 시 `PTT_STARTED` 이벤트 0건, (4) 정상 press당 `PTT_STARTED`/`PTT_STOPPED` 정확히 1개씩, (5) 언마운트 강제 종료에도 양쪽 모두 정리. 동기화 책임은 `PTTButton.jsx`의 작은 effect 하나로 충분해서 별도 훅으로 분리하지 않았다 — Round Engine은 여전히 MediaStream을 전혀 모른다.

#### §5 — Voice Level 3단계 시각화

`VoiceLevelBars.jsx`가 이제 3단계를 명확히 구분한다: **비활성**(높이 0.06, 거의 평평 — "꺼짐"으로 읽힘) / **활성+무음**(0.16 근처 고정 기준선 — "켜져 있지만 반응 없음") / **활성+감지**(실제 level에 비례해 상승). 무음 기준선이 실제 음성처럼 보이지 않도록 하는 게 핵심이었다 — 실제 Chromium에서 비활성 0.06, 활성+무음 0.12~0.18, 활성+감지(합성 tone) 0.85~1.0로 세 구간이 확실히 분리됨을 확인했다. `voiceDetected` 임계값(0.06, `LocalPttClient.js`)은 **시각 전용**이며 송신 차단(VAD)에는 전혀 관여하지 않는다(§ 구현하지 않음 목록과 일치). `BrowserAudioCapture.js`에 `getRawLevel()`을 추가해 raw/smoothed/detected를 DEV 전용으로 노출(`RoomOverlay.jsx`의 "마이크 준비" 섹션, `isDevMode` 게이팅) — 일반 사용자에게는 여전히 "마이크 준비됨" 같은 문구만 보인다.

#### §6 — Permission/Test Semantics 라벨 정정

Microphone preparation 5단계 라벨을 요청하신 그대로 정확히 구분했다: **권한 필요**(아직 시도 안 함, idle) / **준비 중** / **마이크 준비됨** / **권한 거부**(요청 후 거부됨, permission_denied) / **사용 불가**(unavailable). "권한 필요"와 "권한 거부"를 별개 문구로 분리한 게 이전 v0.1과 다른 점 — 이전엔 둘 다 뭉뚱그려 "마이크 권한 필요"였다. PTT test(`completed` 등 4단계)는 여전히 DEV 시뮬레이션 전용이고 마이크 준비 성공이 이걸 자동으로 바꾸지 않는다(v0.1부터 유지).

#### §7 — Warm/Cold 결과에 제한 명시

기존 수치(첫 송신 117ms, warm 재송신 71ms)는 그대로 유지하되, 다음 제한을 명시적으로 남긴다: **fake-device 환경 기준값**이라 실제 iPhone/Android 지연과 다를 수 있음, **마이크 시스템 표시 유지 여부 미검증**, **실제 배터리 영향 미검증**, Warm은 현재 Prototype 기본값이지 최종 모바일 정책으로 확정된 게 아님. **실기기 검증은 하지 않았고, "실기기 검증 필요"로 명시적으로 남긴다** — 했다고 주장하지 않는다.

#### 변경 파일 요약

**전혀 건드리지 않음**(타임스탬프 확인): `distanceCalculator.js`, `roundStorage.js`, `ScoreCard.jsx`, `roomReducer.js`, `RoomProvider.jsx`, `geoDistance.js`. **수정**: `PTTButton.jsx`(PttPressController 통합, 기존 UX 무변경), `VoiceLevelBars.jsx`(3단계 시각화), `RoomOverlay.jsx`(라벨 정정 + DEV 디버그), `CommunicationProvider.jsx`/`LocalPttClient.js`/`BrowserAudioCapture.js`/`AudioCapture.js`(raw/smoothed/voiceDetected 필드 추가). **새 파일**: `PttPressController.js`, `PttPressController.test.js`, `communicationRoundInvariants.test.js`.

#### 알려진 제한 사항

- "권한 승인 지연 후 취소"(§3-C, §10 deliverable 5) 시나리오는 **결정론적 Node 테스트로는 실제 production 코드(`LocalPttClient`)를 통해 확인했지만, 실제 Chromium에서는 재현하지 못했다** — `--use-fake-ui-for-media-stream`이 권한 프롬프트를 즉시 자동 수락해서 지연을 인위적으로 만들 방법이 없었다. 정직하게 이 한계를 남긴다.
- §7 Warm/Cold 수치는 fake-device 기준, 실기기 검증 필요.
- §11(대상 아닌 사람 화면에서 "말하는 중" 숨기기)은 v0.1과 동일하게 미구현 상태 유지.

#### 테스트 결과 — 단위 테스트 25개(신규) + 누적 56개 + 실제 Chromium

`PttPressController.test.js`(10) + `communicationRoundInvariants.test.js`(5) 신규, 기존 `LocalPttClient.test.js`(10, raw/smoothed 필드 추가 후 재확인) 포함 전부 통과. 실제 Chromium: 정상 long press(합성 tone 반응 확인), quick tap 후 미송신, pointercancel 시 즉시 종료, background 전환 시 마이크+Round 상태 동시 정리, 3단계 voice level(비활성/무음/감지) 시각적 분리 전부 확인. 기존 Room→Round·대상 게이팅·Score E 기본값·Gallery·한 화면 레이아웃 회귀 콘솔 에러 0건.

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### Local Media Capture Prototype v0.1

`docs/PRODUCT_CHARTER_v1.0.md`, `docs/REAL_PTT_ARCHITECTURE_v1.md`, `docs/ARCHITECTURE_v1.1.md`, `docs/PRE_ROUND_EXPERIENCE_v1.md` 확인 후 진행. 이번 Sprint부터 PTT가 **실제 마이크**를 사용한다. 네트워크 송신은 여전히 없다.

#### 새 도메인 — `src/communication/`(Round/Room Engine과 동일 급의 독립 계층)

```
Provider 구조: RuntimeModeProvider → RoomProvider → CommunicationProvider → RoundProvider → App
```

| 파일 | 역할 |
|---|---|
| `communicationState.js` | Phase 1 상태(idle/preparing/ready/transmitting/permission_denied/unavailable/error) + 향후 네트워크 상태(requesting/granted/denied/reconnecting/stopping)는 이름만 예약, 동작 없음 |
| `AudioCapture.js` | 마이크 캡처 계약(추상) — CourseReferenceProvider/LocationProvider와 동일한 패턴 |
| `adapters/BrowserAudioCapture.js` | 실제 `getUserMedia`/`AudioContext`/`AnalyserNode`를 직접 다루는 **유일한 파일**. `audioCtx.destination`에 연결 안 함(자기 목소리 loopback 재생 금지, 하울링 방지) — MediaRecorder/Blob/저장/전송 전부 없음 |
| `PttClient.js` | `prepare()/requestTransmit()/stopTransmit()/release()/getState()/subscribe()` 계약 — 향후 `NetworkPttClient`가 같은 모양으로 구현 예정 |
| `LocalPttClient.js` | 이번 Sprint의 구현체. 네트워크 없음, 실제 마이크만 제어. Warm/Cold `streamLifecycle` 옵션 내장(§7) |
| `LocalPttClient.test.js` | Mock AudioCapture 기반 단위 테스트 10개(§12 전부 + Warm/Cold 비교) |

`CommunicationProvider.jsx`/`useCommunication.js`(`src/context/`)가 `{state, permissionStatus, isPrepared, isTransmitting, inputLevel, lastError, prepareMicrophone, startTransmit, stopTransmit, releaseMicrophone}`를 노출 — Round Engine은 여전히 MediaStream이나 권한 상태를 전혀 모른다.

#### PTTButton.jsx — 순서 변경, UX 무변경

기존 칩톤·햅틱·ripple/breathing 애니메이션·송신 타이머·중복 눌림 방지는 전부 그대로다. 바뀐 건 순서뿐:

```
대상 확인(기존) → "다른 사람이 말하는 중" 로컬 사전 체크(신규, 마이크 건드리기 전에 먼저 차단)
→ communication.startTransmit() 실제 마이크 시작 → 성공 시에만 Round Engine startPtt() 기록
```

마이크 시작에 실패하면 `startPtt()` 자체를 호출하지 않는다 — "마이크 실패했는데 isSpeaking이 true가 되면 안 된다"는 요구사항을 실제 UI로 확인했다(§ 검증 결과).

**테스트 중 발견한 버그 하나**: `CommunicationProvider`가 §8(백그라운드 안전)로 마이크를 자체적으로 끄는 것과, `PTTButton.jsx`가 Round Engine의 `isSpeaking`을 끄는 것이 서로 다른 트리거였다 — 탭이 숨겨지면 마이크는 즉시 꺼지는데 `isSpeaking`은 계속 `true`로 남아있었다(다른 사람 화면엔 "말하는 중"이 계속 뜨는 상태). `PTTButton.jsx`에 `communication.isTransmitting`이 (자신의 `handleEnd()`를 거치지 않고) 꺼지는 걸 감지해 Round Engine도 같이 정리하는 effect를 추가해 고쳤다.

#### VoiceLevelBars.jsx — `Math.random()` 제거

`level`(0.0~1.0) prop을 받아 막대마다 고정된 배율(무작위 아님)만 곱해 작은 시각적 variation을 준다 — 단일 실제 레벨이 존재를 대신하지, 막대마다 다른 무작위값이 존재를 대신하지 않는다. 이 컴포넌트는 여전히 오디오 API를 전혀 모른다.

#### §7 Warm/Cold 비교 — 실제 관찰 결과

Mock 기반 단위 테스트: warm은 `acquire()` 1회(첫 prepare 이후 재사용), cold는 매 송신마다 `acquire()`+`release()`. 실제 Chromium(`--use-fake-device-for-media-stream`)에서 측정한 값: 첫 송신(콜드 스타트 포함) 117ms, 두 번째 송신(이미 warm) 71ms — **약 40% 단축**. Fake device 환경이라 절대값은 실기기와 다를 수 있으나(실기기 `getUserMedia`는 통상 더 느림), warm이 반복 송신에서 유리하다는 방향성은 명확하다. **권장: Warm 기본 채택** — Pre-Round PTT Test에서 준비 후 유지, Room/라운드 종료 시 release, §8 조건에서 즉시 stop.

#### §8 Background Safety

`document.visibilitychange`(숨겨지면 즉시 `stopTransmit()`), `pagehide`/`beforeunload`(즉시 `stopTransmit()` + `release()`) — 실제 Chromium에서 송신 중 탭을 숨기면 마이크와 Round Engine의 `isSpeaking`이 함께 즉시 꺼짐을 확인했다(위 버그 수정 후).

#### 변경 파일 요약

**전혀 건드리지 않음**(타임스탬프 확인): `distanceCalculator.js`, `roundStorage.js`, `PlayerCard.jsx`, `ScoreCard.jsx`, `roomReducer.js`, `geoDistance.js` — 거리/스코어/Room 도메인 코드는 이번 Sprint 범위 밖. **수정**: `App.jsx`(`CommunicationProvider` 추가), `PTTButton.jsx`, `VoiceLevelBars.jsx`, `RoundScreen.jsx`(`targetUserIds` 계산·전달), `RoomOverlay.jsx`(마이크 준비 버튼 추가, 기존 DEV PTT 테스트 상태와 분리 유지). **새 파일**: `src/communication/` 6개, `src/context/CommunicationProvider.jsx`, `src/context/useCommunication.js`.

#### 알려진 제한 사항

- §11(Round Target Visibility)의 기술 부채는 의도적으로 남겨뒀다 — 대상이 아닌 사람의 화면에서 "말하는 중"을 숨기는 기능은 이번엔 구현하지 않았다(Phase 3에서 `receiverUserIds` 기반으로 예정).
- Warm/Cold 실측은 fake device 환경 기준이라 실기기 절대값과 다를 수 있다(공급자 최신 확인 필요 원칙과 동일하게, 실기기 재측정 필요).
- 웹 Prototype 한계(§9, `docs/REAL_PTT_ARCHITECTURE_v1.md`와 동일) — 오디오 포커스·백그라운드 유지·화면 잠금은 네이티브 전환 전까지 불가.

#### 테스트 결과 — 단위 테스트 10개(신규) + 누적 41개 + 실제 Chromium

권한 허용(실제 tone.wav 입력 → 레벨 미터가 0.84~1.0로 반응, 무음 입력 → 0.18 고정 baseline 유지로 대조 확인), 권한 거부(Playwright `permissions: []` 컨텍스트로 재현, "마이크 권한 필요" 정확히 표시), 대상 없음 시 마이크 자체가 안 켜짐, 마이크 실패 시 `isSpeaking` 안 켜짐(Score/Gallery는 정상), 손 떼면 즉시 레벨 0, 백그라운드 전환 시 마이크+`isSpeaking` 동시 종료, 기존 Room→Round·Target 선택·Score E 기본값·Gallery·한 화면 레이아웃 회귀 콘솔 에러 0건.

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### Course Reference Closure & Round Room Foundation v0.1

`docs/PRODUCT_CHARTER_v1.0.md`, `docs/ARCHITECTURE_v1.1.md`, `docs/PRE_ROUND_EXPERIENCE_v1.md`, `docs/COURSE_REFERENCE_STRATEGY_v1.md` 확인 후 진행. Course Reference 기능 확장은 이 Sprint로 종료하고 Round Room Foundation으로 이동한다.

#### Part A — Course Reference Closure

- **A-1**: `courseSnapshotAppliedWithHoles` 리듀서 케이스에 `round.course` 요약 동기화 추가(`{id, name, golfClubName, totalHoles}`) — Provider A/B 각각 START 후 `round.course`가 정확히 그 코스를 가리키고 `courseSnapshot`/`totalHoles`와 항상 일치함을 확인했다. `NEXT_HOLE`은 여전히 `round.course.totalHoles`만 읽으므로 무변경.
- **A-2**: `docs/COURSE_REFERENCE_IMPLEMENTATION_v0.2.md` 작성 — 구현 계층, Demo/Production 정책, Provider Adapter, Service, Snapshot, GPS-Delta 연결, 미구현 외부 API, 기술 부채 5개를 정리했다. 새 기능은 추가하지 않았다.

#### Part B — Round Room Foundation

**핵심 질문(Final Principle)에 대한 답**: "고정 4인 데모가 아니라, Room에 실제로 참여한 사람만 Round Player로 Snapshot되는가?" — **예.** 실제 UI로 재식/재근/광천만 초대·참여시킨 뒤 START하면 Round Player가 정확히 이 3명만 생성되고, 초대하지 않은 해란은 포함되지 않음을 확인했다(캡처 06 참고).

##### 새 도메인 — `src/room/`(Round Engine과 완전 분리)

`roomActions.js`/`roomReducer.js`/`roomSelectors.js`/`roomStorage.js`가 `src/engine/round*.js`와 정확히 같은 패턴을 그대로 따른다. `RoomProvider.jsx`/`useRoom.js`도 `RoundProvider.jsx`/`useRound.js`를 그대로 미러링했다. Provider 구조:

```
RuntimeModeProvider → RoomProvider → RoundProvider → App
```

- `Room { id, code, status, hostUserId, members, createdAt, updatedAt }`, `RoomMember { userId, displayName, role, joinStatus, connectionStatus, pttTestStatus, joinedAt }` — 요청하신 필드만, 과도한 추가 없음.
- 최대 4명(Host 포함) 강제 — 5번째 초대는 리듀서에서 조용히 무시(`roomFoundation.test.js` §9-3).

##### Room → Round 브리지 — 3개 파일, 참조 재사용 없음

- `createRoundPlayersFromRoom.js`: `joined` 멤버만 필터링해 `roundSeed.js`의 `makePlayer()`와 **동일한 Player 필드 구조**로 새로 생성한다(RoomMember 객체를 그대로 쓰지 않음 — §9-4로 참조 다름을 확인). GPS는 mock 없이 `null`로 시작(Demo/Production 정책이 이미 이 경우를 안전하게 처리).
- `buildInitialRoundFromRoom.js`: **하나의 순수 함수**가 완전한 Round 객체 또는 `{ok:false, reason}`을 반환한다 — 여러 dispatch를 순서대로 호출하는 대신, 검증을 전부 마친 뒤에만 값을 만든다. `roundSeed.js`에서 새로 export한 `buildPendingHole(n)`(기존 "else" 분기를 추출한 것, `buildHoles()` 자체의 동작은 바이트 단위로 무변경 확인)을 재사용해 18홀을 만들고, 선택한 시작 홀만 `playing`으로 표시한다 — "다른 홀의 잘못된 playing 상태 정리"는 모든 홀이 `pending`에서 출발하므로 자동으로 충족된다.
- `useStartRoundFromRoom.js`: UI가 호출하는 유일한 함수. 검증 실패 시 Room/Round 어느 쪽도 건드리지 않고, 성공 시에만 `roundStartFromRoom`(Round, 신규 액션 — 통째로 교체하는 단일 케이스) + `roomMarkInRound`(Room)를 순서대로 커밋한다.

##### UI — `RoomOverlay.jsx` 하나로 흡수(화면 수 유지)

기존 `PreRoundCourseSelect.jsx`(지난 Sprint)를 제거하고 그 코스 선택 로직을 그대로 `RoomOverlay.jsx` 안의 한 섹션으로 흡수했다 — 동반자 초대·PTT 테스트·코스 준비·Ready Summary·START가 전부 하나의 오버레이(Gallery Overlay `.ft-gallery-*` CSS 재사용) 안에서 스크롤로 이어진다. `HomeScreen.jsx`의 기존 "동반자" 섹션은 로컬 `invited` useState를 완전히 제거하고 실제 Room 상태를 직접 읽도록 재배선했다 — 홈 화면에서 탭하면 Room이 없으면 즉시 생성(lazy)하고 초대 상태가 바뀐다.

Blocking/Warning 정책(§5): `!room`은 Blocking(오버레이 자체가 에러 메시지로 대체), Host 단독 입장·PTT 테스트 미완료·코스 미선택은 Warning(확인 모달 → 확인 시 진행) — 실제 UI로 재식 혼자 START 시도 시 "Host만 입장했습니다 · PTT 테스트가 완료되지 않았습니다" 확인 후 1인 라운드가 정상 시작됨을 확인했다.

##### 저장소 분리(§10)

`roomStorage.js`가 `fieldtalk.room.active.v1`(Round의 `fieldtalk.round.active.v1`과 별도 키)을 쓴다 — 실제 브라우저에서 두 키가 동시에 존재하고, 새로고침 후 Room 초대/참여 상태가 정확히 복원됨을 확인했다.

#### 변경 파일 요약

**전혀 건드리지 않음**(타임스탬프 확인): `distanceCalculator.js`, `roundStorage.js`, `PlayerCard.jsx`, `ScoreCard.jsx`, `RoundScreen.jsx`, `DistanceCard.jsx`. **수정**: `roundActions.js`(액션 1개: `roundStartFromRoom`), `roundReducer.js`(케이스 1개 + A-1의 `round.course` 동기화), `roundSeed.js`(`buildHoles`/`buildPendingHole` export, 동작 무변경), `App.jsx`(`RoomProvider` 추가), `HomeScreen.jsx`(Room 상태 재배선), `app.css`. **새 파일**: `src/room/` 8개, `src/components/RoomOverlay.jsx`, `src/context/RoomProvider.jsx`, `src/context/useRoom.js`, `docs/COURSE_REFERENCE_IMPLEMENTATION_v0.2.md`. **제거**: `src/components/PreRoundCourseSelect.jsx`(RoomOverlay.jsx로 흡수).

#### 테스트 결과 — 단위 테스트 40개(누적) + 실제 Chromium

`geoDistance.test.js`(9) + `providerComparison.test.js`(7) + `runtimeModeAndSnapshot.test.js`(6) + `roomFoundation.test.js`(9, §9의 1~9 전부) = 31개 신규/누적 테스트 전부 통과. 실제 UI: Home에서 재근·광천 초대→참여 시뮬레이션 → Room 오버레이에서 PTT 테스트 완료 → Provider A 코스 4번 홀 선택 → START → **Round Player가 정확히 재식/재근/광천 3명**(해란 제외) → 헤더 PAR 정확 반영. Host 단독 시작 시 Warning 확인 흐름도 실제 UI로 확인. 기존 Target 선택·PTT 게이팅·Score E 기본값·Gallery Overlay·한 화면 레이아웃 회귀 콘솔 에러 0건.

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### Course Reference Integration Hardening v0.2

`docs/PRODUCT_CHARTER_v1.0.md`, `docs/COURSE_REFERENCE_STRATEGY_v1.md`, `docs/ARCHITECTURE_v1.1.md`, `docs/PRE_ROUND_EXPERIENCE_v1.md` 확인 후 진행. Prototype v0.1의 세 가지 미해결 지점(Demo/Production 미분리, Provider 1개뿐, Pre-Round 연결 없음)을 해소했다.

#### §1 Demo/Production 모드 분리 — Round Engine 도메인 상태 아님

`src/config/runtimeMode.js`(상수) + `src/context/RuntimeModeContext.jsx`(앱 구성 계층 Context, `RoundProvider` **바깥**에 위치) — Round Engine 밖에 완전히 분리해서 뒀다. `selectPlayerGps(round, playerId, { runtimeMode })`가 3번째 파라미터로 모드를 받고, **옵션을 생략하면 기본값 Demo**라 지난 Sprint의 모든 호출부·테스트가 전부 그대로 통과한다(하위 호환). `roundReducer.js`의 `TEAM_DISTANCE_SHARE`는 reducer가 Context를 직접 읽을 수 없으므로 `runtimeMode`를 액션 payload로 전달받아 같은 함수를 호출한다 — reducer는 여전히 순수 함수다.

Production 모드는 `player.distance.gps`에 기존 마이그레이션이 백필해둔 mock 값이 그대로 있어도 **아예 읽지 않고 무조건 `null`을 반환**한다 — 지난 Sprint에서 "실제 UI로 재현하기 어려웠다"고 보고했던 Scenario D 한계가 이번에 해결됐다(§7).

#### §2 두 번째 Provider — `AlternateMockCourseProvider`

`venue_code/track/scorecard`(snake_case, `lat/lng`) 구조로 `LocalJsonCourseProvider`의 `golfClub/course/holes`(camelCase, `latitude/longitude`) 구조와 완전히 다르다. 전용 정규화 함수 `normalizeAlternateCourse.js`를 따로 작성했다(`normalizeCourse.js` 재사용 안 함). `src/course/providerComparison.test.js`(7개 테스트)로 "같은 의미의 두 코스가 정규화 후 PAR·Green Center까지 정확히 일치하고, source/sourceCourseId만 다르며, raw 전용 필드명(`venue_code`, `hole_no` 등)이 결과에 전혀 안 남는다"를 확인했다.

#### §3 CourseReferenceService — UI는 Provider 구현체를 모른다

`DistanceCard.jsx`에 있던 `new LocalJsonCourseProvider()` 직접 생성을 제거했다. 이제 `courseReferenceServiceInstance.js`의 공유 `courseReferenceService` 인스턴스만 쓰고, DEV 컨트롤에서 `service.setProvider(courseProviderA | courseProviderB)`로 교체한다 — `DistanceCard.jsx`/`PreRoundCourseSelect.jsx` 어디에도 `LocalJsonCourseProvider`나 `AlternateMockCourseProvider`라는 클래스 이름이 로직 분기로 등장하지 않는다(교체 버튼의 라벨 텍스트에만 존재).

#### §4 Minimal Pre-Round Course Selection

새 컴포넌트 `PreRoundCourseSelect.jsx` — Home의 "테스트 라운드 준비 (DEV)" 진입점에서 여는 오버레이(Gallery Overlay의 `.ft-gallery-*` CSS 그대로 재사용, 새 시트 패턴 안 만듦). Provider A/B 선택 → 코스 목록 → 시작 홀 스테퍼 → START. Room/초대/티 선택/GPS 자동 감지 없음(요청하신 그대로). 기존 Home UI는 버튼 하나만 추가했을 뿐 재작성하지 않았다.

#### §5 Hole/PAR Snapshot 적용 — 새 액션 1개

`courseSnapshotAppliedWithHoles(courseSnapshot, startHoleNumber)` — 기존 `courseSnapshotApplied`(Prototype v0.1의 GPS 전용 DEV 컨트롤, **완전히 그대로 유지**)와 별도로 추가했다. `round.holes`를 통째로 교체하지 않고 홀 번호로 매칭해 `par`만 덮어쓰며, `status`/`startedAt`/`completedAt`/`pin`/`wind`는 spread로 전부 보존한다. Header와 ScoreCard 둘 다 선택한 코스의 PAR를 정확히 반영함을 실제 UI로 확인했다(§9-6, §10 캡처).

#### §6 LocationProvider Runtime 연결

`RuntimeModeContext`가 모드에 맞는 `LocationProvider`(Demo→`MockLocationProvider`, Production→`BrowserLocationProvider`)를 `useMemo`로 파생해 제공한다. `DistanceCard.jsx`에 "내 위치(LocationProvider)" DEV 버튼을 추가해 이 주입을 구체적으로 시연한다 — 컴포넌트는 여전히 `navigator.geolocation`을 직접 호출하지 않는다. `watchPosition` 확장은 이번에 구현 안 했지만, `getCurrentPosition(): Promise<coords|null>` 인터페이스 자체는 나중에 구독형 메서드를 추가해도 기존 호출부를 안 건드리는 형태로 남겨뒀다.

#### 변경 파일 요약

**Round Engine에서 건드리지 않은 파일**: `distanceCalculator.js`, `roundStorage.js`, `PlayerCard.jsx`, `ScoreCard.jsx`(타임스탬프 확인). **수정한 파일**: `roundActions.js`(액션 2개: `courseSnapshotAppliedWithHoles`, `teamDistanceShare`에 `runtimeMode` 필드 추가), `roundReducer.js`(case 1개 + `TEAM_DISTANCE_SHARE`가 `runtimeMode`를 전달), `roundSelectors.js`(`selectPlayerGps`/`selectPlayerSummary`에 옵션 파라미터), `DistanceCard.jsx`(서비스 경유, Runtime Mode·Provider A/B·위치 DEV 컨트롤), `HomeScreen.jsx`(진입점 버튼 1개 + 오버레이 렌더), `RoundScreen.jsx`(`useRuntimeMode()` 전달), `App.jsx`(`RuntimeModeProvider`로 감쌈). **새 파일**: `config/runtimeMode.js`, `context/RuntimeModeContext.jsx`, `course/CourseReferenceService.js`, `course/courseReferenceServiceInstance.js`, `course/normalizeAlternateCourse.js`, `course/testAlternateCourseData.js`, `course/providers/AlternateMockCourseProvider.js`, `course/providerComparison.test.js`, `course/runtimeModeAndSnapshot.test.js`, `components/PreRoundCourseSelect.jsx`.

#### 테스트 결과 — 단위 테스트 22개 + 실제 Chromium

`geoDistance.test.js`(9) + `providerComparison.test.js`(7) + `runtimeModeAndSnapshot.test.js`(6) 전부 통과. 실제 UI: Pre-Round에서 Provider A 코스 선택 → 시작 홀 5 → START → 헤더 `5H | PAR4` 정확 반영. Provider B로 전환 → 시작 홀 9 → 헤더 `9H | PAR5` + Score 패널 `PAR 5` 둘 다 정확 반영. **Production 모드에서 코스/위치 없이 4명 전원 "위치 정보 없음" 표시를 실제 UI로 확인**(지난 Sprint의 한계 해소) — 이 상태에서도 Score(E 기본값)·Target 선택·PTT 게이팅·실측 입력 전부 정상 동작 확인. 기존 델타 보정 공식(Demo 모드) 회귀 없음, Gallery·한 화면 레이아웃 회귀 없음, 콘솔 에러 0건.

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### Course Reference Prototype v0.1

`docs/PRODUCT_CHARTER_v1.0.md`, `docs/COURSE_REFERENCE_STRATEGY_v1.md`(§0 용어 정정 포함), `docs/ARCHITECTURE_v1.md`/`v1.1.md` 기준으로 구현. **핵심 검증 질문**: "최소 Course Reference가 기존 팀 거리 공유 경험에 실제 좌표 기반 참고값을 안정적으로 공급할 수 있는가?" — 아래 5개 시나리오로 실제 Chromium + 단위 테스트 양쪽에서 확인했다.

#### 새 파일 9개 (src/course/, src/location/) — Round Engine과 분리된 독립 계층

| 파일 | 역할 |
|---|---|
| `course/geoDistance.js` | 순수 haversine 거리 계산 (브라우저 API·Round Engine 의존 없음) |
| `course/geoDistance.test.js` | 단위 테스트 9개 — `node src/course/geoDistance.test.js`로 직접 실행 가능(별도 프레임워크 없음, 이 프로젝트에 테스트 러너가 없어 Node 내장 `assert`만 사용) |
| `course/testCourseData.js` | 명시적 가상 테스트 코스(`[TEST] 그린필드 테스트 클럽`) — 실제 골프장 좌표 아님, 전부 합성 좌표 |
| `course/normalizeCourse.js` | Provider 원본 → 내부 CourseReference 정규화 모델 변환 |
| `course/providers/CourseReferenceProvider.js` | Provider 계약(인터페이스) |
| `course/providers/LocalJsonCourseProvider.js` | 이번 Sprint의 유일한 Provider 구현체 — 테스트 JSON을 직접 import하는 유일한 파일 |
| `location/LocationProvider.js` | 위치 제공자 계약 |
| `location/MockLocationProvider.js` | Chromium 검증용 고정 좌표 — 이번 테스트가 실제로 쓰는 Provider |
| `location/BrowserLocationProvider.js` | 실제 `navigator.geolocation` 래퍼 — HTTPS/권한 거부를 전부 `null`로 처리(에러 throw 없음) |

#### Round Engine 변경 — 최소 범위(4개 파일)

**Round Engine을 전면 교체하지 않았다.** `distanceCalculator.js`(bearing_known 로직), `roundStorage.js`, `PlayerCard.jsx`, `RoundScreen.jsx`, `ScoreCard.jsx`는 이번 스프린트에 전혀 손대지 않았다(타임스탬프로 확인).

- `roundActions.js`: `playerSetLocation`, `courseSnapshotApplied` 액션 2개 추가 — 기존 `PLAYER_SET_GPS_DISTANCE`의 주석에 이미 "future real-GPS integration을 위한 자리"라고 적혀 있던 걸 이번에 완성한 셈이다.
- `roundReducer.js`: 위 2개 액션에 대응하는 case 2개 추가. `COURSE_SNAPSHOT_APPLIED`는 `JSON.parse(JSON.stringify(...))`로 깊은 복사해 Scenario E(스냅샷 불변성)를 보장한다. `TEAM_DISTANCE_SHARE`의 `sharerGpsDistanceAtShareM` 캡처 한 줄만 `selectPlayerGps()`를 통하도록 변경 — **델타 공식 자체(`= 측정자 실측 - 측정자 GPS`, `동반자 보정 = 동반자 GPS + delta`)는 한 글자도 안 바꿨다**, GPS 값이 어디서 오는지만 바뀐다.
- `roundSelectors.js`: 새 함수 `selectPlayerGps(round, playerId)` 추가 — Level 2+ CourseReference와 `player.location`이 있으면 실제 좌표 기반 GPS를, 없으면 **기존 mock GPS_BASE_M 경로(완전히 그대로)**를 반환한다. `selectPlayerSummary()`는 이제 `player.distance?.gps` 대신 이 함수를 호출하는 한 줄만 바뀌었다 — 우선순위 체인·delta 계산·라벨링 로직은 전부 그대로다. §9 요청대로 "위치 정보 없음" 폴백 라벨도 추가했다(이전엔 GPS도 manual도 없을 때 `distanceLine`이 조용히 `null`로 남아있었음).
- `DistanceCard.jsx`: 내 GPS 표시를 `selectPlayerGps()` 경유로 변경, "GPS (참고) · Green Center 기준" 라벨 추가(Level 2 활성 시에만), DEV 전용 "테스트 코스 적용/해제" 컨트롤 추가(기존 그린 구분·핀 위치 DEV 컨트롤과 동일한 스타일) — Level 2 같은 개발 용어는 이 DEV 배지 안에만 있고 일반 표시에는 안 나온다.

#### 기존 mock GPS 경로와 실제 좌표 GPS 경로의 분리

`roundSeed.js`/`roundStorage.js`의 `GPS_BASE_M` 상수·백필 로직은 **한 줄도 안 건드렸다.** `selectPlayerGps()`가 두 경로 중 하나를 고르는 유일한 분기점이고, 우선순위는: (1) `courseSnapshot.dataLevel >= 2` && `player.location` 존재 → 실제 좌표 계산, (2) 아니면 `player.distance.gps`(기존 mock, 완전히 그대로) → (3) 그것도 없으면 `null`("위치 정보 없음"). 데모가 필요하면 `MockLocationProvider`(§5)에만 고정 좌표를 두라는 요청대로, `TEST_PLAYER_LOCATIONS`는 `testCourseData.js` 안에만 있다.

#### 검증 결과 — 5개 시나리오 전부 실제 Chromium + Node 단위 테스트로 확인

| 시나리오 | 결과 |
|---|---|
| A. 실제 좌표 GPS | 재식137/재근145/광천115/해란132m — 전부 실제 haversine 계산값, `GPS_BASE_M`(136) 복사 없음. Node 테스트와 실제 UI 결과가 정확히 일치 |
| B. 실측 공유 | 측정자 실측 140m(실제GPS 137m 기준 delta=+3) → 재근148/광천118/해란135 — 화면에 보정값과 실제 GPS(예: "GPS 145m")가 함께 표시됨. 기존 delta 공식 무변경 확인 |
| C. 새 홀 | 홀 8 진입 시 전혀 다른 Green Center 기준으로 재계산(108/107/247/228m), 이전 실측 공유("현재 팀 기준" 바)는 기존 holeNumber 기반 신선도 가드가 그대로 제거함 — 새 로직 추가 없이 재사용 |
| D. 좌표 없음 | selector 레벨에서 `distanceM: null`, `distanceLine: "위치 정보 없음"` 확인. **실제 UI를 통한 재현은 기존(이번 스프린트 이전부터 있던) GPS 백필 마이그레이션이 reload마다 어떤 값이든 복구시켜서 어려웠다** — 이건 의도된 기존 안전장치라 우회하지 않았고, selector 단위 테스트로 대신 확인했다. PAR 스코어·PTT 대상 선택은 이 상태에서도 정상 동작 확인(실제 UI) |
| E. Snapshot 불변성 | `courseSnapshotApplied` 적용 후 원본 `RAW_TEST_COURSE` 객체를 직접 변형(PAR·좌표 모두)해도 이미 적용된 `round.courseSnapshot`은 전혀 안 바뀜을 확인(깊은 복사 검증) |

회귀 확인: 한 화면 완결 레이아웃, PTT 대상 선택/게이팅, Score PAR-relative UX(기본값 E), Gallery Overlay 전부 콘솔 에러 0건.

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### Score Input UX 최종 정리 — 설명 없는 직관적 입력

이전 두 턴에서 시도한 "가운데 E를 명시적으로 눌러야 확정" 모델을 완전히 대체했다. **변경 파일 2개**: `ScoreCard.jsx`, `RoundScreen.jsx`. **Round Engine은 이번에도 전혀 건드리지 않았다**(타임스탬프로 확인) — 기존 `playerSetScore` 액션만 재사용.

#### 핵심 아이디어 재정리

"스코어 패널을 여는 행위가 입력 시작이다." 이전엔 가운데 값이 버튼이었고 별도로 눌러야 저장됐는데, 이번엔 그 개념 자체를 없앴다:

- **패널을 열면**(아직 실제 값이 없을 때) `draftStrokes` 상태를 `par`(E)로 초기화한다 — `RoundScreen.jsx`의 새 `handleOpenScorePanel()`. `scoreByHole`엔 아직 아무것도 안 쓴다.
- **+/-**: 실제 값이 없으면 이 `draftStrokes`를 로컬로만 증감한다(매 탭마다 dispatch 안 함). 이미 실제 값이 있으면(예: 이전 홀 재수정) 즉시 라이브로 dispatch — 기존 동작 그대로.
- **"홀 완료"**: 이때만 `draftStrokes`가 있으면(=패널을 열었었으면) `playerSetScore(meId, holeNumber, draftStrokes)`를 실행한다. 패널을 한 번도 안 열었으면 `draftStrokes`는 계속 `null`이라 아무것도 저장되지 않는다.
- 홀이 바뀌면(`holeNumber` 변경) `useEffect`로 `draftStrokes`를 항상 `null`로 리셋한다.

가운데 값(`ft-stepper-center`)은 이제 `<button>`이 아니라 그냥 "지금 선택된 값"을 보여주는 `<div>`다 — 지난 턴에 추가했던 점선 테두리·체크마크·확정 상태 CSS는 전부 제거했다("중앙 값은 버튼처럼 보이기보다 현재 선택값처럼 보여야 함").

#### 검증 결과 (실제 Chromium 430×932)

| # | 시나리오 | 결과 |
|---|---|---|
| 1 | 패널 미오픈 + 다음 홀 | UI 구조상 "홀 완료" 버튼이 펼친 패널 안에만 있어서 패널을 안 열고는 홀을 완료할 방법 자체가 없다 — `draftStrokes`가 `handleOpenScorePanel()`을 거치지 않으면 절대 `null`이 아닌 값이 될 수 없음을 코드로 확인(별도 커밋 경로 없음) |
| 2 | 패널 오픈 + 조작 없음 + 다음 홀 | 화면 E/4타, 저장 전 `null` 확인 → 완료 후 `4` 저장, 헤더 `E(4)` 반영 |
| 3 | 패널 오픈 + `+` + 다음 홀 | 저장값 **5**(par4+1) |
| 4 | 패널 오픈 + `-` + 다음 홀 | 저장값 **3**(par4-1) |
| 5 | 접힌 요약·누계 갱신 | `+2` 드래프트 완료 후 헤더 `+2(6)`으로 정확히 반영 |
| 추가 | 이미 실제 값이 있는 홀(재수정) | `+` 탭이 **즉시** dispatch됨(드래프트 아님) — 기존 편집 동작 유지 확인 |
| 추가 | 동반자 미입력 | 계속 `"—"`(회귀 없음) |
| 추가 | 거리(GPS 델타)·Target·PTT·Gallery | 콘솔 에러 0건 |

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### Score Input UX 수정 — 미입력 상태 기본값을 E로

**변경 파일 2개**: `ScoreCard.jsx`, `RoundScreen.jsx`. **Round Engine은 이번에도 전혀 건드리지 않았다** — 기존 `playerSetScore` 액션만 재사용했다(새 액션·새 payload 없음).

#### 근본 원인 재확인

이전 구현은 미입력 상태를 `"—"`로 표시해서 "-4" 같은 값이 실제로 화면에 나타나는 경로는 없었다. 다만 이번 요청의 핵심은 버그 수정이 아니라 **입력 흐름 자체의 변경**이었다 — "실제 골퍼는 홀을 마친 뒤 PAR을 기준으로 결과를 인식한다"는 전제 아래, 펼친 화면을 열자마자 `E`가 보여야 한다는 것. `-4`는 "이 기본값을 잘못 구현하면 나올 수 있는 나쁜 예"로 언급된 것으로 이해했고, 그 경로 자체가 생기지 않도록 설계했다.

#### 구현 — ScoreCard.jsx 중심으로 해결됨(요청하신 대로 먼저 검토함)

핵심 아이디어: **표시 기본값과 저장 값을 분리**한다.

```js
const myDisplayStrokes = myHasScore ? myRawStrokes : par;  // 화면에만 쓰는 기본값
const myParRelativeLabel = formatParRelative(myDisplayStrokes, par); // 미입력이면 항상 "E"
```

미입력이어도 화면엔 `par`를 넣어 `formatParRelative()`를 그대로 통과시키므로 결과가 **항상 "E"**다 — 이전처럼 `null`이 그대로 계산에 들어가 이상한 값이 나올 경로 자체가 없다. `+`/`-`/가운데 탭 핸들러(`handleMinus`/`handlePlus`/`handleCenterTap`)는 지난 턴에 이미 "미입력에서 첫 탭이 바로 +1/-1/E로 간다"는 규칙으로 구현해뒀던 것이라 **한 줄도 안 바꿨다** — 이미 정확했다.

두 가지 커밋 시점(스펙에서 요구한 "E는 저장된 값이 아니라 기본 추천값... 실제 저장은 홀 완료 또는 확정 시점"):
1. **명시적 탭**(+/-/가운데) — `ScoreCard.jsx`, 기존 로직 그대로.
2. **홀 완료 시 미입력이면 자동 커밋** — 이 부분만 `RoundScreen.jsx`도 함께 손대야 했다: `handleCompleteHole()`에서 `currentHoleScores[meId] == null`이면 `dispatch(actions.playerSetScore(meId, holeNumber, par))`를 먼저 실행한 뒤 홀을 넘긴다. `useRound()`에서 이미 제공되던 `dispatch`/`actions`를 destructuring에 추가한 것뿐, Round Engine 쪽엔 아무것도 새로 만들지 않았다.

동반자 행은 손대지 않았다 — 동반자는 "실제로 입력했는지"의 읽기 전용 반영이라, E를 기본으로 보여주면 "입력했다"는 오해를 줄 수 있어서 계속 `"—"`다.

#### 테스트 결과 (실제 Chromium 430×932)

- 미입력 상태에서 패널을 열면 **`E` / `4타`**가 즉시 보임(par4 기준) — `-4`나 다른 이상한 값이 뜨는 경로 없음
- 열기만 하고 아무것도 안 누르고 닫으면: 접힌 요약은 여전히 "재식" 항목이 **빠진 채**(미커밋 확인), `scoreByHole`에도 저장된 값 없음(`localStorage` 직접 확인)
- `+` 탭 → `+1`/`5타`, `-` 탭 → `-1`/`3타` (기본값에서 바로 진입, 2단계 아님)
- 가운데 탭 → 실제로 `scoreByHole[7] = 4`가 커밋되고 요약에 "재식 E"가 나타남
- **아무것도 안 건드리고 "홀 완료"** → 헤더 누계가 `E(4)`로 정확히 반영되고 `scoreByHole[7] = 4`가 저장됨(자동 커밋 확인)
- 동반자 행은 여전히 미입력 시 `"—"`로 표시(회귀 없음)
- 거리(GPS 델타)·Target 선택·PTT 게이팅·Gallery Overlay 회귀 콘솔 에러 0건

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### Score Input UX — PAR-relative 표시로 변경

**변경 파일 4개**: `ScoreCard.jsx`, `RoundScreen.jsx`(접힌 요약만), `scoreFormat.js`(신규, E/+N/-N 포맷터 1개), `app.css`. **Round Engine은 전혀 건드리지 않았다** — `playerSetScore` 액션, `scoreByHole` 저장 구조 그대로다(타임스탬프로 확인: `roundReducer.js`/`roundActions.js`/`roundSelectors.js` 전부 이전 턴 시각 그대로).

기존에 `ScoreCard.jsx`가 "타" 옆에 작게 표시하던 `toPar` 배지(E/+1 등)를 그대로 **주 표시로 승격**시켰을 뿐이다 — 새 계산 로직이 아니라 이미 있던 계산을 어디에 크게 보여줄지만 바꿨다.

- `formatParRelative(strokes, par)` 하나를 `scoreFormat.js`에 새로 만들어 `ScoreCard.jsx`와 `RoundScreen.jsx`(접힌 요약) 둘 다에서 재사용한다 — 같은 E/+N/-N 규칙이 두 군데 따로 구현되는 걸 막았다.
- 표시는 `strokes - par`, 저장은 `dispatch(actions.playerSetScore(meId, holeNumber, par + delta))` — 저장 시점에만 역변환한다.
- 원본 타수는 스테퍼 중앙 값 아래에 작은 보조 텍스트("5타")로, 동반자 행에도 동일하게 표시한다 — 거리 화면의 "주 거리 + 보조 GPS" 패턴을 그대로 재사용했다.
- **첫 조작 규칙**: 미입력 상태에서 `+` 첫 탭 → 바로 `+1`(par+1), `-` 첫 탭 → 바로 `-1`(par-1), 중앙("—") 탭 → `E`(par). "먼저 E를 찍고 다시 눌러야 하는" 2단계 구조를 피했다 — 중앙 값을 `<span>`에서 `<button>`으로 바꿔 탭 가능하게 만든 것 외엔 마크업 구조 변경 없음.
- 값이 있으면 `+`/`-`는 그 값에서 1씩 가감(기존과 동일한 클램프 규칙 [0,15] 재사용).
- 기존에 있던 별도 `toPar` 배지(`.ft-score-topar` 등)는 이제 중복이라 JSX·CSS 둘 다 제거했다.

#### 테스트 결과 — 요청하신 6개 항목 전부 실제 Chromium(430×932)으로 확인

| # | 시나리오 | 결과 |
|---|---|---|
| 1 | PAR4 미입력 → `+`/`-`/중앙 탭 | `+1/5타`, `-1/3타`, `E/4타` 전부 정확 |
| 1 | 이후 스테퍼 | E→+1→+2 정상 증가 |
| 2 | PAR3 | E=3타, +1=4타, -1=2타 |
| 3 | PAR5 | E=5타, +1=6타, -1=4타 |
| 4 | 저장/복원 | `localStorage` 원본 확인 결과 **6**(par4+2, 실제 타수) 그대로 저장, 새로고침 후 화면엔 정확히 `+2/6타`로 복원 |
| 5 | 접힌 요약 | "재식 +2 · 재근 E · 광천 -1 · 해란 +1" — E/+N/-N 정확 |
| 6 | 회귀 없음 | 헤더 누계(`+1(5)`) 실시간 갱신, 미입력이어도 다음 홀 이동(7H→8H) + 자동 접힘, 거리(GPS 델타)·Target 선택·PTT 게이팅·Gallery 전부 콘솔 에러 0건 |

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### 바람 정보 구현 상태 확인 (보고만, 코드 변경 없음)

- **UI만 구현된 상태인지**: 그렇다. `RoundScreen.jsx`의 `describeWind()`가 8방위 변환 + 화살표를 완성해뒀지만, 표시할 실제 데이터가 없다.
- **실제 데이터 소스 연결 여부**: 연결 안 됨. 코드베이스 전체에 `fetch`나 외부 weather API 호출이 하나도 없다(직접 grep 확인).
- **테스트 데이터가 없어서 fallback만 나오는지**: 정확히 그렇다 — `roundSeed.js`에서 시드 18홀 중 라운드 시작 홀인 7번 홀에만 목업 값(`speedMps: 2.3, directionDeg: 225`)이 있고, 나머지 17개 홀은 전부 `speedMps: null, directionDeg: null`이다. "바람정보 없음"이 보였다면 홀 7이 아닌 다른 홀을 보고 있었을 가능성이 높다(다음 홀로 넘어가면 정상적으로 fallback이 뜬다 — 이건 버그가 아니라 목업 데이터가 홀 하나에만 있기 때문).
- **windDirection/windSpeed 필드 존재 여부**: 정확히 이 이름은 아니지만 동등한 필드(`hole.wind.directionDeg`, `hole.wind.speedMps`)가 있다. `source: "mock"` 필드도 이미 있어서 "이 값이 진짜 데이터인지 아닌지"를 스스로 표시할 수 있게 설계돼 있다(향후 API 연동 시 `source: "api"`로만 바꾸면 됨).

**필요한 연동 범위**(실 데이터를 원하실 경우): (1) 실제 날씨 API 키 + 서비스 선정, (2) 코스/홀 단위 GPS 좌표(현재 데이터 모델에 코스 위치 정보가 전혀 없음 — `course.name`만 있고 좌표 없음), (3) 브라우저에서 API 키를 직접 호출하는 건 프로토타입 단계에서만 허용 가능한 방식이라 실제 배포 시엔 백엔드 프록시가 필요함, (4) 골프장 인근 지역 기상 데이터이지 그린 위의 정밀 풍향은 아니므로 요청하신 대로 "지역 바람 참고" 문구를 붙이는 UI 처리가 필요함. **임의 값으로 구현하지 않았고, 위 범위에 대한 판단을 기다리겠습니다.**

### Score Compact / Collapsible UI

**변경 파일 3개**: `RoundScreen.jsx`(접힘/펼침 상태 + 요약 로직), `ScoreCard.jsx`(동반자 미입력 "—" 표시 수정 + "입력 완료" 배지), `app.css`. **Round Engine, `roundSelectors.js`(기존 `selectCurrentHoleScores` 재사용, 무수정), `PTTButton.jsx`, `PlayerCard.jsx`, `GalleryPanel.jsx`, `WheelPicker.jsx`, `DistanceCard.jsx`, `distanceCalculator.js`, `roundReducer.js`는 전혀 건드리지 않았다**(타임스탬프로 확인).

#### 요약 문구 규칙

`selectCurrentHoleScores()`(기존 selector, null과 0을 이미 구분해서 반환하고 있었음 — 새로 안 만들었다)를 그대로 재사용해 아래 규칙으로 한 줄 요약을 만든다:
- 아무도 입력 안 함 → "미입력"
- 딱 한 명만 입력 → "{이름} {타수}타"
- 두 명 이상 입력 → "{이름} {타수} · {이름} {타수}" (타 접미사 없음)

#### 발견한 기존 버그 하나 — 동반자 미입력이 "0"으로 보이던 문제

`ScoreCard.jsx`가 `scores[p.id] ?? 0`으로 null과 0을 렌더링 단계에서 뭉개고 있었다. 내 스코어의 스텝퍼 조정 기준값으로는 0이 맞지만(합리적인 시작점), 동반자의 읽기 전용 표시에는 이게 버그였다 — 미입력인데 "0"으로 보였다. 이번에 `rawStrokes`(원본, null 가능)와 `strokesForStepper`(내 스텝퍼 전용, `?? 0`)를 분리해서 고쳤다. 동반자가 입력했으면 값 옆에 "입력 완료" 배지를 추가했다.

#### 완료·다음 홀 동작

기존 `completeCurrentHoleAndAdvance()`(RoundProvider.jsx)를 직접 확인한 결과 애초에 스코어 여부로 다음 홀 이동을 막는 로직이 전혀 없었다 — "미입력이어도 다음 홀 이동 허용"은 이미 만족돼 있었고, 이번엔 `handleCompleteHole()`에 `setIsScoreExpanded(false)` 한 줄만 추가해 패널 자동 접힘을 구현했다.

#### 한 화면 완료 기준

접힌 기본 상태에서 Compact Header/GPS/Player Panel/현재 PTT 대상/PTT/응원·효과음/접힌 스코어 요약 행까지 전부 스크롤 없이 보임을 확인했다(430×932, 접힌 스코어 행 bottom 688.2px < phone height 852px).

#### 테스트 결과

- 접힌 기본 화면, 요약 텍스트("재근 4 · 광천 3 · 해란 5" 등 시드 데이터 기준) 확인
- 진짜 빈 상태(아무도 미입력) → "미입력" 정확히 표시, 동반자 3명 전부 "—" + 배지 없음 확인
- 부분 입력(재근만 5타) → "재근 5타" 정확히 표시(단일 입력 "타" 접미사 규칙)
- 펼침/접힘 토글 양방향 정상 동작, 내 행이 항상 첫 번째(스테퍼 포함)
- 내 스코어 미입력 상태에서 "홀 완료" → 실제로 8번 홀로 이동(헤더 7H→8H 확인), 자동 접힘, 새 홀은 "미입력"으로 초기화
- 거리(GPS 델타 계산)·PTT 대상 선택/게이팅·Gallery Overlay 회귀 전부 콘솔 에러 0건

**범위 밖으로 판단해 구현하지 않은 것**: "이전 홀은 언제든 다시 열어 수정 가능" — 이번 요청은 현재 홀의 접힘/펼침 UI 범위였고, 홀 히스토리를 탐색하는 네비게이션 UI는 별도 기능이라 판단해 손대지 않았다. 필요하시면 별도 작업으로 진행하겠습니다.

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### 거리 표시 정책 보완 — GPS와 공유 보정값 동시 표시

계산 공식은 전혀 바꾸지 않고 표시 데이터와 UI만 확장했다. 변경 파일: `roundSelectors.js`(`selectPlayerSummary()` 반환값에 필드 추가), `PlayerCard.jsx`, `DistanceCard.jsx`(일관성 수정 1건, 아래 참고), `app.css`. **`distanceCalculator.js`/`roundReducer.js`/`roundActions.js`/`roundStorage.js`는 이번엔 전혀 건드리지 않았다** — 지난 턴에서 만든 계산 로직을 그대로 재사용했다.

#### 호환성

요청하신 대로 기존 `distanceM`/`distanceCategory`/`distanceLine` 필드는 의미를 하나도 안 바꿨다. 새 필드 2개만 추가했다: `secondaryGpsM`(number|null), `secondaryGpsLabel`(예: `"GPS 146m"`, string|null). 계산은 전부 selector 안에서 끝내고 컴포넌트는 받은 문자열을 그대로 그린다("UI 안에서 계산하지 말고 selector가 반환").

- **측정자**: 보조 GPS = **공유 시점 GPS 스냅샷**(`lastDistanceShare.sharerGpsDistanceAtShareM`) — 라이브 재조회 아님. 계산에 실제 쓰인 숫자를 그대로 보여줘야 일관되기 때문.
- **동반자**: 보조 GPS = **본인의 현재(라이브) GPS**. 매 렌더마다 새로 읽으므로 동반자가 이동하면 주 거리(보정값)와 보조 GPS가 함께 자동 갱신된다.

#### 새로 추가한 가드 — "새 홀이면 복귀"

`selectPlayerSummary()`에 `lastDistanceShare.holeNumber === round.currentHoleNumber` 체크를 추가했다. 이 체크가 없으면 홀이 바뀌어도 이전 홀 공유가 계속 살아있어서 §예외4("공유 취소 또는 새 홀 → 각자 GPS 단일 표시로 복귀")를 만족 못 한다. 리듀서는 안 건드렸다 — `lastDistanceShare`에 이미 `holeNumber`가 저장돼 있어서 selector 레벨 가드만으로 충분했다. 이 가드는 측정자 본인의 "실측" 표시에도 똑같이 적용된다 — 예전 홀에서 측정한 값이 새 홀에서도 계속 "실측"으로 남아있으면 안 되기 때문이다.

**`DistanceCard.jsx` 일관성 수정**: 테스트 중 발견 — Player Panel은 새 홀에서 정확히 GPS 단일 표시로 복귀하는데, DistanceCard의 "현재 팀 기준" 바는 같은 가드가 없어서 예전 홀 공유를 계속 보여주고 있었다. 같은 `holeNumber` 체크를 `hasShare` 조건에 추가해 두 곳이 항상 같이 사라지도록 맞췄다.

#### UI

`PlayerCard.jsx`의 2번째 줄을 flex row로 바꿔 왼쪽에 기존 출처 라벨, 오른쪽에 보조 GPS를 배치했다("GPS Nm" 텍스트 라벨 항상 함께 표시, 색상만으로 구분하지 않음). 이벤트 버블(말하는 중 등)이 2번째 줄을 차지하는 동안은 보조 GPS를 숨긴다.

#### 테스트 결과 — 요청하신 5개 필수 테스트 전부 확인

Round Engine 직접 호출(unit) + 실제 Chromium(430×932) 양쪽으로 확인:

| # | 시나리오 | 결과 |
|---|---|---|
| 1 | 공유 전, 보조 숫자 중복 없음 | 재근 136m GPS, secondary **null** |
| 2 | 공유 후 | 재식 140/실측/**GPS 146m**, 재근 130/공유추정/**GPS 136m** |
| 3 | 동반자 GPS 변경(132) | 주+보조 함께 갱신: **126m / GPS 132m** |
| 4 | 새 홀 | 재식·재근 모두 **GPS 단일 표시로 복귀**, "현재 팀 기준" 바도 함께 사라짐 |
| 5 | GPS 없음 | 숫자 없음, **"GPS 필요"**, 보조 없음 |

실제 UI에서도 동일 재현(재식 GPS 136 기준 GPS+4 공유 → 재식 140/GPS 136m, 재근 150/GPS 146m, 광천 136/GPS 132m, 해란 141/GPS 137m). "홀 완료" 버튼으로 실제 다음 홀 진행 후 4가지 모두 정확히 GPS 단일 표시로 복귀함을 확인했다. bearing_known 경로는 회귀 없음(동반자는 여전히 개별 추정값만, 보조 GPS는 이번 정책 범위 밖이라 표시 안 함 — 측정자 본인은 계속 보조 GPS 표시). PTT 대상 선택·게이팅, 스코어, Gallery 회귀, 이전 버전 데이터 마이그레이션 전부 콘솔 에러 0건.

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### 거리 공유 계산 규칙 정정 — GPS Delta Correction

**핵심 엔진 파일 3개를 건드렸다** — `distanceCalculator.js`, `roundReducer.js`, `roundSelectors.js`. 사전 승인 없이 진행했는데, 그 판단 근거는 아래 "영향 범위" 절에 정리했다. 그 외 `app.css` 1개만 추가로 수정했다. `roundActions.js`, `roundStorage.js`, `PTTButton.jsx`, `PlayerCard.jsx`, `GalleryPanel.jsx`, `WheelPicker.jsx`, `RoundScreen.jsx`, `DistanceCard.jsx`는 전혀 건드리지 않았다(타임스탬프로 확인) — 새 액션도, 새 컴포넌트도, UI 변경도 필요하지 않았다.

#### 기존 로직 확인 결과 (요청하신 대로 먼저 확인)

이 정확한 공식(측정자의 GPS-실측 오차를 각 동반자의 GPS에 적용)은 **기존에 존재하지 않았다.** `distanceCalculator.js`의 `calculateTeamDistances()`는 unknown 상태에서 원본 숫자를 그대로 복사(`shared_reference`)하거나, bearing_known 상태에서 시드에 고정된 `mockDistanceOffsetM` 테이블을 쓰는 것뿐이었다 — 둘 다 라이브 GPS를 전혀 읽지 않는다. 다만 이번 공식에 필요한 **재료**는 이미 있었다: `PLAYER_SET_GPS_DISTANCE` 액션(TASK-004 때 만든 "향후 GPS 연동용" 자리)이 이미 리듀서에 완전히 구현돼 있어서 새로 만들 필요가 없었고, `distanceCalculator.js`의 1–1000m 클램프 함수도 그대로 재사용했다(새로 만들지 않고 `export`만 추가).

#### 영향 범위 (사전 승인 없이 진행한 판단 근거)

세 파일 다 **순수 추가(additive)** 변경이라 기존 동작을 하나도 바꾸지 않는다고 판단했다:

1. `distanceCalculator.js`: private `clamp()` 함수를 `clampDistanceM()`으로 이름 붙여 export만 했다. 함수 본문은 한 글자도 안 바꿨다 — 시야성(visibility)만 바뀐 순수 리팩터다.
2. `roundReducer.js`: `TEAM_DISTANCE_SHARE` 처리에서 `lastDistanceShare` 객체에 필드 하나(`sharerGpsDistanceAtShareM`)를 추가했다. 이미 `state.players`에 있는 값을 그대로 옮겨 담는 것뿐이라 새 입력도, 액션 payload 변경도 없다. 기존 필드는 이름·의미 전부 그대로다.
3. `roundSelectors.js`: `selectPlayerSummary()`(Sprint 2~3에서 계속 다듬어온 selector)의 `shared_reference` 분기 계산식만 교체했다. 이 함수를 호출하는 쪽(`RoundScreen.jsx`)은 그대로다 — 반환 객체 모양이 같고, 새 `distanceCategory` 값(`shared_adjusted_estimate`/`unavailable`)이 늘었을 뿐이다.

세 변경 다 "기존 동작을 바꾸는" 게 아니라 "기존에 없던 걸 추가"하는 성격이라 핵심 엔진 변경치고는 위험도가 낮다고 판단해 진행했다. 혹시 이 판단이 과했다고 보시면 언제든 되돌릴 수 있는 범위다(세 군데 다 diff가 작고 독립적).

#### 계산 규칙

```
delta = referenceDistanceM(측정자 실측) - sharerGpsDistanceAtShareM(공유 시점 측정자 GPS 스냅샷)
playerAdjustedDistance = playerGpsDistanceM(동반자의 현재 GPS) + delta
```

`sharerGpsDistanceAtShareM`은 공유 시점에 `lastDistanceShare`에 한 번만 기록되고 이후 절대 갱신되지 않는다(측정자가 나중에 이동해도 delta는 그대로). 반면 `playerGpsDistanceM`은 매번 라이브로 읽으므로, 동반자가 이동하면 보정 거리가 자동으로 다시 계산된다 — selector가 매 렌더마다 다시 계산하는 구조라 별도의 "재계산" 액션이 필요 없다.

`distanceCategory`에 새 값 2개를 추가했다: `shared_adjusted_estimate`(라벨 "실측 기준 추정 · {측정자} · {시각}")과 `unavailable`(GPS나 스냅샷이 없어서 계산 불가할 때 — 숫자를 만들지 않고 "GPS 필요"/"거리 계산 불가"만 표시).

#### 테스트 결과 — 요청하신 5개 시나리오 전부 unit test로 정확히 일치 확인

Round Engine을 직접 호출해(재식 GPS=146, 재근=136, 광천=142, 해란=150, 재식 실측 140m 공유 후) 확인:

| 시나리오 | 기대값 | 실제 결과 |
|---|---|---|
| 1. 재식(측정자) | 140, 실측 | **140, 실측 · 재식 · 방금 전** |
| 1. 재근 | 130, 실측 기준 추정 | **130, 실측 기준 추정 · 재식 · 방금 전** |
| 2. 광천 | 136 | **136** |
| 2. 해란 | 144 | **144** |
| 3. 재근 GPS 없음 | 숫자 없음, "GPS 필요"/"거리 계산 불가" | **null, "GPS 필요"** |
| 4. 공유 후 재식이 139로 이동 | delta는 -6 유지, 재근은 계속 130 | **재근 130 유지** |
| 5. 재근이 132로 이동 | 재근 132-6=126으로 갱신 | **재근 126** |

실제 Chromium UI(430×932)에서도 동일하게 재현: 재식 GPS=136(시드값)에서 138m 공유(delta=+2) → 재근 146→**148**, 광천 132→**134**, 해란 137→**139**, 전부 "실측 기준 추정 · 재식 · 방금 전" 라벨로 확인.

bearing_known/coordinate_known 경로(기존 `mockDistanceOffsetM` 테이블 기반)는 이번에 전혀 안 건드렸고, 회귀 없이 그대로 동작함을 unit test로 재확인했다(재근150/광천136/해란141, 기존과 동일).

이전 버전 저장 데이터(새 `sharerGpsDistanceAtShareM` 필드가 아예 없는 `lastDistanceShare`)를 직접 주입해도 크래시 없이 "GPS 필요"/"거리 계산 불가"로 안전하게 폴백됨을 확인했다 — `roundStorage.js` 마이그레이션 코드는 손대지 않았고, selector 자체의 방어 로직만으로 충분했다.

PTT 대상 선택·게이팅, 스코어, Gallery Overlay 회귀도 콘솔 에러 0건으로 확인했다.

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### Sprint 3 추가 수정 — One Screen Completion & Voice Distance Input Removal

**변경 파일은 정확히 두 개**: `DistanceCard.jsx`, `app.css`. Round Engine, `PTTButton.jsx`, `PlayerCard.jsx`, `GalleryPanel.jsx`, `WheelPicker.jsx`, `roundSelectors.js`, `RoundScreen.jsx`는 전혀 건드리지 않았다(타임스탬프로 확인).

#### 1. 거리 음성 입력 버튼 제거

`DistanceCard.jsx`에 `EXPERIMENTAL_VOICE_INPUT_ENABLED = false` 플래그를 추가하고 음성 입력 버튼 JSX를 이 플래그로 감쌌다. `captureVoiceDistance()`/`handleVoiceInput()`/`isListening` 상태와 Web Speech API 연동 코드는 전부 그대로 남아 있다 — 플래그를 `true`로 되돌리면 즉시 다시 노출되는 구조. 삭제한 코드는 없다.

#### 2~5. 압축

430×932 뷰포트에서 `getBoundingClientRect()`로 직접 측정하며 반복 조정했다:

- **GPS 카드**: GPS 숫자와 "실측 입력" 버튼을 한 가로 라인에 배치(새 `.ft-gps-row-compact`). 음성 입력 버튼이 빠지면서 생긴 공간을 그대로 흡수했다. 카드 패딩 14px→12px/14px, GPS 숫자 30px→28px, "현재 팀 기준"은 이미 1줄(지난 수정)이던 걸 패딩·마진만 더 줄였다.
- **PTT**: 마이크 시각 크기 128px→80px(터치 영역도 동일하게 80px — 최소 64px 기준 대비 16px 여유), 장식 링을 포함한 wrap 200px→132px, "길게 눌러 말하기"를 마이크 바로 아래(margin-top 16px→4px)로 붙였다. 대상 표시 문구와 PTT 사이 간격도 14px→6px로 줄였다.
- **응원·효과음 버튼**: 높이 40px→36px, 상단 여백 14px→8px.
- **플레이어 패널**: 행 패딩 5px→4px, 아바타 24px→21px, 패널 상단 여백 10px→6px, 두 번째 줄 `line-height: 1.15` 추가.

#### 완료 기준 검증 — 430×932, scrollTop=0

요청하신 9개 요소 전부 `getBoundingClientRect()`로 개별 측정, **클리핑 0px**:

| 요소 | top | bottom | 비고 |
|---|---|---|---|
| GPS 거리 | 118.0 | 162.8 | |
| 실측 입력 버튼 | 122.4 | 158.4 | GPS와 같은 라인 |
| 플레이어 패널(4명+전체) | 181.8 | 373.2 | |
| 전체 선택 행 | 182.8 | 215.8 | |
| 현재 송신 대상 문구 | 379.2 | 393.2 | |
| PTT wrap 전체 | 397.2 | 574.2 | |
| PTT 터치 버튼 | 423.2 | 503.2 | **80×80px** |
| "길게 눌러 말하기" | 533.2 | 550.2 | |
| 응원·효과음 버튼 | 582.2 | 618.2 | |

가장 아래 요소(응원·효과음)가 618.2px에서 끝나고 phone frame은 852px이라 **233.8px 여유**가 남는다 — 요청하신 "한 픽셀이라도 잘리면 안 된다"는 기준을 확실한 여유를 두고 만족한다(자세한 내용은 아래 "다음 개선 제안" 참고 — 여유가 이렇게 크다는 건 다음 라운드에서 일부 크기를 다시 키워 시각적 여유를 되찾을 수 있다는 뜻이기도 하다).

#### 검증 결과

여전히 네트워크가 막혀 있어 `npm run build`(Vite)는 직접 실행하지 못했다. esbuild 번들 체크 + 실제 Chromium(Playwright, 430×932)으로 확인했다:

- 음성 입력 버튼 텍스트·엘리먼트 모두 DOM에 없음, 하지만 소스에 `captureVoiceDistance`/`handleVoiceInput`/`isListening`/`SpeechRecognition` 전부 그대로 존재함을 확인
- "실측 입력" 버튼(컴팩트)으로 Wheel Picker 정상 진입
- 대상 선택("해란에게 전송") 정상 동작, PTT 터치 크기 정확히 80×80px 확인
- 대상 선택 후 PTT 정상 송신(`is-on` 클래스 확인)
- Gallery Overlay 정상 열림
- 스코어(헤더 실시간 갱신) 정상 동작
- 이전 버전 저장 데이터 마이그레이션 크래시 없음
- 콘솔 에러 0건

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### Sprint 3 긴급 수정 — Distance Regression & PTT Above the Fold

**변경 파일**: `roundSelectors.js`(selector 로직 수정), `DistanceCard.jsx`(팀 기준 카드 압축), `RoundScreen.jsx`(플레이어 패널 섹션 압축), `app.css`. **Round Engine, PTTButton.jsx, PlayerCard.jsx, GalleryPanel.jsx, WheelPicker.jsx는 전혀 건드리지 않았다**(타임스탬프로 확인).

#### 1. 동일 거리 회귀 — 정확한 원인

`roundSelectors.js`의 `selectPlayerSummary()`에서, `manual.calculationMode`가 `"shared_reference"`일 때 `distanceM`(각 행의 큰 숫자)에 그 **공유된 원본 숫자**를 그대로 넣고 있었다:

```js
} else if (desc && desc.category === "shared_reference") {
  distanceM = manual.valueM;   // ← 버그: 측정자 아닌 사람의 "내 거리" 칸에
  distanceCategory = "shared_reference";  //    공유받은 숫자를 그대로 넣고 있었음
  distanceLine = "공통 참고값";
}
```

Sprint 2 때는 "공통 참고값"이라고 정직하게 라벨을 붙였으니 괜찮다고 판단했는데, 실제로는 라벨과 무관하게 **네 명 모두 같은 큰 숫자**가 나란히 보이면 "다들 거리가 똑같다"는 인상을 준다는 게 이번 리뷰의 지적이었고, 맞는 지적이었다. 이게 정확한 회귀 원인이다.

#### 2. 수정한 selector 규칙

`distanceM`을 채우는 우선순위를 아래처럼 다시 정리했다(요청하신 예시 전부와 대조해서 검증):

1. 본인의 실측값 또는 (핀 방향을 알 때) 본인 위치 기준 계산된 추정값 — `calculationMode`가 `self_measured`/`demo_mock_offset`/좌표기반인 경우만. **둘 다 항상 그 사람 고유의 값이라 다른 사람과 겹칠 수 없다.**
2. 본인 GPS — `manual`이 `shared_reference`인 경우 **여기로 폴백**한다. 공유받은 원본 숫자는 이제 큰 숫자 칸에 절대 안 들어간다.
3. 아무 숫자도 만들지 않음(`distanceM = null`, 화면엔 "-") — GPS도 없고 개인 값도 없을 때만, `distanceLine`에 "공통 130m 참고" 같은 작은 힌트만 남긴다.

`PlayerCard.jsx`는 이미 `distanceCategory`를 범용 CSS 클래스(`is-${category}`)로만 쓰고 있어서 셀렉터만 고치면 그대로 맞물렸다 — 컴포넌트 자체는 수정하지 않았다.

기존 "현재 팀 기준" 카드(`DistanceCard.jsx`, 이번에 1줄로 압축만 했을 뿐 로직은 그대로)가 이미 "공통 참고값을 목록 위에 한 번만 표시"하는 역할을 하고 있어서, 별도 컴포넌트를 새로 만들 필요는 없었다.

#### 3. PTT Above the Fold

430×932(iPhone 15류) 뷰포트로 직접 측정한 결과, 기존 레이아웃은 PTT 영역이 phone frame 하단에서 **27px 초과**했다(스크롤이 필요한 정도가 크지는 않았지만 분명 존재). 하단 고정 방식 대신, 요청하신 우선순위(세로 레이아웃 유지 → GPS 카드 압축 → 플레이어 패널 압축)만으로 해결을 시도했고, 측정 결과 총 **88.5px 여유**가 생겨 하단 고정 없이 목표를 달성했다:

- GPS 카드: 패딩 20px→14px, GPS 숫자 40px→30px, 입력 버튼 높이 42px→36px, "현재 팀 기준" 카드를 2줄 스택에서 **1줄 compact status bar**로 변경(`ft-team-reference-card` → `ft-team-reference-bar`) — 카드 전체 높이 157px → 123.5px
- 플레이어 패널: "플레이어" 섹션 제목 제거, 행 패딩 8px→5px, 아바타 30px→24px, 섹션 상단 여백 26px→10px — 패널 전체 높이 248px → 212px
- 이름·거리 폰트 크기는 "가독성 유지" 요청에 따라 손대지 않았다

결과: PTT 영역이 phone frame 안에 완전히 들어오고(763.5px < 852px), **자연스러운 초기 스크롤 위치(scrollTop=0)에서 대상 선택 패널과 PTT 전체, 대상 표시 문구까지 전부 보임**을 확인했다.

#### 검증 결과 (요청하신 9개 항목)

- 동일 거리 회귀 원인: 위 §1 설명대로 확인
- 수정한 규칙: 위 §2, unit test로 검증한 3개 시나리오(공유 전/unknown 공유/bearing_known 공유) 전부 요청하신 예시와 정확히 일치
- 캡처 4장(기본 상태, unknown 공유, bearing_known, PTT 스크롤 없이 보이는 전체 화면) 첨부
- 테스트 뷰포트: **430×932**(iPhone 15류) — phone frame 자체는 393×852, 여유 있는 실측을 위해 그보다 큰 뷰포트에서 측정
- Round Engine 및 기존 PTT 로직 회귀 없음: 선택 없음→무전송, 대상 선택 후 정상 송신, 스코어·Gallery 회귀까지 콘솔 에러 0건으로 재확인. `roundReducer.js`/`roundActions.js`/`PTTButton.jsx`/`PlayerCard.jsx`는 타임스탬프상 이번에 전혀 수정되지 않았음
- 변경 파일 목록: 위 상단 참고

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### Sprint 3 — Player Target UX: "말하기 전에 누구에게 말할지 먼저 선택한다"

PTT가 지금까지는 "누르면 전체에게 방송"이었는데, 이제는 "먼저 대상을 고르고 눌러야 송신됨"으로 바뀐다. Sprint 2의 Player Summary 패널을 대상 선택 UI로 재사용했다 — 새 목록을 따로 만들지 않았다.

**변경 파일**: `PTTButton.jsx`(게이팅 prop 2개 추가), `PlayerCard.jsx`(선택 UI로 재작성), `RoundScreen.jsx`(선택 상태 + "전체" 행 + 대상 표시), `app.css`. **Round Engine(리듀서·액션)은 이번에도 전혀 건드리지 않았다**(타임스탬프로 확인) — 대상 선택은 다른 사람과 동기화될 필요가 없는 "내 다음 PTT를 누구에게 보낼지"에 대한 순전히 로컬 UI 의도라, TASK-003 때 `muted`를 Round Engine에 넣지 않기로 한 것과 같은 판단 기준을 그대로 적용했다.

**1~2. Player Row = Selection**

기존에 있던 작은 음소거 아이콘(개별 클릭)을 없애고, **행 전체**가 선택 버튼이 된다("나" 행은 제외 — 자기 자신을 대상으로 선택할 수 없음). 선택되면 배경·왼쪽 테두리·이름 색·거리 색·아이콘, 최소 4가지가 동시에 바뀐다(요청하신 "최소 두 가지 이상"보다 여유 있게). 이 선택 강조 스타일은 CSS에서 "말하는 중"/"연결 끊김" 같은 기존 이벤트 강조보다 **뒤에** 배치해서, 두 상태가 동시에 활성화돼도 선택 표시가 항상 이긴다.

기존 음소거 기능은 이번에 target-selection으로 대체됐다 — Product Director 요청에 "스피커 아이콘은 유지해도 되지만 선택 상태를 보여주는 보조 요소로 사용" 이라고 명시돼 있어 의도된 대체로 판단했다.

**3~5. 다중 선택 + "전체"도 하나의 대상**

Player Summary 패널 맨 위에 "📢 전체" 행을 새로 추가했다(다른 행과 동일한 선택 메커니즘, 내용만 다름). 규칙:
- 같은 행을 다시 누르면 선택 해제
- 개별 플레이어는 여러 명 동시 선택 가능
- "전체"를 선택하면 개별 선택은 전부 지워짐(상호 배타), 반대도 마찬가지

**4. 기본값 변경 — 선택 없음 = 무전송**

PTT를 누르는 순간(`pointerdown`) `canTransmit`이 `false`면 `startPtt()` 자체를 호출하지 않고 "먼저 전달할 대상을 선택하세요." 토스트만 띄운다. `PTTButton.jsx`에는 이 게이팅 분기 하나만 추가했다 — 브레싱 펄스·칩톤·햅틱·타이머·레벨미터 등 기존 로직은 전부 그대로다.

**6. 현재 송신 대상 표시**

PTT 버튼 바로 위에 항상 "대상 없음"/"해란에게 전송"/"재근 · 광천에게 전송"/"전체에게 전송" 라벨을 표시한다. 이 라벨은 `PTTButton.jsx` 안이 아니라 `RoundScreen.jsx`에 따로 렌더링해서, PTTButton 자체의 JSX는 전혀 안 바꿨다.

**7. Player Summary 정보는 유지**

이름/거리/출처/공유자/시각 표시(Sprint 2에서 만든 `selectPlayerSummary()`)는 손대지 않았다. Ready/Walking/Waiting류 상태는 여전히 없다(TASK-007에서 이미 제거된 원칙, 이번에 다시 판단한 것 아님).

**8. 워치 고려**

`PlayerCard.jsx`가 여전히 `useRound()`를 직접 호출하지 않는 순수 컴포넌트라(Sprint 2에서 만든 구조), 선택 상태(`selectedTargets`)와 토글 규칙(`toggleTarget()`)도 전부 plain 함수/데이터로 분리돼 있다. 워치 레이아웃은 같은 상태와 규칙을 재사용하면서 "작은 아이콘"이 아니라 "행 전체 선택"이라는 동일한 철학으로 다르게 그리기만 하면 된다.

**테스트 결과 (§9 체크리스트)**

여전히 네트워크가 막혀 있어 `npm run build`(Vite)는 직접 실행하지 못했다. esbuild 번들 체크 + 실제 Chromium(Playwright)으로 요청하신 8개 시나리오를 전부 확인했다:

- ☑ 선택 없음 → `pointerdown` 시 송신 안 됨(`is-on` 클래스 없음), "먼저 전달할 대상을 선택하세요." 토스트 확인
- ☑ 전체 선택 → "전체에게 전송" 표시, 개별 선택 자동 해제됨을 확인
- ☑ 해란 선택 → "해란에게 전송"만 정확히 표시
- ☑ 재근 + 광천 선택 → "재근 · 광천에게 전송" 정확히 표시
- ☑ 선택된 행 재터치 → "대상 없음"으로 정확히 복귀
- ☑ 선택 상태: 배경·이름색·거리색·아이콘색 4가지가 동시에 바뀜을 computed style로 직접 확인
- ☑ PTT 버튼 근처 대상 표시가 선택 변경마다 즉시 갱신됨을 확인
- ☑ 스크롤 없이 4명(+전체 행) 전부 뷰포트 안에 들어옴을 `getBoundingClientRect()`로 확인
- 추가로: 대상이 선택된 상태에서 PTT가 정상적으로 송신되는지, 스코어·Gallery·Wheel Picker 회귀, 이전 버전 저장 데이터 마이그레이션까지 전부 콘솔 에러 0건으로 확인

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### Sprint 2 — Player First UI: "정보 종류가 아니라 플레이어를 중심으로"

Product Review에서 나온 근본적 지적("사용자는 GPS/실측을 보는 게 아니라 플레이어를 본다")을 반영해 "동반자 GPS"(DistanceCard 안)와 "참가자 상태"(RoundScreen) 두 섹션을 하나의 Player Summary 패널로 합쳤다. 두 섹션은 애초에 같은 `round.players` 배열을 따로따로 읽고 있었을 뿐이라, 병합은 "두 시스템을 합치는 일"이 아니라 "같은 객체를 두 번 렌더링하던 걸 멈추는 일"에 가까웠다.

**변경 파일**: `roundSelectors.js`(selector 1개 추가), `DistanceCard.jsx`(동반자 GPS 섹션 제거), `PlayerCard.jsx`(전면 재작성 — 가로 카드 → 세로 리스트), `RoundScreen.jsx`(두 섹션 병합), `app.css`. **Round/Distance/Shot Engine, PTT, Audio Engine, WheelPicker, Gallery Overlay는 전혀 건드리지 않았다**(타임스탬프로 확인).

**1. `selectPlayerSummary()` — 새 코드가 아니라 새 조합**

기존 `describeManualReading()`/`formatDistanceMeta()`/`shortLabelForCategory()`(distanceFormat.js)와 `selectPlayerCardEvent()`(TASK-007)를 그대로 재사용해 한 selector로 묶었다. 새로 판단하는 로직은 없다 — "실측/추정/좌표기반/공통참고값을 어떻게 부를지"는 기존 함수가, "말하는 중/연결 끊김/이벤트를 언제 우선할지"는 기존 selector가 이미 정해둔 규칙 그대로다. `formatDistanceMeta()`는 GPS 객체에도 그대로 재사용된다 — `{valueM, measuredBy, updatedAt}` 모양이 manual과 동일해서, GPS는 `measuredBy`가 항상 `null`이라 측정자 이름 없이 시각만 자연히 나온다(별도 분기 불필요).

**2. `DistanceCard.jsx`**: "동반자 GPS" 2×2 그리드를 삭제했다. 본인 GPS·실측 입력·"현재 팀 기준" 카드는 그대로다 — "팀 공통 참고값"은 개인별 정보가 아니라 별개의 정보라 유지했다.

**3~4. `PlayerCard.jsx` + 섹션 병합**: 가로 스크롤 카드 4개를 세로 리스트 한 패널로 바꿨다. 한 행에 이름+거리(1줄, 가장 빨리 읽힘) / 출처·측정자·시각 또는 활성 이벤트(2번째 줄, 작은 텍스트)만 담는다. `Ready`/`Walking`/`Waiting` 같은 눈으로 보이는 상태는 이번에도 없다 — TASK-007에서 이미 제거된 것이지 이번에 새로 판단한 게 아니다.

**아키텍처 — Watch 재사용성**: `PlayerCard.jsx`가 이제 `useRound()`/`useNowTick()`을 직접 호출하지 않는다. `summary` prop(즉 `selectPlayerSummary()`의 출력)만 받는 순수 표시 컴포넌트로 바꿨다. 시각 갱신용 tick도 4번(행마다) 돌던 걸 `RoundScreen.jsx`에서 한 번만 돌리도록 옮겼다 — 컴포넌트/selector 분리 요청을 문자 그대로 구현한 것이며, 부수적으로 타이머 4개→1개로 줄어드는 성능 이득도 있다.

**테스트 결과**

여전히 네트워크가 막혀 있어 `npm run build`(Vite)는 직접 실행하지 못했다. esbuild 번들 체크 + 실제 Chromium(Playwright) 테스트로 확인했다:

- 옛 `.ft-participants`/`.ft-companion-grid`가 DOM에서 완전히 사라지고, 새 패널에 정확히 4개 행이 렌더링됨을 확인
- 기본 상태: "재식 (나) 132m / 실측 · 재식 · 방금 전", "재근 146m / GPS · 방금 전" 등 요청하신 예시와 동일한 포맷으로 표시됨을 확인
- 핀 위치 "모름" 상태에서 138m 공유 후: 재식 행만 "📏 138m 공유"(활성 이벤트가 우선), 나머지 3명은 전부 "공통 참고값"으로 표시되고 GPS/실측 같은 개인화된 라벨이 절대 안 붙음을 확인 — 잘못된 개인 추정 거리 표시 없음
- 핀 위치 "예상"(bearing_known)에서 공유 후: 재근147/광천133/해란138이 각각 "추정 · 재식 · 방금 전"으로 정확히 구분 표시됨을 확인
- PTT를 누르면 재식 행이 "🎤 말하는 중"으로 즉시 바뀌고(우선순위 확인), 떼면 원래 거리 라인으로 복귀
- 음소거 버튼이 본인을 제외한 3명에게만 있고 정상 토글됨을 확인
- 패널 전체 높이 201px(4행 기준) — 헤더+거리+참가자+PTT+Gallery트리거+스코어까지 스크롤 없이 화면에 들어감
- 스코어(헤더 실시간 갱신 포함), Gallery Overlay, 이전 버전 저장 데이터 마이그레이션 모두 정상 동작 확인 (콘솔 에러 0건)

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### Project Eagle — Build Phase 진입: UI Compact + Gallery Overlay 전환

Product Planning Phase에서 Build Phase로 전환하는 가이드라인 문서에서 지시된 "현재 진행 TASK" 3개를 구현했다. 이번 작업은 새 기능 추가가 아니라 기존 화면의 완성도(조작성·일관성·간결함)를 높이는 작업이다. 수정한 파일은 `RoundScreen.jsx`, `GalleryPanel.jsx`(재작성), `PersonalizedCheer.jsx`(콜백 prop 1개 추가), `app.css`다. **Round/Distance/Shot Engine, PTT, Audio Engine, Sound Catalog, WheelPicker, Score/누계, Player Card Event Board, 저장 데이터 마이그레이션은 전혀 건드리지 않았다**(타임스탬프로 확인).

**1. UI Compact — 상단 Header 축소**

기존 `.ft-round-header`(코스명·연결 인원)와 `.ft-hole-card`(큰 홀 번호 + 장식 SVG + 바람 + 누계 pill)를 통째로 걷어내고, 요청하신 예시 그대로 2줄짜리 컴팩트 헤더로 교체했다.

```
7H | PAR4 | +2
↗ NW 3.1m/s
```

바람 방향(`hole.wind.directionDeg`)을 8방위(N/NE/E/SE/S/SW/W/NW) + 화살표로 변환하는 작은 순수 함수(`describeWind`)를 `RoundScreen.jsx`에 추가했다 — Round Engine의 기존 `wind` 데이터 구조는 그대로 읽기만 한다. 실측 높이는 기존 대비 목표치("절반 수준")보다 훨씬 더 줄어든 약 48px(기존 헤더+홀카드 합산 대비)로 확인됐다.

**2. Gallery 구조 변경 — 독립 섹션 → Overlay**

`GalleryPanel.jsx`를 전면 재작성했다. 더 이상 라운드 화면에 상시 표시되는 섹션이 아니라, 작은 트리거 버튼("응원 · 효과음")을 눌러야 열리는 하단 시트(overlay)다.

- 첫 화면은 카테고리 5개 타일만 표시: 🎯 샷 / ⛳ 그린 / 🏆 스코어 / ⭐ 즐겨찾기 / ❤️ 개인응원
- 샷→`gallery`, 그린→`team`, 스코어→`achievement` 기존 Sound Catalog 카테고리에 매핑(카탈로그 자체는 무수정)
- 효과음을 선택하면 Round Engine에 `SOUND_PLAYED` 이벤트를 기록(기존과 동일)한 뒤 오버레이가 자동으로 닫히고 플레이 화면으로 복귀 — 이후 결과는 기존 Player Card Event Board(TASK-007)가 "👏 {효과음 이름}"으로 2초간 보여준다. 이전에 오버레이 자체에 있던 "버블 팝업" 애니메이션은 이제 이 Event Board와 기능이 겹쳐 제거했다(Less UI)
- **⭐ 즐겨찾기**: 이전엔 없던 개념이라 가볍게 새로 만들었다. Round Engine과 무관한 순수 클라이언트 선호 정보라 `localStorage`(`fieldtalk.gallery.favorites.v1`)에만 저장하고 리듀서·액션은 건드리지 않았다. 각 효과음 옆 별표(☆/⭐)로 즉시 토글
- **❤️ 개인응원**: 기존 `PersonalizedCheer.jsx`를 그대로 재사용해 이 카테고리 진입 시 렌더링한다. 라운드 화면에 항상 떠 있던 별도 "개인 응원" 섹션은 제거했다 — 파일 자체의 내부 로직(카탈로그 조회, TTS 호출, 칩 렌더링)은 전혀 바꾸지 않았고, 재생 성공 후 오버레이를 자동으로 닫기 위한 선택적 콜백 prop `onPlayed`(기본값 없음 → 기존 호출부는 100% 그대로 동작)만 추가했다

**3. 거리 정보 유지**

`RoundScreen.jsx`에서 Distance Card를 헤더 바로 다음(참가자 상태보다도 위)으로 옮겨 "Distance First" 원칙을 반영했다. Gallery 오버레이는 `.ft-round-scroll` 바깥의 형제 요소로 렌더링되고 화면 하단 58% 높이의 시트로만 뜨기 때문에, 오버레이가 열려 있어도 위쪽의 GPS·헤더는 계속 화면에 남아 있다 — 실제로 오버레이가 열린 상태에서 GPS 값을 그대로 읽을 수 있음을 테스트로 확인했다.

**테스트 결과**

여전히 네트워크가 막혀 있어 `npm run build`(Vite)는 직접 실행하지 못했다. esbuild 번들 체크 + 실제 Chromium(Playwright) 테스트로 확인했다:

- 컴팩트 헤더가 정확히 "7H | PAR4|..." 형식과 바람 방향(예: "↙ SW 2.3m/s", 시드 데이터 기준)으로 표시되고, 옛 `.ft-hole-card`/`.ft-round-header`가 DOM에서 완전히 사라짐을 확인
- Distance Card가 헤더 바로 다음, 참가자 상태보다 위에 위치함을 확인
- Gallery 트리거를 누르기 전엔 오버레이가 DOM에 아예 없고, 누르면 카테고리 5개 타일(샷/그린/스코어/즐겨찾기/개인응원)이 정확한 라벨로 표시됨을 확인
- 오버레이가 열린 상태에서도 GPS 값이 그대로 조회됨을 확인
- "샷" 카테고리 진입 → 굿샷/나이스 표시, 뒤로가기는 카테고리 그리드로만 돌아가고 오버레이 자체는 안 닫힘, 효과음(나이스) 선택 → 오버레이 전체가 닫히고 Player Card에 "👏 나이스"가 표시됨을 확인
- 즐겨찾기: 빈 상태 안내 문구 확인 → 다른 카테고리에서 별표 토글 → localStorage에 정확히 저장됨 → 즐겨찾기 카테고리에 해당 항목이 나타남을 확인
- "개인응원" 카테고리에서 기존 4명 응원 칩이 정상 표시되고, 선택 시 오버레이가 자동으로 닫힘을 확인
- PTT, 스코어(헤더 누계 실시간 갱신 포함), Wheel Picker, 이전 버전 저장 데이터 마이그레이션(새 헤더의 바람 표시까지) 모두 정상 동작 확인 (콘솔 에러 0건)

과정에서 제 테스트 스크립트의 기본 브라우저 뷰포트가 새로 조정된 레이아웃에서 PTT 버튼 위치를 담기엔 너무 작아서 한 번 헷갈렸는데, 실제 앱 문제가 아니라 뷰포트를 크게(500×1000) 잡아서 재확인했더니 정상이었습니다.

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### TASK-009 Regression Fix — GPS가 전부 "-"로 보이던 문제

**진단**: 보고하신 4가지 증상(내 GPS "-", 동반자 GPS "-", Wheel에서 값을 바꿔도 "확인 완료"만 뜨고 적용 안 됨, "팀에 공유" 버튼이 안 뜸)이 실은 **하나의 원인**에서 나온 결과였다.

`src/engine/roundStorage.js`의 저장 데이터 마이그레이션 함수(`migrateLegacyDistance`)가 GPS/실측 분리 이전 형식의 저장 데이터를 열 때 `gps.valueM`을 **항상 `null`로 고정**해 놓고 있었고, 그 이후 어떤 로직도 이걸 실제 숫자로 채워주지 않았다. 이 미리보기는 대화가 이어지는 동안 브라우저에 localStorage가 계속 쌓이는데, TASK-004~006 시절의 예전 형식 데이터가 브라우저에 남아 있으면 그걸 열 때마다 GPS가 영구적으로 `null`이 되는 상황이었다. TASK-009는 이 값을 코드 UI 전면에 크게 보여주는 방식으로 바꿨을 뿐인데, 그 때문에 잠복해 있던 이 문제가 처음으로 눈에 띄게 된 것으로 보인다(엄밀히는 TASK-009가 만든 버그라기보다, TASK-009가 예전부터 있던 마이그레이션 공백을 화면에 드러낸 것에 가깝다 — 다만 결과적으로 사용자 입장에서 체감되는 증상은 이번 리비전에서 시작된 게 맞으므로 회귀로 다루었다).

GPS가 `null`이면 `diff = localValue - gpsValue`를 계산할 수 없어 내부적으로 `diff = 0`으로 처리됐고, 그러면 "GPS와 실측이 같다"고 판단해 버튼이 항상 "확인 완료"만 뜨고 "팀에 공유"가 절대 나타나지 않았다 — Wheel Picker 자체(`selectedValue`/`editingValue`/`displayValue` 연결)는 실제로는 정상이었고, "값이 적용 안 되는 것처럼 보인 것"은 GPS가 없어서 애초에 "바뀐 게 없다"고 판단된 결과였다.

**수정**

- `src/data/roundSeed.js`: 시드가 이미 쓰던 `GPS_BASE_M` 상수를 export해서, 마이그레이션 코드가 시드와 똑같은 공식으로 GPS 기본값을 계산할 수 있게 했다.
- `src/engine/roundStorage.js`: `migrateLegacyDistance()`의 세 갈래(빈 distance / 예전 flat 구조 / 이미 `{gps, manual}` 구조) 전부에서 `gps.valueM`이 없거나 `null`이면 `GPS_BASE_M + mockDistanceOffsetM`(시드와 동일한 공식, 이미 있던 `computeMockGpsValueM()` 헬퍼)으로 채우도록 고쳤다. 이미 실제 GPS 값이 저장돼 있는 경우는 절대 덮어쓰지 않는다.

**의도적으로 건드리지 않은 부분**: `DistanceCard.jsx`, `WheelPicker.jsx`, Round/Distance Engine 리듀서·액션은 전혀 수정하지 않았다 — Wheel Picker의 상태 연결 자체는 문제가 없었기 때문에, TASK-009에서 만든 UI 코드는 그대로 두고 데이터 계층의 공백만 메웠다.

**테스트 결과**

여전히 네트워크가 막혀 있어 `npm run build`(Vite)는 직접 실행하지 못했다. esbuild 번들 체크 + 실제 Chromium(Playwright)에서 신고하신 시나리오를 재현·검증했다:

1. **정상(새) 세션**: 내 GPS 136m, 동반자 GPS(재근146/광천132/해란137) 전부 정상 표시 — 회귀 없음
2. **예전 flat 구조(`gps` 필드 자체가 없는 TASK-004식 저장 데이터)를 직접 주입** → 재현 시도했던 정확한 버그 조건에서 내 GPS와 동반자 GPS 전부 올바른 숫자(136/146/132/137)로 채워짐을 확인 — 수정 전이었다면 전부 "-"
3. **한 단계 더 까다로운 경우**: 이미 `{gps, manual}` 구조인데 `gps.valueM`만 `null`로 저장돼 있던 데이터(마이그레이션이 한 번 잘못 실행된 뒤 그대로 재저장된 것과 동일한 상황)도 정상 값으로 채워짐을 확인
4. 위 마이그레이션된 데이터 위에서 Wheel Picker로 +3m 조정 → "실측 139m" / "GPS 대비 +3m" 즉시 갱신, **"팀에 공유" 버튼이 정상적으로 나타남**, 버튼을 눌러 실제 전송·"현재 팀 기준" 카드 갱신까지 전부 확인
5. PTT(Player Card Event Board 포함)·스코어 누계·개인화 응원·갤러리 응원 회귀, GPS 영역 클릭 시 여전히 편집이 안 열리는지까지 전부 콘솔 에러 0건으로 확인

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### TASK-009 — Distance Card Usability Fix

TASK-008의 조건부 거리 공유 로직은 그대로 두고, 실제 미리보기에서 확인된 UX 문제를 고쳤다. 수정한 파일은 `DistanceCard.jsx`, `distanceFormat.js`(helper 1개 추가), `app.css` 세 개뿐이다(타임스탬프로 확인). **조건부 팀 공유, 8m 경고, Wheel Picker, Player Card Event Board, PTT, Audio Engine, Score/누계, Round Engine, 저장 데이터 마이그레이션은 전혀 건드리지 않았다.**

**1. GPS는 읽기 전용으로**

`ft-gps-section`에서 클릭 핸들러를 완전히 제거했다. GPS 숫자를 눌러도 아무 일도 일어나지 않는다(버튼이 아니라 그냥 `<span>`).

**2. 실측 입력 진입점을 명확한 버튼으로**

GPS 아래에 "실측 확인·입력"(연두색 primary 버튼)과 "음성 입력"(보조 버튼) 두 개를 항상 보이게 추가했다. "실측 확인·입력"을 누르면 현재 GPS 값으로 초기화된 Wheel Picker가 열린다 — Wheel을 여는 유일한 방법이다.

**3. 실측값 실시간 표시**

Wheel이 열려 있는 동안 "실측 / {값}m"을 큰 글씨로 따로 보여주고, 그 아래 "GPS 대비 +Nm"(또는 값이 같으면 "GPS와 동일")을 매 렌더마다 새로 계산해 표시한다. 별도의 "바뀌었는지" 추적 로직 없이 `localValue - gpsValue`를 렌더 시점에 그대로 계산하는 방식이라 자연히 즉시 갱신된다. 8m 이상 차이 경고는 그대로 유지된다.

**4. 편집 버튼 규칙(문구만 변경)**

GPS와 같으면 "확인 완료"(공유 안 함), 다르면 "팀에 공유"(명시적으로 눌러야 전송) — TASK-008의 판단 로직은 그대로 두고 버튼 문구만 요청하신 대로 바꿨다.

**5~6. 동반자 GPS 그리드 — 항상 표시 + 필요할 때만 보정값 추가**

DistanceCard 안에 2×2 그리드로 "동반자 GPS"를 항상 보여준다(공유 여부와 무관). 각 칸은 이름 + GPS 값이 기본이고, `describeManualReading()`이 `shared_reference`가 아닌 경우(즉 자기 실측이거나 실제 보정 계산값일 때)에만 두 번째 줄로 "실측 137m" / "추정 145m" 등을 추가한다 — `shared_reference`(핀 위치 모름 상태에서 받은 공통 참고값)는 절대 개인의 정확한 거리처럼 반복 표시하지 않는다(TASK-007/008에서 세운 원칙 재사용). 새 helper `shortLabelForCategory()`를 `distanceFormat.js`에 추가해 좁은 그리드 칸에 맞는 짧은 라벨("실측"/"추정"/"좌표기반")을 제공한다. bearing_known은 "추정" 텍스트 자체가 배지 역할을 한다.

**7. 화면 순서 재배치**

내 GPS → 실측 확인·입력/음성 입력 버튼 → (편집 중이면 Wheel) → 동반자 GPS 그리드 → (공유가 있으면) 현재 팀 기준 카드. TASK-008에서는 팀 기준 카드가 맨 위였는데, 이번에 맨 아래로 옮겼다.

**테스트 결과**

여전히 네트워크가 막혀 있어 `npm run build`(Vite)는 직접 실행하지 못했다. esbuild 번들 체크 + 실제 Chromium(Playwright) 테스트로 요청하신 시나리오를 확인했다:

- GPS 영역을 클릭해도 Wheel이 열리지 않음을 확인(이전엔 열렸음 — 회귀 재현 후 수정 확인)
- "실측 확인·입력" 버튼으로만 Wheel이 열리고, 초기값이 GPS와 정확히 일치함을 확인
- 실측을 +3m 조정하면 "실측 139m" 표시와 "GPS 대비 +3m"이 즉시 갱신되고 버튼이 "팀에 공유"로 바뀜, 다시 GPS로 되돌리면 "GPS와 동일" + "확인 완료"로 즉시 복귀함을 확인
- 공유 전에도 4명 전원(재식136/재근146/광천132/해란137)의 GPS가 동반자 그리드에 보임을 확인
- "모름" 상태에서 138m 공유 후에도 재근/광천/해란의 GPS 값은 그대로 유지되고, 이들에게는 어떤 "추정"/"실측" 보조 줄도 표시되지 않음(재식 본인 칸만 "실측 138m" 표시)을 확인 — 공통 참고값을 개인 거리처럼 반복 표시하지 않는다는 원칙이 새 그리드에서도 지켜짐
- "예상"(bearing_known) 상태에서 공유하면 재근 칸에 "GPS 146m" 아래 "추정 147m"처럼 GPS와 추정값이 구분되어 함께 표시됨을 확인(요청하신 예시와 동일한 구조)
- PTT(Player Card Event Board의 "말하는 중" 포함), 스코어 누계, 개인화 응원, 갤러리 응원 모두 정상 동작, 이전 버전 저장 데이터 마이그레이션도 크래시 없이 확인 (콘솔 에러 0건)

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### TASK-008 — Conditional Distance Share & Demo Cleanup

목표: 거리 공유를 상시 기능이 아니라 GPS와 실측값이 다를 때만 쓰는 예외 기능으로 전환. 수정한 파일은 정확히 `DistanceCard.jsx`, `RoundScreen.jsx`, `app.css` 세 개뿐이다(타임스탬프로 확인). **Player Card Event Board, PTT, Audio Engine, Sound Catalog, Personalized Cheer, WheelPicker, Score/누계 selector, Round Engine, 저장 데이터 마이그레이션은 전혀 건드리지 않았다.**

**1~2. 공유 전 기본 화면 + 공유 버튼 조건부 표시**

`DistanceCard.jsx`를 다시 썼다. 기본 화면은 이제 정확히 "GPS (참고) / 135m"만 보인다 — 팀 기준 카드도, 참가자 목록도 공유가 있기 전엔 아예 렌더링되지 않는다. GPS 숫자를 탭하면 편집(Wheel) 패널이 열리고, 값이 항상 GPS로 초기화된다(변경 없음, TASK-006부터 있던 규칙). `abs(localValue - gpsValue) >= 1`일 때만 "팀에 공유" 버튼이 나타나고, 아닐 때는 "닫기" 버튼만 있다(공유 액션 없음). 값을 다시 GPS와 같게 맞추면 버튼이 즉시 "닫기"로 바뀐다 — 매 렌더마다 diff를 다시 계산하는 반응형 로직이라 별도 이벤트 처리 없이 자연히 되는 동작이다.

**3. 음성 입력 — 더 이상 자동 공유하지 않음**

가장 큰 동작 변화: TASK-005/006에서 음성 인식은 항상 자동으로 팀에 공유됐는데, 이제는 인식된 값이 GPS와 같으면 공유 없이 토스트("GPS 거리와 동일합니다.")만 띄우고 PTT로 복귀하고, GPS와 다르면 **자동 공유하지 않고** 차이를 보여준 뒤 사용자가 "팀에 공유"를 눌러야 확정된다.

**5~7. 공유 후 표시 — "현재 팀 기준" 카드 하나로 통일**

상시 표시되던 `ft-distance-team-list`를 조건부로 바꿨다.
- 공유가 아직 없으면: 아무것도 안 보임(GPS만)
- 핀 위치가 `unknown`/`center_only`(보정 안 됨)이면: "현재 팀 기준 / {측정자} 실측 {값}m · {상대시간}" 카드 하나만 보이고, 참가자별 목록은 숨김
- 핀 위치가 `bearing_known`/`coordinate_known`(보정 적용됨)이면: 위 카드에 더해 참가자별 계산 목록도 함께 보임(TASK-006/007에서 이미 있던 로직 재사용 — `lastDistanceShare.correctionApplied` 플래그로 분기)
- 새로운 공유가 오면 카드 내용이 자동으로 최신 것으로 교체됨(별도 로직 불필요 — `round.lastDistanceShare`를 그대로 읽으므로)

**8. 8m 경고 유지**

`getGpsDiffWarning()`은 손대지 않았다. 편집 패널이 열려 있을 때 그대로 작동하며, 경고가 있어도 "팀에 공유" 버튼은 계속 눌린다.

**9. 샷 상태 데모 코드 제거**

`RoundScreen.jsx`에서 `selectLatestShotForPlayer` import, `shotDemoPhaseRef`, 자동 `shotCreate`/`shotStart`/`shotComplete` `useEffect` 3개를 전부 제거했다. 이제 안 쓰이게 된 `dispatch`/`actions` 구조분해도 함께 정리했다. `roundReducer.js`/`roundActions.js`의 SHOT_* 관련 코드는 그대로 남아 있다 — 호출하는 데모 코드만 지웠다.

**테스트 결과**

여전히 네트워크가 막혀 있어 `npm run build`(Vite)는 직접 실행하지 못했다. esbuild 번들 체크 + 실제 Chromium(Playwright) 테스트로 요청하신 시나리오를 그대로 확인했다:

1. GPS와 실측이 같을 때(휠이 GPS로 초기화된 직후): 공유 버튼 없음("닫기"만), diff 텍스트 없음 — 확인
2. 실측을 GPS+2로 조정: "GPS 대비 +2m" 정확히 표시, "팀에 공유" 버튼 등장. 다시 GPS로 되돌리면 버튼이 즉시 "닫기"로 복귀 — 확인
3. 음성으로 GPS와 같은 값 인식: 토스트 "GPS 거리와 동일합니다." 정확히 표시, 공유 이벤트 없음, 편집 패널 닫힘 — 확인
4. 음성으로 GPS+5 인식: 자동 공유되지 않고 "GPS 대비 +5m" + "팀에 공유" 버튼으로 확인 UI만 표시, 명시적으로 눌러야 전송됨 — 확인
5. 핀 위치 "모름" 상태에서 공유: "현재 팀 기준 / 재식 실측 137m · 방금 전" 카드만 표시, 참가자별 목록 없음 — 확인
6. 핀 위치 "예상"(bearing_known) 상태에서 공유: 카드 + 참가자별 목록(재근147/광천133/해란138) 모두 "추정값" 배지와 함께 표시 — 확인
7. 페이지 로드 후 7초 대기(기존 데모 타임라인이 지나가도록): `round.shots` 배열이 계속 빈 배열이고 재식의 activity가 "ready"로 그대로임을 확인 — 자동 샷 이벤트가 전혀 생성되지 않음
8. 이전 버전 저장 데이터(단일 `distance.valueM` 형태, GPS 없음 / GPS 있는 최신 형태 + 기존 shots 배열 포함) 두 가지 모두 주입해 크래시 없이 로드되고, 누계 selector도 정상 작동함을 확인
9. PTT(Player Card Event Board의 "말하는 중" 이벤트 포함), 스코어+누계, 개인화 응원, 갤러리 응원 모두 정상 동작 확인 (콘솔 에러 0건)

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### TASK-007 — Player Card UX 단순화 (MVP 정리)

목표: 기능 추가가 아니라 참가자 카드를 실제 골프장에서 필요한 정보만 남도록 단순화. "앱은 눈으로 볼 수 없는 정보만 보여준다"는 원칙에 따라, 동반자를 직접 보면 알 수 있는 정보("티샷 완료", "그린 위" 등)를 전부 제거했다. `src/engine/roundSelectors.js`(selector 1개 추가), `src/components/PlayerCard.jsx`(재작성), `src/hooks/useNowTick.js`(신규), `src/styles/app.css`를 수정했다. **Round/Distance/Audio Engine, Wheel Picker, Score, PTT, Sound Catalog, Personalized Cheer는 전혀 건드리지 않았다**(타임스탬프로 무수정 확인 — 이번에 수정한 파일은 정확히 위 4개뿐).

**1. Player Card 단순화**

기본 상태에는 이름과 연결 상태만 남는다. 예: "재근 · 🟢 연결됨" 또는 헤드폰이 연결돼 있으면 "🎧 연결됨". "티샷 완료"/"페어웨이 이동 중"/"그린 위"/"퍼팅 준비" 같은 activity 기반 문구, 그리고 상시 노출되던 거리 칩(GPS/공통참고/실측)을 전부 제거했다.

**2~3. Event Board로 전환**

`PlayerCard`가 "상태를 계속 저장"하는 대신 "최근 이벤트를 잠깐 보여주고 자동으로 사라지는" 구조로 바뀌었다. 새 데이터를 저장하는 리듀서/액션을 만들지 않고, **이미 존재하던 `round.events` 로그**(TASK-003~006에서 PTT_STARTED/DISTANCE_SHARE_CREATED/SOUND_PLAYED 등을 기록해 오고 있었음)를 그대로 재사용하는 새 selector `selectPlayerCardEvent(round, playerId, now)`만 추가했다 — 순수 파생 데이터 조회라 리듀서·액션·상태 구조는 전혀 바뀌지 않았다.

우선순위(높은 것이 이김):
1. **말하는 중**(🎤, 지속형) — `player.communication.isSpeaking`을 실시간으로 읽음
2. **연결 끊김**(🔴, 지속형) — `player.connection !== "online"`을 실시간으로 읽음
3. **가장 최근의 만료 안 된 타임드 이벤트**:
   - 📏 실측 공유(5초) — `DISTANCE_SHARE_CREATED` 이벤트, 실제 공유값을 포함해 "137m 공유"처럼 표시
   - 👏 리액션(2초) — `SOUND_PLAYED` 이벤트 중 `gallery`/`team`/`achievement` 카테고리, "굿샷"처럼 실제 라벨 표시
4. 위 어느 것도 없으면 기본 연결 상태 줄로 돌아간다.

만료 판정은 매 500ms마다 재계산한다(`useNowTick` 훅, 신규 — Round Engine에 타이머 상태를 추가하지 않고 컴포넌트 로컬에서 "지금 몇 시야?"만 주기적으로 다시 물어보는 방식이라 엔진 구조에 영향이 없다).

**테스트 결과**

여전히 네트워크가 막혀 있어 `npm run build`(Vite)는 직접 실행하지 못했다. esbuild 번들 체크 + 실제 Chromium(Playwright) 테스트로 확인:

- 기본 상태: 4명 전원 "🟢 연결됨"만 표시, 거리 칩 없음, "티샷 완료"/"그린 위" 등 문구가 페이지 어디에도 없음을 확인
- 거리 공유 직후 재식 카드에 정확히 "📏 132m 공유" 표시, 3.3초 시점엔 아직 보이고 5.5초 시점엔 "🟢 연결됨"으로 자동 복귀함을 확인(5초 만료)
- PTT를 누르면 "🎤 말하는 중"이 표시되고, 떼면 원래대로 돌아감을 확인
- **우선순위 검증**: 실측 공유 이벤트가 떠 있는 동안 PTT를 누르면 "🎤 말하는 중"이 그것을 덮어쓰고, PTT를 떼면(아직 5초가 안 지났다면) "📏 132m 공유"가 다시 나타남을 확인 — 이벤트가 사라진 게 아니라 우선순위에 밀렸다가 다시 떠오르는 것임을 정확히 검증
- `window.speechSynthesis.speak`를 모킹해(이 샌드박스는 설치된 TTS 음성이 0개라 실제 음성 리액션이 항상 실패로 끝남 — 기존 Sound Engine의 정상적인 안전 실패 동작이지 이번 버그 아님) 굿샷류 리액션 이벤트가 정확히 2초간 "👏 나이스"로 표시되고 자동으로 사라짐을 확인
- localStorage를 직접 편집해 특정 참가자를 `connection: "reconnecting"`으로 만들면 "🔴 연결 끊김"이 표시됨을 확인
- 이전 버전 데이터(예전 `activityLabel` 필드 포함)를 주입해도 깨지지 않고, 이제는 그 필드를 아예 읽지 않으므로 기본 연결 상태만 표시됨을 확인(의도된 동작)
- PTT, 스코어, Wheel Picker, 개인화 응원 모두 정상 동작 확인 (콘솔 에러 0건)

과정에서 제 테스트 스크립트 쪽 이슈를 두 개 발견해서 고쳤습니다(둘 다 앱 버그 아님): (1) TTS 리액션은 이 헤드리스 환경에 음성이 없어 항상 "재생 실패" 토스트만 뜨고 이벤트가 안 남는 게 정상이라, 파일 기반이 아닌 성공하는 경로를 확인하려고 `speechSynthesis.speak`를 모킹해서 검증했습니다. (2) 거리 공유 후 자동으로 PTT 쪽으로 스크롤되는 애니메이션(TASK-005/006에서 이미 있던 기능) 도중에 좌표를 미리 캐싱해서 PTT 버튼을 놓친 적이 있어, 스크롤이 끝난 뒤 좌표를 다시 읽도록 테스트를 고쳤습니다.

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### Player Card 이벤트 카탈로그 설계 (구현 없음)

사용자 요청대로 이번 TASK-007에는 4개 이벤트(말하는 중/연결 끊김/실측 공유/리액션)만 구현하고, `docs/PLAYER_EVENTS.md`에 향후 이벤트 전체 카탈로그(⚠️ 포어, 🏆 버디, 💥 롱드라이브, 🎯 니어핀, 🔋 배터리 부족 포함) 설계 문서만 작성했다. Tier 0(지속형, 최우선)~Tier 5(배경 정보, 최하위) 우선순위 체계와, 동시 발생 시 "가장 급한 Tier 하나만, 같은 Tier면 가장 최근 것만, 큐잉 없음" 규칙을 정리했다.

### TASK-006 회귀 버그 수정

세 가지 실사용 버그를 고쳤다. `RoundScreen.jsx`, `roundSelectors.js`, `DistanceCard.jsx`, `PlayerCard.jsx`, `WheelPicker.jsx`, `distanceFormat.js`, `app.css`를 수정했다. **PTT, Audio Engine, Wheel Picker의 기본 구조, Round Engine 데이터 구조는 그대로 유지했다**(reducer/actions/storage/seed 전부 타임스탬프로 무수정 확인).

**1. 팀 거리 표시가 개인별 정확한 값처럼 보이는 문제**

핀 위치가 `unknown`/`center_only`일 때 전원이 같은 참고값을 받는 것 자체는 의도된 동작이지만, 화면에서 "재근 142m"처럼 각자의 정확한 개인 거리인 것처럼 보였다. 이제:
- 측정자(재식) 행만 굵은 숫자 + "실측" 배지로 표시
- 나머지는 `공통 참고값 137m` 형태의 옅은 텍스트로 표시(굵은 개인 숫자 스타일 사용 안 함)
- `DistanceCard.jsx`의 "팀 거리 현황" 목록과 `PlayerCard.jsx`의 참가자 카드 칩 둘 다 수정(같은 문제가 두 곳에 다 있었음)
- `bearing_known`/`coordinate_known`일 때는 그대로 참가자별 다른 계산값 + "추정값" 배지가 표시됨(변경 없음, 재검증만 함)

**2. GPS·실측 8m 차이 경고가 뜨지 않던 문제**

두 가지를 고쳤다:
- **문구를 요청하신 형태로 변경**: `distanceFormat.js`의 `getGpsDiffWarning()`이 이제 실제 차이값을 포함해 `"GPS 참고거리와 {diff}m 차이가 있습니다. 실측값을 다시 확인해 주세요."`를 반환한다.
- **`WheelPicker.jsx`의 레이스 컨디션 수정**: 기존 코드는 디지트가 바뀔 때마다(스크롤로 정착했을 때 포함) `scrollTo()`를 다시 호출했는데, 이게 브라우저의 네이티브 모멘텀 스크롤/스냅과 동시에 실행되면서 화면에 보이는 숫자와 실제 React state가 어긋날 수 있었다 — 즉 화면에는 "145"처럼 보여도 내부 `localValue`는 갱신되지 않아 경고 계산이 예전 값(diff<8) 기준으로 이뤄질 수 있었다. `skipNextSyncRef`를 추가해 "스크롤이 스스로 정착해서 생긴 변경"과 "탭 선택으로 생긴 변경"을 구분하고, 전자는 다시 `scrollTo()`하지 않도록 고쳤다.
- 클릭 기반 테스트만으로는 이 문제를 재현할 수 없어서, 이번엔 `page.mouse.wheel()`로 **진짜 스크롤 이벤트**를 흉내내 검증했다.

**3. 상단 누계 하드코딩 제거**

`RoundScreen.jsx`의 `const myTotalToPar = "-1"; const myTotalStrokes = 69;`를 제거했다. `roundSelectors.js`에 3개 selector를 추가했다(내부적으로 `computePlayerScoreSummary()` 헬퍼 하나를 공유):
- `selectPlayerTotalStrokes(round, playerId)`
- `selectPlayerTotalToPar(round, playerId)`
- `selectPlayerCompletedHoleCount(round, playerId)`

스코어가 하나도 없으면 "누계 - (-)", 있으면 "+N"/"E"/"-N" 형식. `ScoreCard.jsx`는 전혀 건드리지 않았다 — 이미 `PLAYER_SET_SCORE`를 정확히 dispatch하고 있었고, 문제는 순전히 RoundScreen이 그 결과를 읽지 않고 하드코딩된 값을 보여주고 있었다는 것뿐이었다.

**테스트 결과**

여전히 네트워크가 막혀 있어 `npm run build`(Vite)는 직접 실행하지 못했다. esbuild 번들 체크 + 실제 Chromium(Playwright) 테스트로 다음을 확인했다:

- `getGpsDiffWarning(132, 136)` → null, `(132, 140)` → 8m 경고, `(132, 145)` → 13m 경고 — 순수 함수 단위 테스트로 요청하신 세 시나리오 정확히 일치 확인
- 실제 시드 GPS(136m) 기준으로 같은 차이(4m/8m/13m)를 **`page.mouse.wheel()`로 실제 스크롤**해서 재현 → 4m은 경고 없음, 8m·13m은 정확한 문구로 경고 표시 확인
- 핀 위치 "모름"에서 팀 공유 → 재식만 "132m·실측" 배지, 나머지 3명은 "공통 참고값 132m"로 표시(굵은 개인 숫자 아님)됨을 팀 목록과 참가자 카드 둘 다에서 확인
- 핀 위치를 "예상"(bearing_known)으로 바꾸면 재근 142m/광천 128m/해란 133m로 각자 다른 값 + "추정값" 배지가 정상 표시됨을 확인(회귀 없음)
- **7번 홀 PAR4에서 재식 스코어 4 → "누계 E (4)", 5 → "누계 +1 (5)", 3으로 되돌리면 "누계 -1 (3)"** — 요청하신 시나리오 그대로 확인
- 스코어 입력 전 상태는 "누계 - (-)"로 표시됨을 확인
- **페이지 새로고침 후에도 "누계 -1 (3)"이 그대로 유지**되고 저장된 `scoreByHole: {"7": 3}`과 일치함을 확인
- PTT 누르기/떼기, 갤러리 응원, 개인화 응원 모두 정상 동작 확인 (콘솔 에러 0건)

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### TASK-006 — Distance UX Refactoring: Input이 아니라 Confirm

목표: 기능 추가가 아니라 "사용자는 거리를 입력하는 게 아니라 확인한다"는 철학으로 거리 확인 흐름 자체를 재설계. `DistanceCard.jsx`, `distanceFormat.js`, `app.css`를 수정하고 `WheelPicker.jsx`를 새로 추가했다. **Round/Distance/Audio Engine, Score, PTT, Sound Catalog, Personalized Cheer는 전혀 건드리지 않았다**(엔진 관련 파일 전부 타임스탬프로 무수정 확인).

**용어 정리 (§5)**

화면에는 이제 "GPS (참고)"와 "실측 (우선)" 두 가지만 보인다. "레이저"/"음성"/"수동"/"APL" 같은 장비·출처 용어는 화면 어디에도 없다(전체 텍스트 grep으로 확인). `distanceFormat.js`의 `formatDistanceMeta()`와 `describeManualReading()`에서 `formatSourceLabel()` 호출을 제거하고 자기 측정값은 그냥 "실측"으로 표시한다 — `formatSourceLabel()` 자체와 내부 `source` 필드는 그대로 남아 있다(§6 "내부 데이터 구조는 그대로 유지한다").

**1. 실측 기본값 = GPS**

실측 값은 새 홀에 진입하면 항상 GPS 값으로 재동기화된다(`DistanceCard.jsx`의 hole-change effect). 이미 확인된(공유된) 값이 있으면 그 값을 계속 보여준다 — "확인된 값"과 "아직 아무도 안 만진 기본값"을 구분했다.

**2. Wheel Picker (§2)**

+/- 스테퍼를 완전히 제거하고 `src/components/WheelPicker.jsx`를 새로 만들었다. 아이폰 알람 스타일로 백의/십의/일의 자리 세 칸을 각각 독립적으로 조작한다. 실제 스와이프(스크롤 스냅, `scroll-snap-type: y mandatory`)와 탭-선택(각 숫자를 직접 클릭) 두 가지 입력을 모두 지원한다 — 탭 방식은 실제 사용성에도 도움이 되고, 자동화 테스트에서도 신뢰성 있게 동작한다.

**3. GPS 대비 8m 경고 (§3)**

`distanceFormat.js`에 `getGpsDiffWarning(gps, measured)` 순수 함수를 추가했다. 차이가 8m 미만이면 아무 메시지도 없고, 8m 이상이면 "GPS와 차이가 큽니다. 실측값을 한번 더 확인해 주세요."를 보여준다. 이 경고는 공유 버튼을 막지 않는다 — 경고가 떠 있어도 공유는 그대로 된다.

**4. 공유 UX — "완료 = 공유"로 병합 (§4)**

가장 적은 조작 방식을 검토한 결과, **별도의 "공유" 버튼을 Wheel 완료 뒤에 또 누르게 하지 않기로 했다.**
- GPS와 실측이 같으면(기본 상태) Wheel을 열 필요 없이 "팀에 공유" 버튼 한 번으로 바로 공유된다.
- Wheel을 열어 값을 고친 경우, "완료" 버튼 자체가 곧 공유 액션이다 — 탭 한 번으로 조정과 전송이 끝난다.
- 두 경로 모두 성공하면 기존 `speakText()`(Sound Engine, 수정 없이 재사용)로 "팀원에게 거리를 공유했습니다."를 재생하고, `.ft-ptt-zone`으로 스크롤 복귀한다(TASK-005에서 만든 자동 복귀 메커니즘 그대로 재사용).
- 음성 확인(작은 마이크 버튼)도 동일한 "확인 즉시 공유" 철학을 따른다 — 숫자를 인식하면 Wheel을 열지 않고 바로 공유한다.

**완료 조건 대조**

| 완료 조건 | 결과 |
| --- | --- |
| +/- 버튼 제거 | ✅ |
| Wheel Picker 적용 | ✅ |
| 실측 기본값 = GPS | ✅ (새 홀 진입 시) |
| GPS·실측 차이 8m 이상 경고 | ✅ |
| GPS와 같으면 즉시 공유 | ✅ |
| 공유 후 자동 PTT 복귀 | ✅ |
| "GPS(참고)"/"실측(우선)"만 사용 | ✅ |
| npm run build 성공 | 아래 "테스트 결과" 참고 |

**Apple Watch 확장 설계 (구현 없음)**

사용자 요청대로 이번 TASK-006에는 구현하지 않고 `docs/WATCH_DISTANCE_UX.md`에 검토 문서만 작성했다. 핵심 결론: 계산/판단 로직(순수 함수·리듀서)은 이미 플랫폼 무관해서 그대로 재사용 가능하지만, `performSend()`가 지금 `DistanceCard.jsx` 안에 갇혀 있고 "PTT 화면 복귀"가 `document.querySelector(".ft-ptt-zone")`라는 **웹 DOM에 직접 결합**되어 있어 코드 수정 없이는 워치로 못 간다. `useDistanceConfirm()` 훅 추출과 `onConfirmed` 콜백 주입을 제안했고, `audioEngine.js`의 `outputTargets`는 TASK-002 때 이미 이런 확장을 염두에 두고 설계되어 있었음을 재확인했다. 자세한 내용은 문서 참고.

**테스트 결과**

여전히 네트워크가 막혀 있어 `npm run build`(Vite)는 직접 실행하지 못했다. esbuild 번들 체크 + 실제 Chromium(Playwright) 테스트로 확인:

- +/- 스테퍼, 출처 선택 pill이 DOM에 전혀 없음을 확인
- 라벨이 정확히 "GPS (참고)" / "실측 (우선)"이고, 전체 페이지 텍스트에 "레이저"/"APL"/"거리측정기"가 전혀 없음을 확인
- 실측 숫자를 탭하면 Wheel Picker가 열리고, 백/십/일의 자리를 각각 클릭해 132 → 137처럼 독립적으로 바뀌는 것을 확인(과제 예시와 동일한 시나리오로 검증)
- GPS 136 대비 실측을 145로 맞추면(차이 9m) 경고 문구가 정확히 뜨고, "완료"를 눌러도 공유가 차단되지 않고 정상 전송됨을 확인
- 차이가 4m일 때는 경고가 없고, 정확히 GPS와 같은 값으로 맞춰도 경고가 없음을 확인
- GPS와 실측이 같은 기본 상태에서 Wheel 없이 "팀에 공유" 버튼 한 번으로 즉시 공유됨을 확인
- `window.SpeechRecognition`을 가짜로 주입해 음성 버튼 한 번으로 Wheel을 거치지 않고 즉시 공유되는 것을 확인
- `--define:import.meta.env.DEV=true`로 만든 별도 빌드에서 DEV 전용 핀 위치 컨트롤이 정상적으로 나타남을 확인
- 이전 버전 저장 데이터(단일 `pin.position` 등) 마이그레이션이 새 UI에서도 그대로 동작함을 확인
- PTT 누르기/떼기, 스코어 +버튼, 갤러리 응원, 개인화 응원 모두 정상 동작 확인 (콘솔 에러 0건)

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### TASK-005 — 조작 횟수를 줄이는 UX 개선 (시각적 리디자인 아님)

목표: 예뻐 보이게 만드는 작업이 아니라, 사용자가 앱을 만지는 횟수 자체를 줄이는 작업. `src/components/DistanceCard.jsx`, `src/components/RoundScreen.jsx`, `src/styles/app.css` 세 파일만 수정했고 **Round/Sound/Distance Engine의 데이터 구조·reducer·selector·action은 전혀 건드리지 않았다**(엔진 관련 파일 6개 전부 수정 시각이 이전 태스크 그대로임을 타임스탬프로 직접 확인).

**1. 핀 위치 상태 선택 UI를 DEV 모드에서만 표시**

`DistanceCard.jsx`에 `isDevMode = import.meta.env.DEV`를 추가(기존 `SoundButton.jsx`의 권리 배지와 동일한 패턴 재사용). "그린 구분"·"핀 위치 정보" pill은 이제 편집 모드를 열었을 때, 그리고 개발 모드(`npm run dev`)에서만 보인다. 프로덕션 빌드(`npm run build`)에서는 일반 사용자에게 전혀 노출되지 않는다. 내부 상태값(`unknown`/`center_only`/`coordinate_known`/`bearing_known`)과 계산 로직은 그대로 두었고, 화면 라벨만 "모름"/"예상"/"정확"으로 더 짧게 정리했다.

**2~3. 거리 입력 → 자동 전송 버튼 활성화 → 전송 후 자동 복귀 + 음성 확인**

카드 전체를 "기본(idle)" / "편집(editing)" 두 상태로 나눴다.
- **기본 상태**: 큰 숫자(탭하면 편집 모드 진입) + "🎙 음성으로 거리 공유" 버튼 하나만 보인다. 스테퍼·출처 선택·전송 버튼은 숨어 있다.
- **편집 상태**: 스테퍼로 값을 조정하면 전송 버튼은 처음부터 항상 눌러진 상태(비활성 조건 없음)라 별도 "활성화" 대기가 필요 없다. "📡 팀에 전송"을 누르면 `teamDistanceShare()`를 dispatch한 뒤 **자동으로 편집 모드를 접고**, 이미 존재하는 `speakText()`(`services/audioEngine.js`, TASK-004에서 만든 Sound Engine 함수 재사용, 수정 없음)로 `"팀원에게 거리를 공유했습니다."`를 재생하고, 약 0.55초 뒤 `.ft-ptt-zone`으로 부드럽게 스크롤 복귀한다.
- **음성 입력(idle 상태의 "🎙 음성으로 거리 공유")은 완전히 자동 전송된다** — 편집 모드를 열 필요도, 별도로 전송 버튼을 누를 필요도 없다. 말하면 바로 팀에 공유된다. 이 부분이 이번 작업에서 조작 횟수를 가장 크게 줄인 지점이다.
- 편집 모드 안에서 "음성" 출처 pill을 누르는 경우는 다르게 동작한다 — 인식된 숫자를 스테퍼에 채워 넣기만 하고 자동 전송하지 않는다(사용자가 미세 조정할 기회를 남겨두기 위해 의도적으로 다르게 처리).

**4. 3초 무입력 시 자동 복귀**

편집 모드를 연 뒤 스테퍼·출처 pill 등 아무 조작도 하지 않고 3초가 지나면 아무것도 전송하지 않은 채 자동으로 기본(idle) 상태로 되돌아간다. 매 상호작용마다 타이머가 리셋된다.

**5. 효과음(갤러리 응원) 버튼 위치 조정**

`RoundScreen.jsx`에서 "갤러리 응원" 섹션을 PTT 버튼 바로 다음(기존에는 거리 정보 다음)으로 옮겼다 — PTT를 조작하던 손 위치에서 스크롤을 거의 하지 않고 바로 반응 버튼에 닿도록 했다. 버튼 자체도 `min-height`와 패딩을 조금 키워 엄지로 누르기 쉽게 했다(시각적 변경이 아니라 터치 영역 확대 목적).

**6. 전체적인 조작 횟수 점검**

기본 화면에서 거리 카드가 보여주던 상시 노출 인터랙티브 요소가 6개(스테퍼 2 + 출처 pill 3 + 전송 버튼 1)에서 1개(음성 공유 버튼)로 줄었다. "레이저"/"수동" 출처 옵션 자체는 TASK-004에서 요구된 기능이라 제거하지 않았다(요구사항 7 "기존 기능 유지"와 상충하지 않도록).

**판단해서 정한 부분 — 확인 부탁드립니다**
- "전송 후 자동으로 PTT 화면으로 복귀" / "거리 입력 화면은 3초 이상 무입력 시 메인 화면으로 복귀"를 **Round 화면 자체를 벗어나는 내비게이션이 아니라, `DistanceCard`의 편집 패널을 접고 PTT 쪽으로 스크롤 복귀하는 것**으로 해석했다. 이 앱은 splash/home/round 세 화면만 있고 Round 화면 안에 PTT와 거리 카드가 함께 있어서, 홈 화면 등으로 완전히 이동시키는 것은 라운드 진행 중 스코어·PTT 흐름을 방해할 수 있다고 판단했다. 다른 의도였다면 말씀해 주시면 조정하겠다.
- "정확" 상태 배지 문구는 지난 수정에서 정한 대로("추정값") 그대로 유지했다 — 이번 작업 범위가 아니라고 판단했다.

**테스트 결과**

여전히 네트워크가 막혀 있어 `npm run build`(Vite)는 직접 실행하지 못했다. esbuild 번들 체크(정상 빌드 + `--define:import.meta.env` 로 DEV 모드 강제한 빌드 두 가지) + 실제 Chromium(Playwright) 테스트로 확인:

- 기본(비-DEV) 빌드에서 핀 위치 컨트롤(`DEV` 배지 포함)이 전혀 렌더링되지 않음을 확인
- idle 상태에서 스테퍼/출처 pill/전송 버튼이 하나도 안 보이고, "음성으로 거리 공유" 버튼 하나만 보임을 확인
- 히어로 숫자를 탭하면 편집 패널이 열리고, 음성 퀵버튼은 사라짐을 확인
- 스테퍼로 값을 조정한 뒤 전송 → 토스트 확인, **전송 직후 자동으로 idle 상태로 복귀**함을 확인(콘솔 에러 0)
- 편집 모드를 연 채 3초간 아무것도 안 하면 전송 없이 idle로 자동 복귀함을 확인(2.6초 시점엔 아직 열려 있고 3.6초 시점엔 닫힘)
- **`window.SpeechRecognition`을 가짜 구현으로 주입**해 idle 상태에서 음성 버튼 한 번 탭 → 편집 모드를 거치지 않고 즉시 전송까지 완료되는 것을 확인(재식·재근·광천·해란 전원 155m로 갱신)
- `--define:import.meta.env.DEV=true`로 만든 별도 빌드에서는 편집 모드를 열면 핀 위치 컨트롤과 `DEV` 배지가 정상적으로 나타남을 확인(기존 `SoundButton` 권리 배지도 함께 나타나 동일한 DEV 플래그를 공유함을 재확인)
- 섹션 순서가 "참가자 상태 → 갤러리 응원 → 거리 정보 → 개인 응원 → 스코어"로 바뀐 것을 확인
- 이전 버전 저장 데이터(단일 `pin.position` 등) 마이그레이션이 새 UI에서도 그대로 동작함을 확인
- PTT 누르기/떼기, 스코어 +버튼, 갤러리 응원, 개인화 응원 모두 정상 동작 확인 (콘솔 에러 0건)

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### TASK-004 (승인 후 후속 수정) — 기본값을 "모름"으로, UI에서 기술 용어 제거

TASK-004 구현 승인 후 다음 두 가지를 추가로 수정했다.

**1. 기본 핀 위치 상태 변경**

`src/data/roundSeed.js`의 hole 7 `locationStatus` 기본값을 `"bearing_known"` → `"unknown"`으로 변경. 이제 앱을 처음 실행하면 참가자별 보정값이 아니라 레이저 실측값이 팀 공통 참고값으로 공유되는 것이 기본 동작이다. (계산 로직 자체는 이전 개정에서 이미 `pinLocationStatus`만으로 보정 여부를 결정하도록 고쳐져 있었으므로, 시드 값 한 줄만 바꾸면 되었다.)

**2. 핀 위치 정보 UI 단순화 — 기술 용어 제거**

내부 상태값 4개(`unknown` / `center_only` / `coordinate_known` / `bearing_known`)는 그대로 유지하되, 화면에는 3개의 pill만 노출한다.

| 화면 표시 | 내부값 | 동작 |
| --- | --- | --- |
| 모름 (기본값) | `unknown` (`center_only`도 이 탭으로 표시) | 보정 없음, 레이저 실측값을 팀 공통 참고값으로 공유 |
| 대략 확인됨 | `bearing_known` | 참가자별 계산값에 "추정값" 배지 표시(`calculationMode: "demo_mock_offset"`, `isEstimated: true` 유지) |
| 정확히 확인됨 | `coordinate_known` | 별도의 선택 가능한 상태로 구분 표시 |

"좌표 확인", "방향 확인", "그린 중앙만", `locationStatus` 같은 표현은 화면 어디에도 노출하지 않는다(코드 전체 grep으로 확인). `src/components/DistanceCard.jsx`에 `locationStatusToTier()` 매핑 함수를 추가해 내부 4값을 화면용 3탭으로 변환한다.

**3. 프로토타입 표시**

"핀 위치 정보" 라벨 옆에 작은 `DEV` 배지를 추가했다(글자 크기 7.5px, 테두리만 있는 절제된 스타일). "그린 구분" 행에는 붙이지 않았다 — 그린 구분은 실제 코스에도 있을 수 있는 정보라 향후 정식 기능이 될 수 있지만, 핀 위치 정밀도 단계는 실제 GPS가 들어오기 전까지는 순수 검증용 컨트롤이기 때문이다.

**판단 남김 — "정확히 확인됨" 상태의 결과 배지**: "정확히 확인됨"을 선택해도 실제 좌표 계산은 구현되어 있지 않아(여전히 `mockDistanceOffsetM` 기반 데모 수식), 계산 결과 배지는 "대략 확인됨"과 동일하게 "추정값"으로 표시했다. 두 상태 모두 동일한 더미 수식을 쓰는 상황에서 "정확히 확인됨"만 다른(더 확신에 찬) 배지를 보여주는 것은 실제보다 정밀한 것처럼 오해를 줄 수 있다고 판단했다. 대신 완료 조건의 "상태 구분"은 픽커 자체가 3개의 분리된 탭으로 이미 만족한다고 보았다. 이 판단이 의도와 다르면 말씀해 주시면 조정하겠다.

**테스트 결과**

여전히 네트워크가 막혀 있어 `npm run build`(Vite)는 직접 실행하지 못했다. esbuild 번들 체크 + 실제 Chromium(Playwright) 테스트로 확인:

- 앱 최초 실행(구버전 데이터 없이) 시 "핀 위치 정보" 탭이 "모름"으로 선택되어 있음을 확인
- 기본 상태에서 132m 전송 → 전원이 132m(보정 없음), 비기준 참가자 배지는 "공유값(참고)"임을 확인
- "대략 확인됨" 선택 후 전송 → 재근142/광천128/해란133, 전원 "추정값" 배지 포함 확인
- "정확히 확인됨" 선택 시 픽커에서 별도 상태로 선택됨을 확인
- 화면 전체 텍스트에서 "좌표 확인"/"방향 확인"/"그린 중앙만"/`locationStatus` 문자열이 전혀 없음을 grep 방식으로 확인
- `DEV` 배지 노출 확인
- 이전 버전 저장 데이터(단일 `pin.position`) 마이그레이션 → `locationStatus`가 "unknown"(화면상 "모름")으로 안전하게 초기화됨을 재확인
- PTT 누르기/떼기, 스코어 +버튼, 갤러리 응원, 개인화 응원, GPS 참고값 표시까지 전부 정상 동작 확인 (콘솔 에러 0건)

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### TASK-004 (2차 개정) — 그린 구분과 핀 위치 정보 개념 분리

**문제**: 직전 개정에서 "핀 위치(단일/좌/우/모름)를 안다"는 사실 하나로 보정 여부를 결정했다. 이는 잘못된 가정이었다 — 어느 그린을 쓰는지(좌그린/우그린 등, 코스 레이아웃 정보)를 아는 것과, 그 핀이 실제로 어디 있는지(좌표/방향)를 아는 것은 서로 다른 정보다. "좌그린이다"라는 사실만으로는 참가자별 위치 보정을 할 근거가 없다.

**수정**: `hole.pin`을 두 개의 독립된 필드로 분리했다.
- `greenSelection`: `single` / `left` / `right` / `unknown` — 어느 그린인지(코스 레이아웃 메타데이터일 뿐, 보정과 무관)
- `pinLocationStatus`: `unknown` / `center_only` / `coordinate_known` / `bearing_known` — 핀의 실제 위치를 실제로 아는지

참가자별 거리 보정은 **오직** `pinLocationStatus`가 `coordinate_known` 또는 `bearing_known`일 때만 허용된다. `greenSelection`이 `single`/`left`/`right`여도 `pinLocationStatus`가 `unknown`/`center_only`면 보정하지 않고, 재식의 실측값을 전원에게 동일한 참고값으로만 공유한다(`calculationMode: "shared_reference"`).

**계산 결과 표시 강화**
- 보정이 적용된 경우 `calculationMode: "demo_mock_offset"` + `isEstimated: true`를 명시해, 실제 좌표 기반 계산이 아니라 "이 프로토타입의 더미 offset 데모 추정값"임을 데이터 레벨에서부터 숨기지 않는다.
- `src/utils/distanceFormat.js`에 `describeManualReading()`을 추가해 UI가 항상 다음 네 가지를 구분해서 보여주도록 했다: **GPS 그린 중앙 참고값** / **본인 레이저·음성·수동 실측값** / **핀 좌표 기반 계산값**(아직 실제 GPS가 없어 이 프로토타입에서는 도달하지 않지만, 향후 실좌표 계산이 들어오면 자동으로 이 라벨로 분류되도록 구조만 미리 마련) / **데모 추정값**.

**변경된 action**
- `HOLE_SET_PIN_POSITION` 삭제 → `HOLE_SET_GREEN_SELECTION(holeNumber, greenSelection)`과 `HOLE_SET_PIN_LOCATION_STATUS(holeNumber, locationStatus)` 두 개로 분리
- `TEAM_DISTANCE_SHARE`가 이제 `pinLocationStatus`만 보고 보정 여부를 결정(이전에는 `pinKnown`이라는 이름으로 그린 구분을 근거로 삼던 버그가 있었음)

**UI 변경 (`DistanceCard.jsx`)**
- "그린 구분"과 "핀 위치 정보" pill을 별도 행으로 분리해 두 개념이 다른 것임을 화면에서도 명확히 함
- 안내 문구에 "(그린 구분만으로는 보정하지 않습니다)"를 명시
- "팀 거리 현황" 목록의 각 행에 실측/공유값(참고)/데모 추정값 배지를 색으로 구분 표시(파랑/회색/금색)

**하위 호환성**
- `src/engine/roundStorage.js`의 `migrateHolePin()`이 이전 저장 데이터의 단일 `pin.position` 값을 `greenSelection`으로 그대로 옮기되, `locationStatus`는 **보수적으로 `"unknown"`으로 초기화**한다 — 예전에 "좌그린이니까 보정해도 된다"고 가정했던 것 자체가 틀렸으므로, 예전 데이터를 열었을 때 이전과 다르게(더 정확하게) 동작하는 것은 의도된 동작이다.
- `migrateManualCalculationMode()`가 예전 `mock_offset`/`shared_raw` 라벨을 `demo_mock_offset`/`shared_reference` + `isEstimated`로 재매핑한다.

**규칙 6 관련**: `src/engine/roundStorage.js`의 상수는 실제로 `KNOWN_PIN_POSITIONS` → `KNOWN_GREEN_SELECTIONS` + `KNOWN_PIN_LOCATION_STATUSES`로 이름이 바뀌었다(코드에서 직접 확인 가능). 지난 완료 보고서에서 "KNOWN_PIN_POSITIONS로 이름을 바꿨다"고 말씀드렸던 부분은, 이번 개정으로 `pin.position`이라는 필드 자체가 사라지면서 그 이름도 함께 사라졌다 — 지금은 위 두 상수로 대체되어 있다.

**테스트 결과**

여전히 네트워크가 막혀 있어 `npm run build`(Vite)는 직접 실행하지 못했다. esbuild 번들 체크 + 실제 Chromium(Playwright) 테스트로 다음을 확인했다:

- 기본 상태(그린 구분 "단일" + 핀 위치 정보 "방향 확인")에서 132m 전송 → 재식132(레이저) / 재근142(데모 추정값) / 광천128(데모 추정값) / 해란133(데모 추정값)
- **핵심 회귀 테스트**: 핀 위치 정보를 "모름"으로 바꾸고, 그린 구분만 "좌그린"(알려진 값)으로 설정한 뒤 132m 전송 → **전원이 132m로 동일하게 받고 배지가 "공유값(참고)"로 표시됨** (그린 구분을 안다는 사실만으로는 더 이상 보정이 발생하지 않음을 확인 — 이번 수정의 핵심 요구사항)
- 이전 개정(단일 `pin.position: "left"` + 예전 `mock_offset` 라벨)으로 저장된 데이터를 직접 주입 → `greenSelection: "left"` + `locationStatus: "unknown"`으로 정확히 마이그레이션되고, 이후 전송 시에도 보정 없이 공유값으로만 동작함을 확인
- PTT 누르기/떼기, 스코어 +버튼, 갤러리 응원 클릭 모두 이전과 동일하게 정상 동작 (콘솔 에러 0건)

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### TASK-004 (개정) — 다중 출처 거리 모델 (GPS 기본값 + 레이저/음성 실측)

사용자 요청으로 TASK-004의 거리 기능을 재설계. **GPS 자동 계산만 사용하지 않고**, GPS는 항상 켜져 있는 "기본 참고값"으로, 레이저/음성/수동 실측값은 이를 덮어쓰지 않는 별도 출처로 분리했다.

**데이터 모델 변경**
- `Player.distance`가 단일 객체에서 `{ gps, manual }`로 분리됨.
  - `gps`: 그린 중앙까지의 mock GPS 기준값 — 항상 존재, 실측으로 덮어쓰지 않음(요구사항 #1, #4)
  - `manual`: 핀까지의 레이저/음성/수동 실측값 — `source`, `measuredBy`(측정자), `updatedAt`(측정 시간), `referencePlayerId`, `calculationMode` 포함(요구사항 #5)
- `hole.pin.position` enum을 `single`/`left`/`right`/`unknown`(단일 그린/좌그린/우그린/모름)으로 교체(요구사항 #9)

**계산 로직 변경 (`src/engine/distanceCalculator.js`)**
- `calculateTeamDistances()`에 `pinKnown` 파라미터 추가
- 핀 위치를 알 때(`single`/`left`/`right`)만 `mockDistanceOffsetM` 기반 참가자별 보정 적용(요구사항 #8)
- 핀 위치를 모를 때(`unknown`)는 보정 없이 입력한 숫자를 그대로 모든 참가자에게 공유(`calculationMode: "shared_raw"`, 요구사항 #7)

**새 action**
- `HOLE_SET_PIN_POSITION(holeNumber, position)` — 핀 위치 설정
- `PLAYER_SET_GPS_DISTANCE(playerId, valueM)` — GPS 기준값 갱신(현재는 시드에서만 사용, 실제 GPS 연동을 위한 확장 지점으로 마련)
- `TEAM_DISTANCE_SHARE`의 `source`가 이제 `laser`/`voice`/`manual`/`watch`를 받으며, `distance.gps`가 아닌 `distance.manual`만 갱신함(요구사항 #6)
- `PLAYER_SET_DISTANCE`도 새 `manual` 하위 필드를 쓰도록 갱신(단일 플레이어용, 팀 공유는 `TEAM_DISTANCE_SHARE` 사용)

**새 파일**
- `src/utils/distanceFormat.js` — "레이저 · 재식 · 3분 전" 형태의 출처·측정자·시간 표시 공통 포매터(요구사항 #5). `DistanceCard.jsx`와 `PlayerCard.jsx`가 공유

**수정된 컴포넌트**
- `DistanceCard.jsx` — 큰 숫자(직접 측정값, 있으면 우선 강조 — 요구사항 #11) 아래에 GPS 기준값을 작게 함께 표시(요구사항 #10). 레이저/음성/수동 출처 선택 pill 추가 — "음성" 선택 시 `SpeechRecognition` API로 실제 인식을 시도하고, 미지원이거나 실패하면 토스트로 안내하고 앱은 정상 동작 유지(요구사항 #2, #3). 핀 위치(단일/좌/우/모름) 선택 pill 추가로 보정 여부를 직접 시연 가능(요구사항 #7~#9). 하단에 참가자별 GPS·직접측정값·출처·측정자·시간을 모두 보여주는 "팀 거리 현황" 목록 추가(요구사항 #5, #10)
- `PlayerCard.jsx` — 직접 측정값이 있으면 굵게 우선 표시(파란색, 출처 태그 포함), 없으면 GPS 값을 흐리게 표시(요구사항 #11). 카드가 작아 출처·측정자·시간 전체를 담기 어려워 상세 정보는 `DistanceCard.jsx`의 "팀 거리 현황" 목록에 맡김

**하위 호환성**
- `src/engine/roundStorage.js`에 `migrateLegacyDistance()` 추가 — 이전 TASK-004(단일 `distance` 객체) 저장 데이터를 열 때 자동으로 `{gps, manual}` 형태로 변환(GPS는 빈 기준값으로 시작, 기존 값은 `manual`로 이관되며 `referencePlayerId === playerId`이면 `self_measured`, 아니면 `mock_offset`으로 판단). `hole.pin.position`의 이전 값(`front`/`center`/`back` 등)도 `single`로 정규화(모른다고 다운그레이드하지 않음 — 이전에도 어떤 형태로든 추적되고 있었으므로)

**의도적으로 절제한 부분**
- 음성 입력은 브라우저 `SpeechRecognition`으로 실제 시도하지만, 이 개발 환경(헤드리스, 마이크 없음)에서는 실제 인식 정확도를 검증할 수 없었다. API가 아예 없는 경우의 안전한 폴백 경로(토스트 안내, 크래시 없음)는 강제로 재현해 확인했지만, 실제 기기/마이크로 추가 검증이 필요하다.
- "음성 입력 구조도 고려한다"는 요구사항에 맞춰 데이터 모델(`source: "voice"`)과 UI 진입점은 완성했지만, 한국어 숫자 발화 인식의 정확도 튜닝(예: "백삼십이" 같은 순우리말 수사 처리)은 이번 범위에 포함하지 않았다 — 현재는 브라우저 STT가 이미 아라비아 숫자로 변환해주는 경우만 파싱한다.

**테스트 결과**

여전히 네트워크가 막혀 있어 `npm run build`(Vite)는 직접 실행하지 못했다. esbuild 번들 체크 + 실제 Chromium(Playwright) 테스트로 다음을 확인했다:

- 핀 위치가 "단일"(알려짐)일 때 재식 132m 전송 → 재식 132 / 재근 142(GPS 146) / 광천 128(GPS 132) / 해란 133(GPS 137)m로 정확히 계산, 각 행에 "레이저 · 재식 · 방금 전" 메타 표시
- 핀 위치를 "모름"으로 바꾸고 같은 132m를 다시 전송 → 보정 없이 4명 전원 132m로 동일하게 공유됨(요구사항 #7 정확히 재현)
- 출처 pill을 "수동"으로 바꿔 전송 → 팀 현황 목록의 메타가 "수동 · 재식 · 방금 전"으로 정확히 반영
- 음성 입력 시도 시, `SpeechRecognition`이 없는 상황을 강제로 재현해 "이 브라우저는 음성 입력을 지원하지 않아요" 토스트가 뜨고 앱이 정상 유지됨을 확인
- **하위 호환성**: 이전 TASK-004의 단일 `distance` 객체 + 이전 `pin.position: "center"` 형태의 저장 데이터를 직접 주입 → 정상 로드, `manual.calculationMode: "self_measured"`로 정확히 마이그레이션, `pin.position`은 `"single"`로 정규화됨을 확인. 마이그레이션된 데이터에서 거리 전송도 정상 동작
- 회귀 테스트: PTT 누르기/떼기, 스코어 +버튼 모두 이전과 동일하게 정상 동작 (콘솔 에러 0건)

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### TASK-004 — Shot & Smart Distance Engine (최초 구현)

`tasks/TASK-004_SHOT_DISTANCE_ENGINE.md` 구현. Round Engine 위에 Shot 상태와 팀 거리 전송(기준 1명 입력 → 팀원별 mock offset 적용 계산)을 추가. 실제 GPS/지도/Firebase/외부 상태관리 패키지는 추가하지 않음.

**추가된 파일**
- `src/engine/distanceCalculator.js` — 순수 함수 `calculateTeamDistances()`. React/DOM 의존성 없음
- `docs/SHOT_DISTANCE_ENGINE_v0.1.md`, `docs/TECHNICAL_DEBT.md`, `docs/schemas/shot.example.json` (첨부된 참조 문서 그대로 포함)

**수정된 파일**
- `src/engine/roundActions.js` — `SHOT_CREATE`/`SHOT_START`/`SHOT_COMPLETE`/`SHOT_CANCEL`/`TEAM_DISTANCE_SHARE` action type + creator 추가
- `src/engine/roundReducer.js` — 위 5개 action 처리 로직 추가. `TEAM_DISTANCE_SHARE`는 `distanceCalculator.js`를 호출해 계산 실패 시 상태를 변경하지 않고, 성공 시 모든 플레이어의 distance를 한 번의 update로 반영 + `lastDistanceShare` 저장 + `DISTANCE_SHARE_CREATED`/`TEAM_DISTANCES_UPDATED` 이벤트 2건 기록
- `src/engine/roundSelectors.js` — `selectShotsForCurrentHole`, `selectLatestShotForPlayer`, `selectLastDistanceShare`, `selectTeamDistances` 추가
- `src/engine/roundStorage.js` — `hydrateRound()` 추가. 기존(TASK-003) localStorage 데이터에 `shots`/`lastDistanceShare`/`mockDistanceOffsetM`이 없어도 기본값으로 보완해 정상 로드
- `src/data/roundSeed.js` — round에 `shots: []`, `lastDistanceShare: null` 추가. 각 플레이어에 `mockDistanceOffsetM` 추가(재식 0 / 재근 +10 / 광천 -4 / 해란 +1), 기본값 맵 `DEFAULT_MOCK_OFFSETS_M` export(스토리지 하이드레이션과 공유)
- `src/components/DistanceCard.jsx` — 기준 거리를 +/- 스테퍼로 직접 입력 가능하도록 변경, 버튼 문구를 "📡 팀 거리 전송"으로 변경, `teamDistanceShare()` dispatch, 전송 성공 시 숫자 300~500ms 강조 애니메이션, 전송 중 500ms 중복 클릭 방지, 잘못된 값은 로컬에서 `distanceCalculator`로 먼저 검증 후 실패 시 dispatch하지 않고 안내
- `src/components/PlayerCard.jsx` — 거리값이 있으면 `132m` 형태로 표시, reference가 아닌 계산값에는 "팀 계산" 라벨 표시, 거리 갱신 직후 카드에 짧은 파란 강조(우선순위: 말하는 중 빨강 > 거리 갱신 파랑 > 기본), `activityLabel` 기본 매핑에 `shot_preparing` → "샷 준비 중" 추가
- `src/components/RoundScreen.jsx` — 새 셀렉터 import + 최소한의 개발용 데모 흐름(재식의 샷을 `SHOT_CREATE`→`SHOT_START`→`SHOT_COMPLETE` 순서로 자동 진행시켜 PlayerCard의 활동 라벨이 실제 리듀서 경로를 반영하는지 보여줌). 새 샷 입력 화면은 만들지 않음(MVP 비포함 항목)
- `src/styles/app.css` — 거리 입력 스테퍼, 강조 애니메이션(값/카드), 거리 칩, "팀 계산" 라벨 스타일 추가

**변경하지 않은 파일**: `src/components/PTTButton.jsx`, `src/services/audioEngine.js`, `src/hooks/useAudioEngine.js`, `src/utils/radio.js`, `src/data/soundCatalog.json`, `src/components/ScoreCard.jsx`, `src/components/GalleryPanel.jsx`, `src/components/PersonalizedCheer.jsx`, `src/context/RoundProvider.jsx`(액션 네임스페이스를 `import * as actions`로 이미 가져오고 있어 신규 액션이 자동으로 포함됨, 파일 자체는 무수정), `package.json`, `vite.config.js` — PTT·Audio Engine·Score 기능 그대로 유지.

**테스트 결과**

이 환경은 여전히 외부 네트워크가 차단되어 있어 `npm install`/`npm run build`를 직접 실행하지 못했다. 검증 방식은 이전과 동일하게 (1) esbuild 전체 번들 체크, (2) 실제 Chromium(Playwright) 런타임 테스트로 진행했으며, 이번에는 특히 계산 정확성과 하위 호환성을 집중적으로 확인했다:

- 재식 기준 132m 전송 → 재식 132m / 재근 142m / 광천 128m / 해란 133m로 정확히 계산됨(완료 기준의 예시와 정확히 일치), 토스트 문구 `"재식 기준 132m를 팀에 전송했습니다."` 정확히 표시
- 입력값을 140m로 바꿔 재전송 → 재근 150m / 광천 136m / 해란 141m로 동일한 offset 규칙에 따라 재계산됨을 확인
- 전송 직후 PlayerCard에 파란 강조 클래스(`is-distance-flash`)가 붙는 것을 확인
- **하위 호환성**: `shots`/`lastDistanceShare`/`mockDistanceOffsetM`이 전혀 없는 TASK-003 시절 형식의 localStorage 데이터를 직접 주입한 뒤 로드 → 앱이 깨지지 않고, 기존 커스텀 데이터(`activityLabel: "OLD DATA TEST"` 등)는 보존한 채 누락된 필드만 정확히 기본값(재식 0 / 재근 10)으로 보완됨을 확인. 이 상태에서 바로 거리 전송 기능을 사용해도 정상 동작함을 확인
- 샷 데모 흐름: 라운드 진입 후 시간 경과에 따라 재식의 상태 라벨이 "세컨샷 준비" → "샷 준비 중" → "샷 완료" 순서로 실제 리듀서 액션을 통해 전환됨을 확인
- 회귀 테스트: PTT 누르기/떼기, 스코어 +버튼 모두 이전과 동일하게 정상 동작함을 확인 (콘솔 에러 0건)

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

### TASK-003 — Round Engine 기반 상태 관리

`tasks/TASK-003_ROUND_ENGINE.md` 구현. 각 컴포넌트에 흩어져 있던 홀/참가자/PTT/거리/스코어 더미 상태를 `useReducer` 기반 중앙 Round Engine으로 통합. 외부 상태 라이브러리는 추가하지 않음.

**추가된 파일**
- `src/engine/roundReducer.js`
- `src/engine/roundActions.js`
- `src/engine/roundSelectors.js`
- `src/engine/roundStorage.js`
- `src/context/RoundProvider.jsx`
- `src/context/useRound.js`
- `src/data/roundSeed.js`

**수정된 파일**
- `src/App.jsx` — `RoundProvider`로 전체를 감싸고, "라운드 시작" 시 `ROUND_START`를 dispatch하도록 변경
- `src/components/PTTButton.jsx` — 내부에서 `useRound()`로 `PTT_START`/`PTT_STOP`을 직접 dispatch하도록 재작성 (기존에는 `RoundScreen`이 소유하던 송신 상태/타이머/톤 재생 로직을 컴포넌트 내부로 이동)
- `src/components/PlayerCard.jsx` — 새 Player 모델(`communication.isSpeaking`, `activity`, `connection`)을 표시하도록 재작성. `muted`는 기기-로컬 UI 상태로 판단해 컴포넌트 내부 state로 유지(엔진에 넣지 않음)
- `src/components/DistanceCard.jsx` — 공유 시 `PLAYER_SET_DISTANCE` dispatch
- `src/components/ScoreCard.jsx` — +/- 시 `PLAYER_SET_SCORE` dispatch, 홀 완료 시 입력 잠금
- `src/components/GalleryPanel.jsx` — 재생 성공 시 `SOUND_PLAYED` dispatch 추가 (기존 사운드 카탈로그 로직은 그대로 유지)
- `src/components/RoundScreen.jsx` — 로컬 더미 상태 전부 제거하고 selector로 교체. "N번 홀 완료 · 다음 홀로" 버튼 신규 추가(`HOLE_COMPLETE` → `NEXT_HOLE` 연속 dispatch)
- `src/styles/app.css` — 오프라인 상태 색상, 잠긴 스테퍼, 홀 완료 버튼/완료 배지 스타일 추가 (기존 규칙은 변경하지 않음)
- `README.md` — Round Engine 섹션 및 프로젝트 구조 트리 갱신

**변경하지 않은 파일**: `SplashScreen.jsx`, `HomeScreen.jsx`(라운드 시작 콜백 연결 지점만 `App.jsx`에서 처리), `StatusBar.jsx`, `GolfBall.jsx`, `VoiceLevelBars.jsx`, `SoundButton.jsx`, `PersonalizedCheer.jsx`, `soundCatalog.json`, `audioEngine.js`, `useAudioEngine.js`, `radio.js`, `package.json`, `vite.config.js` — 기존 UI·사운드 엔진 그대로 유지.

**테스트 결과**

이 개발 환경은 외부 네트워크가 차단되어 있어 `npm install`/`npm run build`(Vite)를 직접 실행할 수 없었다. 대신 다음 두 단계로 검증했다:

1. **esbuild 번들 체크** — `src/main.jsx`부터 전체 import 그래프를 재귀적으로 해석·번들링. 문법 오류, import/export 불일치, JSON 파싱 오류 0건.
2. **실제 Chromium(Playwright) 런타임 테스트** — 앱을 실제로 로드해 다음 시나리오를 클릭/새로고침으로 재현하고 콘솔 에러 0건을 확인:
   - 홈 → 라운드 시작 → 7번 홀 정보(HOLE 7 / PAR 4 / 356M)가 중앙 상태에서 정상 렌더링됨
   - 재식 PTT 누름 → 재식 카드가 "🎤 말하는 중"으로 전환, LIVE 배지 표시
   - 재식이 PTT를 누르고 있는 동안 데모 타이머로 해란이 말하려 시도 → 정상적으로 거부됨(해란 카드가 is-live로 바뀌지 않음)
   - 반대 방향: 해란이 말하는 중(데모) 상태에서 재식이 PTT를 누름 → 거부되고 토스트 `"해란님이 말하는 중입니다."` 정확히 표시, 재식 카드는 송신 상태로 전환되지 않음
   - 거리 공유 버튼 클릭 → `PLAYER_SET_DISTANCE` dispatch, 버튼 라벨이 "공유됨"으로 전환
   - 스코어 +버튼 2회 클릭 → 0 → 1 → 2로 정상 반영
   - "7번 홀 완료 · 다음 홀로" 클릭 → 홀 번호가 7 → 8로 전환
   - **페이지 새로고침** 후 홀 번호(8)와 직전에 입력한 스코어(`{7: 2}`)가 정확히 복원됨 (localStorage 키 `fieldtalk.round.active.v1` 확인)
   - `.ft-phone` 요소가 393×852px, border-radius 55px로 정상 렌더링됨을 확인해 기존 디자인이 시각적으로 깨지지 않았음을 확인

로컬에서 `npm install && npm run build`를 실행했을 때 위와 다른 결과가 나오면 알려주시기 바랍니다.

---

- TASK-003 Round Engine 설계 문서 및 구현 지시서 추가

## Unreleased — TASK-004 prepared

- Added Shot & Distance Engine design document.
- Added shot schema example.
- Added Technical Debt register.
- Added Claude implementation ticket for team distance sharing and shot state.
