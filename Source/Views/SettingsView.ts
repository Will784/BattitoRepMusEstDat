import { button } from "../Components/Rows";
import { el } from "../Utils/Dom";
import type { AppContext, View } from "./AppContext";
import { showConfirm, showLoginDialog } from "./Dialogs";
import { showAppearanceDialog } from "./MediaDialogs";

export class SettingsView implements View {
  public readonly element = el("section", { class: "view settingsView" });

  public constructor(private readonly context: AppContext) {
    context.setSearchContext(null);
    this.refresh();
  }

  public refresh(): void {
    const context = this.context;
    const user = context.user.user;
    const themeSwitch = (): HTMLElement =>
      el(
        "div",
        { class: "themeRow" },
        el("span", {}, "Modo de color"),
        el(
          "div",
          { class: "segmented" },
          el("button", { class: context.appearance.theme === "light" ? "selected" : "", type: "button", onClick: () => void this.setTheme("light") }, "Claro"),
          el("button", { class: context.appearance.theme === "dark" ? "selected" : "", type: "button", onClick: () => void this.setTheme("dark") }, "Oscuro")
        )
      );
    this.element.replaceChildren(
      el("div", { class: "viewHeader" }, el("h1", {}, "Ajustes")),
      el(
        "div",
        { class: "settingsCard" },
        el("h3", {}, "Apariencia"),
        themeSwitch(),
        el("p", { class: "muted small" }, user === null ? "Como invitado, los cambios de apariencia son temporales." : "Tus preferencias se guardan en tu cuenta."),
        el("div", { class: "buttonRow" }, button("Personalizar apariencia", () => showAppearanceDialog(context, null), "outline", "color"), button("Restablecer fondo", () => void this.resetBackground(), "ghost"))
      ),
      el(
        "div",
        { class: "settingsCard" },
        el("h3", {}, "Cuenta"),
        user === null
          ? el("div", { class: "stack" }, el("p", { class: "muted" }, "No has iniciado sesión. Inicia sesión para guardar tu biblioteca, crear playlists y carpetas, y descargar tu música."), button("Iniciar sesión", () => showLoginDialog(context), "primary", "user"))
          : el(
              "div",
              { class: "stack" },
              el("p", {}, el("strong", {}, user.displayName), el("br"), el("span", { class: "muted" }, user.email)),
              button("Cerrar sesión", () => showConfirm("Cerrar sesión", "Tu biblioteca seguirá guardada. Podrás volver a verla al iniciar sesión.", "Cerrar sesión", () => context.user.logout().catch((error: unknown) => context.handleError(error))), "outline", "logout")
            )
      ),
      el("div", { class: "settingsCard" }, el("h3", {}, "Acerca de Battito"), el("p", { class: "muted" }, "Battito organiza y reproduce tu música sobre una lista doblemente enlazada: cada canción conoce a su anterior y a su siguiente."))
    );
  }

  public destroy(): void {}

  private async setTheme(theme: "light" | "dark"): Promise<void> {
    try {
      await this.context.appearance.setTheme(theme);
    } catch (error) {
      this.context.handleError(error);
    }
    this.refresh();
  }

  private async resetBackground(): Promise<void> {
    try {
      await this.context.appearance.setGlobalAppearance({ mode: "default" }, null);
      this.context.toast("Fondo restablecido.", "success");
    } catch (error) {
      this.context.handleError(error);
    }
  }
}
