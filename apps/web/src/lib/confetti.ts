/**
 * Confetti in the palette (docs/DESIGN.md "Motion"). `canvas-confetti` is
 * imported lazily so the bundle a first lesson downloads does not carry it,
 * and every burst is a no-op when the learner has asked for less motion.
 */

export const CONFETTI_COLOURS = ["#F6B73C", "#1FA38C", "#E85D5D", "#26264F", "#FFFFFF"];
/** Warmer set for the crown and the medal: sun, ochre and a pale gold. */
export const GOLD_COLOURS = ["#F6B73C", "#D9772B", "#FFE58F", "#FFFFFF"];

/** Fires a burst from both bottom corners; a no-op under reduced motion. */
export async function burst(
  reduced: boolean,
  colours = CONFETTI_COLOURS,
  strength: "normal" | "big" = "normal",
): Promise<void> {
  if (reduced || typeof window === "undefined") return;
  const { default: confetti } = await import("canvas-confetti");
  const big = strength === "big";
  const base = {
    particleCount: big ? 160 : 90,
    spread: big ? 95 : 70,
    colors: colours,
    ticks: big ? 300 : 220,
    gravity: 0.9,
    scalar: big ? 1.25 : 1.1,
  };
  void confetti({ ...base, angle: 60, origin: { x: 0.05, y: 0.9 } });
  void confetti({ ...base, angle: 120, origin: { x: 0.95, y: 0.9 } });
  if (big) {
    void confetti({
      ...base,
      particleCount: 90,
      angle: 90,
      spread: 140,
      origin: { x: 0.5, y: 0.6 },
    });
  }
}
