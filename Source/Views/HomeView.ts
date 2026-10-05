import { button, collectionRow, emptyState } from "../Components/Rows";
import { el } from "../Utils/Dom";
import { pluralize } from "../Utils/Format";
import { icon, logoMark } from "../Utils/Icons";
import type { AppContext, View } from "./AppContext";
import { showCreateDialog } from "./Dialogs";
import { showAddDialog } from "./MediaDialogs";
import { showCollectionMenu } from "./Menus";
import { buildSongList, type BuiltList } from "./SongListBuilder";

export class HomeView implements View {
  public readonly element = el("section", { class: "view homeView" });
  private built: BuiltList | null = null;

  public constructor(private readonly context: AppContext) {
    context.setSearchContext(null);
    this.refresh();
  }

  public refresh(): void {
    this.built?.destroy();
    this.built = null;
    const context = this.context;
    const library = context.library;
    this.element.replaceChildren();
    if (library.isEmpty) {
      this.element.append(
        el(
          "div",
          { class: "welcome" },
          el("div", { class: "welcomeArt" }, el("div", { class: "welcomeGlow" }), el("div", { class: "welcomeIcon" }, logoMark(64))),
          el("h1", {}, "Bienvenido a Battito"),
          el("p", { class: "tagline" }, "Tu música, a tu manera."),
          el("p", { class: "muted" }, "Agrega una canción, carpeta o playlist para comenzar."),
          button("Agregar", () => showAddDialog(context, null), "primary large", "plus"),
          context.user.isAuthenticated ? null : el("p", { class: "muted small guestHint" }, `Modo invitado: hasta ${context.policy.limit} canciones. Inicia sesión para guardar y organizar tu biblioteca.`)
        )
      );
      return;
    }
    const greeting = context.user.user === null ? "Tu música" : `Hola, ${context.user.user.displayName}`;
    this.element.append(
      el(
        "div",
        { class: "viewHeader" },
        el("div", {}, el("h1", {}, greeting), el("p", { class: "muted" }, pluralize(library.totalSongCount, "canción", "canciones") + " en tu biblioteca")),
        el("div", { class: "buttonRow" }, button("Agregar", () => showAddDialog(context, null), "primary", "plus"), button("Crear playlist", () => showCreateDialog(context, "playlist"), "outline", "playlist"))
      )
    );
    if (!context.user.isAuthenticated) {
      this.element.append(
        el(
          "div",
          { class: "banner" },
          icon("warning", 20),
          el("span", {}, `Modo invitado: ${library.totalSongCount} de ${context.policy.limit} canciones. Tus datos no se guardan al cerrar.`),
          button("Iniciar sesión", () => context.navigate("#/settings"), "ghost")
        )
      );
    }
    if (!library.songs.isEmpty) {
      this.built = buildSongList(context, library.songs, null, null);
      this.element.append(el("h2", { class: "sectionTitle" }, "Canciones"), this.built.element);
    }
    for (const [title, kind] of [["Playlists", "playlist"], ["Carpetas", "folder"]] as const) {
      const list = library.collectionsOf(kind);
      if (list.isEmpty) continue;
      const rows = el("div", { class: "rowList", role: "list" });
      for (const collection of list) {
        const open = (): void => context.navigate(`#/collection/${collection.id}`, { autoplay: true });
        rows.appendChild(collectionRow(collection, { sortable: false, onOpen: open, onMenu: (anchor) => showCollectionMenu(context, collection, anchor, open) }));
      }
      this.element.append(el("h2", { class: "sectionTitle" }, title), rows);
    }
    if (library.totalSongCount === 0) {
      this.element.append(emptyState("music", "Todavía no hay canciones", "Abre una playlist o carpeta y agrega canciones desde tu dispositivo o YouTube."));
    }
  }

  public destroy(): void {
    this.built?.destroy();
  }
}
