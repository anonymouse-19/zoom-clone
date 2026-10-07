/**
 * The current width and height of an element, kept up to date as it resizes (window
 * resized, phone rotated, side panel opened).
 *
 * Uses ResizeObserver, the browser's API for "tell me when this element's size changes".
 * Attach `ref` to the element. The size is 0×0 until the first measurement.
 */

import { useEffect, useRef, useState } from "react";

export function useElementSize<ElementType extends HTMLElement>() {
  const ref = useRef<ElementType>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}
