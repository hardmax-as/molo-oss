/**
 * What a mascot stands on (docs/DESIGN.md "Illustration"). `dark` is the
 * indigo night sky behind the celebrations: there the penguin's body and
 * flippers, the sunbird's outer tail and the crane's legs are the ground's
 * own indigo and vanish, so the whole silhouette gets a cream rim, the way a
 * sticker has a white edge. The bird's own colours never change.
 *
 * On the web the rim is a CSS filter over the rendered drawing rather than a
 * second copy of the shapes, so the flippers and wings that Motion swings
 * carry their rim with them. Mobile draws the same rim as shapes
 * (apps/mobile/src/ui/Mascots.tsx), because React Native has no such filter
 * on iOS.
 */

export type MascotSurface = "light" | "dark";

/** Sand, the page's own cream: it reads as light, not as a border. */
export const RIM_COLOUR = "#FFF7E8";
/** How much rim shows outside the drawing, in CSS pixels, at any size. */
export const RIM_PX = 2.5;

/**
 * Four hard drop shadows, one per side. Each shadows everything before it,
 * so together they dilate the silhouette by `RIM_PX` all round.
 */
export const DARK_RIM_FILTER = [
  `drop-shadow(${RIM_PX}px 0 0 ${RIM_COLOUR})`,
  `drop-shadow(-${RIM_PX}px 0 0 ${RIM_COLOUR})`,
  `drop-shadow(0 ${RIM_PX}px 0 ${RIM_COLOUR})`,
  `drop-shadow(0 -${RIM_PX}px 0 ${RIM_COLOUR})`,
].join(" ");

/** The props a mascot's `<svg>` takes on this surface, to spread; nothing on a light one. */
export function surfaceProps(surface: MascotSurface): { style?: { filter: string } } {
  return surface === "dark" ? { style: { filter: DARK_RIM_FILTER } } : {};
}
