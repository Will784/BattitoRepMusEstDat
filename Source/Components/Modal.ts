import { el } from "../Utils/Dom";
import { icon } from "../Utils/Icons";

export interface ModalOptions {
  label: string;
  className?: string;
  dismissible?: boolean;
  showClose?: boolean;
  onClose?: () => void;
}

export class Modal {
  public readonly element: HTMLElement;
  public readonly panel: HTMLElement;
  private closed = false;
  private readonly previousFocus: Element | null;
  private readonly keyHandler: (event: KeyboardEvent) => void;
  private dismissible: boolean;

  public constructor(
    content: HTMLElement,
    private readonly options: ModalOptions
  ) {
    this.dismissible = options.dismissible !== false;
    this.previousFocus = document.activeElement;
    const closeButton =
      options.showClose === false
        ? null
        : el("button", { class: "iconButton modalClose", type: "button", "aria-label": "Cerrar", onClick: () => this.close() }, icon("close", 18));
    this.panel = el("div", { class: `modalPanel ${options.className ?? ""}`, role: "dialog", "aria-modal": "true", "aria-label": options.label }, closeButton, content);
    this.element = el("div", { class: "modalBackdrop" }, this.panel);
    this.element.addEventListener("pointerdown", (event) => {
      if (event.target === this.element && this.dismissible) this.close();
    });
    this.keyHandler = (event) => {
      if (event.key === "Escape" && this.dismissible && this.isTopmost()) {
        event.stopPropagation();
        this.close();
      } else if (event.key === "Tab") {
        this.trapFocus(event);
      }
    };
    document.addEventListener("keydown", this.keyHandler, true);
    document.body.appendChild(this.element);
    requestAnimationFrame(() => {
      this.element.classList.add("visible");
      const focusTarget = this.panel.querySelector<HTMLElement>("[data-autofocus], input:not([type=hidden]), button.primary");
      (focusTarget ?? this.panel).focus({ preventScroll: true });
    });
  }

  public setDismissible(value: boolean): void {
    this.dismissible = value;
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    document.removeEventListener("keydown", this.keyHandler, true);
    this.element.classList.remove("visible");
    setTimeout(() => this.element.remove(), 180);
    if (this.previousFocus instanceof HTMLElement) this.previousFocus.focus({ preventScroll: true });
    this.options.onClose?.();
  }

  private isTopmost(): boolean {
    const all = document.querySelectorAll(".modalBackdrop");
    return all[all.length - 1] === this.element;
  }

  private trapFocus(event: KeyboardEvent): void {
    if (!this.isTopmost()) return;
    const focusable = Array.from(this.panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])')).filter(
      (item) => item.offsetParent !== null
    );
    if (focusable.length === 0) return;
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
