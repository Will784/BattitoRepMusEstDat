import { PopoverMenu } from "../Components/Popover";
import { button, emptyState } from "../Components/Rows";
import { el } from "../Utils/Dom";
import { icon } from "../Utils/Icons";
import type { AppContext, View } from "./AppContext";
import { showCreateDialog } from "./Dialogs";
import { showAddDialog } from "./MediaDialogs";
import { buildCollectionList, buildSongList, type BuiltList } from "./SongListBuilder";

type LibraryTab = "songs" | "folders" | "playlists";

let rememberedTab: LibraryTab = "songs";

export class LibraryView implements View {
  public readonly element = el("section", { class: "view libraryView" });
  private built: BuiltList | null = null;
  private tab: LibraryTab = rememberedTab;

  public constructor(private readonly context: AppContext) {
    context.setSearchContext(null);
    this.refresh();
  }

  public refresh(): void {
    this.built?.destroy();
    this.built = null;
    const context = this.context;
    const library = context.library;
    const tabs: { id: LibraryTab; label: string; iconName: string; count: number }[] = [
      { id: "songs", label: "Canciones", iconName: "music", count: library.songs.size },
      { id: "folders", label: "Carpetas", iconName: "folder", count: library.folders.size },
      { id: "playlists", label: "Playlists", iconName: "playlist", count: library.playlists.size }
    ];
    const addButton = el("button", { class: "iconButton accentFill", type: "button", "aria-label": "Agregar o crear", onClick: () => {
      PopoverMenu.open(
        [
          { label: "Agregar canciones", iconNode: icon("upload", 16), onSelect: () => showAddDialog(context, null) },
          { label: "Crear playlist", iconNode: icon("playlist", 16), onSelect: () => showCreateDialog(context, "playlist") },
          { label: "Crear carpeta", iconNode: icon("folder", 16), onSelect: () => showCreateDialog(context, "folder") }
        ],
        addButton
      );
    } }, icon("plus", 20));
    const tabBar = el(
      "div",
      { class: "tabBar", role: "tablist" },
      ...tabs.map((item) =>
        el("button", { class: `tab ${this.tab === item.id ? "selected" : ""}`, type: "button", role: "tab", "aria-selected": this.tab === item.id, onClick: () => {
          this.tab = item.id;
          rememberedTab = item.id;
          this.refresh();
        } }, icon(item.iconName, 16), el("span", {}, item.label), el("span", { class: "tabCount" }, String(item.count)))
      )
    );
    this.element.replaceChildren(el("div", { class: "viewHeader" }, el("h1", {}, "Tu biblioteca"), addButton), tabBar);
    if (this.tab === "songs") {
      if (library.songs.isEmpty) {
        this.element.append(emptyState("music", "Sin canciones sueltas", "Agrega canciones desde tu dispositivo, una URL o YouTube.", button("Agregar canciones", () => showAddDialog(context, null), "primary", "plus")));
      } else {
        this.built = buildSongList(context, library.songs, null, null);
        this.element.append(el("p", { class: "hint" }, "Arrastra el control ⋮⋮ para reordenar."), this.built.element);
      }
    } else {
      const kind = this.tab === "folders" ? "folder" : "playlist";
      const list = library.collectionsOf(kind);
      if (list.isEmpty) {
        this.element.append(
          emptyState(
            kind === "folder" ? "folder" : "playlist",
            kind === "folder" ? "Sin carpetas" : "Sin playlists",
            context.user.isAuthenticated ? "Crea una nueva o importa una desde tu dispositivo." : "Importa una desde tu dispositivo. Para crear nuevas necesitas iniciar sesión.",
            el(
              "div",
              { class: "buttonRow center" },
              button("Importar", () => showAddDialog(context, null, kind), "primary", "upload"),
              button(kind === "folder" ? "Crear carpeta" : "Crear playlist", () => showCreateDialog(context, kind), "outline", "plus")
            )
          )
        );
      } else {
        this.built = buildCollectionList(context, kind);
        this.element.append(el("p", { class: "hint" }, "Arrastra el control ⋮⋮ para reordenar."), this.built.element);
      }
    }
  }

  public destroy(): void {
    this.built?.destroy();
  }
}
