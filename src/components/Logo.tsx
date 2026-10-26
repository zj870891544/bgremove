export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <pattern id="lm-check" width="8" height="8" patternUnits="userSpaceOnUse">
          <rect width="8" height="8" fill="#fff" />
          <rect width="4" height="4" fill="#dcd8ff" />
          <rect x="4" y="4" width="4" height="4" fill="#dcd8ff" />
        </pattern>
        <linearGradient id="lm-grad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#5940f5" />
          <stop offset="1" stopColor="#b13df5" />
        </linearGradient>
        <clipPath id="lm-clip">
          <rect width="32" height="32" rx="9" />
        </clipPath>
      </defs>
      <g clipPath="url(#lm-clip)">
        <rect width="32" height="32" fill="url(#lm-check)" />
        <path d="M0 32 L0 0 L32 32 Z" fill="url(#lm-grad)" />
        <path d="M0 0 L32 32" stroke="#fff" strokeWidth="2" strokeDasharray="3 3" />
      </g>
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="8.5" fill="none" stroke="#5940f5" strokeOpacity="0.25" strokeWidth="1.5" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="text-lg font-extrabold tracking-tight text-ink">
        BGRemove<span className="text-ink-mute">.cc</span>
      </span>
    </span>
  );
}
