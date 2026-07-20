# FIELDTALK Architecture v1.1
## Product Principle & Room/Round Refinement

이 문서는 `docs/ARCHITECTURE_v1.md`를 **대체하지 않고 보완**한다. v1에서 정의한 Entity·Lifecycle·Data Ownership·Offline 전략은 그대로 유효하고, 이 문서는 그 위에 v1에서 다루지 않았던 세 가지 — 제품 철학의 명시적 선언, Team/Companion 우선 흐름에 필요한 Entity 보완, Course/Hole 정정 정책 — 를 추가한다.

---

## 1. Product Principle

> **FIELDTALK는 골프 기능들의 집합이 아니다.**
> 함께 플레이할 팀이 준비되는 순간부터 라운드가 끝날 때까지, 한 Room 안에서 음성·거리·스코어·응원 정보를 공유하는 **Real-time Golf Team Platform**이다.

이 선언이 실제로 의미하는 것은 세 가지다.

1. **시작점이 코스가 아니라 팀이다.** 지금까지의 UX 작업(Player First, Target UX)이 전부 "플레이어 중심으로 화면을 구성한다"는 원칙 위에 있었던 것과 정확히 같은 방향 — 이번엔 그 원칙을 Pre-Round 단계까지 끌어올리는 것뿐이다. 코스 선택 화면을 먼저 만들지 않고 Room(사람)을 먼저 만든다.
2. **PTT는 여러 기능 중 하나가 아니라 이 플랫폼이 존재하는 이유다.** 거리·스코어·응원은 전부 "지금 같이 라운드를 도는 사람들과 정보를 공유"하기 위해 있고, 음성이 그 공유의 가장 즉각적인 형태다. 이 관점에서 §5(PTT)의 설계가 나머지 기능들의 설계 기준이 된다.
3. **핵심 구조는 5단계다**: `Home → Pre-Round Room → Playing Round → Post-Round → History`. v1의 Round Lifecycle(§2)은 이 중 "Playing Round" 내부를 다뤘고, 이번 문서(`PRE_ROUND_EXPERIENCE_v1.md`)는 "Pre-Round Room" 전체를, v1의 History(§1 Entity 목록)는 이미 있었지만 "Post-Round"라는 전이 단계는 이번에 처음 명시한다 — Round Complete와 History 저장 사이에 있는 짧은 정리 단계(스코어카드 확인, 마지막 응원 등)로, 지금은 별도 설계 없이 v1의 "Round Complete → History" 화살표에 뭉쳐 있던 부분이다. 이번 문서 범위 밖이라 이름만 정의해두고 세부 설계는 다음 Sprint로 미룬다.

---

## 2. Room ≠ Round (v1 재확인 + 보완)

v1 §1.2/§4에서 이미 이 구분을 세웠다. 이번엔 Founder가 승인한 원칙을 그대로 재확인하고, Room의 책임 범위를 v1보다 구체화한다 — v1을 쓸 때는 Room의 역할을 "초대·합류"로만 좁게 봤는데, 이번 요청(§4~§6)을 보면 Room이 실제로 담당해야 할 준비 작업이 더 많다.

| | Room | Round |
|---|---|---|
| 중심 | 사람과 연결 | 경기와 기록 |
| 시점 | START 이전, 준비 공간 | START 시점에 생성 |
| 참가자 변경 | 자유(입장·퇴장) | 확정(Snapshot 이후는 §6 정책 적용) |
| 코스/티/시작 홀 | 자유롭게 변경 가능 | Snapshot으로 고정, 이후 변경은 §6 B/C 정책 |
| PTT | 테스트만(실제 기록 없음) | VoiceEvent로 기록됨 |
| 담당 작업(v1.1 추가) | 동반자 초대, PTT/기기 테스트, 골프장 감지, 코스·티·시작 홀 확인 | Distance, Score, Wind, PTT Event, Cheer 기록 |

**v1과 달라진 점**: v1은 Room의 상태를 `forming → ready → in_round → closed` 4단계로만 나눴다(v1 §4.2). 이번 Pre-Round 설계에서는 `forming` 안에 **동반자 초대, PTT 테스트, 골프장 감지, 코스/티 확인**이라는 4개의 하위 작업이 있고, 이들은 순서가 고정돼 있지 않다(예: 로비에서 팀부터 모으고 나중에 코스를 확정하는 흐름 — §3 Team First). Room의 상태 모델 자체를 더 세분화하기보다는, **Room이 "몇 가지 준비 항목의 완료 여부를 들고 있는 컨테이너"**라는 관점으로 보완한다 — 자세한 설계는 `PRE_ROUND_EXPERIENCE_v1.md` §1.

---

## 3. Entity 보완 (Team / Companion First)

v1은 User를 "로그인된 사람"으로만 정의하고 세부 속성을 남겨뒀다. 이번에 그 부분을 채운다. **원칙: Entity는 필요해서 추가하는 것이지, 있으면 좋을 것 같아서 추가하는 게 아니다.** 아래 표의 "MVP" 열이 그 판단 결과다.

| Entity | MVP | 이유 |
|---|---|---|
| **UserProfile** | ✅ 필요 | 지금 `player.name`/`cheerName`/`voiceGender`가 Round마다 하드코딩돼 있는 것(감사 결과)의 정식 대체. Round를 넘나드는 정체성이 없으면 "최근 동반자" 자체가 성립하지 않는다 — Team First 흐름의 전제 조건. |
| **RecentCompanion** | ✅ 필요(MVP는 이것만) | §3.1에서 상세 |
| **Friend** | ❌ 후순위 | §3.1에서 상세 |
| **Team** | ✅ 필요(단, 최소 기능) | 초대 우선순위 2번(§3 요청)에 명시적으로 들어감 — 후순위로 미루면 그 우선순위 자체가 깨짐. 다만 "팀 관리"(관리자, 초대 승인 등) 없이 "이름 붙은 저장된 동반자 묶음" 수준으로 최소화. |
| **Device** | ✅ 필요(Phone만 우선) | §4(PTT Test)가 "스피커/이어폰/워치 연결 상태"를 요구하므로 최소한의 오디오 출력 경로 정보 없이는 그 화면 자체가 불가능. Watch/Earbuds 세부 연동은 후순위, Phone 기준 오디오 출력 경로 판별만 MVP. |
| **AI Assistant** | ❌ Entity 아님 | §3.4에서 상세 |
| **Statistics** | ❌ Entity 아님(파생 데이터) | §3.5에서 상세 |

### 3.1 Friend vs RecentCompanion

**RecentCompanion**은 Entity라기보다 **History에서 계산되는 파생 목록**에 가깝다 — "나와 함께 Round를 뛴 적 있는 User들, 최근 순 정렬"이다. 별도의 "추가/삭제" 액션이 필요 없다(내가 누구와 라운드를 했는지가 이미 그 목록을 만든다). 초대 우선순위 1번("최근 동반자 원터치 초대")이 정확히 이 개념이다.

**Friend**는 다르다 — 상호 동의(요청→수락)가 필요한 정식 관계이고, "함께 라운드를 한 적 없어도 친구로 등록"이 가능해야 의미가 있다. 이건 소셜 그래프 기능이고, 지금 MVP가 요구하는 "빠른 재초대"에는 RecentCompanion만으로 충분하다.

**판단**: MVP는 RecentCompanion만 만든다. Friend는 나중에 추가해도 RecentCompanion을 대체하거나 망가뜨리지 않는다 — Friend는 "직접 추가한 관계", RecentCompanion은 "자동 계산된 이력"으로 서로 다른 데이터라, 나중에 Friend를 얹어도 구조적 충돌이 없다.

```
RecentCompanion (파생, 저장 안 함 — 매번 History에서 계산)
  = SELECT DISTINCT otherUserId, MAX(round.completedAt)
    FROM History WHERE participantIds CONTAINS myUserId
    GROUP BY otherUserId ORDER BY MAX(round.completedAt) DESC
```

### 3.2 Team

```
Team { id, name, ownerId, memberUserIds[], lastUsedAt }
```

"자주 함께 플레이하는 사용자 묶음"이라는 정의 그대로, Room 생성 시 "이 Team 전원 초대"를 원터치로 가능하게 하는 게 유일한 역할이다. `lastUsedAt`은 §3에서 요청한 "저장된 Team 선택"이 최근 쓴 팀을 상단에 보여줄 수 있게 하는 용도. 팀 내 역할(팀장 등)은 MVP에 넣지 않는다 — Room의 Host와 Team의 소유자가 다를 수 있고(A가 만든 Team으로 B가 Room을 열 수도 있음), 이 둘을 얽으면 복잡도만 늘어난다.

### 3.3 Device

```
Device {
  id, userId, type: "phone" | "watch" | "earbuds",
  platform: "ios" | "android" | "watchos" | "wearos",
  connectionStatus: "connected" | "disconnected",
  audioOutputPath: "speaker" | "earbuds" | "watch",
  notificationCapable, vibrationCapable
}
```

MVP는 `type: "phone"`과 `audioOutputPath`(스피커냐 이어폰이냐)만 실질적으로 필요하다 — §4 PTT Test 화면의 "스피커/이어폰 연결 상태"가 이 필드 하나로 충족된다. Watch/Earbuds를 별도 Device로 등록하고 관리하는 건 MVP 이후(§8 확장성, v1에서 이미 "Watch는 데이터 계층 재사용으로 가능"이라 판단한 것과 이어짐 — Device Entity가 그 판단을 뒷받침하는 최소 구조다).

### 3.4 AI Assistant — Entity 아님

당장 구현하지 않는다는 전제는 그대로 두고, **구조적으로도 Entity가 아니라 Service로 두는 게 맞다**고 판단한다. 이유:

- Entity는 "누가 소유하고 어떤 상태를 갖는가"가 있어야 하는데, AI Assistant는 상태를 갖지 않는다 — Round/History 데이터를 **읽어서** 조언을 만들어내는 소비자일 뿐이다.
- Entity로 만들면 "AI Assistant가 무언가를 소유한다"는 잘못된 관계가 생긴다. 반대로 Service로 두면 "Round Data → AI Service → 조언(읽기 전용 출력)"이라는 단방향 흐름이 명확해진다.
- v1 §8에서 이미 "AI Caddie는 Course Data(§3)가 실 좌표 기반이 된 이후에만 의미 있다"고 판단했다 — 그 전제가 갖춰지기 전까지는 Entity를 미리 만들어둘 이유도 없다.

### 3.5 Statistics — Entity 아님, 파생 데이터

Statistics를 User나 별도 테이블에 저장하면 "raw 데이터(History)와 집계 데이터(Statistics)가 어긋날 수 있다"는 위험이 생긴다(스코어를 나중에 수정하면 Statistics도 같이 갱신해야 하는데, 그 동기화를 놓치는 경우). v1 §6(Data Ownership)의 원칙("Server가 소유, 최종값 보존")과 같은 논리로, Statistics는 **History에서 매번 계산하는 파생 뷰**로 두는 걸 제안한다 — 저장하지 않고 필요할 때 History를 집계. 트래픽이 문제가 되면 그때 캐시(§6의 "Cache" 카테고리)를 얹으면 되고, 이건 나중에 성능 문제로 판단할 사안이지 지금 설계 단계에서 미리 걱정할 사안은 아니다.

---

## 4. Course Lock / 정정 정책

§6(Course Lock/Start Lock) 요청의 A/B/C 구분을 그대로 채택하고, 각 단계의 정확한 경계와 기록 방식을 정의한다.

### A. Round 시작 전 (Room 단계)
자유롭게 변경 가능. Round가 아직 생성되지 않았으므로 "정정"이라는 개념 자체가 없다 — 그냥 값이 바뀌는 것뿐. 기록 불필요.

### B. 첫 홀 플레이 이전 정정
**경계**: Round는 이미 생성됐지만(`Round.status = playing`), 첫 홀에서 Distance/Score/PTT Event/Cheer 중 **단 하나도 기록되지 않은 시점**까지.

- Host만 정정 가능.
- `Round.courseSnapshot`을 직접 덮어쓴다(별도 브랜치 유지 안 함 — 아직 아무 기록도 그 스냅샷에 의존하고 있지 않으므로 안전).
- 대신 `round.events`에 `SNAPSHOT_CORRECTED` 이벤트를 남긴다: `{ before: {...}, after: {...}, correctedBy: hostId, at }`. — 이미 있는 append-only 이벤트 로그(`round.events`)에 새 타입 하나 추가하는 것뿐, 구조 변경 없음.

### C. 플레이 중 코스/홀 전환
**경계**: 첫 홀에 기록이 하나라도 생긴 이후.

두 가지를 반드시 구분해서 기록한다:

- **정상 전환** (`COURSE_TRANSITION`): 9홀 완료 후 다음 코스 진입처럼, 원래 계획된 흐름. 지금까지의 기록은 그대로 두고 Round가 그냥 다음 코스/홀로 넘어간다.
- **정정** (`HOLE_CORRECTED` / `COURSE_CORRECTED`): "3번 홀로 표시돼 있었는데 실제로는 5번 홀이었다"처럼 잘못된 상태를 바로잡는 경우. 이미 기록된 Distance/Score는 **기본적으로 옮기지 않는다** — 그 데이터는 "그 시점에 그 홀 번호로 기록된 사실"이고, 조용히 재배정하면 나중에 스코어카드를 봤을 때 왜 숫자가 바뀌었는지 알 수 없게 된다. 데이터를 옮기고 싶다면 Host가 **명시적으로** "이 스코어를 5번 홀로 옮기시겠습니까"에 확인해야 하고, 이동 자체도 `SCORE_REASSIGNED` 이벤트로 남는다.

이 구분의 핵심은 하나다 — **"진행"과 "정정"은 데이터에 미치는 영향이 다르므로 반드시 다른 이벤트 타입으로 남는다.** 리듀서 관점에서는 이미 있는 `appendEvent()` 패턴에 이벤트 타입 3~4개(`SNAPSHOT_CORRECTED`, `COURSE_TRANSITION`, `HOLE_CORRECTED`, `SCORE_REASSIGNED`)를 추가하는 것으로 충분하고, 리듀서의 기존 구조(액션 → 이벤트 로그 append)를 벗어나지 않는다.

### 코스/홀 변경 시 부수 효과 (§7 요청 반영)

| 항목 | 정책 |
|---|---|
| 현재 거리 계산 | 초기화 — 새 홀의 GPS 기준으로 다시 시작 |
| 이전 홀 실측 공유값(`lastDistanceShare`) | 제거 — 이미 있는 `holeNumber` 기반 신선도 가드(거리 표시 정책 보완 작업에서 만든 것)를 그대로 재사용 가능. 이 가드는 원래 "새 홀로 넘어가면 공유값이 안 보이게" 하려고 만든 것인데, 코스/홀 정정 상황에도 동일하게 적용된다 — 새로 만들 필요 없음. |
| 바람 | 재조회 |
| 스코어 | 유지(위 C 정책과 동일 — 기본은 유지, 명시적 확인 시에만 이동) |
| Round Event | `HOLE_CORRECTED` 등 위 이벤트 타입으로 기록 |
| 다른 동반자 화면 동기화 | v1 §6에서 이미 Round 진행 데이터를 "Realtime"으로 분류해뒀다 — 코스/홀 변경도 같은 채널로 즉시 전파되면 된다. 별도 동기화 메커니즘 불필요. |

---

## 5. v1 대비 변경 요약

- Room의 책임 범위를 "초대·합류"에서 "초대·PTT테스트·골프장감지·코스확인"까지로 넓힘 (v1 §4 보완, 상태 모델 자체는 유지).
- User 관련 Entity 4개(UserProfile/RecentCompanion/Team/Device) 확정, Friend는 후순위로 명시적 보류.
- AI Assistant/Statistics를 Entity가 아니라 "Round Data를 소비/집계하는 파생 계층"으로 재분류 — v1의 Entity 목록에 추가하지 않음.
- Course/Hole 정정을 A/B/C 3단계로 세분화하고, 각 단계의 기록 방식(스냅샷 직접 수정 vs 이벤트 기록)을 구체화 — v1 §3.4(스냅샷 원칙)를 어기지 않으면서 실제 골프장 상황(코스 변경, 정정)을 수용.

Round Lifecycle(v1 §2)의 나머지 부분, Data Ownership(v1 §6), Offline 전략(v1 §7)은 변경 없음 — 그대로 유효하다.
