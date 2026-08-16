interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function relativePosition(clientX: number, clientY: number, rect: Rect): { x: number; y: number } {
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}
