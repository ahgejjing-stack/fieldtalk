export const PLAYERS_SEED = [
  {
    id: "jaesik",
    name: "재식",
    me: true,
    status: "세컨샷 준비",
    color: "#2FBE7F",
    muted: false,
    transmitting: false,
    strokes: 0,
    cheerName: "재식",
    voiceGender: "male",
  },
  {
    id: "jaegeun",
    name: "재근",
    me: false,
    status: "티샷 완료",
    color: "#4FA8FF",
    muted: false,
    transmitting: false,
    strokes: 4,
    cheerName: "재근이",
    voiceGender: "male",
  },
  {
    id: "gwangcheon",
    name: "광천",
    me: false,
    status: "페어웨이 이동 중",
    color: "#C9A24B",
    muted: false,
    transmitting: false,
    strokes: 3,
    cheerName: "광천이",
    voiceGender: "male",
  },
  {
    id: "haeran",
    name: "해란",
    me: false,
    status: "그린 위 · 퍼팅 준비",
    color: "#E37FBD",
    muted: false,
    transmitting: false,
    strokes: 5,
    cheerName: "해란이",
    voiceGender: "female",
  },
];

// Gallery/team/achievement/caddie/warning reaction sounds now live in
// src/data/soundCatalog.json, loaded via src/services/audioEngine.js.
// (Previously this file also exported a hardcoded REACTIONS array; that
// has been superseded by the data-driven sound catalog — see TASK-002.)
