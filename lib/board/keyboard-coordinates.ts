import type { KeyboardCoordinateGetter } from "@dnd-kit/core";

/**
 * This app ships with no visual CSS yet (every prior feature's own accessibility audit
 * notes the same gap), so the board's columns are plain stacked block elements, not a
 * horizontal row — @dnd-kit's own position-based multi-container example (comparing
 * droppable rects' x-coordinates) doesn't apply here. Navigates by the columns'
 * *declared* order instead, independent of how they happen to be laid out visually:
 * Right/Left move to the next/previous column in `columnOrder`, landing exactly on that
 * column's center so collision detection can't ambiguously match a different one.
 */
export function createBoardKeyboardCoordinateGetter(columnOrder: string[]): KeyboardCoordinateGetter {
  return (event, { context }) => {
    if (event.code !== "ArrowRight" && event.code !== "ArrowLeft") {
      return undefined;
    }
    event.preventDefault();

    const { active, over, droppableContainers, droppableRects } = context;
    if (!active) return undefined;

    const currentId = String(over?.id ?? (active.data.current as { status?: string } | undefined)?.status ?? "");
    const enabledIds = new Set(droppableContainers.getEnabled().map((c) => c?.id).filter(Boolean));
    const orderedIds = columnOrder.filter((id) => enabledIds.has(id));
    const currentIndex = orderedIds.indexOf(currentId);
    if (currentIndex === -1) return undefined;

    const nextIndex = event.code === "ArrowRight" ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= orderedIds.length) return undefined;

    const targetRect = droppableRects.get(orderedIds[nextIndex]);
    if (!targetRect) return undefined;

    return { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 };
  };
}
