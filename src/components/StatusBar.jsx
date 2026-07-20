import React from "react";

export default function StatusBar() {
  return (
    <div className="ft-statusbar">
      <span className="ft-statustime">9:41</span>
      <div className="ft-island" />
      <div className="ft-statusicons">
        <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
          <rect x="0" y="7" width="3" height="5" rx="0.6" fill="#F4F7F5" />
          <rect x="4.5" y="5" width="3" height="7" rx="0.6" fill="#F4F7F5" />
          <rect x="9" y="3" width="3" height="9" rx="0.6" fill="#F4F7F5" />
          <rect x="13.5" y="0.5" width="3" height="11.5" rx="0.6" fill="#F4F7F5" />
        </svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
          <path
            d="M8 10.5C6 8.3 3.2 8.3 1 10.2L0 9C2.8 6.5 6 6.2 8 6.2C10 6.2 13.2 6.5 16 9L15 10.2C12.8 8.3 10 8.3 8 10.5Z"
            fill="#F4F7F5"
          />
          <circle cx="8" cy="10.4" r="1.1" fill="#F4F7F5" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
          <rect x="0.5" y="0.5" width="20" height="11" rx="2.5" stroke="#F4F7F5" strokeOpacity="0.5" />
          <rect x="2" y="2" width="15" height="8" rx="1.2" fill="#F4F7F5" />
          <rect x="21.5" y="4" width="1.6" height="4" rx="0.6" fill="#F4F7F5" fillOpacity="0.5" />
        </svg>
      </div>
    </div>
  );
}
