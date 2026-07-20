import React from "react";

export default function GolfBall({ size = 28, glow = false }) {
  const dimples = [
    [0, -6],
    [0, 6],
    [-6, 0],
    [6, 0],
    [-4.2, -4.2],
    [4.2, -4.2],
    [-4.2, 4.2],
    [4.2, 4.2],
    [0, 0],
  ];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={glow ? "ft-ball ft-ball-glow" : "ft-ball"}
    >
      <defs>
        <radialGradient id="ballShade" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="55%" stopColor="#eef4ef" />
          <stop offset="100%" stopColor="#c6d3c9" />
        </radialGradient>
      </defs>
      <circle
        cx="16"
        cy="16"
        r="14.5"
        fill="url(#ballShade)"
        stroke="rgba(20,89,63,0.35)"
        strokeWidth="0.6"
      />
      {dimples.map(([dx, dy], i) => (
        <circle key={i} cx={16 + dx} cy={16 + dy} r="1.15" fill="rgba(80,110,90,0.28)" />
      ))}
    </svg>
  );
}
