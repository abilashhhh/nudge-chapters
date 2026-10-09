"use client";

/** A short emoji burst for milestones. Skipped when celebrations or motion are off, or reduced motion is on. */
export function celebrate(emojis = ["🎉", "✨", "🥳", "💰", "⭐"]) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  if (root.dataset.motion === "off" || root.dataset.celebrate === "off") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const x = window.innerWidth / 2;
  const y = window.innerHeight / 2;
  for (let i = 0; i < 18; i++) {
    const el = document.createElement("span");
    el.className = "celebrate-piece";
    el.textContent = emojis[i % emojis.length];
    const a = (Math.PI * 2 * i) / 18;
    const r = 120 + Math.random() * 120;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.setProperty("--dx", `${Math.cos(a) * r}px`);
    el.style.setProperty("--dy", `${Math.sin(a) * r - 60}px`);
    el.style.setProperty("--rot", `${Math.round(Math.random() * 360)}deg`);
    document.body.appendChild(el);
    window.setTimeout(() => el.remove(), 1200);
  }
}
