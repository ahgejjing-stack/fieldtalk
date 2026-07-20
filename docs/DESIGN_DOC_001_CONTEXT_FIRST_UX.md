# DESIGN DOC-001 — Context First UX

**Status: Design Approved (No Implementation)**

이 문서는 구현 문서가 아니다. Project Eagle(FIELDTALK)의 UX 철학을 정의하는 문서다. 이후 모든 Sprint Brief와 기능 설계는 이 문서를 기준으로 검토한다.

---

## 왜 이 문서가 필요한가

지금까지 "심플한 UI"를 목표로 만들어 왔다. 하지만 Founder의 실제 필드 시뮬레이션 결과, 중요한 사실 하나를 발견했다.

**골퍼는 항상 같은 상태가 아니다.** 샷을 준비하는 순간과 카트를 타고 이동하거나 대기하는 순간은 완전히 다른 UX를 요구한다.

따라서 앞으로의 UX는 **화면(Screen)이 아니라 Context(상황)를 중심으로 설계한다.**

---

## Context 1 — Play Context

사용자가 집중해야 하는 순간.

예) 티샷 준비 · 세컨샷 준비 · 퍼팅 준비 · 거리 확인 · PTT · 스코어 입력

**원칙**
- Don't Interrupt Concentration
- Less App. More Golf.
- Watch First
- One Tap
- Zero Thinking

보여줄 정보는 현재 행동에 필요한 것만.

---

## Context 2 — Relax Context

사용자가 여유를 가지는 순간.

예) 카트 이동 · 홀 종료 후 · 대기 · 전반 종료 · 라운드 종료

**원칙**

사용자는 정보를 '소비'하려는 상태다. Play Context보다 조금 더 풍부한 정보를 제공할 수 있다.

하지만 **새로운 기능을 만드는 것이 아니라, 이미 존재하는 데이터를 더 보기 좋게, 더 즐겁게, 더 의미 있게 보여준다.**

예) 홀 결과 · 팀 스코어 · 응원 기록 · Gallery · 오늘의 라운드

---

## Transition

V1에서는 새로운 감지 로직을 만들지 않는다. **Round Engine의 기존 상태를 활용하여 Relax Context 진입 시점을 결정한다.**

이 원칙은 단순성과 유지보수를 위해 유지한다. 향후 User Context(예: GPS/가속도 기반 자동 감지)로 확장 가능하지만, 현재는 설계 범위에 포함하지 않는다.

---

## Design Principle

같은 앱 안에 두 개의 화면을 만드는 것이 아니다. **같은 컴포넌트가 상황(Context)에 따라 우선순위만 달라진다.**

예)
```
Play:   거리 → PTT → 공유
Relax:  홀 결과 → 팀 정보
```
(거리와 PTT는 사라지는 것이 아니라 우선순위가 내려간다.)

---

## Future Rule

앞으로 새로운 기능을 설계할 때 항상 먼저 질문한다.

> "이 기능은 Play Context인가? Relax Context인가?"

이 질문에 답하지 못하면 기능을 추가하지 않는다.

---

## Engineering Note (구현 시 참고용, 이번 Sprint 범위 아님)

Founder 검토 세션에서 나온 참고 사항 — 실제 구현 Sprint가 열릴 때를 위해 남겨둔다.

- **Round Engine의 상태 전환 3곳이 Relax Context 진입점 후보**: 홀 완료→다음 홀 시작 전, 9번 홀→10번 홀(전후반 전환), 라운드 완료. 세 곳 모두 이미 Round Engine이 추적하는 상태이므로 새 판단 로직이 필요 없다.
- 홀 "내부"에서 벌어지는 이동 시간(예: 티샷 후 걸어가는 동안)은 이 방식으로는 못 잡는다 — 오판으로 Play Context를 방해하는 것보다 안전한 쪽을 택한 의도적 설계 범위 제한.
- PTT는 두 Context 모두에서 동일한 접근성을 유지해야 한다 — Relax Context의 "정보가 풍부해짐"이 PTT 우선순위를 밀어내는 방향으로 가면 안 된다.
- 거리 등 핵심 수치는 두 Context에서 계산/반올림 방식이 일치해야 한다 — 같은 세션 안에서 두 화면이 두 개의 다른 숫자를 보여주면 신뢰가 깨진다.
