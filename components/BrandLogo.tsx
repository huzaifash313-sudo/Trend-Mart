type BrandLogoProps = {
  size?: number;
  className?: string;
};

export default function BrandLogo({ size = 36, className = "" }: BrandLogoProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ${className}`}
      style={{ width: size, height: size }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/trendsmart-mark.png?v=16"
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-contain"
        decoding="async"
      />
    </span>
  );
}
