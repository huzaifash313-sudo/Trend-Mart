"use client";

export type TrendBotPose = "idle" | "wave" | "jump" | "walk" | "happy";

interface TrendBotAvatarProps {
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  /** One-shot / pose class — jump, wave, walk legs */
  pose?: TrendBotPose;
  wiggle?: boolean;
  className?: string;
}

/** Pixel box — taller than wide so full body fits the FAB. */
const SIZES = { sm: { w: 44, h: 58 }, md: { w: 56, h: 74 }, lg: { w: 72, h: 94 } };

/**
 * Cute full-body TrendBot mascot (head + belly + arms + feet).
 * Matches the teal screen-face brand, now with a tiny body for walk/jump poses.
 */
export function TrendBotAvatar({
  size = "md",
  animated = true,
  pose = "idle",
  wiggle = false,
  className = "",
}: TrendBotAvatarProps) {
  const { w, h } = SIZES[size];
  const uid = `tb${size}${pose}`;
  const anim = [
    animated && pose === "idle" ? "tm-trendbot-float" : "",
    pose === "jump" ? "tm-trendbot-jump" : "",
    pose === "happy" ? "tm-trendbot-happy" : "",
    pose === "walk" ? "tm-trendbot-walk-bob" : "",
    pose === "wave" || wiggle ? "tm-trendbot-wiggle" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`relative flex shrink-0 items-end justify-center ${anim}`}
      style={{ width: w, height: h }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 64 88"
        width={w}
        height={h}
        className="relative"
        role="img"
        aria-label="TrendBot"
      >
        <defs>
          <linearGradient id={`${uid}-body`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--tm-brand-500)" />
            <stop offset="55%" stopColor="var(--tm-sea-600)" />
            <stop offset="100%" stopColor="var(--tm-sea-500)" />
          </linearGradient>
          <linearGradient id={`${uid}-face`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="var(--tm-brand-50)" />
          </linearGradient>
        </defs>

        {/* Antenna */}
        <line
          x1="32"
          y1="4"
          x2="32"
          y2="12"
          stroke="var(--tm-sea-700)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle
          cx="32"
          cy="3.5"
          r="3.2"
          fill="var(--tm-brand-400)"
          className={animated ? "tm-trendbot-antenna" : ""}
        />

        {/* Head */}
        <rect x="12" y="12" width="40" height="32" rx="11" fill={`url(#${uid}-body)`} />
        <rect x="16" y="17" width="32" height="22" rx="7" fill={`url(#${uid}-face)`} />

        {/* Eyes */}
        <ellipse
          cx="24"
          cy="27"
          rx="4.4"
          ry="5.2"
          fill="var(--tm-sea-700)"
          className={animated ? "tm-trendbot-eye-l" : ""}
        />
        <ellipse
          cx="40"
          cy="27"
          rx="4.4"
          ry="5.2"
          fill="var(--tm-sea-700)"
          className={animated ? "tm-trendbot-eye-r" : ""}
        />
        <circle cx="25" cy="25.2" r="1.5" fill="var(--tm-brand-200)" />
        <circle cx="41" cy="25.2" r="1.5" fill="var(--tm-brand-200)" />

        {/* Smile — soft friendly curve */}
        <path
          d="M 24 33.5 Q 32 40 40 33.5"
          fill="none"
          stroke="var(--tm-sea-700)"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Left arm */}
        <g className={pose === "wave" ? "tm-trendbot-arm-wave" : pose === "walk" ? "tm-trendbot-arm-l" : ""}>
          <rect x="4" y="48" width="10" height="16" rx="5" fill="var(--tm-sea-600)" />
          <circle cx="9" cy="65" r="4.2" fill="var(--tm-sea-500)" />
        </g>

        {/* Right arm */}
        <g className={pose === "walk" ? "tm-trendbot-arm-r" : ""}>
          <rect x="50" y="48" width="10" height="16" rx="5" fill="var(--tm-sea-600)" />
          <circle cx="55" cy="65" r="4.2" fill="var(--tm-sea-500)" />
        </g>

        {/* Belly / torso */}
        <rect x="18" y="44" width="28" height="24" rx="10" fill={`url(#${uid}-body)`} />
        <ellipse cx="32" cy="56" rx="8" ry="6" fill="var(--tm-sea-300)" opacity="0.35" />

        {/* Legs + feet */}
        <g className={pose === "walk" ? "tm-trendbot-leg-l" : ""}>
          <rect x="20" y="66" width="9" height="14" rx="4.5" fill="var(--tm-sea-700)" />
          <ellipse cx="24.5" cy="82" rx="7" ry="3.5" fill="var(--tm-sea-900)" />
        </g>
        <g className={pose === "walk" ? "tm-trendbot-leg-r" : ""}>
          <rect x="35" y="66" width="9" height="14" rx="4.5" fill="var(--tm-sea-700)" />
          <ellipse cx="39.5" cy="82" rx="7" ry="3.5" fill="var(--tm-sea-900)" />
        </g>
      </svg>
    </div>
  );
}
