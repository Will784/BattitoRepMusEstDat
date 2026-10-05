import { el } from "../Utils/Dom";
import { icon } from "../Utils/Icons";
import type { AppContext, View } from "./AppContext";
import { showAddDialog } from "./MediaDialogs";

export class DevicesView implements View {
  public readonly element = el("section", { class: "view devicesView" });

  public constructor(private readonly context: AppContext) {
    context.setSearchContext(null);
    this.refresh();
  }

  public refresh(): void {
    const context = this.context;
    const supportsFolders = "webkitdirectory" in HTMLInputElement.prototype;
    const card = (iconName: string, title: string, text: string, mode: "song" | "folder" | "playlist" | "youtube" | "url"): HTMLElement =>
      el("button", { class: "deviceCard", type: "button", onClick: () => showAddDialog(context, null, mode) }, el("span", { class: "deviceIcon" }, icon(iconName, 28)), el("strong", {}, title), el("span", { class: "muted" }, text));
    this.element.replaceChildren(
      el("div", { class: "viewHeader" }, el("div", {}, el("h1", {}, "Dispositivos"), el("p", { class: "muted" }, "Importa música desde este dispositivo."))),
      el(
        "div",
        { class: "deviceGrid" },
        card("music", "Agregar canción", "Elige uno o varios archivos de audio.", "song"),
        card("folder", "Agregar carpeta", supportsFolders ? "Importa todas las canciones de una carpeta." : "Tu navegador no permite elegir carpetas; arrástrala al cuadro de importación.", "folder"),
        card("playlist", "Agregar playlist", "Selecciona canciones y, si quieres, un archivo .m3u.", "playlist"),
        card("youtube", "Desde YouTube", "Busca videos y agrégalos a tu biblioteca.", "youtube"),
        card("link", "Desde URL", "Pega un enlace de YouTube o de un archivo de audio.", "url")
      ),
      el(
        "div",
        { class: "infoCard" },
        el("h3", {}, context.user.isAuthenticated ? "Tu biblioteca viaja contigo" : "Modo invitado"),
        el(
          "p",
          { class: "muted" },
          context.user.isAuthenticated
            ? "Los archivos que importas se guardan de forma segura en tu cuenta. Inicia sesión desde otro dispositivo para escucharlos allí."
            : `Los archivos se reproducen desde este dispositivo y se borran al cerrar o recargar. Puedes tener hasta ${context.policy.limit} canciones sin iniciar sesión.`
        )
      )
    );
  }

  public destroy(): void {}
}
