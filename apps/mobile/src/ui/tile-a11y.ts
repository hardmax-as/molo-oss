/**
 * An answer tile is a single accessible button, and on iOS an accessible
 * parent hides its children: a play button inside the tile cannot be
 * reached with VoiceOver, which defeats a listening exercise (audit M05).
 * The tile therefore carries the clip as a custom "play" action (VoiceOver:
 * swipe up or down, then double-tap; TalkBack: the actions menu). Pure, for Jest.
 */

export const PLAY_ACTION = "play";

export interface TilePlayAction {
  /** What VoiceOver reads for the action, e.g. "Listen 2". */
  readonly label: string;
  readonly play: () => void;
}

export function tileAccessibilityActions(playAction: TilePlayAction | undefined) {
  return playAction ? [{ name: PLAY_ACTION, label: playAction.label }] : undefined;
}

/** Runs the named action; "activate" (a plain double-tap) stays the tile's own press. */
export function runTileAction(
  name: string,
  handlers: { press: () => void; playAction?: TilePlayAction | undefined },
) {
  if (name === PLAY_ACTION) handlers.playAction?.play();
  else if (name === "activate") handlers.press();
}
