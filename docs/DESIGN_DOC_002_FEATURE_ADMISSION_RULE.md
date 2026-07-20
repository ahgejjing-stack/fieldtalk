# DESIGN DOC-002 — Feature Admission Rule

**Status: Design Approved (No Implementation)**

---

## 목적

FIELDTALK는 기능이 부족해서 실패하는 앱이 아니라, 기능이 많아져서 방향을 잃을 위험이 더 크다.

따라서 앞으로 새로운 기능은 구현 전에 반드시 아래 규칙을 통과해야 한다.

---

## Admission Rule

새로운 기능은 아래 네 가지 질문을 모두 통과해야 한다.

1. **Play Context를 방해하지 않는가?**
   NO → Reject

2. **기존 기능으로 해결할 수 없는 문제인가?**
   NO → Reject

3. **One Tap / Zero Thinking 원칙을 유지하는가?**
   NO → Reject

4. **실제 필드 테스트에서 필요성이 확인되었는가?**
   NO → Backlog

---

## Decision Flow

```
PASS
  ↓
Design Review
  ↓
Sprint
  ↓
Implementation
```

---

## Important

좋은 아이디어와 좋은 기능은 다르다.

FIELDTALK는 기능을 추가하는 제품이 아니라 **필요한 기능만 남기는 제품**이다.

---

## Engineering Note (적용 방식, 이번 Sprint 범위 아님)

- 1~3번 질문 중 하나라도 NO면 그 시점에서 즉시 Reject — 나머지 질문까지 갈 필요 없다.
- 4번(필드 테스트 필요성 미확인)은 Reject가 아니라 **Backlog** — 아이디어 자체는 나쁘지 않지만 지금 만들 근거가 부족하다는 뜻. DESIGN DOC-001의 Future Rule("Play Context인가 Relax Context인가")과 이 네 가지 질문은 같은 시점에 함께 검토한다 — Context 질문에 답 못 하면 애초에 1번 질문("Play Context를 방해하지 않는가")도 판단할 수 없다.
- 이 문서 승인 이후 접수되는 모든 기능 요청은, 구현에 들어가기 전에 이 네 가지 질문을 먼저 명시적으로 통과시키고 그 결과를 보고한다.
