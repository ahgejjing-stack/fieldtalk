import React, { useEffect } from "react";
import GolfBall from "./GolfBall.jsx";

export default function SplashScreen({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="ft-screen ft-splash" onClick={onDone}>
      <div className="ft-splash-glow" />
      <svg className="ft-contour-bg" viewBox="0 0 393 700" preserveAspectRatio="none">
        <path d="M-20,520 C80,480 140,560 220,520 C300,480 360,540 420,500" />
        <path d="M-20,570 C90,530 150,610 230,570 C310,530 370,590 420,550" />
        <path d="M-20,620 C100,580 160,660 240,620 C320,580 380,640 420,600" />
      </svg>

      <div className="ft-splash-body">
        <GolfBall size={56} glow />
        <div className="ft-wordmark">FIELDTALK</div>
        <div className="ft-tagline">
          Play Together.
          <br />
          Feel Every Shot.
        </div>
      </div>

      <div className="ft-splash-foot">
        <div className="ft-progress">
          <div className="ft-progress-fill" />
        </div>
        <span className="ft-splash-hint">화면을 탭하면 바로 시작합니다</span>
      </div>
    </div>
  );
}
