import soundCatalogFile from "../data/soundCatalog.json";

/**
 * FIELDTALK audio engine
 * ------------------------------------------------------------------
 * A small, dependency-free layer over HTMLAudioElement + the Web
 * Speech API. Sounds are described entirely by data (soundCatalog.json)
 * so new sounds/voice packs can be added with a JSON entry + a file
 * under public/sounds — no code changes required.
 *
 * soundCatalog.json shape:
 *   { "version": 1, "defaultCooldownMs": 3000, "sounds": [ ... ] }
 *
 * Output routing is deliberately abstracted behind `outputTargets`.
 * Today only "browser" is implemented; phone/headphones/watch routing
 * can be added later by implementing the same { playFile, speak }
 * interface and updating resolveTargetName(). The catalog's `targets`
 * field on each sound already lists its intended output devices so
 * that future routing logic has data to work with.
 * ------------------------------------------------------------------
 */

const CATALOG_VERSION = soundCatalogFile.version;
const DEFAULT_COOLDOWN_MS = soundCatalogFile.defaultCooldownMs ?? 3000;
const soundCatalog = soundCatalogFile.sounds || [];

const activeSounds = new Set(); // ids currently mid-playback (dedup guard)
const lastPlayedAt = new Map(); // id -> timestamp of last successful play

function findSound(id) {
  return soundCatalog.find((s) => s.id === id) || null;
}

function isOnCooldown(sound) {
  const last = lastPlayedAt.get(sound.id);
  if (last == null) return false;
  const wait = sound.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  return Date.now() - last < wait;
}

/** Replace {placeholders} in a template string with values from `vars`. */
function applyTemplate(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

/* ---------------------------- Output targets --------------------------- */
/* Only "browser" exists today. Every target must implement:
 *   playFile(sound) -> Promise<{ success, reason? }>
 *   speak(text, opts) -> Promise<{ success, reason? }>
 */
const outputTargets = {
  browser: {
    playFile(sound) {
      return new Promise((resolve) => {
        try {
          const audio = new Audio(sound.src);
          audio.volume = typeof sound.volume === "number" ? sound.volume : 1;

          let settled = false;
          const done = (result) => {
            if (settled) return;
            settled = true;
            resolve(result);
          };

          audio.addEventListener("ended", () => done({ success: true }));
          audio.addEventListener("error", () =>
            done({ success: false, reason: "file_not_found_or_unsupported" })
          );

          const playPromise = audio.play();
          if (playPromise && typeof playPromise.then === "function") {
            playPromise.catch((err) => {
              done({
                success: false,
                reason: err && err.name === "NotAllowedError" ? "autoplay_blocked" : "playback_failed",
              });
            });
          }
        } catch (err) {
          resolve({ success: false, reason: "playback_exception" });
        }
      });
    },

    speak(text, { language, voiceGender, volume } = {}) {
      return new Promise((resolve) => {
        try {
          if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
            resolve({ success: false, reason: "tts_unsupported" });
            return;
          }

          const utter = new SpeechSynthesisUtterance(text);
          utter.lang = language || "ko-KR";
          utter.volume = typeof volume === "number" ? volume : 1;

          const pickVoice = () => {
            const voices = window.speechSynthesis.getVoices();
            if (!voices || !voices.length) return null;
            const langPrefix = (language || "ko-KR").slice(0, 2).toLowerCase();
            const langVoices = voices.filter((v) => (v.lang || "").toLowerCase().startsWith(langPrefix));
            // "auto" picks the best available voice for the language; if no
            // voice matches the language, fall back to whatever is available.
            const pool = langVoices.length ? langVoices : voices;

            switch (voiceGender) {
              case "male":
                return pool.find((v) => /\bmale\b|남/i.test(v.name)) || pool[0];
              case "female":
                return pool.find((v) => /\bfemale\b|woman|여/i.test(v.name)) || pool[0];
              case "mixed":
              case "auto":
              default:
                // No gender filter — just use the first available voice for
                // the language. Any unrecognized value degrades to this
                // same safe default rather than throwing.
                return pool[0];
            }
          };

          const voice = pickVoice();
          if (voice) utter.voice = voice;

          let settled = false;
          const done = (result) => {
            if (settled) return;
            settled = true;
            resolve(result);
          };

          utter.onend = () => done({ success: true });
          utter.onerror = () => done({ success: false, reason: "tts_failed" });

          window.speechSynthesis.speak(utter);

          // Safety net — some browsers silently drop onend for very short
          // utterances or when the tab loses focus. Never hang forever.
          setTimeout(() => done({ success: true }), 6000);
        } catch (err) {
          resolve({ success: false, reason: "tts_exception" });
        }
      });
    },
  },
};

// eslint-disable-next-line no-unused-vars
function resolveTargetName(sound) {
  // Placeholder for future per-device routing (phone / headphones / watch).
  // Every sound currently plays through the browser output until native
  // output channels are introduced.
  return "browser";
}

/**
 * Play a catalog sound by id.
 * @param {string} id
 * @param {{ textOverride?: string, vars?: Record<string,string> }} [opts]
 *   `vars` fills in {placeholder} tokens in the sound's textTemplate,
 *   e.g. play("personalized_aiga", { vars: { name: "재식" } }).
 * @returns {Promise<{success:boolean, reason?:string, id:string}>}
 */
export async function playSoundById(id, { textOverride, vars } = {}) {
  const sound = findSound(id);
  if (!sound) return { success: false, reason: "sound_not_found", id };
  if (!sound.enabled) return { success: false, reason: "sound_disabled", id };
  if (activeSounds.has(id)) return { success: false, reason: "already_playing", id };
  if (isOnCooldown(sound)) return { success: false, reason: "cooldown", id };

  const target = outputTargets[resolveTargetName(sound)];
  activeSounds.add(id);

  let result;
  try {
    if (sound.sourceType === "file") {
      result = sound.src
        ? await target.playFile(sound)
        : { success: false, reason: "missing_src" };
    } else if (sound.sourceType === "tts") {
      const template = textOverride || sound.textTemplate || sound.label;
      const text = applyTemplate(template, vars);
      result = await target.speak(text, {
        language: sound.language,
        voiceGender: sound.voiceGender,
        volume: sound.volume,
      });
    } else {
      result = { success: false, reason: "unknown_source_type" };
    }
  } catch (err) {
    result = { success: false, reason: "unexpected_error" };
  } finally {
    activeSounds.delete(id);
  }

  if (result.success) {
    lastPlayedAt.set(id, Date.now());
  }

  return { ...result, id };
}

/** Speak arbitrary text directly (bypasses the catalog — rarely needed now that
 * personalized cheers are catalog-driven, but kept for ad-hoc use cases). */
export async function speakText(text, { language = "ko-KR", voiceGender, volume = 1 } = {}) {
  try {
    return await outputTargets.browser.speak(text, { language, voiceGender, volume });
  } catch (err) {
    return { success: false, reason: "tts_exception" };
  }
}

export function getSoundCatalog() {
  return soundCatalog;
}

export function getSoundById(id) {
  return findSound(id);
}

export function getCatalogVersion() {
  return CATALOG_VERSION;
}

export function getDefaultCooldownMs() {
  return DEFAULT_COOLDOWN_MS;
}
