import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { LocalPttClient } from "../communication/LocalPttClient.js";
import { NetworkPttClient } from "../communication/NetworkPttClient.js";
import { PttSignalingClient } from "../communication/PttSignalingClient.js";
import { WebRtcTransport } from "../communication/WebRtcTransport.js";
import { BrowserAudioCapture } from "../communication/adapters/BrowserAudioCapture.js";
import { COMMUNICATION_STATES } from "../communication/communicationState.js";
import { COMMUNICATION_MODES, DEFAULT_COMMUNICATION_MODE } from "../config/communicationMode.js";

const CommunicationContext = createContext(null);

// §7: "Pre-Round 테스트 후 Warm... 후속 Sprint 가능" — warm is this
// Sprint's recommended default. A DEV override is exposed via the
// `streamLifecycle` prop for the Warm/Cold comparison itself.
const DEFAULT_STREAM_LIFECYCLE = "warm";

function buildClient({ communicationMode, streamLifecycle, networkConfig }) {
  if (communicationMode === COMMUNICATION_MODES.NETWORK) {
    if (!networkConfig) throw new Error("CommunicationProvider: networkConfig required for network mode");
    return new NetworkPttClient({
      audioCapture: new BrowserAudioCapture(),
      signalingClient: new PttSignalingClient(networkConfig.signalingUrl),
      identity: networkConfig.identity,
      iceServers: networkConfig.iceServers ?? [],
      WebRtcTransportClass: WebRtcTransport,
    });
  }
  return new LocalPttClient(new BrowserAudioCapture(), { streamLifecycle });
}

function computeConfigSignature(communicationMode, networkConfig) {
  if (communicationMode !== COMMUNICATION_MODES.NETWORK) return "local";
  return `network:${networkConfig?.identity?.roomId}:${networkConfig?.identity?.userId}`;
}

/**
 * CommunicationProvider — Local Media Capture Prototype v0.1 §1/§2, Two
 * Device PTT Foundation v0.1 §4, Bidirectional Hardening v0.2 Part G.
 *
 * Bidirectional Hardening v0.2 bugfix: earlier this Sprint, App.jsx swapped
 * modes by changing a React `key` on this component, forcing a full
 * unmount/remount. That's exactly wrong here — this Provider wraps
 * RoundProvider/AppShell, so remounting it also remounted the ENTIRE app
 * (losing AppShell's screen-navigation state, closing any open overlay,
 * resetting to the splash screen) every time network mode was toggled.
 * Root-caused via real two-browser testing (see the Sprint 결과 보고): a
 * WebSocket-construction probe showed `new WebSocket()` was NEVER even
 * called after toggling network mode on, because the toggle click itself
 * triggered a remount that reset everything BEFORE the effect could run
 * meaningfully.
 *
 * Fix: `communicationMode`/`networkConfig` are now genuinely reactive
 * props. A `configSignature` (derived, memo-stable) drives a single
 * effect that releases the OLD client and constructs a NEW one in place
 * — clientRef.current swaps, but the Provider component itself, and
 * everything below it, never unmounts.
 */
export function CommunicationProvider({
  children,
  streamLifecycle = DEFAULT_STREAM_LIFECYCLE,
  communicationMode = DEFAULT_COMMUNICATION_MODE,
  networkConfig = null,
}) {
  const configSignature = computeConfigSignature(communicationMode, networkConfig);
  const clientRef = useRef(null);
  const currentSignatureRef = useRef(null);
  if (!clientRef.current) {
    clientRef.current = buildClient({ communicationMode, streamLifecycle, networkConfig });
    currentSignatureRef.current = configSignature;
  }
  const [state, setState] = useState(() => clientRef.current.getState());

  // The one place the client actually gets swapped, plus (re)subscribing
  // to whichever client is current. Runs on mount, and again any time
  // `configSignature` genuinely changes (local -> network -> local, or
  // between two different rooms/identities).
  useEffect(() => {
    if (currentSignatureRef.current !== configSignature) {
      clientRef.current.release();
      clientRef.current = buildClient({ communicationMode, streamLifecycle, networkConfig });
      currentSignatureRef.current = configSignature;
      setState(clientRef.current.getState());
    }

    const unsubscribe = clientRef.current.subscribe(setState);

    // Bidirectional Hardening v0.2 Part G: the main Room/Round flow has no
    // separate "Room 참가" button like TwoDeviceTestScreen.jsx — turning
    // network mode on IS the explicit opt-in, so auto-connect here.
    // RC4 Session Recovery — when this connect is a [계속하기] rejoin,
    // networkConfig.requireExisting is set so the server rejects an
    // ended/expired room instead of re-creating an empty one.
    if (communicationMode === COMMUNICATION_MODES.NETWORK && typeof clientRef.current.connectToRoom === "function") {
      clientRef.current.connectToRoom({ requireExisting: !!networkConfig?.requireExisting });
    }

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configSignature]);

  // Final teardown only on actual component unmount (app closing/navigating
  // away entirely) — not on every client swap, which the effect above
  // already handles via its own release() call.
  useEffect(() => {
    return () => {
      clientRef.current?.release();
    };
  }, []);

  // §8 Background Safety — a stray pointerup/pointercancel getting lost
  // (tab switch, OS interrupt) must never leave the microphone live.
  // Reads clientRef.current fresh inside the handlers (not captured once)
  // so this keeps working correctly across a client swap too.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && clientRef.current.getState().status === COMMUNICATION_STATES.TRANSMITTING) {
        clientRef.current.stopTransmit();
      }
    };
    const handlePageHide = () => {
      clientRef.current.stopTransmit();
      clientRef.current.release();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, []);

  const value = useMemo(
    () => ({
      state: state.status,
      permissionStatus: state.permissionStatus,
      isPrepared: state.status === COMMUNICATION_STATES.READY || state.status === COMMUNICATION_STATES.TRANSMITTING,
      isTransmitting: state.status === COMMUNICATION_STATES.TRANSMITTING,
      inputLevel: state.inputLevel,
      rawInputLevel: state.rawInputLevel,
      voiceDetected: state.voiceDetected,
      isTesting: state.isTesting ?? false,
      lastError: state.lastError,
      lastAudioPlaybackAttempt: state.lastAudioPlaybackAttempt ?? null,
      p0Lifecycle: state.p0Lifecycle ?? null,
      p0LevelDebug: state.p0LevelDebug ?? null,
      lastMemberOnlineEvent: state.lastMemberOnlineEvent ?? null,
      // RC4 P1-2 — remote-audio diagnostics surfaced to P0DebugOverlay so a
      // phone-only Founder can read them without a desktop console.
      remoteAudioContextState: state.remoteAudioContextState ?? null,
      remoteTrackAttached: state.remoteTrackAttached ?? false,
      retryRemoteAudioPlayback: clientRef.current.retryRemoteAudioPlayback
        ? () => clientRef.current.retryRemoteAudioPlayback()
        : null,
      connectionState: state.connectionState ?? "disconnected",
      retryCount: state.retryCount ?? 0,
      nextRetrySec: state.nextRetrySec ?? null,
      reconnectEvent: state.reconnectEvent ?? null,
      clearReconnectEvent: clientRef.current.clearReconnectEvent
        ? () => clientRef.current.clearReconnectEvent()
        : null,
      leaveRoom: clientRef.current.leaveRoom ? () => clientRef.current.leaveRoom() : null,
      receivedDistanceShare: state.receivedDistanceShare ?? null,
      shareDistance: clientRef.current.shareDistance
        ? (payload) => clientRef.current.shareDistance(payload)
        : null,
      clearReceivedDistanceShare: clientRef.current.clearReceivedDistanceShare
        ? () => clientRef.current.clearReceivedDistanceShare()
        : null,
      receivedSoundPlayed: state.receivedSoundPlayed ?? null,
      shareSoundPlayed: clientRef.current.shareSoundPlayed
        ? (payload) => clientRef.current.shareSoundPlayed(payload)
        : null,
      clearReceivedSoundPlayed: clientRef.current.clearReceivedSoundPlayed
        ? () => clientRef.current.clearReceivedSoundPlayed()
        : null,
      receivedHoleAdvance: state.receivedHoleAdvance ?? null,
      shareHoleAdvance: clientRef.current.shareHoleAdvance
        ? (payload) => clientRef.current.shareHoleAdvance(payload)
        : null,
      clearReceivedHoleAdvance: clientRef.current.clearReceivedHoleAdvance
        ? () => clientRef.current.clearReceivedHoleAdvance()
        : null,
      receivedHoleSync: state.receivedHoleSync ?? null,
      shareHoleSync: clientRef.current.shareHoleSync
        ? (payload) => clientRef.current.shareHoleSync(payload)
        : null,
      clearReceivedHoleSync: clientRef.current.clearReceivedHoleSync
        ? () => clientRef.current.clearReceivedHoleSync()
        : null,
      remoteSpeakerUserId: state.remoteSpeakerUserId ?? null,
      remoteSpeakerName: state.remoteSpeakerName ?? null,
      isReceiving: state.isReceiving ?? false,
      actualTargetUserIds: state.actualTargetUserIds ?? [],
      members: state.members ?? [],
      remoteInputLevel: state.remoteInputLevel ?? 0,
      // RC4 Issue 4 (Host transfer)
      hostUserId: state.hostUserId ?? null,
      hostChangedEvent: state.hostChangedEvent ?? null,
      clearHostChangedEvent: clientRef.current.clearHostChangedEvent
        ? () => clientRef.current.clearHostChangedEvent()
        : null,
      roundStartedPayload: state.roundStartedPayload ?? null,
      sendRoundStart: clientRef.current.sendRoundStart ? (payload) => clientRef.current.sendRoundStart(payload) : null,
      clearRoundStartedPayload: clientRef.current.clearRoundStartedPayload
        ? () => clientRef.current.clearRoundStartedPayload()
        : null,
      prepareMicrophone: () => clientRef.current.prepare(),
      startLocalTest: () => clientRef.current.startLocalTest(),
      stopLocalTest: () => clientRef.current.stopLocalTest(),
      startTransmit: (targetUserIds) => clientRef.current.requestTransmit(targetUserIds),
      stopTransmit: () => clientRef.current.stopTransmit(),
      releaseMicrophone: () => clientRef.current.release(),
      connectToRoom: clientRef.current.connectToRoom ? () => clientRef.current.connectToRoom() : null,
    }),
    [state]
  );

  return <CommunicationContext.Provider value={value}>{children}</CommunicationContext.Provider>;
}

export { CommunicationContext };
