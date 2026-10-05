export interface DragSorterOptions {
  container: HTMLElement;
  itemSelector: string;
  handleSelector: string;
  orientation: "vertical" | "grid";
  onDrop: (draggedId: string, beforeId: string | null) => void;
}

export class DragSorter {
  private dragged: HTMLElement | null = null;
  private ghost: HTMLElement | null = null;
  private indicator: HTMLElement | null = null;
  private pointerId = -1;
  private startX = 0;
  private startY = 0;
  private offsetX = 0;
  private offsetY = 0;
  private active = false;
  private beforeElement: HTMLElement | null = null;
  private scrollFrame = 0;
  private lastY = 0;

  public constructor(private readonly options: DragSorterOptions) {
    options.container.addEventListener("pointerdown", this.handlePointerDown);
    options.container.addEventListener("keydown", this.handleKeyDown);
  }

  public destroy(): void {
    this.options.container.removeEventListener("pointerdown", this.handlePointerDown);
    this.options.container.removeEventListener("keydown", this.handleKeyDown);
    this.finish(false);
  }

  private items(): HTMLElement[] {
    return Array.from(this.options.container.querySelectorAll<HTMLElement>(this.options.itemSelector));
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const handle = (event.target as HTMLElement).closest<HTMLElement>(this.options.handleSelector);
    if (handle === null || !this.options.container.contains(handle)) return;
    const item = handle.closest<HTMLElement>(this.options.itemSelector);
    if (item === null) return;
    event.preventDefault();
    this.dragged = item;
    this.pointerId = event.pointerId;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.active = false;
    handle.setPointerCapture?.(event.pointerId);
    document.addEventListener("pointermove", this.handlePointerMove);
    document.addEventListener("pointerup", this.handlePointerUp);
    document.addEventListener("pointercancel", this.handlePointerCancel);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId || this.dragged === null) return;
    if (!this.active) {
      if (Math.hypot(event.clientX - this.startX, event.clientY - this.startY) < 4) return;
      this.begin(event);
    }
    this.lastY = event.clientY;
    if (this.ghost !== null) {
      this.ghost.style.transform = `translate(${event.clientX - this.offsetX}px, ${event.clientY - this.offsetY}px)`;
    }
    this.updateTarget(event.clientX, event.clientY);
    this.autoScroll();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.finish(this.active);
  };

  private readonly handlePointerCancel = (): void => {
    this.finish(false);
  };

  private begin(event: PointerEvent): void {
    const item = this.dragged as HTMLElement;
    const rect = item.getBoundingClientRect();
    this.active = true;
    this.offsetX = event.clientX - rect.left;
    this.offsetY = event.clientY - rect.top;
    const ghost = item.cloneNode(true) as HTMLElement;
    ghost.classList.add("dragGhost");
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    document.body.appendChild(ghost);
    this.ghost = ghost;
    const indicator = document.createElement("div");
    indicator.className = `dropIndicator ${this.options.orientation}`;
    this.indicator = indicator;
    item.classList.add("isDragging");
    this.options.container.classList.add("isSorting");
    document.body.classList.add("dragActive");
  }

  private updateTarget(x: number, y: number): void {
    const candidates = this.items().filter((item) => item !== this.dragged);
    let before: HTMLElement | null = null;
    for (const candidate of candidates) {
      const rect = candidate.getBoundingClientRect();
      const isAfterPointer =
        this.options.orientation === "vertical" ? y < rect.top + rect.height / 2 : y < rect.top || (y <= rect.bottom && x < rect.left + rect.width / 2);
      if (isAfterPointer) {
        before = candidate;
        break;
      }
    }
    this.beforeElement = before;
    const indicator = this.indicator;
    if (indicator === null) return;
    if (before !== null) {
      before.parentElement?.insertBefore(indicator, before);
    } else {
      const last = candidates[candidates.length - 1];
      if (last !== undefined) last.parentElement?.insertBefore(indicator, last.nextSibling);
      else this.options.container.appendChild(indicator);
    }
  }

  private autoScroll(): void {
    cancelAnimationFrame(this.scrollFrame);
    const scroller = this.scrollParent(this.options.container);
    const step = (): void => {
      if (!this.active) return;
      const bounds = scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
      const edge = 70;
      let delta = 0;
      if (this.lastY < bounds.top + edge) delta = -Math.ceil((bounds.top + edge - this.lastY) / 6);
      else if (this.lastY > bounds.bottom - edge) delta = Math.ceil((this.lastY - (bounds.bottom - edge)) / 6);
      if (delta !== 0) {
        scroller.scrollTop += delta;
        this.scrollFrame = requestAnimationFrame(step);
      }
    };
    this.scrollFrame = requestAnimationFrame(step);
  }

  private scrollParent(node: HTMLElement): HTMLElement {
    let current: HTMLElement | null = node;
    while (current !== null) {
      const overflow = getComputedStyle(current).overflowY;
      if ((overflow === "auto" || overflow === "scroll") && current.scrollHeight > current.clientHeight) return current;
      current = current.parentElement;
    }
    return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
  }

  private finish(commit: boolean): void {
    document.removeEventListener("pointermove", this.handlePointerMove);
    document.removeEventListener("pointerup", this.handlePointerUp);
    document.removeEventListener("pointercancel", this.handlePointerCancel);
    cancelAnimationFrame(this.scrollFrame);
    const dragged = this.dragged;
    const before = this.beforeElement;
    this.ghost?.remove();
    this.indicator?.remove();
    dragged?.classList.remove("isDragging");
    this.options.container.classList.remove("isSorting");
    document.body.classList.remove("dragActive");
    this.ghost = null;
    this.indicator = null;
    this.dragged = null;
    this.beforeElement = null;
    this.active = false;
    if (commit && dragged !== null) {
      const draggedId = dragged.dataset["sortId"];
      if (draggedId !== undefined && before !== dragged.nextElementSibling) {
        this.options.onDrop(draggedId, before?.dataset["sortId"] ?? null);
      }
    }
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const handle = (event.target as HTMLElement).closest<HTMLElement>(this.options.handleSelector);
    if (handle === null) return;
    const item = handle.closest<HTMLElement>(this.options.itemSelector);
    if (item === null) return;
    event.preventDefault();
    const id = item.dataset["sortId"];
    if (id === undefined) return;
    const items = this.items();
    const index = items.indexOf(item);
    if (event.key === "ArrowUp" && index > 0) {
      this.options.onDrop(id, items[index - 1]?.dataset["sortId"] ?? null);
    } else if (event.key === "ArrowDown" && index < items.length - 1) {
      this.options.onDrop(id, items[index + 2]?.dataset["sortId"] ?? null);
    }
    requestAnimationFrame(() => {
      const moved = this.options.container.querySelector<HTMLElement>(`[data-sort-id="${id}"] ${this.options.handleSelector}`);
      moved?.focus();
    });
  };
}
