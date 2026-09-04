import { useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";

export type SvgViewBox = { x: number; y: number; width: number; height: number };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function useSvgViewport(base: SvgViewBox, minWidth = 150) {
  const [view, setView] = useState<SvgViewBox>(base);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ clientX: number; clientY: number; view: SvgViewBox } | null>(null);

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
    dragRef.current = { clientX: event.clientX, clientY: event.clientY, view };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = event.clientX - drag.clientX;
    const dy = event.clientY - drag.clientY;
    const x = drag.view.x - dx * (drag.view.width / rect.width);
    const y = drag.view.y - dy * (drag.view.height / rect.height);
    setView(normalize({ ...drag.view, x, y }));
  }

  function endDrag(event?: ReactPointerEvent<SVGSVGElement>) {
    if (event && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    setDragging(false);
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
    dragging,
    zoomPercent: Math.round((base.width / view.width) * 100),
  };
}
