import React, { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import VoiceLevelBars from "./VoiceLevelBars.jsx";
import { useRound } from "../context/useRound.js";
import { useCommunication } from "../context/useCommunication.js";
import { playRadioTone, triggerHaptic } from "../utils/radio.js";
import { PttPressController } from "../communication/PttPressController.js";

/**
 * Local Media Capture Stabilization v0.2 §1/§2/§4 — this file still knows
 * nothing about getUserMedia/AudioContext/MediaStream; it only calls
 * communication.startTransmit()/stopTransmit(). Every existing UX
 * behavior (target gating, chirp tones, haptics, ripple/breathing
 * animation, transmit timer) is unchanged.
 *
 * What's new this Sprint: handleStart() is async (startTransmit() can
 * take an arbitrary time — permission prompt, device acquisition), so a
 * PttPressController instance decides, once that await resolves, whether
 * the user is STILL holding the button before committing to Round
 * Engine's startPtt()/tone/haptic. If not, the microphone (which may have
 * genuinely started) is rolled back and nothing else happens — "사용자의
 * 손가락이 버튼 위에 없으면 절대 송신하지 않는다".
 */
export default function PTTButton({ onToast, canTransmit = true, onBlockedPress, targetUserIds = [] }) {
  const { round, meId, startPtt, stopPtt } = useRound();
  const communication = useCommunication();
  const me = round.players.find((p) => p.id === meId);
  const isTransmitting = !!(me && me.communication.isSpeaking);

  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef(null);
  // Tracks whether Round Engine's PTT_START was actually dispatched for
  // the CURRENT press — distinct from PttPressController's pointerHeld,
  // which only tracks physical pointer state. Guards against duplicate
  // pointerup/pointerleave/pointercancel firing for one press and
  // double-triggering end-of-transmission side effects.
  const pressedRef = useRef(false);
  const controllerRef = useRef(null);
  if (!controllerRef.current) controllerRef.current = new PttPressController();

  useEffect(() => {
    const controller = controllerRef.current;
    controller.setMounted(true);
    return () => {
      controller.setMounted(false);
      // Hotfix v0.2: a forced cleanup must never leave pointerHeld stuck
      // true — if the browser/OS never delivers pointercancel (exactly
      // the background-reentry case this Hotfix targets), a stale
      // pointerHeld=true would block every future press via handleStart's
      // "if (controller.pointerHeld) return;" guard.
      controller.endPress();
      // §3-F / §4 Invariant 5: unmounting mid-transmission must still
      // fully clean up both sides — a pending async attempt will see
      // isStillValid() go false on its own, but an ALREADY-committed
      // transmission needs an explicit stop here.
      if (pressedRef.current) {
        pressedRef.current = false;
        communication.stopTransmit();
        stopPtt(meId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isTransmitting) {
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isTransmitting]);

  // §8 Background Safety (v0.1): CommunicationProvider stops the
  // microphone on its own (visibilitychange/pagehide) without going
  // through handleEnd() — it deliberately knows nothing about Round
  // Engine or PttPressController. This effect is what finishes BOTH the
  // Round Engine side (isSpeaking never outlives the actual microphone,
  // §4 Invariant 2) AND — Hotfix v0.2 — the press controller's
  // pointerHeld flag, which handleEnd() normally releases but never runs
  // in this external-stop path. Without this, a background tab-switch
  // that the browser/OS never sends a pointercancel for would leave
  // pointerHeld stuck true, silently blocking every PTT press after the
  // user returns to the app.
  useEffect(() => {
    if (!communication.isTransmitting && pressedRef.current) {
      pressedRef.current = false;
      controllerRef.current.endPress();
      stopPtt(meId);
    }
  }, [communication.isTransmitting, meId, stopPtt]);

  // §1/§2: the actual attempt body PttPressController serializes and
  // retries. Only ever touches Round Engine / tone / haptic in the
  // "still valid" branch.
  const attemptTransmit = async (generation) => {
    const controller = controllerRef.current;
    const micResult = await communication.startTransmit(targetUserIds);

    if (!controller.isStillValid(generation)) {
      // User already released, a newer press superseded this one, or we
      // unmounted while this was in flight. Never touch Round Engine or
      // play any tone/haptic — just undo the microphone if it did start.
      if (micResult.ok) communication.stopTransmit();
      return;
    }

    if (!micResult.ok) {
      if (onToast) {
        onToast(
          micResult.reason === "permission_denied"
            ? "마이크 권한이 필요합니다."
            : micResult.reason === "no_target"
            ? "먼저 전달할 대상을 선택하세요."
            : micResult.reason === "room_locked"
            ? // Part H: never surface the raw server reason code — use the
              // speaker name we already know from the last speaker_changed
              // broadcast when available, a generic retry hint otherwise.
              communication.remoteSpeakerName
              ? `${communication.remoteSpeakerName}님이 말하는 중입니다.`
              : "잠시 후 다시 시도해 주세요."
            : "마이크를 사용할 수 없습니다."
        );
      }
      return;
    }

    // Only record PTT_START in Round Engine once the microphone actually
    // started AND the press is still current — never any other order.
    const result = startPtt(meId);
    if (!result.ok) {
      // Rare race: someone else started speaking between the pre-check in
      // handleStart and now. Roll back the microphone we just activated.
      communication.stopTransmit();
      if (onToast) onToast(`${result.speakerName}님이 말하는 중입니다.`);
      return;
    }

    pressedRef.current = true;
    triggerHaptic(18);
    playRadioTone("start");
  };

  const handleStart = (e) => {
    e.preventDefault();
    const controller = controllerRef.current;
    if (controller.pointerHeld) return; // duplicate pointerdown while already held

    // Sprint 3: "말하기 전에 누구에게 말할지 먼저 선택한다" — pressing PTT
    // with no target selected never reaches the microphone at all.
    if (!canTransmit) {
      if (onBlockedPress) onBlockedPress();
      return;
    }

    // Cheap pre-check against Round Engine's existing single-speaker rule,
    // BEFORE touching the microphone — avoids ever starting real capture
    // just to immediately have to roll it back.
    const speaker = round.players.find((p) => p.id !== meId && p.communication.isSpeaking);
    if (speaker) {
      if (onToast) onToast(`${speaker.name}님이 말하는 중입니다.`);
      return;
    }

    const generation = controller.beginPress();
    controller.runExclusive(generation, attemptTransmit);
  };

  const handleEnd = () => {
    controllerRef.current.endPress();
    if (!pressedRef.current) return; // never actually committed (still pending, or blocked) — the pending attempt's own validity check handles cleanup
    pressedRef.current = false;
    communication.stopTransmit();
    stopPtt(meId);
    triggerHaptic(10);
    playRadioTone("end");
  };

  return (
    <div className="ft-ptt-zone">
      <div className={`ft-ptt-wrap ${isTransmitting ? "is-on" : ""}`}>
        <svg className="ft-ptt-contours" viewBox="0 0 220 220">
          <circle cx="110" cy="110" r="104" />
          <circle cx="110" cy="110" r="86" />
          <circle cx="110" cy="110" r="68" />
        </svg>
        {isTransmitting && (
          <>
            <span className="ft-ripple" style={{ animationDelay: "0s" }} />
            <span className="ft-ripple" style={{ animationDelay: "0.5s" }} />
            <span className="ft-ripple" style={{ animationDelay: "1s" }} />
          </>
        )}
        <button
          className="ft-ptt-btn"
          onPointerDown={handleStart}
          onPointerUp={handleEnd}
          onPointerLeave={handleEnd}
          onPointerCancel={handleEnd}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Mic size={36} strokeWidth={1.8} />
        </button>
      </div>
      <div className="ft-ptt-label">
        {isTransmitting ? (
          <span className="ft-ptt-live-label">
            송신중 · 0:{String(seconds).padStart(2, "0")}
          </span>
        ) : (
          <span>길게 눌러 말하기</span>
        )}
      </div>
      <VoiceLevelBars active={isTransmitting} level={communication.inputLevel} voiceDetected={communication.voiceDetected} />
    </div>
  );
}
