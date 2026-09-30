/** Inline stroke icons (24px grid). Decorative unless a label is passed. */
const PATHS = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  record: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  statement: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>,
  passport: <><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  rates: <path d="M4 8h13l-3-3M20 16H7l3 3" />,
  signout: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.01" /></>,
  message: <path d="M4 5h16v11H9l-5 4z" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  cloudOff: <><path d="M3 3l18 18" /><path d="M8 8a5 5 0 0 0-1 9.8h10.5M17.5 17.8A4 4 0 0 0 16 10h-.5A6 6 0 0 0 11 6.2" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, stroke = 1.8, label }: { name: IconName; size?: number; stroke?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {PATHS[name]}
    </svg>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <rect width="34" height="34" rx="10" fill="#E0A43A" />
      <path d="M6 23l5.5-6 5.5 6 5.5-6 5.5 6" fill="none" stroke="#0C3A35" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 15l5.5-6 5.5 6 5.5-6 5.5 6" fill="none" stroke="#0C3A35" strokeOpacity="0.45" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The chevron frieze (after the Great Zimbabwe walls) used as background art. */
export function Chevrons({ id, color = "#E0A43A", opacity = 0.18, height = 64, className = "chev" }: { id: string; color?: string; opacity?: number; height?: number; className?: string }) {
  return (
    <svg className={className} aria-hidden="true" width="100%" height={height}>
      <defs>
        <pattern id={id} width="32" height="16" patternUnits="userSpaceOnUse">
          <path d="M0 14 L16 2 L32 14" fill="none" stroke={color} strokeOpacity={opacity} strokeWidth="2" strokeLinejoin="round" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
