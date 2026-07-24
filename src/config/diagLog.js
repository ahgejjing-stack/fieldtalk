/**
 * diagLog.js — RC4 on-device diagnostic log buffer.
 *
 * Founder cannot always attach a desktop console to the phone, so the
 * bracketed diagnostic lines ([ROOM OVERLAY], [HOST BUILT ROUND], ...) were
 * effectively invisible during device testing. This keeps the last N of
 * them in memory so the PO panel can render them on screen.
 *
 * Deliberately tiny and dependency-free: it wraps console.log/warn/error
 * once, records only lines whose first argument looks like a "[TAG]"
 * diagnostic, and always forwards to the real console.
 */

const MAX_ENTRIES = 60;
const entries = [];
const listeners = new Set();

function push(level, args) {
  const first = args[0];
  if (typeof first !== "string" || !first.startsWith("[")) return; // only tagged diagnostics
  const text = args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
  entries.push({ level, text, t: Date.now() });
  if (entries.length > MAX_ENTRIES) entries.shift();
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

let installed = false;
export function installDiagLog() {
  if (installed || typeof console === "undefined") return;
  installed = true;
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = (...a) => {
    push("log", a);
    orig.log(...a);
  };
  console.warn = (...a) => {
    push("warn", a);
    orig.warn(...a);
  };
  console.error = (...a) => {
    push("error", a);
    orig.error(...a);
  };
}

export function getDiagEntries() {
  return entries;
}

export function subscribeDiag(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearDiag() {
  entries.length = 0;
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}
