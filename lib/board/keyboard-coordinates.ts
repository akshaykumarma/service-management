import type { KeyboardCoordinateGetter } from "@dnd-kit/core";

/**
 * Navigates by the columns' *declared* order rather than their on-screen position:
 * Right/Left move to the next/previous column in `columnOrder`, landing exactly on that
 * column's center so collision detection can't ambiguously match a different one.
 *
 * Deliberately stateful (a closure variable spanning calls, reset whenever `active`
 * changes) rather than deriving "current column" from `context.over` on each call.
 * `over` is dnd-kit's own closestCenter result against each column's REAL rect, and once
 * columns can sit side by side with very different lengths (e.g. a long-lived Open column
 * next to a short On Hold column), a column's rect center can end up far from where the
 * card visually sits inside it — closestCenter then picks the wrong column even before
 * any arrow key is pressed, and every subsequent move compounds that error. Tracking our
 * own notion of "current column" — anchored once per drag session to the ticket's real
 * status from `active.data.current`, then stepped by `columnOrder` index on each arrow
 * press — is immune to that, and still lands the virtual pointer exactly on the intended
 * column's center, which is unambiguously closest to itself at drop time regardless of
 * every other column's geometry.
 */
export function createBoardKeyboardCoordinateGetter(columnOrder: string[]): KeyboardCoordinateGetter {
  let activeId: string | null = null;
  let currentColumnId: string | null = null;

  return (event, { context }) => {
    if (event.code !== "ArrowRight" && event.code !== "ArrowLeft") {
      return undefined;
    }
    event.preventDefault();

    const { active, droppableContainers, droppableRects } = context;
    if (!active) return undefined;

    if (activeId !== String(active.id)) {
      activeId = String(active.id);
      currentColumnId = String((active.data.current as { status?: string } | undefined)?.status ?? "");
    }

    const enabledIds = new Set(droppableContainers.getEnabled().map((c) => c?.id).filter(Boolean));
    const orderedIds = columnOrder.filter((id) => enabledIds.has(id));
    const currentIndex = orderedIds.indexOf(currentColumnId ?? "");
    if (currentIndex === -1) return undefined;

    const nextIndex = event.code === "ArrowRight" ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= orderedIds.length) return undefined;

    currentColumnId = orderedIds[nextIndex];
    const targetRect = droppableRects.get(currentColumnId);
    if (!targetRect) return undefined;

    return { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 };
  };
}
