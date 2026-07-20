# WATCH_DISTANCE_UX.md — Apple Watch로 Distance UX 확장 가능성 검토

> **범위 안내**: 이 문서는 설계 검토 문서입니다. 이 문서에 적힌 어떤 항목도
> TASK-006에서 실제 코드로 구현하지 않았습니다. `src/` 아래 어떤 파일도
> 이 문서 때문에 수정되지 않았습니다 — 아래 "필요한 리팩토링" 절에 적힌
> 변경들은 전부 **미래에 Watch 대응을 실제로 시작할 때** 하면 되는 일들의
> 목록입니다.

## 검토 대상 시나리오

미래에 Apple Watch 컴패니언 앱에서:

1. GPS 참고 거리 자동 표시
2. 사용자는 Digital Crown으로 숫자만 수정
3. 완료하면 자동 공유
4. 자동으로 PTT 대기 화면 복귀

TASK-006에서 완성한 폰 쪽 Distance UX(`DistanceCard.jsx` + `WheelPicker.jsx`)가 이 4가지를 그대로 지원할 수 있는 구조인지 검토합니다.

## 결론 요약

| 항목 | 현재 구조로 확장 가능? | 비고 |
| --- | --- | --- |
| ① GPS 참고 거리 자동 표시 | ✅ 그대로 가능 | `distance.gps`는 이미 플랫폼 무관 데이터 |
| ② Digital Crown으로 수정 | ⚠️ 입력 UI만 새로 필요 | `WheelPicker.jsx`(3-wheel)는 폰 전용. 로직은 재사용 가능하지만 **분리해야** 함 |
| ③ 완료 시 자동 공유 | ✅ 로직은 이미 존재 | `performSend()`가 정확히 이 역할. 단, 현재 `DistanceCard.jsx` 안에 갇혀 있어 추출 필요 |
| ④ 자동 PTT 화면 복귀 | ❌ 재설계 필요 | 현재 구현이 `document.querySelector(".ft-ptt-zone")`처럼 **웹 DOM에 강하게 결합**되어 있어 watchOS에는 이 코드가 그대로 존재하지 않음 |

**한 줄 결론**: 계산/판단 로직(순수 함수·리듀서)은 이미 플랫폼 무관하게 잘 분리되어 있어 그대로 재사용 가능합니다. 다만 **"확인 후 자동 처리" 흐름을 감싸는 오케스트레이션 코드가 지금은 `DistanceCard.jsx` 컴포넌트 내부에, 그리고 부수 효과(DOM 스크롤, Web Speech API)가 브라우저 환경에 직접 결합되어 있어**, 코드 수정 없이 워치로 그대로 확장하는 것은 불가능합니다. 아래에 구체적으로 어디를 어떻게 분리해야 하는지 적었습니다.

---

## 1. 이미 플랫폼 무관한 부분 (그대로 재사용 가능)

이 부분들은 Watch 대응을 시작해도 **손댈 필요가 없습니다**:

- **`src/engine/distanceCalculator.js`의 `calculateTeamDistances()`** — 순수 함수, React·DOM·Web API 어디에도 의존하지 않습니다. Watch에서 호출해도(같은 JS 런타임이라면) 그대로 동작합니다.
- **`src/engine/roundReducer.js` / `roundActions.js` / `roundSelectors.js`** — Round Engine 자체가 이미 순수 리듀서 패턴이라 입력(액션)과 출력(상태)만 맞으면 어떤 UI에서 dispatch하든 상관없습니다.
- **`distance.gps` 데이터 모델** — `{ valueM, source, updatedAt, measuredBy }` 구조 자체는 워치든 폰이든 동일하게 의미가 통합니다. GPS 참고값 자동 표시(①)는 이 데이터를 읽어서 숫자만 그리면 되므로 **구조 변경이 전혀 필요 없습니다.**
- **`src/utils/distanceFormat.js`의 `getGpsDiffWarning()`** — 순수 함수. Watch UI가 작은 화면에 경고를 어떻게 배치할지는 다르겠지만, "8m 이상 차이나면 경고 문자열을 반환한다"는 판단 로직 자체는 그대로 재사용 가능합니다.

## 2. 재설계가 필요한 부분

### 2-1. 입력 UI: 3-Wheel Picker → Digital Crown

`WheelPicker.jsx`는 "세 자리 숫자를 각각 독립적으로 스와이프"하는 아이폰 알람 스타일 UI로, **폰의 넓은 화면과 정밀한 터치를 전제**로 설계되었습니다. Digital Crown은 이와 다른 입력 모델입니다:

- Crown은 **연속된 하나의 값을 회전으로 증감**시키는 입력 장치입니다. "백의 자리/십의 자리/일의 자리를 따로 조작"하는 개념이 아니라, "전체 숫자를 ±1m 단위로 굴린다"는 TASK-005 이전의 +/- 스테퍼에 더 가까운 모델입니다.
- 따라서 **`WheelPicker.jsx` 자체를 워치에 이식하는 것은 적절하지 않습니다.** 대신 워치 전용의 별도 입력 컴포넌트(가칭 `CrownDistanceAdjuster`, 네이티브 SwiftUI에서는 `.digitalCrownRotation()` 모디파이어)를 새로 만들어야 합니다.
- 다만 이 새 컴포넌트가 다뤄야 할 **상태와 판단 로직**(현재 값, GPS와의 차이, 8m 경고 여부, 완료 시 무엇을 할지)은 폰과 동일해야 하므로, 아래 2-2에서 이 부분을 추출하는 것을 제안합니다.

### 2-2. "확인 로직"을 컴포넌트에서 분리 — `useDistanceConfirm()` 훅 제안

현재 `DistanceCard.jsx`에는 다음이 전부 한 컴포넌트 안에 섞여 있습니다:

- `localValue` 상태와 GPS 변경 시 재동기화
- `performSend()` — 검증 → dispatch → 토스트 → 음성 안내 → 복귀 스크롤
- `handleShareNow()` / `handleWheelDone()` — 두 진입점 모두 `performSend()` 호출

이 중 **"무엇을 할지 결정하는 로직"**(위 목록의 위 세 가지)과 **"그 결과를 화면에 어떻게 그릴지"**(Wheel Picker JSX, 버튼 배치, CSS)가 아직 분리되어 있지 않습니다. 워치를 포함해 향후 다른 입력 방식(Crown, 음성 전용 워치 UI 등)이 동일한 판단 로직을 재사용하려면, 다음과 같은 형태의 훅으로 분리하는 것을 제안합니다(가칭, 실제 구현은 이번 범위 아님):

```js
// src/hooks/useDistanceConfirm.js (제안 — 아직 존재하지 않음)
function useDistanceConfirm({ onConfirmed, speak }) {
  // localValue, GPS 동기화, 8m 경고 계산은 그대로 이식
  // performSend()는 그대로 두되, 부수 효과 두 가지를 인자로 받는다:
  //   - onConfirmed(): 완료 후 "돌아갈 화면"을 여는 동작 (웹은 스크롤, 워치는 네이티브 화면 전환)
  //   - speak(text): 음성 안내 방법 (웹은 Web Speech API, 워치는 다른 구현)
  return { localValue, setLocalValue, warningText, shareNow, confirmAndShare };
}
```

이렇게 분리하면:
- `DistanceCard.jsx`(폰)는 이 훅을 사용하며 `onConfirmed = () => document.querySelector(".ft-ptt-zone")?.scrollIntoView(...)`를 넘긴다.
- 미래의 워치 UI는 같은 훅을 사용하며 `onConfirmed = () => navigateToPttStandby()` (워치 앱의 네이티브 화면 전환)를 넘긴다.
- 두 플랫폼이 "GPS와 비교해서 8m 이상이면 경고", "완료하면 dispatch" 같은 **판단 로직을 이중으로 구현하지 않아도** 됩니다.

### 2-3. "PTT 화면 복귀"의 DOM 결합 문제

TASK-005/006에서 구현한 "완료 후 자동 복귀"는 다음과 같이 구현되어 있습니다:

```js
document.querySelector(".ft-ptt-zone")?.scrollIntoView({ behavior: "smooth", block: "center" });
```

이건 **웹 페이지 안에서 같은 화면 내 스크롤 위치를 옮기는 것**이라 워치 앱(네이티브 SwiftUI/WatchKit)에는 `document`도 `.ft-ptt-zone`이라는 CSS 클래스도 존재하지 않습니다. 이 부분은 반드시 2-2에서 제안한 `onConfirmed()` 콜백으로 추상화해야 하며, 실제 워치 구현 시점에는 SwiftUI의 `NavigationPath` pop 이나 화면 전환 API로 대체되어야 합니다. **이것이 이번 검토에서 가장 명확하게 "코드 수정 없이는 워치로 못 간다"고 판단한 지점입니다.**

### 2-4. 음성 안내 — 이미 확장 지점이 마련되어 있음 (TASK-002 설계 재확인)

`services/audioEngine.js`는 애초부터 다음과 같이 설계되어 있었습니다:

```js
const outputTargets = {
  browser: { playFile(...), speak(...) },
  // 향후 phone/headphones/watch 등을 여기에 추가
};
```

TASK-006의 `speakText()` 음성 안내("팀원에게 거리를 공유했습니다.")는 지금 `outputTargets.browser.speak()`(Web Speech API)를 씁니다. 워치 대응 시에는:

- `outputTargets.watch`를 추가하고, watchOS 쪽에서는 `AVSpeechSynthesizer` 대신 **햅틱 피드백**(`WKInterfaceDevice.current().play(.success)` 등)으로 대체하는 편이 워치 UX 관례에 더 맞을 가능성이 높습니다(워치에서 음성 합성으로 소리를 내는 것은 골프장에서 오히려 방해가 될 수 있음 — 이 판단은 실제 구현 시점에 다시 검토 필요).
- 다행히 이 구조는 **TASK-002 때 이미 이런 확장을 염두에 두고 설계**되어 있었기 때문에, `resolveTargetName()` 함수만 플랫폼을 인식하도록 바꾸면 되고 `speakText()`를 호출하는 쪽(`useDistanceConfirm()`)은 손댈 필요가 없습니다. 기존 설계가 정확히 이 문제를 미리 대비하고 있었다는 점을 확인했습니다.

### 2-5. 상태 동기화 — Round Engine은 폰이 계속 "정본"이어야 함

가장 중요한 구조적 결론입니다: **워치 앱은 자기만의 Round Engine 사본을 가지면 안 됩니다.**

- 현재 `RoundProvider.jsx` / `useRound()`는 하나의 React 런타임 안에서만 동작하는 Context입니다. watchOS 앱은 별도의 네이티브(Swift/SwiftUI) 프로세스이므로 이 React Context를 **그대로 공유할 수 없습니다.**
- 만약 워치가 자체적으로 Round Engine 상태를 들고 있다가 독립적으로 `TEAM_DISTANCE_SHARE`를 계산해버리면, 폰과 워치의 라운드 상태가 서로 어긋날 위험이 있습니다(두 개의 "정본"이 생기는 문제).
- 권장 구조: **워치는 얇은 리모컨**입니다. 워치에서 Digital Crown으로 숫자를 맞추고 완료하면, 워치는 계산을 직접 하지 않고 **"이 숫자를 확인했다"는 메시지만 폰으로 보냅니다.** 폰이 이 메시지를 받아 기존 `teamDistanceShare()` 액션을 그대로 dispatch합니다. 계산(`calculateTeamDistances`)과 상태 갱신은 계속 폰에서만 일어납니다.

제안하는 메시지 형태(실제 WatchConnectivity 프레임워크 코드는 아직 작성하지 않음, 페이로드 형태만 제안):

```json
// 워치 → 폰
{ "type": "WATCH_DISTANCE_CONFIRMED", "valueM": 137, "confirmedAt": "2026-07-15T09:00:00.000Z" }

// 폰 → 워치 (라운드 화면을 열 때 최초 동기화 + 매 홀 갱신 시)
{ "type": "PHONE_ROUND_SNAPSHOT", "holeNumber": 7, "gpsValueM": 136, "measuredValueM": 132 }
```

폰 쪽에서 `WATCH_DISTANCE_CONFIRMED`를 받으면 하는 일은 지금 `handleWheelDone()`이 하는 일과 **완전히 동일**합니다 — 그래서 2-2에서 제안한 `useDistanceConfirm()` 훅의 `confirmAndShare(value)` 함수를, 워치에서 온 메시지를 처리하는 핸들러가 그대로 호출하기만 하면 됩니다.

---

## 3. 결론 및 권장 순서 (실제 구현 시)

이번 TASK-006에서는 아무것도 구현하지 않았습니다. 실제로 워치 대응을 시작하게 되면 아래 순서를 권장합니다:

1. `DistanceCard.jsx`에서 확인/공유 로직을 `useDistanceConfirm()` 훅으로 추출(웹 동작은 100% 동일하게 유지되어야 함 — 순수 리팩토링).
2. `document.querySelector(".ft-ptt-zone")` 직접 호출을 `onConfirmed` 콜백 인자로 교체.
3. `audioEngine.js`에 `outputTargets.watch` 자리 추가(당장은 미구현이어도 인터페이스만 맞춰둠).
4. WatchConnectivity 메시지 계약(위 2-5의 JSON 형태)을 정식 스펙 문서로 확정.
5. 그 다음에야 실제 watchOS(SwiftUI) 프로젝트를 시작 — Digital Crown 입력 컴포넌트 + 워치용 "PTT 대기" 화면 + 위 메시지 송수신 구현.

이 순서대로면 1~3번까지는 **웹 앱의 기존 동작을 전혀 바꾸지 않는 순수 리팩토링**이라 언제 진행해도 회귀 위험이 낮습니다. 4~5번부터가 실제 "새 기능 추가"입니다.
