# FIELDTALK Player State v0.1

## Player 모델

```js
{
  id: "player_jaesik",
  name: "재식",
  displayName: "재식",
  pronunciation: "이재식",
  role: "host", // host | member
  connection: "online", // online | reconnecting | offline
  activity: "ready", // ready | tee_ready | shot_complete | moving | putting | holed_out
  communication: {
    isSpeaking: false,
    speakingSince: null,
    lastSpokeAt: null
  },
  distance: {
    valueM: null,
    source: null, // manual | gps | shared
    updatedAt: null,
    referencePlayerId: null
  },
  scoreByHole: {},
  devices: {
    phoneConnected: true,
    headphonesConnected: false,
    watchConnected: true,
    watchType: "apple_watch",
    batteryPercent: 78
  },
  lastActivityAt: null
}
```

## 화면 표시 우선순위
한 참가자에게 여러 상태가 동시에 있을 때 다음 순서로 표시한다.

1. 말하는 중 — 빨간 테두리, `🎤 말하는 중`
2. 재연결 중/오프라인 — 주황/회색
3. 안전 경고 수신 — 빨간 경고
4. 거리 갱신 — 파란 강조
5. 응원 전송 — 노란 강조
6. 플레이 활동 — 티샷 완료, 퍼팅 준비 등
7. 대기 — 초록

## 제한
- 동시에 말하는 플레이어는 최대 1명이다.
- 스코어는 홀 완료 전까지 수정 가능하다.
- 거리 값은 0보다 크고 1000m 이하만 허용한다.
- 이름은 사운드 개인화에 쓰이므로 `displayName`과 `pronunciation`을 분리한다.
