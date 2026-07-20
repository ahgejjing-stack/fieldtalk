# Shot & Distance Engine v0.1

## 목적

FIELDTALK의 대표 기능인 **한 명의 기준 거리 입력을 팀원별 거리로 변환해 공유하는 흐름**을, 이후 GPS·워치·Firebase를 붙일 수 있는 데이터 구조로 만든다.

이 단계에서는 실제 GPS와 기상 API를 사용하지 않는다. 더미 좌표와 결정론적 계산으로 UX와 상태 흐름을 검증한다.

## 핵심 원칙

1. 샷과 거리 상태는 UI 컴포넌트가 직접 소유하지 않는다.
2. 모든 변경은 Round Engine action/reducer를 통과한다.
3. 거리 원본값과 계산값을 구분한다.
4. 수동 입력, GPS, 레이저, 워치 입력을 같은 인터페이스로 수용한다.
5. 계산 결과는 이벤트 로그에 남긴다.
6. 실제 위치 정보는 MVP 프로토타입 단계에서 저장하지 않는다.

## Shot 데이터 구조

```json
{
  "id": "shot_round_demo_001_h7_player_jaesik_001",
  "roundId": "round_demo_001",
  "holeNumber": 7,
  "playerId": "player_jaesik",
  "sequence": 1,
  "type": "approach",
  "status": "planned",
  "club": null,
  "ballPosition": {
    "latitude": null,
    "longitude": null,
    "source": "mock"
  },
  "target": {
    "type": "pin",
    "latitude": null,
    "longitude": null
  },
  "distanceToTargetM": 132,
  "createdAt": "ISO-8601",
  "completedAt": null
}
```

### shot.type
- tee
- approach
- recovery
- chip
- putt
- penalty
- unknown

### shot.status
- planned
- active
- completed
- cancelled

## Distance Share 데이터 구조

```json
{
  "id": "distance_share_001",
  "roundId": "round_demo_001",
  "holeNumber": 7,
  "referencePlayerId": "player_jaesik",
  "referenceDistanceM": 132,
  "source": "manual",
  "sharedAt": "ISO-8601",
  "results": [
    {
      "playerId": "player_jaesik",
      "distanceM": 132,
      "offsetM": 0,
      "calculationMode": "reference"
    },
    {
      "playerId": "player_jaegeun",
      "distanceM": 142,
      "offsetM": 10,
      "calculationMode": "mock_offset"
    }
  ]
}
```

## 프로토타입 계산 규칙

현재는 GPS가 없으므로 seed 데이터의 `mockDistanceOffsetM`을 사용한다.

- 재식: 0m
- 재근: +10m
- 광천: -4m
- 해란: +1m

예: 재식 기준 132m 전송 시
- 재식 132m
- 재근 142m
- 광천 128m
- 해란 133m

결과는 1~1000m 범위로 제한한다.

## 향후 실제 계산

실제 모바일 앱에서는 다음 입력을 사용한다.

- 기준 사용자의 볼 위치
- 각 팀원의 볼 위치
- 핀 위치
- 각 좌표와 핀 사이의 지오데식 거리

기준 사용자가 측정한 거리값은 핀 위치 또는 GPS 오차를 보정하는 기준값으로 사용할 수 있다. 정확한 보정 알고리즘은 실기기 필드 테스트 후 결정한다.

## 이벤트

- SHOT_CREATED
- SHOT_STARTED
- SHOT_COMPLETED
- SHOT_CANCELLED
- DISTANCE_SHARE_CREATED
- TEAM_DISTANCES_UPDATED

## MVP 비포함

- 실제 GPS 권한
- 지도
- 핀 좌표 자동 수집
- 클럽 추천
- 샷 자동 감지
- 바람 보정 거리
