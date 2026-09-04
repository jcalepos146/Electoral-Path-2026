import { useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";

export type SvgViewBox = { x: number; y: number; width: number; height: number };

type DragState = {
  pointerId: number;
  clientX: number;
  clientY: number;
  view: SvgViewBox;
  moved: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function useSvgViewport(base: SvgViewBox, minWidth = 150) {
  const [view, setView] = useState<SvgViewBox>(base);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);

  function normalize(next: SvgViewBox): SvgViewBox {
    const width = clamp(next.width, minWidth, base.width);
    const height = width * (base.height / base.width);
    const maxX = base.x + base.width - width;
    const maxY = base.y + base.height - height;
    return {
      x: clamp(next.x, base.x, maxX),
      y: clamp(next.y, base.y, maxY),
      width,
      height,
    };
  }

  function zoomAt(svg: SVGSVGElement | null, clientX: number, clientY: number, factor: number) {
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    setView((old) => {
      const px = old.x + ((clientX - rect.left) / rect.width) * old.width;
      const py = old.y + ((clientY - rect.top) / rect.height) * old.height;
      const width = clamp(old.width * factor, minWidth, base.width);
      const height = width * (base.height / base.width);
      const x = px - ((px - old.x) / old.width) * width;
      const y = py - ((py - old.y) / old.height) * height;
      return normalize({ x, y, width, height });
    });
  }

  function zoomCenter(svg: SVGSVGElement | null, factor: number) {
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    zoomAt(svg, rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  }

  function onWheel(event: ReactWheelEvent<SVGSVGElement>) {
    event.preventDefault();
    zoomAt(event.currentTarget, event.clientX, event.clientY, event.deltaY < 0 ? 0.82 : 1.22);
  }

  function onPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    suppressClickRef.current = false;
    dragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      view,
      moved: false,
    };
    // Deliberately do not capture the pointer yet. Capturing immediately retargets
    // the eventual click to the SVG and makes district paths feel unclickable.
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.clientX;
    const dy = event.clientY - drag.clientY;
    const distance = Math.hypot(dx, dy);

    if (!drag.moved && distance < 5) return;

    if (!drag.moved) {
      drag.moved = true;
      suppressClickRef.current = true;
      setDragging(true);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is an enhancement; dragging still works while the pointer remains over the SVG.
      }
    }

    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = drag.view.x - dx * (drag.view.width / rect.width);
    const y = drag.view.y - dy * (drag.view.height / rect.height);
    setView(normalize({ ...drag.view, x, y }));
  }

  function endDrag(event?: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (event && drag?.moved && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const moved = Boolean(drag?.moved);
    dragRef.current = null;
    setDragging(false);
    if (moved) {
      // Keep suppression through the synthetic click that browsers may emit immediately
      // after a drag, then clear it before the user's next intentional click.
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
  }

  function shouldSuppressClick() {
    return suppressClickRef.current;
  }

  function reset() {
    setView(base);
  }

  return {
    view,
    setView: (next: SvgViewBox) => setView(normalize(next)),
    reset,
    zoomCenter,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    shouldSuppressClick,
    dragging,
    zoomPercent: Math.round((base.width / view.width) * 100),
  };
}
