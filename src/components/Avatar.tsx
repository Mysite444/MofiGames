// Deterministic colored "initials" avatar — no image upload/storage exists,
// so every account gets a generated badge instead, in the same spirit as
// the procedurally-generated game thumbnails elsewhere in the app.

const PALETTE: { bg: string; fg: string }[] = [
  { bg: "#FFC857", fg: "#221a00" }, // gold
  { bg: "#FF4D5E", fg: "#2a0306" }, // hot
  { bg: "#3DA9FC", fg: "#001827" }, // blue
  { bg: "#7C5CFC", fg: "#140a33" }, // purple
  { bg: "#22D3EE", fg: "#00282d" }, // cyan
  { bg: "#34D399", fg: "#04261a" }, // green
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function paletteFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function Avatar({
  name,
  size = 40,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const { bg, fg } = paletteFor(name || "?");
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-bold leading-none ${className}`}
      style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.38 }}
      aria-hidden
    >
      {getInitials(name)}
    </span>
  );
}
