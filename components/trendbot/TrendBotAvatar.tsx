"use client";

interface TrendBotAvatarProps {
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  wiggle?: boolean;
  className?: string;
}

const SIZES = { sm: 40, md: 56, lg: 72 };

/** Animated TrendBot mascot — sea-green robot face. */
export function TrendBotAvatar({
  size = "md",
  animated = true,
  wiggle = false,
  className = "",
}: TrendBotAvatarProps) {
  const px = SIZES[size];
  const anim = [
    animated ? "tm-trendbot-float" : "",
    wiggle ? "tm-trendbot-wiggle" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center ${anim}`}
      style={{ width: px, height: px }}
      aria-hidden="true"
    >
      {/* Glow ring */}
      <span
        className={`absolute inset-0 rounded-full bg-gradient-to-br from-emerald-400/30 to-teal-500/20 ${animated ? "tm-trendbot-pulse-ring" : ""}`}
      />
      <svg
        viewBox="0 0 64 64"
        width={px}
        height={px}
        className="relative drop-shadow-md"
        role="img"
        aria-label="TrendBot"
      >
        <defs>
          <linearGradient id="tb-body" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#0d9488" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
          <linearGradient id="tb-face" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#ecfdf5" />
          </linearGradient>
        </defs>
        {/* Antenna */}
        <line x1="32" y1="6" x2="32" y2="14" stroke="#0f766e" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="32" cy="5" r="3.5" fill="#34d399" className={animated ? "tm-trendbot-antenna" : ""} />
        {/* Head */}
        <rect x="10" y="14" width="44" height="38" rx="12" fill="url(#tb-body)" />
        <rect x="14" y="20" width="36" height="26" rx="8" fill="url(#tb-face)" />
        {/* Eyes */}
        <ellipse cx="24" cy="32" rx="5" ry="6" fill="#0f766e" className={animated ? "tm-trendbot-eye-l" : ""} />
        <ellipse cx="40" cy="32" rx="5" ry="6" fill="#0f766e" className={animated ? "tm-trendbot-eye-r" : ""} />
        <circle cx="25" cy="30" r="1.8" fill="#a7f3d0" />
        <circle cx="41" cy="30" r="1.8" fill="#a7f3d0" />
        {/* Smile */}
        <path
          d="M 24 40 Q 32 46 40 40"
          fill="none"
          stroke="#0f766e"
          strokeWidth="2"
          strokeLinecap="round"
        />
        {/* Body nub */}
        <rect x="22" y="52" width="20" height="8" rx="4" fill="#0d9488" />
      </svg>
    </div>
  );
}
