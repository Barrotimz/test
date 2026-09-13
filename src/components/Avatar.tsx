import { initials } from "../lib/format";

type Props = {
  name: string;
  hue: number;
  size?: "sm" | "lg";
  ring?: "live" | "seen" | "none";
};

export function Avatar({ name, hue, size = "sm", ring = "none" }: Props) {
  const cls = [
    size === "lg" ? "avatar-lg" : "avatar",
    ring === "live" ? "ring" : "",
    ring === "seen" ? "seen" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 90% 62%), hsl(${hue + 30} 80% 48%))` }}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}
