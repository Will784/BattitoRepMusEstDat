import { el } from "../Utils/Dom";

export interface MenuItem {
  label: string;
  iconNode?: Node;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export class PopoverMenu {
  private static active: PopoverMenu | null = null;
  private readonly element: HTMLElement;
  private readonly dismiss: (event: Event) => void;

  private constructor(items: MenuItem[], anchor: HTMLElement) {
    this.element = el("div", { class: "popover", role: "menu" });
    for (const item of items) {
      const button = el(
        "button",
        {
          class: `popoverItem ${item.danger === true ? "danger" : ""}`,
          type: "button",
          role: "menuitem",
          disabled: item.disabled === true,
          onClick: (event: Event) => {
            event.stopPropagation();
            this.close();
            item.onSelect();
          }
        },
        item.iconNode ?? null,
        el("span", {}, item.label)
      );
      this.element.appendChild(button);
    }
    document.body.appendChild(this.element);
    const rect = anchor.getBoundingClientRect();
    const width = this.element.offsetWidth;
    const height = this.element.offsetHeight;
    const left = Math.min(window.innerWidth - width - 8, Math.max(8, rect.right - width));
    const top = rect.bottom + height + 8 > window.innerHeight ? Math.max(8, rect.top - height - 4) : rect.bottom + 4;
    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
    this.dismiss = (event: Event) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === "Escape") this.close();
        return;
      }
      if (!this.element.contains(event.target as Node)) this.close();
    };
    setTimeout(() => {
      document.addEventListener("pointerdown", this.dismiss, true);
      document.addEventListener("keydown", this.dismiss, true);
      window.addEventListener("resize", () => this.close(), { once: true });
    }, 0);
    (this.element.querySelector("button:not([disabled])") as HTMLElement | null)?.focus();
  }

  public static open(items: MenuItem[], anchor: HTMLElement): void {
    PopoverMenu.active?.close();
    PopoverMenu.active = new PopoverMenu(items, anchor);
  }

  public close(): void {
    document.removeEventListener("pointerdown", this.dismiss, true);
    document.removeEventListener("keydown", this.dismiss, true);
    this.element.remove();
    if (PopoverMenu.active === this) PopoverMenu.active = null;
  }
}
