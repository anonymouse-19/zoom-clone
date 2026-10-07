/**
 * Keeps a video tile at 16:9, as large as fits in the space it's given, and centred,
 * like Zoom's tiles. Used by both gallery cells and speaker view's main stage.
 */

import type { ReactNode } from "react";

export function VideoFrame({ children }: { children: ReactNode }) {
  return (
    // `container-type: size` lets the inner box measure this one: 100cqw is its width
    // and 100cqh its height. The tile is then as wide as possible, but never so wide
    // that its 16:9 height would overflow.
    <div className="flex h-full min-h-0 w-full min-w-0 items-center justify-center [container-type:size]">
      <div className="aspect-video w-[min(100cqw,calc(100cqh*16/9))]">{children}</div>
    </div>
  );
}
