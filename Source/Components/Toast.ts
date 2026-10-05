import { el } from "../Utils/Dom";

export type ToastKind = "info" | "success" | "error";

export class ToastCenter {
  private readonly host: HTMLElement;

  public constructor(parent: HTMLElement) {
    this.host = el("div", { class: "toastHost", role: "status", "aria-live": "polite" });
    parent.appendChild(this.host);
  }

  public show(message: string, kind: ToastKind = "info"): void {
    const toast = el("div", { class: `toast toast-${kind}` }, message);
    this.host.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("visible"));
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 300);
    }, kind === "error" ? 6000 : 3800);
  }
}
