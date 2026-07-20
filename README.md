# FIELDTALK

**Play Together. Feel Every Shot.**

라운드 중 동반자와 실시간으로 소통하는 프리미엄 골프 PTT(무전) 커뮤니케이션 앱의 React 클릭 프로토타입입니다. Apple 스타일 다크 모드, Black + Deep Green 팔레트, Glass Morphism을 기반으로 iPhone 16 Pro 프레임 위에서 동작합니다.

## 시작하기

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:5173` 이 자동으로 열립니다.

다른 명령어:

```bash
npm run build     # 프로덕션 빌드 생성 (dist/)
npm run preview   # 빌드 결과 로컬 미리보기
```

## 화면 구성

1. **Splash** — 로고, 워드마크, 슬로건, 자동 진입 (탭하면 즉시 스킵)
2. **Home** — 오늘 라운드 시작 카드, 동반자 초대, 최근 라운드 기록
3. **Round** — Hole 정보, 참가자 상태, 중앙 PTT(무전) 버튼, 거리 공유, 갤러리 응원, 스코어

### Round 화면의 PTT(무전) 경험

- 버튼을 길게 누르면 5~9% 사이로 숨쉬듯 확대되는 펄스 애니메이션과 함께 "송신중" 상태로 전환됩니다.
- 말하는 동안 라이브 음성 레벨 미터(막대 애니메이션)가 표시됩니다.
- 시작/종료 시 Web Audio API로 합성한 무전 chirp 효과음이 재생되고, 지원 기기에서는 짧은 햅틱 피드백이 함께 동작합니다.
- 송신 중에는 상단에 iOS Live Activity 스타일의 "LIVE" 배지가 나타나고, 해당 참가자 카드에 빨간 테두리와 "🎤 말하는 중" 상태가 표시됩니다.
- 모든 음성/무전 기능은 더미로 동작하며, 실제 오디오 스트리밍이나 네트워크 통신은 포함되어 있지 않습니다.

### 사운드 카탈로그 & 개인화 응원 (TASK-002)

갤러리 응원 버튼은 더 이상 코드에 하드코딩되어 있지 않습니다. `src/data/soundCatalog.json`에 항목을 추가(+ 필요 시 `public/sounds/<category>/`에 파일 추가)하는 것만으로 GalleryPanel에 버튼이 자동 생성됩니다.

**카탈로그 파일 구조**

```json
{
  "version": 1,
  "defaultCooldownMs": 3000,
  "sounds": [ { "id": "gallery_good_shot", "...": "..." } ]
}
```

- `version` — 카탈로그 스키마 버전
- `defaultCooldownMs` — 개별 항목에 `cooldownMs`가 없을 때 쓰이는 기본값
- `sounds` — 실제 사운드 항목 배열 (아래 필드 참고)

**새 사운드 추가 방법**

1. `public/sounds/<category>/`에 mp3/ogg/wav 파일을 넣습니다 (TTS만 쓸 경우 생략 가능).
2. `src/data/soundCatalog.json`의 `sounds` 배열에 항목을 추가합니다. 필드: `id`(카테고리_설명 형태의 snake_case, 예: `gallery_good_shot`, `team_ok_male`), `label`, `category`, `sourceType`("file" 또는 "tts"), `src` 또는 `textTemplate`, `language`, `voiceGender`, `targets`(예: `["phone","headphones","watch"]`), `volume`, `cooldownMs`, `rightsStatus`, `enabled`, `icon`, `tone`.
3. `category`가 `gallery` / `team` / `achievement`이고 `enabled: true`이면 코드 수정 없이 GalleryPanel에 버튼이 즉시 나타납니다. (`caddie`, `warning`, `personalized` 카테고리는 카탈로그에는 등록되지만 GalleryPanel 응원 버튼 줄에는 노출되지 않으며, 각각 향후 캐디 안내 UI · 경고 UI · 개인화 응원에서 재사용됩니다.)

**현재 등록된 team 카테고리 실사용 예시**: 오케이!(남/여), 컨시드(남/여), "오빠, 마크 부탁드려요~"(여) — 전부 실제 파일이 아직 없는 상태(`review_required`/`original`)로 등록되어 있어, 클릭하면 "파일을 찾을 수 없어요" 토스트가 뜨는 것이 정상입니다. `public/sounds/team/`에 실제 파일을 넣으면 바로 재생됩니다.

**오디오 엔진 (`src/services/audioEngine.js`)**

- 사운드 ID로 카탈로그 항목을 조회하고, `sourceType`에 따라 `HTMLAudioElement`(file) 또는 Web Speech API(tts)로 재생합니다.
- 같은 사운드의 동시 중복 재생을 막고(`already_playing`), 성공 재생 후 `cooldownMs`(없으면 카탈로그의 `defaultCooldownMs`) 동안 재실행을 막습니다.
- 파일이 없거나, 브라우저가 자동재생/TTS를 지원하지 않거나, 재생 중 오류가 나도 앱이 멈추지 않고 `{ success: false, reason }` 형태로 결과를 반환합니다 — 이 값은 GalleryPanel/PersonalizedCheer가 토스트 메시지로 변환해 사용자에게 안내합니다.
- `voiceGender`는 `male` / `female` / `mixed` / `auto` 네 가지 값을 오류 없이 처리합니다. `male`/`female`은 이름에 해당 성별 키워드가 포함된 음성을 우선 탐색하고, `mixed`와 `auto`는 성별 필터 없이 해당 언어에서 사용 가능한 첫 번째 음성을 자동 선택합니다.
- TTS 항목의 `textTemplate`은 `{placeholder}` 문법을 지원합니다. `playSoundById(id, { vars: { name: "재식" } })`처럼 호출하면 재생 시점에 치환됩니다 — 개인화 응원이 이 기능을 사용합니다.
- 출력 대상은 `outputTargets` 객체 뒤로 추상화되어 있습니다. 각 사운드의 `targets` 필드(`["phone","headphones","watch"]`)는 의도된 출력 기기를 미리 기술해 두는 용도이며, 지금은 `browser` target 하나로만 실제 재생됩니다. 이후 기기별 출력을 추가할 때 `{ playFile, speak }` 인터페이스를 구현한 target을 추가하고 `resolveTargetName()`만 바꾸면 됩니다 — 호출부(`playSoundById`, `speakText`)는 그대로 둘 수 있습니다.

**개인화 응원**

- 개인화 응원 문구도 이제 하드코딩이 아니라 카탈로그 항목입니다: `soundCatalog.json`의 `category: "personalized"`, `id: "personalized_aiga"` 항목이 `textTemplate: "{name} 아이가~!!"`를 갖고 있습니다.
- `PersonalizedCheer.jsx`는 이 문구를 직접 갖고 있지 않고, 재생 시점에 `play("personalized_aiga", { vars: { name: 선택한_참가자.cheerName } })`로 `{name}`을 치환해 호출할 뿐입니다. 문구 자체를 바꾸고 싶다면 컴포넌트를 수정할 필요 없이 카탈로그의 `textTemplate`만 바꾸면 됩니다.
- Round 화면의 "개인 응원" 섹션에서 재식/재근/광천/해란 중 한 명을 탭하면 즉시 재생됩니다 (선택과 실행이 한 번의 터치로 이루어집니다). 예: "재식 아이가~!!", "해란이 아이가~!!"
- 실제 대회 음원이나 유명 선수 음성은 사용하지 않으며, 전적으로 브라우저 내장 음성 합성(Web Speech API)만 사용합니다.
- 해당 브라우저가 TTS를 지원하지 않으면 토스트로 안내하고 앱은 정상 동작을 유지합니다.

**⚠️ 권리 상태(rightsStatus) — 출시 전 필수 검토**

카탈로그의 각 항목은 `rightsStatus` 필드를 가집니다(`original` / `prototype_only` / `review_required`). `prototype_only` 또는 `review_required`인 항목은 개발 모드(`npm run dev` / `import.meta.env.DEV`)에서 버튼에 작은 경고 배지가 표시됩니다.

> **실제 App Store 출시 전에는 `prototype_only`·`review_required`로 표시된 모든 사운드/음성에 대해 반드시 저작권·초상권·상표권 검토를 완료해야 합니다.** 특히 실제 대회 방송 음원, 유명 선수 음성, 타사 브랜드 효과음은 사용이 금지되며, 검토가 끝나기 전까지는 `enabled: false`로 두거나 자체 제작/라이선스가 확인된 음원으로 교체해야 합니다.

### Round Engine — 중앙 상태 관리 (TASK-003)

지금까지 `RoundScreen`/`PlayerCard`/`PTTButton` 등 각 컴포넌트에 흩어져 있던 홀·참가자·PTT·거리·스코어 더미 상태를 `useReducer` 기반의 중앙 **Round Engine**으로 통합했습니다. 외부 상태 라이브러리(Redux/Zustand 등)는 추가하지 않았습니다.

- `docs/ROUND_ENGINE_v0.1.md`, `docs/PLAYER_STATE_v0.1.md`, `docs/schemas/round.example.json`에 정의된 Round/Hole/Player 스키마를 그대로 따릅니다.
- `src/context/RoundProvider.jsx`가 `App.jsx` 최상단을 감싸고, 모든 컴포넌트는 `useRound()` 훅(`src/context/useRound.js`)으로 접근합니다.
- 상태 변경은 전부 `src/engine/roundActions.js`에 정의된 action을 통해서만 일어나며, `src/engine/roundReducer.js`가 순수 함수로 처리합니다. 파생 데이터는 `src/engine/roundSelectors.js`의 selector로 읽습니다.
- **PTT 동시 발화 방지**: `PTT_START`는 이미 다른 참가자가 말하고 있으면 거부됩니다. `PTTButton.jsx`는 리듀서에 직접 dispatch하기 전에 `useRound().startPtt()`로 먼저 상태를 확인해, 거부되면 즉시 `"{이름}님이 말하는 중입니다."` 토스트를 띄우고 실제 dispatch는 하지 않습니다(리듀서 자체에도 동일한 가드가 이중으로 걸려 있습니다).
- **거리/스코어**: `DistanceCard.jsx`는 거리 공유 시 `TEAM_DISTANCE_SHARE`를(TASK-004에서 `PLAYER_SET_DISTANCE`에서 교체됨, 자세한 내용은 아래 TASK-004 절 참고), `ScoreCard.jsx`는 +/- 버튼을 누를 때 `PLAYER_SET_SCORE`를 dispatch합니다. 홀이 `completed` 상태가 되면 해당 홀의 스코어 입력은 잠깁니다.
- **홀 진행**: 스코어 섹션 하단의 "N번 홀 완료 · 다음 홀로" 버튼이 `HOLE_COMPLETE` → `NEXT_HOLE`을 순서대로 dispatch합니다. 18번 홀 완료 후에는 자동으로 라운드가 `completed` 상태로 전환됩니다.
- **사운드 이벤트 로그**: `GalleryPanel.jsx`는 효과음이 성공적으로 재생될 때마다 `SOUND_PLAYED`를 dispatch해 `round.events`에 기록을 남깁니다.
- **영속성**: `localStorage` 키 `fieldtalk.round.active.v1`에 변경될 때마다(디바운스 없이 MVP 수준으로) 저장됩니다. 저장된 JSON이 손상됐거나 스키마가 맞지 않으면 자동으로 `roundSeed`로 복원됩니다. 페이지를 새로고침해도 진행 중이던 홀 번호·거리·스코어가 그대로 복원됩니다.
- **표시 우선순위**: `PlayerCard.jsx`는 PLAYER_STATE_v0.1의 우선순위(말하는 중 → 재연결/오프라인 → 플레이 활동)를 따라 상태 텍스트를 고릅니다. 리치한 한국어 문구("세컨샷 준비" 등)는 스키마의 `activity` enum과 별도로 `activityLabel`이라는 확장 필드에 저장해, 상태 로직은 enum을 쓰면서도 기존 UI 문구는 그대로 유지했습니다.
- `muted`(내 화면에서만 상대를 음소거하는 기능)는 다른 사람과 동기화될 필요가 없는 기기-로컬 UI 상태라 판단해 Round Engine에 넣지 않고 `PlayerCard.jsx` 안에 로컬 state로 유지했습니다.

**검증 방법**: 이 샌드박스는 외부 네트워크가 막혀 있어 `npm install`/`npm run build`(Vite)를 직접 실행하지 못했습니다. 대신 (1) esbuild로 `src/main.jsx`부터 전체 import 그래프를 번들링해 문법·참조 오류를 확인하고, (2) 실제 Chromium(Playwright)에 앱을 로드해 라운드 시작 → PTT 눌러 말하기 → 충돌 상황에서 두 번째 PTT 거부 + 정확한 토스트 문구 확인 → 거리 공유 → 스코어 변경 → 홀 완료·다음 홀 이동 → **페이지 새로고침 후 상태 복원**까지 실제로 클릭/새로고침하며 콘솔 에러 0건을 확인했습니다.

### Shot & Smart Distance Engine (TASK-004, 3차 수정: 기본값 "모름" + UI 용어 단순화)

거리 기능은 **GPS 자동 계산만 쓰지 않습니다.** GPS는 항상 켜져 있는 "그린 중앙까지의 기본 참고값"이고, 사용자가 레이저 거리측정기나 음성으로 직접 잰 "핀까지의 실측값"은 이를 덮어쓰지 않는 별도 출처로 저장됩니다. 실제 GPS/위치 권한은 아직 없고, `src/data/roundSeed.js`의 `mockDistanceOffsetM`(재식 0 / 재근 +10 / 광천 -4 / 해란 +1)을 이용한 결정론적 계산으로 흐름을 검증합니다.

> ⚠️ **"어느 그린인지 안다" ≠ "핀이 어디 있는지 안다"** — 이 둘을 하나로 합쳤던 것이 이전 개정의 버그였습니다. 지금은 완전히 분리되어 있습니다.

- **거리 모델**: 각 참가자의 `distance`는 `{ gps, manual }`로 나뉩니다. `manual`은 `source`(출처)·`measuredBy`(측정자)·`updatedAt`(측정 시간)·`calculationMode`·`isEstimated`를 함께 저장합니다.
- **그린 구분(`greenSelection`) vs 핀 위치 정보(`pinLocationStatus`)**: `hole.pin`이 두 개의 독립된 필드를 가집니다.
  - `greenSelection`: `single`/`left`/`right`/`unknown` — 어느 그린을 쓰는지(코스 레이아웃 정보일 뿐)
  - `pinLocationStatus`: `unknown`/`center_only`/`coordinate_known`/`bearing_known` — 핀의 실제 위치를 정말로 아는지
  
  `DistanceCard.jsx`에 이 두 pill 행을 별도로 두었고, **참가자별 거리 보정은 `pinLocationStatus`가 `coordinate_known` 또는 `bearing_known`일 때만 적용됩니다.** `greenSelection`이 `single`/`left`/`right`로 알려져 있어도 `pinLocationStatus`가 `unknown`/`center_only`면 보정하지 않고, 실측값을 전원에게 **동일한 참고값**으로만 공유합니다(`calculationMode: "shared_reference"`). **앱을 처음 실행하면 항상 `unknown`(화면에는 "모름")이 기본값**이라, 별도 설정 없이는 레이저 실측값이 팀 공통 참고값으로만 공유됩니다.
- **핀 위치 정보 UI — 기술 용어 없이 3단계만 노출**: 내부적으로는 `unknown`/`center_only`/`coordinate_known`/`bearing_known` 4개 값이 있지만, 화면에는 이렇게 3개 pill만 보입니다(기본 선택값은 항상 "모름"):
  | 화면 | 내부값 | 동작 |
  | --- | --- | --- |
  | 모름 | `unknown`(`center_only` 포함) | 보정 없음, 참고값만 공유 |
  | 대략 확인됨 | `bearing_known` | 참가자별 계산값 + "추정값" 배지 |
  | 정확히 확인됨 | `coordinate_known` | 별도 상태로 선택 가능 |

  "좌표 확인"/"방향 확인"/`locationStatus` 같은 표현은 화면 어디에도 노출하지 않습니다. 이 컨트롤은 실제 GPS가 들어오기 전까지의 검증용이라 라벨 옆에 작은 `DEV` 배지가 붙어 있습니다(그린 구분 pill에는 붙지 않음 — 그린 구분은 실제 코스 정보로 남을 수 있는 개념이라 구분했습니다).
- **`src/engine/distanceCalculator.js`**: `calculateTeamDistances({ players, referencePlayerId, referenceDistanceM, pinLocationStatus })` — React/DOM에 의존하지 않는 순수 함수. `canApplyPositionCorrection(pinLocationStatus)`가 true일 때만 `mockDistanceOffsetM` 보정을 적용하며, 그 결과에는 항상 `calculationMode: "demo_mock_offset"`와 `isEstimated: true`를 명시합니다 — 실제 좌표 계산이 아니라 프로토타입 더미 추정값임을 데이터 자체가 숨기지 않습니다. "정확히 확인됨"을 선택해도 실제 좌표 계산은 아직 없어 동일한 더미 수식을 쓰므로, 결과 배지는 "대략 확인됨"과 마찬가지로 "추정값"으로 표시됩니다(실제보다 정밀한 것처럼 보이지 않도록 하는 의도적 선택). 보정하지 않을 때는 `calculationMode: "shared_reference"`, `isEstimated: false`. 실패 시 예외 없이 `{ ok: false, reason }`을 반환합니다.
- **화면에서 명확히 구분하는 4가지**: GPS 그린 중앙 참고값 / 본인의 레이저·음성·수동 실측값 / 핀 좌표 기반 계산값(실제 GPS가 아직 없어 이 프로토타입에서는 발생하지 않지만, 향후 실좌표 계산이 들어오면 자동으로 이 라벨로 분류되도록 `src/utils/distanceFormat.js`의 `describeManualReading()`이 구조를 마련해 둠) / 추정값. "팀 거리 현황" 목록에서 각 값에 색이 다른 배지(파랑=실측, 회색=공유값, 금색=추정)로 표시됩니다.
- **레이저 · 음성 · 수동 출처 선택**: "📡 팀 거리 전송" 버튼 위 pill에서 이번에 보낼 값의 출처를 고릅니다. "음성"을 선택하면 브라우저 `SpeechRecognition` API로 실제 인식을 시도하고, 지원하지 않거나 실패하면 토스트로 안내하며 앱은 정상 동작을 유지합니다.
- **재식 기준 132m 전송 예시**: 기본값("모름")에서는 재식 132m(실측) 외 전원이 132m(공유값·참고). "대략 확인됨"으로 바꿔 같은 132m를 보내면 재근 142m·광천 128m·해란 133m로 참가자별 추정값이 계산됩니다(전부 "추정값" 배지 포함).
- **`PlayerCard.jsx`**: 직접 측정값이 있으면 굵은 파란 숫자 + 카테고리별 색상 태그(실측/공유값/데모 추정)로 우선 표시, 없으면 GPS 값을 흐리게 대신 보여줍니다. 강조 우선순위는 여전히 **말하는 중(빨강) > 거리 갱신(파랑) > 기본 상태색**입니다.
- **Shot 상태**: `SHOT_CREATE`/`SHOT_START`/`SHOT_COMPLETE`/`SHOT_CANCEL`을 리듀서에 구현(이번 개정에서 변경 없음). 별도 샷 입력 화면 없이 `RoundScreen.jsx`의 개발용 데모 흐름으로 재식의 샷이 `planned → active → completed`로 자동 진행되며 활동 라벨이 "세컨샷 준비 → 샷 준비 중 → 샷 완료"로 바뀝니다.
- **저장 호환성**: `src/engine/roundStorage.js`의 `migrateHolePin()`이 이전 저장 데이터의 단일 `pin.position`을 `greenSelection`으로 옮기되 `locationStatus`는 항상 `"unknown"`으로 보수적으로 초기화합니다(예전에 "그린 구분을 아니까 보정해도 된다"고 가정했던 것 자체가 틀렸으므로, 옛 데이터를 열었을 때 이전과 다르게 — 더 정확하게 — 동작하는 것은 의도된 변경입니다). `migrateManualCalculationMode()`가 예전 `mock_offset`/`shared_raw` 라벨도 새 이름 + `isEstimated`로 재매핑합니다.

**검증 방법(3차 수정분)**: 앱 최초 실행 시 "핀 위치 정보"가 "모름"으로 선택되어 있는지, 그 상태로 132m 전송 시 전원이 보정 없이 132m를 받는지, "예상"으로 바꾸면 142/128/133 + "추정값" 배지가 뜨는지, "정확"이 별도 상태로 선택되는지, 화면 전체 텍스트에 기술 용어가 전혀 없는지, `DEV` 배지가 보이는지, 이전 데이터 마이그레이션이 여전히 "모름"으로 안전하게 초기화되는지, PTT·스코어·갤러리·개인화 응원 회귀까지 전부 콘솔 에러 0건으로 확인했습니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### 조작 횟수를 줄이는 UX 개선 (TASK-005)

이번 작업은 시각적 리디자인이 아니라 **사용자가 앱을 만지는 횟수 자체를 줄이는 것**이 목표였습니다. `DistanceCard.jsx`, `RoundScreen.jsx`, `app.css` 세 파일만 수정했고 Round/Sound/Distance Engine의 데이터 구조·reducer·selector·action은 전혀 건드리지 않았습니다.

- **핀 위치 컨트롤은 DEV 모드 전용**: "그린 구분"·"핀 위치 정보" pill은 이제 `import.meta.env.DEV`일 때(즉 `npm run dev`)만 보이고, 프로덕션 빌드에서는 일반 사용자에게 노출되지 않습니다(기존 `SoundButton.jsx` 권리 배지와 동일한 패턴 재사용). 라벨도 "모름"/"예상"/"정확"으로 더 짧게 정리했습니다.
- **거리 카드가 idle/편집 두 상태로 분리됨**: 기본 상태에서는 큰 숫자(탭하면 편집 모드)와 "🎙 음성으로 거리 공유" 버튼 하나만 보입니다. 스테퍼·출처 선택·전송 버튼은 편집 모드를 열어야만 나타납니다 — 상시 노출되던 인터랙티브 요소가 6개에서 1개로 줄었습니다.
- **음성 공유는 완전 자동 전송**: idle 상태의 음성 버튼은 편집 모드를 거치지 않고, 인식된 숫자를 곧바로 `teamDistanceShare()`로 전송합니다. 편집 모드 안의 "음성" 출처 pill은 다르게 동작해 숫자만 채워 넣고 자동 전송하지 않습니다(미세 조정 여지를 남기기 위함).
- **전송 후 자동 복귀 + 음성 확인**: 전송이 끝나면 기존 `services/audioEngine.js`의 `speakText()`(수정 없이 재사용)로 "팀원에게 거리를 공유했습니다."를 재생하고, 편집 패널을 자동으로 접은 뒤 PTT 버튼 쪽으로 부드럽게 스크롤 복귀합니다.
- **3초 무입력 자동 복귀**: 편집 모드를 연 채 3초간 아무 조작이 없으면 아무것도 전송하지 않고 idle 상태로 자동 복귀합니다.
- **갤러리 응원 버튼 위치**: PTT 버튼 바로 다음(기존엔 거리 정보 다음)으로 옮겨 손 위치 이동을 줄였고, 터치 영역도 살짝 키웠습니다.

**해석해서 정한 부분**: "전송 후 PTT 화면 복귀"·"3초 후 메인 화면 복귀"는 별도 화면 이동이 아니라 Round 화면 안에서 편집 패널을 접고 PTT로 스크롤 복귀하는 것으로 구현했습니다(이 앱은 splash/home/round 세 화면만 있고, 라운드 도중 다른 화면으로 이동시키는 건 스코어·PTT 흐름을 방해할 수 있다고 판단했습니다). 자세한 판단 근거는 `CHANGELOG.md`를 참고하세요.

### Distance UX Refactoring — Input이 아니라 Confirm (TASK-006)

"거리를 입력하는 게 아니라 확인한다"는 철학으로 거리 확인 흐름을 다시 설계했습니다. `DistanceCard.jsx`를 다시 쓰고 `WheelPicker.jsx`를 새로 추가했습니다. Round/Distance/Audio Engine, Score, PTT, Sound Catalog, Personalized Cheer는 전혀 건드리지 않았습니다.

- **용어는 두 가지만**: 화면에는 "GPS (참고)"와 "실측 (우선)"만 보입니다. "레이저"/"음성"/"수동" 같은 출처 용어는 화면에서 완전히 사라졌습니다(내부 `source` 필드 자체는 그대로 있습니다 — TASK-006 §5 "내부 데이터 구조는 그대로 유지한다").
- **실측 기본값 = GPS**: 새 홀에 들어가면 실측 값이 항상 GPS 값으로 다시 맞춰집니다. 이미 확인·공유된 값이 있으면 그 값을 계속 보여줍니다.
- **Wheel Picker**: +/- 스테퍼를 없애고 아이폰 알람 스타일의 3자리 독립 휠로 교체했습니다(`WheelPicker.jsx`, 외부 라이브러리 없이 `scroll-snap`으로 직접 구현, 탭으로도 선택 가능). 예: 실측 숫자를 탭 → 132 → 백/십/일의 자리를 각각 조정 → 137.
- **8m 경고, 공유는 안 막음**: GPS와 실측 차이가 8m 미만이면 아무 메시지도 없고, 8m 이상이면 "GPS와 차이가 큽니다. 실측값을 한번 더 확인해 주세요."가 뜨지만 공유 버튼은 계속 눌립니다.
- **"완료" = 공유**: GPS와 값이 같으면 Wheel 없이 "팀에 공유" 버튼 한 번으로 끝. Wheel을 열어 값을 고친 경우엔 "완료" 버튼 자체가 공유 액션이라 별도로 또 누를 필요가 없습니다. 두 경로 모두 성공하면 기존 `speakText()`로 음성 확인이 재생되고 PTT로 스크롤 복귀합니다.
- **Apple Watch 확장은 이번에 구현하지 않았습니다.** `docs/WATCH_DISTANCE_UX.md`에 구조 검토만 남겼습니다 — 계산 로직은 이미 플랫폼 무관해서 재사용 가능하지만, 완료 후 처리(`performSend`)가 `DistanceCard.jsx` 안에 있고 "PTT 복귀"가 웹 DOM에 직접 결합돼 있어 코드 없이는 워치로 못 간다는 게 핵심 결론입니다.

**검증 방법**: Wheel 각 자리 독립 조정(132→137, 과제 예시와 동일), 8m 경고 발생/미발생 경계 확인, 경고 중에도 공유 차단 안 됨, GPS=실측일 때 즉시 공유, 음성 원탭 공유, DEV 모드 핀 컨트롤, 이전 데이터 마이그레이션, PTT·스코어·갤러리·개인화 응원 회귀까지 전부 콘솔 에러 0건으로 확인했습니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### Player Card UX 단순화 — Status Board가 아니라 Event Board (TASK-007)

"앱은 눈으로 볼 수 없는 정보만 보여준다"는 원칙으로 참가자 카드를 다시 정리했습니다. `PlayerCard.jsx`를 다시 쓰고 `roundSelectors.js`에 selector 1개, `hooks/useNowTick.js`를 새로 추가했습니다. Round/Distance/Audio Engine, Wheel Picker, Score, PTT, Sound Catalog, Personalized Cheer는 전혀 건드리지 않았습니다.

- **기본 상태는 이름 + 연결 상태뿐**: "티샷 완료"/"그린 위"처럼 동반자를 보면 바로 아는 정보와, 상시 노출되던 거리 칩(GPS/공통참고/실측)을 전부 제거했습니다. 기본 줄은 "🟢 연결됨" 또는(헤드폰 연결 시) "🎧 연결됨"만 보입니다.
- **Event Board로 전환**: 새 상태 저장소를 만들지 않고, 이미 있던 `round.events` 로그(PTT_STARTED, DISTANCE_SHARE_CREATED, SOUND_PLAYED 등 — TASK-003~006에서부터 계속 기록되고 있었음)를 읽는 selector `selectPlayerCardEvent()`만 추가했습니다. 순수 파생 조회라 리듀서·액션은 손대지 않았습니다.
- **우선순위**: 🎤 말하는 중(지속형) > 🔴 연결 끊김(지속형) > 가장 최근의 만료 안 된 타임드 이벤트(📏 실측 공유 5초, 👏 리액션 2초) > 기본 연결 상태. 이벤트가 끝나면 자동으로 기본 상태로 돌아가고, 우선순위 높은 이벤트가 끝나면 아직 유효기간이 남은 낮은 이벤트가 다시 떠오릅니다(실제로 재식이 실측 공유 중 PTT를 눌렀다가 떼는 시나리오로 검증).
- **거리는 이제 Distance Card에서만** 확인합니다 — Player Card는 "137m 공유"처럼 누가 방금 공유했는지만 5초간 알려줄 뿐, 상시 숫자를 보여주지 않습니다.
- **Player Card 이벤트 카탈로그(⚠️ 포어, 🏆 버디, 💥 롱드라이브, 🎯 니어핀, 🔋 배터리 부족 등)는 이번에 구현하지 않고** `docs/PLAYER_EVENTS.md`에 설계만 남겼습니다 — Tier 우선순위 체계와 동시 발생 처리 규칙까지 정리되어 있습니다.

**검증 방법**: 기본 상태에서 옛 activity 문구·거리 칩이 전혀 없는지, 실측 공유가 정확히 5초 후 자동 복귀하는지, 리액션이 2초 후 복귀하는지(TTS가 필요한 리액션은 이 샌드박스에 설치된 음성이 없어 `speechSynthesis.speak`를 모킹해 검증), PTT가 활성 이벤트를 올바르게 덮어썼다가 떼면 복귀하는지, 연결 끊김 상태가 정확히 표시되는지, 이전 데이터 마이그레이션과 PTT·스코어·Wheel Picker·개인화 응원 회귀까지 전부 콘솔 에러 0건으로 확인했습니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### Conditional Distance Share & Demo Cleanup (TASK-008)

거리 공유를 상시 기능에서 "GPS와 실측이 다를 때만 쓰는 예외 기능"으로 바꿨습니다. 수정한 파일은 `DistanceCard.jsx`, `RoundScreen.jsx`, `app.css` 세 개뿐입니다. Player Card Event Board, PTT, Audio Engine, Sound Catalog, Personalized Cheer, WheelPicker, Score/누계 selector, Round Engine, 저장 데이터 마이그레이션은 전혀 건드리지 않았습니다.

- **기본 화면은 GPS만**: "GPS (참고) / 135m"만 보이고, 팀 기준 카드·참가자 목록은 공유가 있기 전엔 아예 렌더링되지 않습니다. GPS 숫자를 탭하면 Wheel이 열리고 항상 GPS 값으로 초기화됩니다.
- **공유 버튼은 조건부**: `abs(실측 - GPS) >= 1`일 때만 "팀에 공유" 버튼이 나타나고, 아니면 "닫기"만 보입니다. 다시 GPS와 같게 맞추면 버튼이 즉시 사라집니다.
- **음성 입력이 더 이상 자동 공유하지 않습니다**: GPS와 같은 값을 인식하면 "GPS 거리와 동일합니다." 토스트만 뜨고 끝나고, 다른 값을 인식하면 차이를 보여줄 뿐 사용자가 "팀에 공유"를 눌러야 확정됩니다(TASK-005/006의 "음성=자동 즉시 공유"에서 바뀐 부분).
- **공유 후에는 카드 하나로 통일**: "현재 팀 기준 / {측정자} 실측 {값}m · {상대시간}" 카드가 상단에 뜹니다. 핀 위치가 `unknown`/`center_only`면 이 카드만 보이고, `bearing_known`/`coordinate_known`이면 참가자별 계산 목록(추정 배지 포함)도 함께 보입니다. 새 공유가 오면 카드 내용이 자동으로 최신으로 바뀝니다.
- **샷 데모 코드 제거**: `RoundScreen.jsx`의 자동 `shotCreate`/`shotStart`/`shotComplete` 데모(Player Card에 더 이상 표시되지 않던 가짜 이벤트)를 지웠습니다. `roundReducer.js`/`roundActions.js`의 Shot Engine 자체는 그대로 남아 있습니다 — 호출하던 데모 코드만 제거했습니다.

**검증 방법**: GPS=실측일 때 공유 버튼 없음, +2m 조정 시 버튼 등장 후 되돌리면 즉시 사라짐, 음성으로 GPS와 같은 값 인식 시 공유 없이 안내만, 음성으로 다른 값 인식 시 자동 공유 없이 확인 UI만 표시, "모름" 상태에서 팀 기준 카드만 표시, "예상" 상태에서 참가자별 추정값 목록도 함께 표시, 7초 대기 후에도 샷이 자동 생성되지 않음, PTT·스코어·개인화 응원·갤러리 회귀와 두 종류의 이전 데이터 마이그레이션까지 전부 콘솔 에러 0건으로 확인했습니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### Distance Card Usability Fix (TASK-009)

TASK-008의 조건부 공유 로직은 그대로 두고, 실제 미리보기에서 확인된 UX 문제만 고쳤습니다. 수정한 파일은 `DistanceCard.jsx`, `distanceFormat.js`(helper 1개 추가), `app.css` 세 개뿐입니다.

- **GPS는 이제 진짜 읽기 전용**입니다 — 클릭 핸들러 자체가 없습니다. 실측 입력은 "실측 확인·입력"(GPS 값으로 초기화된 Wheel 열기) / "음성 입력" 두 개의 명확한 버튼으로만 시작됩니다.
- **실측값과 GPS 차이가 즉시 갱신**됩니다 — Wheel이 열려 있는 동안 "실측 137m" + "GPS 대비 +2m"(같으면 "GPS와 동일")을 매 렌더마다 새로 계산해서 보여주므로, 조정해도 화면이 안 바뀌는 것처럼 보이는 문제가 없습니다.
- 버튼 문구가 "확인 완료"(공유 없음)/"팀에 공유"(명시적 확정)로 바뀌었습니다 — 판단 로직 자체는 TASK-008 그대로입니다.
- **동반자 GPS 2×2 그리드**를 새로 추가해 공유 여부와 무관하게 항상 4명의 GPS 거리를 보여줍니다. 핀 위치가 `bearing_known`/`coordinate_known`일 때만 각 칸에 "추정 145m" 같은 보정값이 추가되고, `unknown`/`center_only`에서 받은 공통 참고값은 절대 개인의 정확한 거리처럼 표시되지 않습니다(TASK-007/008 원칙 재사용).
- 화면 순서를 GPS → 입력 버튼 → 동반자 그리드 → (있으면) 팀 기준 카드 순으로 재배치했습니다(팀 기준 카드가 맨 위에서 맨 아래로 이동).

**검증 방법**: GPS 클릭 시 Wheel 안 열림(회귀 재현 후 수정 확인), "실측 확인·입력"으로만 진입, 조정 시 실측값·diff 즉시 갱신, GPS와 같으면 "확인 완료"만/다르면 "팀에 공유"까지 등장, 공유 전에도 4명 GPS 전부 표시, "모름" 공유 후에도 다른 참가자 GPS가 유지되고 가짜 개인 추정치가 안 붙음, "예상" 상태에서 GPS와 추정값이 나란히 표시됨, PTT·스코어·개인화 응원·갤러리 회귀와 마이그레이션까지 전부 콘솔 에러 0건으로 확인했습니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### Project Eagle Build Phase — UI Compact + Gallery Overlay

Product Planning Phase에서 Build Phase로 전환하며 받은 가이드라인 문서의 "현재 진행 TASK" 3개를 구현했습니다. 새 기능이 아니라 완성도(조작성·간결함·일관성)를 높이는 작업입니다. 수정 파일은 `RoundScreen.jsx`, `GalleryPanel.jsx`(재작성), `PersonalizedCheer.jsx`(콜백 prop 1개), `app.css`뿐입니다. Round/Distance/Shot Engine, PTT, Audio Engine, WheelPicker, Score/누계, Player Card Event Board, 마이그레이션은 전혀 건드리지 않았습니다.

- **Header 컴팩트화**: 기존 큰 홀 카드(장식 SVG + 46px 홀 번호)를 없애고 "7H | PAR4 | +2" / "↗ NW 3.1m/s" 2줄짜리 헤더로 교체했습니다. 바람 각도(°)를 8방위+화살표로 바꾸는 순수 함수를 추가했을 뿐, `hole.wind` 데이터 구조는 그대로입니다.
- **Gallery → Overlay 전환**: 상시 표시 섹션이었던 Gallery가 이제 트리거 버튼을 눌러야 여는 하단 시트입니다. 첫 화면은 카테고리 5개(🎯샷/⛳그린/🏆스코어/⭐즐겨찾기/❤️개인응원)만 보이고, 효과음을 고르면 Round Engine에 이벤트를 남긴 뒤 오버레이가 자동으로 닫혀 플레이 화면(및 Player Card Event Board의 "👏" 표시)으로 복귀합니다. 즐겨찾기는 Round Engine과 무관한 순수 클라이언트 선호 정보라 `localStorage`에만 저장했습니다. 기존 "개인 응원" 섹션은 사라졌지만 `PersonalizedCheer.jsx` 자체는 손대지 않고 이 오버레이의 "개인응원" 카테고리로 옮겨 그대로 재사용했습니다.
- **거리 정보 유지**: Distance Card를 헤더 바로 다음(참가자 상태보다 위)으로 옮겨 "Distance First"를 반영했고, Gallery 오버레이는 화면 하단 58%만 차지하는 시트라 열려 있어도 위쪽 GPS는 계속 보입니다.

**검증 방법**: 헤더 2줄 형식·바람 표시·구 헤더 완전 제거, Distance Card 위치, 오버레이 열기 전/후 GPS 유지, 카테고리 5개 정확한 라벨, 뒤로가기(카테고리 그리드로만)와 효과음 선택(오버레이 전체 닫힘 + Event Board 표시) 구분, 즐겨찾기 토글·저장·조회, 개인응원 카테고리 선택 시 자동 닫힘, PTT·스코어(헤더 실시간 갱신 포함)·Wheel Picker·마이그레이션 회귀까지 전부 콘솔 에러 0건으로 확인했습니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### Sprint 2 — Player First UI

Product Review에서 나온 지적("사용자는 정보 종류가 아니라 플레이어를 본다")을 반영해 "동반자 GPS"(DistanceCard 안)와 "참가자 상태"(RoundScreen)를 하나의 Player Summary 패널로 합쳤습니다. 두 섹션은 원래 같은 `round.players`를 따로 읽고 있었을 뿐이라, 병합은 새 로직을 만드는 일이 아니라 기존 함수 4개(`describeManualReading`/`formatDistanceMeta`/`shortLabelForCategory`/`selectPlayerCardEvent`)를 한 selector(`selectPlayerSummary`)로 조합하는 일이었습니다. Round/Distance/Shot Engine, PTT, Audio Engine, WheelPicker, Gallery Overlay는 전혀 건드리지 않았습니다.

- **세로 리스트로 전환**: 가로 스크롤 카드 4개 → 한 패널 안의 컴팩트한 행 4개. 한 줄에 이름+거리(가장 빨리 읽히는 정보), 두 번째 줄에 출처·측정자·시각 또는 활성 이벤트(작은 텍스트)만 담습니다. `Ready`/`Walking`/`Waiting` 같은 눈으로 보이는 상태는 여전히 없습니다(TASK-007에서 이미 제거된 원칙 유지).
- **공통 참고값은 여전히 개인 정보처럼 안 보입니다**: 핀 위치를 모르는 상태에서 공유하면 측정자를 제외한 모두가 "공통 참고값"만 보고, 숫자는 같아도 GPS/실측 같은 개인화된 라벨이 붙지 않습니다.
- **Watch 재사용성**: `PlayerCard.jsx`가 이제 `useRound()`를 직접 호출하지 않는 순수 표시 컴포넌트입니다. `summary` prop(= `selectPlayerSummary()`의 출력)만 받아 그리므로, 미래의 Watch 레이아웃이 같은 selector를 다른 방식(한 명씩 세로 스크롤 등)으로 렌더링할 수 있습니다. 시각 갱신 타이머도 행마다(4개) 돌던 걸 `RoundScreen.jsx`에서 한 번만 돌리도록 옮겼습니다.

**검증 방법**: 옛 섹션 완전 제거, 4행 정확한 포맷("재식 (나) 132m / 실측 · 재식 · 방금 전" 등), 핀 위치 "모름"에서 공유 시 측정자 외 전원 "공통 참고값"만 표시, "예상" 상태에서 참가자별 "추정" 값 구분 표시, PTT 우선순위 override, 음소거 토글(본인 제외 3명), 패널 높이(201px, 4행 기준 스크롤 없이 화면에 들어감), 스코어·Gallery·마이그레이션 회귀까지 전부 콘솔 에러 0건으로 확인했습니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### Sprint 3 — Player Target UX

PTT가 "누르면 전체 방송"에서 "먼저 대상을 고르고 눌러야 송신"으로 바뀌었습니다. Sprint 2의 Player Summary 패널을 대상 선택 UI로 그대로 재사용했습니다 — 새 목록을 따로 만들지 않았습니다. 변경 파일은 `PTTButton.jsx`(게이팅 prop 2개만 추가), `PlayerCard.jsx`(선택 UI로 재작성), `RoundScreen.jsx`, `app.css`뿐입니다. **Round Engine은 이번에도 전혀 건드리지 않았습니다** — 대상 선택은 "내 다음 PTT를 누구에게 보낼지"에 대한 순전히 로컬 UI 의도라, TASK-003 때 `muted`를 Round Engine에 넣지 않기로 한 것과 같은 기준을 적용했습니다.

- **행 전체가 선택 버튼**입니다(작은 아이콘이 아니라). 기존 개별 음소거 아이콘은 선택 상태 표시로 대체됐습니다(Product Director 요청에 명시된 대체).
- 선택 시 배경·왼쪽 테두리·이름색·거리색·아이콘, 최소 4가지가 동시에 바뀝니다. "말하는 중" 같은 기존 이벤트 강조보다 CSS에서 뒤에 배치해 항상 선택 표시가 우선하도록 했습니다.
- Player Summary 패널 맨 위에 "📢 전체" 행이 새로 생겼습니다 — 개별 선택과 상호 배타적입니다.
- 대상 없이 PTT를 누르면 `startPtt()` 자체가 호출되지 않고 "먼저 전달할 대상을 선택하세요." 안내만 뜹니다. `PTTButton.jsx`에는 이 분기 하나만 추가했고, 브레싱 펄스·칩톤·햅틱·타이머는 전부 그대로입니다.
- PTT 버튼 위에 항상 현재 대상("대상 없음"/"해란에게 전송"/"재근 · 광천에게 전송"/"전체에게 전송")이 표시됩니다.

**검증 방법**: §9 체크리스트 8개 항목(선택 없음→무전송, 전체 선택, 단일/다중 선택, 재터치 해제, 선택 시각 변화, 대상 표시 갱신, 스크롤 없이 전부 표시) 전부 실제 Chromium으로 확인했고, 대상 선택 후 정상 송신·스코어·Gallery·Wheel Picker 회귀·마이그레이션까지 콘솔 에러 0건으로 확인했습니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### Sprint 3 긴급 수정 — Distance Regression & PTT Above the Fold

두 가지를 고쳤습니다. 변경 파일은 `roundSelectors.js`, `DistanceCard.jsx`, `RoundScreen.jsx`, `app.css`뿐입니다. Round Engine, PTTButton.jsx, PlayerCard.jsx는 전혀 건드리지 않았습니다.

- **거리 회귀**: `selectPlayerSummary()`가 `shared_reference`(공통 참고값)일 때 그 원본 숫자를 각 행의 "내 거리" 칸에 그대로 넣고 있었습니다. 라벨은 정직했지만 네 명 모두 같은 큰 숫자가 보이면 "다들 거리가 똑같다"는 인상을 줬습니다. 이제 `shared_reference`는 본인 GPS로 폴백하고(GPS도 없으면 숫자 없이 작은 힌트만), 진짜 본인 값(실측/추정)만 큰 숫자 칸에 들어갑니다.
- **PTT Above the Fold**: 430×932 뷰포트로 실측한 결과 27px 초과가 있었습니다. GPS 카드(패딩·숫자 크기·버튼 높이 축소, "현재 팀 기준"을 1줄 status bar로 압축)와 플레이어 패널("플레이어" 제목 제거, 행 패딩·아바타 축소)만으로 88.5px 여유를 만들어 하단 고정 없이 해결했습니다. 스크롤 없이(scrollTop=0) PTT 전체와 대상 표시가 보임을 실측으로 확인했습니다.

**검증 방법**: unknown/bearing_known 공유 시나리오 전부 요청하신 예시와 정확히 일치함을 unit test + 실제 Chromium으로 확인, PTT 게이팅·대상 선택·스코어·Gallery 회귀 콘솔 에러 0건, Round Engine 무수정(타임스탬프 확인)까지 검증했습니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### Sprint 3 추가 수정 — One Screen Completion

변경 파일은 정확히 `DistanceCard.jsx`, `app.css` 두 개입니다. Round Engine, PTTButton.jsx, PlayerCard.jsx, GalleryPanel.jsx, WheelPicker.jsx는 전혀 건드리지 않았습니다.

- **음성 입력 제거**: `EXPERIMENTAL_VOICE_INPUT_ENABLED = false` 플래그로 UI에서만 숨겼습니다. `captureVoiceDistance`/`handleVoiceInput`/`isListening`과 Web Speech API 연동 코드는 전부 그대로 남아 있습니다 — 삭제한 코드는 없습니다.
- **GPS 카드**: GPS 숫자와 "실측 입력" 버튼을 한 가로 라인에 배치해 음성 버튼이 빠진 공간을 흡수했습니다.
- **PTT**: 마이크 시각·터치 크기 128px→80px(최소 64px 기준 대비 16px 여유), 장식 링 wrap 200px→132px, "길게 눌러 말하기"를 마이크 바로 아래로 붙였습니다.
- **플레이어 패널·응원 버튼**: 행 패딩·아바타·여백을 추가로 축소했습니다.

**완료 기준 검증**: 430×932, scrollTop=0에서 요청하신 9개 요소(GPS 거리/실측 입력/공통 참고/플레이어 4명/전체 선택/현재 대상/PTT 전체/길게 눌러 말하기/응원·효과음) 전부 `getBoundingClientRect()`로 개별 측정해 **클리핑 0px**을 확인했습니다. 가장 아래 요소가 618.2px, phone frame이 852px라 233.8px 여유가 있습니다(음성 입력·대상 선택·PTT 게이팅·Gallery 회귀도 콘솔 에러 0건). 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### 거리 공유 계산 규칙 정정 — GPS Delta Correction

핀 위치를 모를 때(unknown/center_only) 팀 공유가 지금까지는 원본 숫자를 그대로 복사하거나(TASK-007~009) 각자의 GPS로만 되돌리는(Sprint 3 긴급 수정) 방식이었는데, 정확한 규칙은 "측정자의 GPS-실측 오차를 각 동반자의 GPS에 동일하게 적용"하는 것이었습니다.

```
delta = 측정자 실측값 - 측정자의 공유 시점 GPS 스냅샷
동반자 보정 거리 = 동반자의 현재 GPS + delta
```

**핵심 엔진 파일 3개**(`distanceCalculator.js`, `roundReducer.js`, `roundSelectors.js`)를 건드렸지만 전부 순수 추가(additive) 변경입니다 — 기존 함수·필드·액션 payload 중 하나도 의미가 바뀌지 않았습니다. 이 정확한 공식은 기존에 구현된 적이 없었지만(사전 확인 결과), 필요한 재료(`PLAYER_SET_GPS_DISTANCE` 액션, 1–1000m 클램프 함수)는 이미 있어서 그대로 재사용했습니다. 측정자의 GPS 스냅샷은 공유 시점에 한 번만 고정되고(측정자가 나중에 이동해도 델타는 그대로), 동반자의 GPS는 매번 라이브로 읽으므로 동반자가 이동하면 보정 거리가 자동으로 갱신됩니다.

**검증 방법**: Founder가 제시한 5개 시나리오(공유 전 GPS, unknown 공유 후 동반자별 보정값, GPS 없는 동반자, 측정자 이동 후 델타 고정, 동반자 이동 후 실시간 갱신) 전부 Round Engine을 직접 호출한 unit test로 예상값과 정확히 일치함을 확인했고, 실제 Chromium UI(430×932)에서도 동일한 계산 결과(재식 GPS 136 기준 138m 공유 → 재근146→148, 광천132→134, 해란137→139)를 재현했습니다. bearing_known 경로는 전혀 안 건드렸고 회귀 없음을 재확인했습니다. 이전 버전 저장 데이터(새 필드 없음)도 크래시 없이 "GPS 필요"로 안전하게 폴백됩니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### 거리 표시 정책 보완 — GPS와 공유 보정값 동시 표시

계산 공식은 전혀 바꾸지 않고(지난 턴의 `distanceCalculator.js`/`roundReducer.js` 로직을 그대로 재사용) 표시 데이터와 UI만 확장했습니다. 변경 파일은 `roundSelectors.js`, `PlayerCard.jsx`, `DistanceCard.jsx`, `app.css`뿐입니다.

- **호환성**: 기존 `distanceM`/`distanceCategory`/`distanceLine`은 그대로 두고 `secondaryGpsM`/`secondaryGpsLabel`(예: `"GPS 146m"`) 필드만 추가했습니다. 측정자는 공유 시점 GPS 스냅샷을, 동반자는 본인의 현재 라이브 GPS를 보조로 표시합니다 — 동반자가 이동하면 주 거리와 보조 GPS가 함께 자동 갱신됩니다.
- **새 홀 가드**: `lastDistanceShare.holeNumber === round.currentHoleNumber`를 selector에 추가해 홀이 바뀌면 측정자·동반자 모두 GPS 단일 표시로 돌아갑니다. 리듀서는 안 건드렸습니다 — `holeNumber`가 이미 저장돼 있어서 selector 가드만으로 충분했습니다. 테스트 중 DistanceCard의 "현재 팀 기준" 바에는 이 가드가 없어서 예전 홀 공유가 계속 남아있는 불일치를 발견해 같이 고쳤습니다.
- **UI**: `PlayerCard.jsx` 2번째 줄을 flex row로 바꿔 왼쪽엔 기존 출처 라벨, 오른쪽엔 "GPS Nm" 텍스트(색상만으로 구분 안 함)를 배치했습니다. 이벤트 버블이 떠 있을 땐 보조 GPS를 숨깁니다.

**검증 방법**: 요청하신 5개 필수 테스트(공유 전 중복 없음, 공유 후 측정자/동반자 보조 GPS, 동반자 이동 시 동시 갱신, 새 홀 복귀, GPS 없음) 전부 unit test + 실제 Chromium(430×932)으로 확인했습니다. "홀 완료" 버튼으로 실제 다음 홀 진행 후 Player Panel과 "현재 팀 기준" 바가 함께 GPS 단일 표시로 복귀함을 확인했고, bearing_known 회귀·PTT 대상 선택·스코어·Gallery 회귀·마이그레이션까지 콘솔 에러 0건입니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### 바람 정보 구현 상태 (보고만, 코드 변경 없음)

UI(8방위 변환 + 화살표)는 완성돼 있지만 실제 데이터 소스는 연결돼 있지 않습니다. `roundSeed.js`에서 시드 18홀 중 라운드 시작 홀(7번)에만 목업 값이 있고 나머지 17개 홀은 전부 null이라, 다른 홀로 넘어가면 "바람 정보 없음"이 뜨는 게 정상 동작입니다(버그 아님). `hole.wind.directionDeg`/`speedMps` 필드가 이미 있고 `source: "mock"`으로 스스로 가짜 데이터임을 표시하고 있습니다. 실 데이터 연동에는 날씨 API + 코스 GPS 좌표(현재 데이터 모델에 없음) + 백엔드 프록시가 필요합니다. 임의 값으로 구현하지 않았습니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### Score Compact / Collapsible UI

변경 파일 3개(`RoundScreen.jsx`, `ScoreCard.jsx`, `app.css`)뿐입니다. Round Engine은 전혀 건드리지 않았고, 기존 `selectCurrentHoleScores()`(null과 0을 이미 구분해서 반환)를 그대로 재사용했습니다.

- 접힘 기본: "{N}번 홀 스코어 [요약] >" — 미입력이면 "미입력", 한 명만 입력했으면 "{이름} {타수}타", 두 명 이상이면 "타" 접미사 없이 " · "로 연결.
- **발견한 기존 버그**: `ScoreCard.jsx`가 동반자의 미입력(null)과 0을 렌더링 단계에서 뭉개서 "0"으로 보이고 있었습니다. 원본값과 제 스텝퍼 전용 baseline을 분리해서 고쳤고, 동반자가 입력하면 "입력 완료" 배지를 추가했습니다.
- `completeCurrentHoleAndAdvance()`를 직접 확인한 결과 애초에 스코어 여부로 다음 홀 이동을 막는 로직이 없었습니다 — "미입력이어도 이동 허용"은 이미 만족돼 있었고, `setIsScoreExpanded(false)` 한 줄만 추가해 자동 접힘을 구현했습니다.

**검증 방법**: 진짜 빈 상태("미입력" + 동반자 전부 "—"), 부분 입력("재근 5타"), 펼침/접힘 토글, 내 스코어 미입력 상태에서 실제 다음 홀 이동(헤더 7H→8H 확인) 및 자동 접힘, 한 화면 완료 기준(접힌 스코어 행까지 스크롤 없이 전부 보임, bottom 688.2px < 852px)까지 전부 확인했습니다. 거리·PTT 대상 선택/게이팅·Gallery 회귀 콘솔 에러 0건입니다. "이전 홀 재수정" 기능은 홀 히스토리 네비게이션이 필요한 별도 범위로 판단해 이번엔 구현하지 않았습니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### Score Input UX — PAR-relative 표시

변경 파일 4개(`ScoreCard.jsx`, `RoundScreen.jsx`, `scoreFormat.js`(신규), `app.css`)뿐입니다. Round Engine은 전혀 건드리지 않았습니다 — `playerSetScore` 액션과 `scoreByHole` 저장 구조 그대로입니다.

기존에 작은 배지로만 쓰던 `toPar`(E/+1 등) 계산을 주 표시로 승격시켰습니다. 표시는 `strokes - par`, 저장은 `par + delta`로 저장 시점에만 역변환합니다. 원본 타수는 "5타"처럼 작은 보조 텍스트로 함께 보여줍니다(거리 화면의 "주 거리 + 보조 GPS" 패턴 재사용). 미입력 상태에서 `+`/`-`/중앙("—") 탭은 각각 바로 `+1`/`-1`/`E`로 진입합니다("먼저 E부터" 같은 2단계 구조 없음).

**검증 방법**: PAR3/PAR4/PAR5 각각 E/+1/-1의 실제 타수 매핑, 첫 조작 규칙(+/-/중앙 탭), 저장/복원(localStorage에는 실제 타수만 저장되는지 직접 확인), 접힌 요약("재식 +2 · 재근 E · 광천 -1 · 해란 +1"), 헤더 누계·다음 홀 이동·거리/Target/PTT/Gallery 회귀까지 실제 Chromium(430×932)으로 전부 확인했습니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### Score Input UX — 패널을 여는 행위가 입력 시작

변경 파일 2개(`ScoreCard.jsx`, `RoundScreen.jsx`)뿐입니다. Round Engine은 전혀 건드리지 않았고 기존 `playerSetScore` 액션만 재사용했습니다.

핵심은 **"스코어 패널을 여는 행위 자체가 입력 시작"**이라는 모델입니다. 실제 값이 없는 상태에서 패널을 열면 로컬 `draftStrokes`가 `par`(E)로 초기화됩니다(`scoreByHole`엔 아직 안 씀). `+`/`-`는 이 draft를 로컬로만 증감하고, "홀 완료"를 눌렀을 때만 draft가 있으면(=패널을 열었으면) 그 시점 값을 실제로 저장합니다. 패널을 한 번도 안 열었으면 draft는 계속 `null`이라 아무것도 저장되지 않습니다. 이미 실제 값이 있는 홀(예: 이전 홀 재수정)은 `+`/`-`가 즉시 라이브로 반영됩니다 — 기존 편집 동작 그대로입니다. 가운데 값은 버튼이 아니라 "지금 선택된 값"을 보여주는 표시 전용 요소입니다 — 별도로 눌러 확정하는 단계는 없습니다.

**검증 방법**: 패널 오픈 시 화면 E/4타 + 저장 `null`, 조작 없이 완료하면 `4` 저장, `+`/`-` 후 완료하면 각각 `5`/`3` 저장, 이미 값 있는 홀은 `+`가 즉시 dispatch되는지, 접힌 요약·헤더 누계 정확한 갱신, 동반자는 계속 `"—"`까지 실제 Chromium(430×932)으로 확인했습니다. 거리·Target·PTT·Gallery 회귀 콘솔 에러 0건입니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### Course Reference Prototype v0.1

새 디렉터리 `src/course/`, `src/location/`(9개 파일)로 구현했고, Round Engine은 4개 파일(`roundActions.js`, `roundReducer.js`, `roundSelectors.js`, `DistanceCard.jsx`)에만 최소 범위로 연결했습니다. `distanceCalculator.js`, `roundStorage.js`, `PlayerCard.jsx`, `RoundScreen.jsx`, `ScoreCard.jsx`는 전혀 건드리지 않았습니다.

핵심은 `selectPlayerGps(round, playerId)` 하나입니다 — Level 2 이상 CourseReference와 플레이어의 실제 좌표가 있으면 순수 haversine 계산(`src/course/geoDistance.js`)으로 GPS를, 없으면 **기존 `GPS_BASE_M` mock 경로를 완전히 그대로** 반환합니다. `selectPlayerSummary()`와 `TEAM_DISTANCE_SHARE`의 GPS 스냅샷 캡처가 이 함수 하나를 공유해서 쓰고, 팀 실측 보정 델타 공식(`측정자 실측 - 측정자 GPS`, `동반자 GPS + delta`)은 한 글자도 안 바뀌었습니다 — GPS 값이 어디서 오는지만 바뀝니다.

Provider 경계(`CourseReferenceProvider` → `LocalJsonCourseProvider`)와 정규화 모델(`normalizeCourse.js`)도 요청하신 그대로 분리했고, 테스트 코스는 명시적으로 가상 데이터(`[TEST] 그린필드 테스트 클럽`, 합성 좌표)입니다.

**검증 방법**: Founder가 제시한 5개 시나리오(실제 좌표 GPS가 플레이어마다 다르게 계산, 실측 공유 후 보정, 새 홀에서 재계산 + 이전 공유 제거, 좌표 없을 때 임의 숫자 없음, Round 시작 후 원본 JSON을 바꿔도 Snapshot 불변) 전부 Node 단위 테스트(`geoDistance.test.js`, 9개 통과) + 실제 Chromium으로 확인했습니다. 한 화면 레이아웃·PTT 대상 선택/게이팅·Score PAR-relative·Gallery 회귀 콘솔 에러 0건입니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### Course Reference Integration Hardening v0.2

Prototype v0.1의 미해결 지점 3가지를 해소했습니다: Demo/Production 모드 분리, 두 번째 Provider로 독립성 검증, Pre-Round 코스 선택 → Round Snapshot 최소 연결.

- **Demo/Production**: `RuntimeModeContext`가 `RoundProvider` **바깥**(앱 구성 계층)에서 모드를 관리합니다. `selectPlayerGps(round, playerId, { runtimeMode })`가 옵션을 생략하면 기본값 Demo라 지난 Sprint의 모든 코드가 그대로 통과합니다(하위 호환). Production 모드는 mock GPS가 내부에 남아있어도 절대 읽지 않고 `null`을 반환합니다 — 지난 Sprint에서 "실제 UI 재현이 어려웠다"고 보고한 Scenario D 한계가 이번에 해결됐습니다.
- **두 번째 Provider**: `AlternateMockCourseProvider`가 완전히 다른 raw 구조(`venue_code/track/scorecard`, snake_case)를 전용 정규화 함수로 처리합니다. 7개 비교 테스트로 "같은 의미의 두 코스가 PAR·Green Center까지 정확히 일치하고 source만 다르다"를 확인했습니다.
- **CourseReferenceService**: `DistanceCard.jsx`의 `new LocalJsonCourseProvider()` 직접 생성을 제거하고 공유 서비스 인스턴스만 쓰도록 바꿨습니다 — UI 로직 어디에도 Provider 클래스 이름이 분기로 등장하지 않습니다.
- **Pre-Round 선택**: 새 오버레이 `PreRoundCourseSelect.jsx`(Gallery Overlay CSS 재사용) — Provider A/B 선택 → 코스 목록 → 시작 홀 → START → `courseSnapshotAppliedWithHoles`(새 액션, 기존 `courseSnapshotApplied`는 그대로 유지)로 PAR을 `round.holes`에 병합하되 `status`/`pin`/`wind` 등은 전부 보존합니다.

**검증 방법**: 단위 테스트 22개(누적) 전부 통과. 실제 UI로 Provider A/B 각각 적용 후 Header·Score 패널에 정확한 PAR 반영 확인, **Production 모드에서 4명 전원 "위치 정보 없음" 표시를 실제 UI로 확인**(지난 Sprint 한계 해소), 이 상태에서도 Score·Target·PTT·실측 입력 정상 동작 확인. 기존 델타 보정 공식·Gallery·한 화면 레이아웃 회귀 콘솔 에러 0건입니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### Course Reference Closure & Round Room Foundation v0.1

Course Reference 기능 확장은 이 Sprint로 종료했습니다(Part A: `round.course` 요약 동기화 + `docs/COURSE_REFERENCE_IMPLEMENTATION_v0.2.md` 정리). 이후 핵심 작업은 **Round Room Foundation**(Part B)입니다 — "고정 4인 데모가 아니라, Room에 실제로 참여한 사람만 Round Player로 Snapshot되는가?"

새 도메인 `src/room/`을 Round Engine과 완전히 분리해서 만들었습니다(`roomActions.js`/`roomReducer.js`/`roomSelectors.js`가 `src/engine/round*.js`와 정확히 같은 패턴). Provider 구조는 `RuntimeModeProvider → RoomProvider → RoundProvider → App`입니다.

Room→Round 브리지는 3개 파일입니다: `createRoundPlayersFromRoom.js`(joined 멤버만, RoomMember를 그대로 쓰지 않고 새 Player 객체로 생성), `buildInitialRoundFromRoom.js`(여러 dispatch 대신 **하나의 순수 함수**가 완전한 Round 또는 실패 사유를 반환), `useStartRoundFromRoom.js`(UI가 호출하는 유일한 함수, 검증 통과 후에만 Round+Room 커밋). 기존 `PreRoundCourseSelect.jsx`는 제거하고 그 코스 선택 로직을 새 `RoomOverlay.jsx` 안의 한 섹션으로 흡수했습니다 — 동반자 초대·PTT 테스트·코스 준비·Ready Summary·START가 전부 하나의 오버레이입니다. Room 저장소(`fieldtalk.room.active.v1`)는 Round 저장소와 완전히 분리했습니다.

**검증 방법**: 단위 테스트 31개(누적) 전부 통과. 실제 UI로 재근·광천만 초대→참여시킨 뒤 START하면 **Round Player가 정확히 이 3명만 생성**되고 해란은 포함되지 않음을 확인했습니다(핵심 검증 기준 충족). 최대 4명 제한, Host 단독 시작 시 Warning 확인 흐름, 새로고침 후 Room 상태 복원까지 실제 UI로 확인했습니다. `distanceCalculator.js`/`roundStorage.js`/`PlayerCard.jsx`/`ScoreCard.jsx`/`RoundScreen.jsx`/`DistanceCard.jsx`는 전혀 건드리지 않았고, 기존 Target 선택·PTT 게이팅·Score·Gallery·한 화면 레이아웃 회귀 콘솔 에러 0건입니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### Local Media Capture Prototype v0.1

PTT가 이제 **실제 마이크**를 사용합니다(네트워크 송신은 여전히 없음). 새 도메인 `src/communication/`을 Round/Room Engine과 같은 급의 독립 계층으로 만들었고, Provider 구조는 `RuntimeModeProvider → RoomProvider → CommunicationProvider → RoundProvider → App`입니다.

`adapters/BrowserAudioCapture.js`가 실제 `getUserMedia`/`AudioContext`/`AnalyserNode`를 다루는 유일한 파일입니다 — `audioCtx.destination`에 연결하지 않아 자기 목소리 loopback 재생이 없고(하울링 방지), 녹음/저장/전송도 전혀 없습니다. `PTTButton.jsx`는 기존 칩톤·햅틱·애니메이션·타이머를 전부 그대로 유지한 채, 마이크가 실제로 시작된 뒤에만 Round Engine에 `PTT_START`를 기록하도록 순서만 바꿨습니다. `VoiceLevelBars.jsx`의 `Math.random()`은 완전히 제거하고 실제 입력 레벨(0.0~1.0)을 받아 반응합니다.

**테스트 중 발견한 버그**: 탭이 백그라운드로 가면 마이크는 즉시 꺼지는데 Round Engine의 `isSpeaking`은 별도 트리거가 없어 계속 `true`로 남아있었습니다 — `PTTButton.jsx`에 감지용 effect를 추가해 고쳤습니다.

**검증 방법**: 실제 Chromium(`--use-fake-device-for-media-stream`)에 합성 tone.wav를 입력으로 흘려 레벨 미터가 실제로 반응함(0.84~1.0)을, 무음 입력에서는 baseline(0.18)에 고정됨을 대조 확인했습니다. Playwright의 `permissions: []` 컨텍스트로 권한 거부 흐름도 실제 UI로 재현해 "마이크 권한 필요"가 정확히 표시되고 `isSpeaking`이 켜지지 않음을 확인했습니다. Warm/Cold 스트림 정책 비교(§7)는 단위 테스트(acquire 호출 횟수)와 실제 Chromium 타이밍(두 번째 송신이 약 40% 빠름) 양쪽으로 확인했고 Warm을 기본으로 권장합니다. 단위 테스트 10개(신규, 누적 41개) 전부 통과, 기존 Room→Round·Target 선택·Score·Gallery·한 화면 레이아웃 회귀 콘솔 에러 0건입니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### Local Media Capture Stabilization v0.2

이번 Sprint의 핵심 질문 하나: **"비동기 작업이 늦게 끝나더라도, 사용자의 손가락이 버튼 위에 없으면 절대 송신하지 않는가?"**

새 파일 `PttPressController.js`(일반 JS 클래스, React 훅 아님 — Node에서 직접 테스트 가능)가 async press race condition을 해결합니다. 단순 토큰 비교로는 부족했습니다 — `startTransmit()`이 진짜 공유 클라이언트를 호출하는 이상 두 press의 비동기 작업이 동시에 진행되면 서로 경쟁할 수 있어서, `runExclusive()`가 **항상 최대 1개 요청만 동시 진행**되도록 직렬화하고 필요시 최신 press로 재시도합니다. `PTTButton.jsx`는 mounted·pointerHeld·generation 3가지를 전부 만족할 때만 Round Engine에 커밋하고, 하나라도 어긋나면 마이크가 이미 켜졌어도 즉시 되돌립니다.

`communicationRoundInvariants.test.js`(신규)는 Mock이 아니라 **실제** `roundReducer.js`+`LocalPttClient.js`를 함께 동작시켜 5개 불변조건(Round/Communication 상태 항상 수렴, 실패 시 이벤트 0건, 정상 press당 START/STOP 각 1회, 언마운트 시 정리)을 전부 확인했습니다. `VoiceLevelBars.jsx`는 이제 비활성(0.06)/활성+무음(0.16 기준선)/활성+감지(실제 level 비례) 3단계를 명확히 구분합니다.

**정직하게 남긴 제한**: "권한 승인 지연 후 취소" 시나리오는 결정론적 Node 테스트로는 실제 production 코드를 통해 확인했지만, `--use-fake-ui-for-media-stream`이 권한을 즉시 자동 수락해 실제 Chromium에서는 재현하지 못했습니다. §7 Warm/Cold 수치는 fake-device 기준이라 실기기 검증이 필요하다고 명시했습니다.

**검증 방법**: 단위 테스트 25개(신규, 누적 56개) 전부 통과 — §3 A~F 전 시나리오(제어된 지연시간으로 결정론적 재현), §8-4로 "동시 2개 in-flight 없음" 직렬화를 명시적으로 측정. 실제 Chromium으로 정상 long press·quick tap 미송신·pointercancel·background 전환·3단계 voice level 시각 분리를 확인했습니다. 기존 Room→Round·대상 게이팅·Score·Gallery·한 화면 레이아웃 회귀 콘솔 에러 0건입니다. 자세한 내용은 `CHANGELOG.md`를 참고하세요.

### Local Media v0.2 Hotfix & Two Device PTT Foundation v0.1

**Part A**: `PttPressController.pointerHeld`가 백그라운드 강제 종료 후에도 `true`로 남아 다음 PTT를 조용히 차단할 수 있던 버그를 고쳤습니다. 6단계 시나리오를 실제 Chromium으로 확인했습니다.

**Part B — 핵심 질문 "재식이 재근을 선택해 누르고 말하면, 재근의 다른 기기에서 실제 목소리가 들리는가?" — 예, 확인했습니다.** Playwright의 독립된 두 `BrowserContext`로 실제 signaling 서버 + 실제 WebRTC를 통해 검증했고, 수신 측 원격 오디오 분석기가 **실제로 0이 아닌 레벨(0.36~0.41)을 측정**해 재생이 실행됐다는 가정이 아니라 오디오가 실제로 도착했음을 객관적으로 확인했습니다.

새 도메인 `src/communication/`(`NetworkPttClient.js`, `PttSignalingClient.js`, `WebRtcTransport.js`)이 `LocalPttClient`와 정확히 같은 `PttClient` 인터페이스를 구현해서 `PTTButton.jsx`는 한 줄도 안 바뀌었습니다. 새 `server/`는 RFC 6455 WebSocket 서버를 Node 내장 모듈만으로 직접 구현했습니다(이 개발 샌드박스가 npm 레지스트리에 접근하지 못해 `ws` 패키지를 설치할 수 없었습니다 — 실제 운영에는 권장하지 않는 임시 조치입니다). Room당 단일 PTT lock을 서버가 소유하고(lease 60초 기본값), Room membership을 서버가 검증합니다.

기존 `ME_PLAYER_ID`(Round Engine의 "나" 식별자)는 건드리지 않기로 판단했습니다 — 완전히 격리된 새 DEV 화면 `TwoDeviceTestScreen.jsx`로 검증했고, `App.jsx`의 메인 `CommunicationProvider`는 여전히 기본값(local)만 쓰며 동작이 전혀 안 바뀝니다(회귀 테스트로 확인).

**정직하게 남긴 제한**: STUN/TURN은 이 샌드박스가 공개 STUN 서버에도 접근하지 못해 같은 머신에서만 검증했고(`iceServers: []`), 4인 확장은 미검증입니다(Mesh는 4인부터 부담이 커진다는 `docs/REAL_PTT_ARCHITECTURE_v1.md`의 SFU 권장을 이번 결과가 재확인합니다). 자세한 내용은 `docs/TWO_DEVICE_PTT_v0.1.md`와 `CHANGELOG.md`를 참고하세요.

## 프로젝트 구조

```
FIELDTALK/
├─ index.html            # Vite 엔트리 HTML
├─ package.json
├─ vite.config.js
├─ README.md
├─ CHANGELOG.md
├─ docs/                 # Round / Shot / Distance Engine 설계 문서 + Watch 확장 검토 (설계만, 미구현)
│  ├─ ROUND_ENGINE_v0.1.md
│  ├─ PLAYER_STATE_v0.1.md
│  ├─ SHOT_DISTANCE_ENGINE_v0.1.md
│  ├─ TECHNICAL_DEBT.md
│  ├─ WATCH_DISTANCE_UX.md   # Apple Watch 확장 구조 검토 (TASK-006, 코드 미구현)
│  ├─ PLAYER_EVENTS.md       # Player Card 이벤트 카탈로그 설계 (TASK-007, 코드 미구현)
│  └─ schemas/
│     ├─ round.example.json
│     └─ shot.example.json
├─ tasks/
│  ├─ TASK-003_ROUND_ENGINE.md
│  └─ TASK-004_SHOT_DISTANCE_ENGINE.md
├─ public/
│  ├─ favicon.svg
│  └─ sounds/            # 카테고리별 사운드 파일 (코드 수정 없이 파일 추가만으로 확장)
│     ├─ gallery/
│     ├─ team/
│     ├─ caddie/
│     ├─ warning/
│     └─ achievement/
└─ src/
   ├─ main.jsx           # React 진입점, 전역 스타일 import
   ├─ App.jsx             # RoundProvider로 감싼 화면 라우팅(splash/home/round) + 전역 토스트
   ├─ engine/                       # Round / Shot / Distance Engine (TASK-003, TASK-004)
   │  ├─ roundReducer.js            # 순수 리듀서 — 모든 상태 전이 규칙이 여기 있음
   │  ├─ roundActions.js            # action type 상수 + action creator
   │  ├─ roundSelectors.js          # selectCurrentHole / selectPlayers / selectTeamDistances 등
   │  ├─ roundStorage.js            # localStorage 저장/복원 + 구버전 데이터 하이드레이션
   │  └─ distanceCalculator.js      # 순수 함수 calculateTeamDistances() — pinLocationStatus로만 보정 적용 분기 (greenSelection은 무관)
   ├─ context/
   │  ├─ RoundProvider.jsx     # useReducer + localStorage persistence + 가드된 PTT 헬퍼
   │  └─ useRound.js           # 컴포넌트에서 Round Engine에 접근하는 훅
   ├─ components/
   │  ├─ StatusBar.jsx        # iPhone 상태 표시줄 + Dynamic Island 목업
   │  ├─ GolfBall.jsx         # 브랜드 마크(골프공) SVG
   │  ├─ SplashScreen.jsx     # 스플래시 화면
   │  ├─ HomeScreen.jsx       # 홈 화면 (라운드 시작 CTA → ROUND_START dispatch, 동반자, 최근 라운드)
   │  ├─ RoundScreen.jsx      # 컴팩트 헤더 + Distance Card + 병합된 Player Summary 패널 + Gallery 오버레이 트리거
   │  ├─ PTTButton.jsx        # 길게 눌러 말하기 — PTT_START/PTT_STOP dispatch (동시발화 가드) + canTransmit 게이팅(Sprint 3)
   │  ├─ VoiceLevelBars.jsx   # PTT 버튼에 쓰이는 실시간 음성 레벨 막대
   │  ├─ PlayerCard.jsx       # Player First 행 = PTT 대상 선택 버튼 — summary/selection prop만 받는 순수 표시용(Sprint 2/3)
   │  ├─ DistanceCard.jsx     # GPS 읽기전용(selectPlayerGps 경유, 실좌표/mock 자동 분기) + "실측 확인·입력" 버튼 + "현재 팀 기준" 카드 + DEV 전용 테스트 코스 적용 컨트롤
   │  ├─ WheelPicker.jsx      # 아이폰 알람 스타일 3자리 독립 휠 (스크롤 스냅 + 탭 선택, 외부 라이브러리 없음)
   │  ├─ GalleryPanel.jsx     # Overlay UI — 카테고리 5개(샷/그린/스코어/즐겨찾기/개인응원), 선택 시 자동으로 닫힘
   │  ├─ SoundButton.jsx      # 카탈로그 1건을 재생하는 범용 버튼 (쿨다운/중복재생 방지/권리 배지)
   │  ├─ PersonalizedCheer.jsx# 참가자 선택 → "{이름} 아이가~!!" TTS 응원. 이제 Gallery 오버레이의 "개인응원" 카테고리로 렌더링됨(파일 자체는 무수정, onPlayed 콜백만 추가)
   │  └─ ScoreCard.jsx        # PAR-relative(E/+N/-N) 주 표시 + 원본 타수 보조 표시 · +/- 시 PLAYER_SET_SCORE dispatch (홀 완료 시 잠금)
   ├─ data/
   │  ├─ seed.js           # (레거시) 사운드 카탈로그용 참가자 더미 — cheerName/voiceGender만 사용됨
   │  ├─ roundSeed.js      # Round Engine 초기 상태 시드 + mockDistanceOffsetM / GPS 기준값 export
   │  └─ soundCatalog.json # 사운드 카탈로그 — 새 항목 추가만으로 버튼이 자동 생성됨
   ├─ services/
   │  └─ audioEngine.js    # 카탈로그 조회, 파일 재생(HTMLAudioElement), TTS 재생(Web Speech API),
   │                        # 중복 재생 방지, 쿨다운, 오류 처리. 출력 대상(phone/headphones/watch)을
   │                        # 확장할 수 있도록 outputTargets 인터페이스로 분리되어 있음(현재는 browser만 구현)
   ├─ hooks/
   │  ├─ useAudioEngine.js # audioEngine.js를 컴포넌트에 연결하는 React 훅
   │  └─ useNowTick.js     # 주기적으로 현재 시각을 다시 흘려보내는 훅 — RoundScreen.jsx에서 한 번만 호출해 전체 Player Summary의 이벤트 만료를 판정(Sprint 2부터 4번→1번으로 통합)
   ├─ utils/
   │  ├─ radio.js            # PTT 무전 chirp 효과음 + 햅틱 헬퍼 (외부 음원 파일 없음)
   │  ├─ distanceFormat.js   # "레이저 · 재식 · 3분 전" 형태의 출처·측정자·시간 포매터
   │  └─ scoreFormat.js      # strokes-par -> E/+N/-N 포맷터 — ScoreCard.jsx와 RoundScreen.jsx 접힌 요약이 공유
   ├─ course/               # Course Reference Prototype v0.1 — Round Engine과 분리된 독립 계층
   │  ├─ geoDistance.js       # 순수 haversine 거리 계산(브라우저 API 무의존)
   │  ├─ geoDistance.test.js  # 단위 테스트 9개 — `node src/course/geoDistance.test.js`로 직접 실행
   │  ├─ testCourseData.js    # 명시적 가상 테스트 코스([TEST] 그린필드 테스트 클럽) — 합성 좌표, 실제 골프장 아님
   │  ├─ normalizeCourse.js   # Provider 원본 → 내부 CourseReference 정규화
   │  └─ providers/
   │     ├─ CourseReferenceProvider.js # Provider 계약(인터페이스)
   │     └─ LocalJsonCourseProvider.js # 유일한 Provider 구현체 — testCourseData.js를 직접 import하는 유일한 파일
   ├─ location/              # LocationProvider 계층 — distanceCalculator/geoDistance는 navigator.geolocation을 직접 호출하지 않음
   │  ├─ LocationProvider.js         # 위치 제공자 계약
   │  ├─ MockLocationProvider.js     # Chromium 검증용 고정 좌표 — 이 프로젝트 테스트가 실제로 쓰는 Provider
   │  └─ BrowserLocationProvider.js  # 실제 navigator.geolocation 래퍼 — HTTPS/권한 거부를 전부 null로 처리
   └─ styles/
      └─ app.css          # 디자인 토큰 및 전체 화면 스타일
```

## 디자인 시스템

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--void` | `#060907` | 배경 (보이드 블랙) |
| `--green-400` | `#2FBE7F` | 라이브/성공 액센트 |
| `--gold` | `#C9A24B` | 프리미엄 강조 (언더파 등) |
| `--red` | `#FF5B4C` | 송신중 · 포어 경고 |

- 타이포그래피: `-apple-system` 기반, 스코어·거리 수치는 `font-variant-numeric: tabular-nums` 적용
- 디바이스: iPhone 16 Pro 논리 해상도(393×852pt) 프레임 + Dynamic Island + 홈 인디케이터
- 시그니처 요소: PTT 버튼을 감싸는 등고선 링 — 골프 그린의 등고선과 무전 신호를 함께 은유

## 기술 스택

- [React 18](https://react.dev/)
- [Vite 5](https://vitejs.dev/)
- [lucide-react](https://lucide.dev/) — 아이콘
- 순수 CSS (Tailwind 미사용) — `src/styles/app.css`에 디자인 토큰과 컴포넌트 스타일을 직접 정의

## 참고

- 모든 데이터는 더미이며 실제 백엔드/네트워크 연동은 없습니다.
- 실제 음성 통신은 구현되어 있지 않으며, PTT 효과음은 Web Audio API로 코드에서 직접 합성합니다.
- 갤러리/개인 응원 사운드는 `soundCatalog.json` 기반이며, `prototype_only`/`review_required` 항목은 출시 전 권리 검토가 반드시 필요합니다 (위 "권리 상태" 절 참고).
- 다음 단계로는 Flutter 이식, 코스 검색/라운드 생성 플로우, 실제 App Store 출시 준비가 예정되어 있습니다.
