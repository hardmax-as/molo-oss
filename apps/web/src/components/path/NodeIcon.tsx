import type { LessonKind } from "@molo/core";
import { BookOpen, Crown, Headphones, Lock, Mic, Star } from "lucide-react";

/**
 * What a node says it is, at a glance (docs/DESIGN.md "The path"). The icon
 * is never the only signal: every node's accessible name spells the kind
 * out in words, so the picture is a shortcut, not the information.
 */
export function NodeIcon({
  kind,
  locked = false,
  size = 26,
}: {
  kind: LessonKind;
  locked?: boolean;
  size?: number;
}) {
  if (locked) return <Lock size={size} aria-hidden />;
  switch (kind) {
    case "listen":
      return <Headphones size={size} aria-hidden />;
    case "speak":
      return <Mic size={size} aria-hidden />;
    case "culture":
      return <BookOpen size={size} aria-hidden />;
    case "test":
      return <Crown size={size} aria-hidden />;
    default:
      return <Star size={size} aria-hidden fill="currentColor" />;
  }
}
