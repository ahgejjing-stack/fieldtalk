import React, { useEffect, useRef, useState } from "react";
import { Check, Mic } from "lucide-react";
import { courseReferenceService, courseProviderA } from "../course/courseReferenceServiceInstance.js";
import { useIdentity } from "../context/useIdentity.js";

/**
 * CreateRoomScreen.jsx — RC4 "방 만들기" 화면.
 * ------------------------------------------------------------------
 * Product Director 결정에 따라 "라운드 준비"와 역할을 분리한다.
 *
 *   방 만들기 화면  = 설정 (여기)
 *   Room 화면       = 생성 완료 후 대기
 *   ROUND START     = 게임 시작
 *
 * 핵심 UX 규칙:
 *  - [방 만들기] 버튼을 누르기 전에는 Room을 생성하지 않는다.
 *  - 배경(스크림) 터치로 닫히지 않는다. X 버튼도 두지 않는다.
 *    방을 만드는 도중 실수로 밖을 눌러 작업이 사라지면 안 되기 때문.
 *  - 나가려면 명시적인 [취소] 버튼만 사용한다.
 * ------------------------------------------------------------------
 */

// 코스 로딩 실패 시에도 방 만들기가 막히지 않도록 하는 내장 코스.
const FALLBACK_COURSE = {
  id: "fallback_course_18",
  course: { id: "fallback_course_18", name: "기본 코스", holeCount: 18 },
  golfClub: { name: "FieldTalk" },
  holes: Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4 })),
};

export default function CreateRoomScreen({ isOpen, onCancel, onCreate, onToast }) {
  const identity = useIdentity();

  const [title, setTitle] = useState("");
  const [courses, setCourses] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState(null);
  const [startHole, setStartHole] = useState(1);
  const [micChecked, setMicChecked] = useState(false);
  const [micBusy, setMicBusy] = useState(false);
  const didInitTitle = useRef(false);

  const defaultTitle = `${identity.displayName}님의 라운드`;

  // 열릴 때마다 초기화. 제목은 기본값을 미리 채워 사용자가 바로 수정할 수 있게 한다.
  useEffect(() => {
    if (!isOpen) {
      didInitTitle.current = false;
      return;
    }
    if (!didInitTitle.current) {
      didInitTitle.current = true;
      setTitle(defaultTitle);
      setStartHole(1);
      setMicChecked(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // 코스 목록 로딩. 실패해도 FALLBACK_COURSE로 진행 가능하게 둔다.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    courseReferenceService.setProvider(courseProviderA);
    courseReferenceService
      .listAvailableCourses()
      .then((list) => {
        if (cancelled) return;
        const safe = list && list.length > 0 ? list : [FALLBACK_COURSE];
        // eslint-disable-next-line no-console
        console.log("[CREATE ROOM] course load", `count=${safe.length}`, `first=${safe[0]?.id}`);
        setCourses(safe);
        setSelectedCourseId(safe[0]?.id ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error("[CREATE ROOM] course load FAILED — using fallback", err?.message ?? err);
        setCourses([FALLBACK_COURSE]);
        setSelectedCourseId(FALLBACK_COURSE.id);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedCourse = courses.find((c) => c.id === selectedCourseId) ?? courses[0] ?? FALLBACK_COURSE;
  const maxHole = selectedCourse?.course?.holeCount ?? 18;

  async function handleMicCheck() {
    if (micBusy) return;
    setMicBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicChecked(true);
      onToast?.("마이크 확인 완료");
    } catch (err) {
      // 마이크는 필수 조건이 아니다. 실패해도 방은 만들 수 있어야 한다.
      // eslint-disable-next-line no-console
      console.warn("[CREATE ROOM] mic check failed", err?.name ?? err);
      onToast?.("마이크 권한을 확인해주세요. 나중에 다시 할 수 있습니다.");
    } finally {
      setMicBusy(false);
    }
  }

  function handleCreate() {
    const finalTitle = (title ?? "").trim() || defaultTitle;
    // eslint-disable-next-line no-console
    console.log("[CREATE ROOM] submit", `title=${finalTitle}`, `course=${selectedCourse?.id}`, `startHole=${startHole}`, `micChecked=${micChecked}`);
    onCreate({ title: finalTitle, course: selectedCourse, startHole });
  }

  return (
    <div style={S.overlay}>
      {/* RC4 — 스크림에 onClick을 두지 않는다. 배경 터치로는 절대 닫히지 않는다. */}
      <div style={S.scrim} />
      <div style={S.sheet}>
        <div style={S.header}>방 만들기</div>

        <div style={S.scroll}>
          {/* ① 방 제목 */}
          <label style={S.label}>방 제목</label>
          <input
            style={S.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={defaultTitle}
            maxLength={40}
          />

          {/* ② Host */}
          <label style={S.label}>Host</label>
          <div style={S.readonlyRow}>
            {identity.displayName}
            <span style={S.hostBadge}>Host</span>
          </div>

          {/* ③ 코스 선택 */}
          <label style={S.label}>코스</label>
          <div style={S.chipWrap}>
            {courses.map((c) => {
              const active = c.id === selectedCourse?.id;
              return (
                <button
                  key={c.id}
                  style={{ ...S.chip, ...(active ? S.chipActive : null) }}
                  onClick={() => {
                    setSelectedCourseId(c.id);
                    setStartHole(1);
                  }}
                >
                  {active && <Check size={13} strokeWidth={3} />}
                  {c.course?.name ?? c.id}
                </button>
              );
            })}
          </div>

          {/* ④ 시작 홀 */}
          <label style={S.label}>시작 홀</label>
          <div style={S.chipWrap}>
            {[1, 10].filter((h) => h <= maxHole).map((h) => (
              <button
                key={h}
                style={{ ...S.chip, ...(startHole === h ? S.chipActive : null) }}
                onClick={() => setStartHole(h)}
              >
                {h}번 홀
              </button>
            ))}
          </div>

          {/* ⑤ 마이크 확인 */}
          <label style={S.label}>마이크 확인</label>
          <button style={{ ...S.micBtn, ...(micChecked ? S.micDone : null) }} onClick={handleMicCheck}>
            {micChecked ? <Check size={16} strokeWidth={3} /> : <Mic size={16} strokeWidth={2.2} />}
            {micChecked ? "마이크 확인됨" : micBusy ? "확인 중…" : "마이크 확인하기"}
          </button>
          <p style={S.hint}>선택 사항입니다. 나중에 라운드 중에도 확인할 수 있습니다.</p>
        </div>

        {/* 하단 고정 CTA — 명시적 버튼으로만 동작한다. */}
        <div style={S.cta}>
          <button style={S.cancelBtn} onClick={onCancel}>
            취소
          </button>
          <button style={S.createBtn} onClick={handleCreate}>
            방 만들기
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position: "fixed", inset: 0, zIndex: 99998, display: "flex", flexDirection: "column", justifyContent: "flex-end" },
  scrim: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" },
  sheet: {
    position: "relative",
    background: "#1c1c1e",
    color: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "88vh",
    display: "flex",
    flexDirection: "column",
  },
  header: { padding: "18px 16px 10px", fontSize: 18, fontWeight: 700, textAlign: "center" },
  scroll: { padding: "0 16px", overflowY: "auto", flex: 1 },
  label: { display: "block", fontSize: 12, color: "#8e8e93", margin: "16px 0 6px", fontWeight: 600 },
  input: {
    width: "100%",
    minHeight: 48,
    background: "#2c2c2e",
    color: "#fff",
    border: "1px solid #3a3a3c",
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 16,
    boxSizing: "border-box",
  },
  readonlyRow: {
    minHeight: 48,
    background: "#2c2c2e",
    borderRadius: 10,
    padding: "12px 14px",
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  hostBadge: { fontSize: 11, color: "#ffd60a", border: "1px solid #ffd60a", borderRadius: 6, padding: "2px 6px" },
  chipWrap: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    padding: "10px 14px",
    background: "#2c2c2e",
    color: "#fff",
    border: "1px solid #3a3a3c",
    borderRadius: 10,
    fontSize: 15,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  chipActive: { background: "#0a84ff", borderColor: "#0a84ff", fontWeight: 700 },
  micBtn: {
    width: "100%",
    minHeight: 52,
    background: "#2c2c2e",
    color: "#fff",
    border: "1px solid #3a3a3c",
    borderRadius: 10,
    fontSize: 16,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  micDone: { background: "#1e3a2a", borderColor: "#30d158", color: "#30d158" },
  hint: { fontSize: 12, color: "#8e8e93", margin: "8px 0 4px" },
  cta: {
    display: "flex",
    gap: 10,
    padding: "12px 16px calc(12px + env(safe-area-inset-bottom))",
    borderTop: "1px solid #2c2c2e",
  },
  cancelBtn: {
    flex: 1,
    minHeight: 56,
    background: "#3a3a3c",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    fontSize: 17,
    fontWeight: 600,
  },
  createBtn: {
    flex: 2,
    minHeight: 56,
    background: "#0a84ff",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    fontSize: 17,
    fontWeight: 700,
  },
};
