import { coverElement, button, emptyState } from "../Components/Rows";
import { el } from "../Utils/Dom";
import { pluralize } from "../Utils/Format";
import type { AppContext, View } from "./AppContext";
import { showConfirm } from "./Dialogs";
import { showAddDialog } from "./MediaDialogs";
import { buildSongList, type BuiltList } from "./SongListBuilder";

export class CollectionView implements View {
  public readonly element = el("section", { class: "view collectionView" });
  private built: BuiltList | null = null;
  private query = "";

  public constructor(
    private readonly context: AppContext,
    private readonly collectionId: string,
    autoplay: boolean
  ) {
    const collection = context.library.findCollection(collectionId);
    if (collection !== null) {
      context.setSearchContext({
        placeholder: `Buscar en "${collection.name}"`,
        value: "",
        live: true,
        onChange: (value) => {
          this.query = value;
          this.refresh();
        },
        onSubmit: (value) => {
          this.query = value;
          this.refresh();
        }
      });
      if (autoplay && !collection.songs.isEmpty) {
        void context.player.playFirstOf(collection.songs);
      }
    }
    this.refresh();
  }

  public refresh(): void {
    this.built?.destroy();
    this.built = null;
    const context = this.context;
    const collection = context.library.findCollection(this.collectionId);
    if (collection === null) {
      context.navigate("#/library");
      return;
    }
    const header = el(
      "div",
      { class: "collectionHeader" },
      coverElement(collection.coverImage, collection.isFolder ? "folder" : "playlist", "cover large"),
      el(
        "div",
        { class: "collectionInfo" },
        el("span", { class: "eyebrow" }, collection.isFolder ? "Carpeta" : "Playlist"),
        el("h1", {}, collection.name),
        el("p", { class: "muted" }, pluralize(collection.songs.size, "canción", "canciones")),
        el(
          "div",
          { class: "buttonRow" },
          button("Reproducir", () => void context.player.playFirstOf(collection.songs), "primary", "play"),
          button("Agregar canciones", () => showAddDialog(context, collection), "outline", "plus"),
          button("Eliminar", () => showConfirm(collection.isFolder ? "Eliminar carpeta" : "Eliminar playlist", `¿Quieres eliminar "${collection.name}" y sus canciones?`, "Eliminar", async () => {
            try {
              await context.library.deleteCollection(collection);
              context.toast("Eliminado correctamente.", "success");
            } catch (error) {
              context.handleError(error);
            }
          }), "ghost danger", "trash")
        )
      )
    );
    this.element.replaceChildren(el("button", { class: "linkButton backLink", type: "button", onClick: () => context.navigate("#/library") }, "← Biblioteca"), header);
    if (collection.songs.isEmpty) {
      this.element.append(
        emptyState(
          "music",
          collection.isFolder ? "Esta carpeta está vacía" : "Esta playlist está vacía",
          "Agrega canciones desde tu dispositivo o desde YouTube.",
          button("Agregar canciones", () => showAddDialog(context, collection), "primary", "plus")
        )
      );
      return;
    }
    let filter: Set<string> | null = null;
    if (this.query.trim().length > 0) {
      filter = new Set(context.search.searchCollection(collection, this.query).map((song) => song.id));
      if (filter.size === 0) {
        this.element.append(emptyState("search", "Sin resultados", `No encontramos canciones que coincidan con "${this.query.trim()}" en "${collection.name}".`));
        return;
      }
    }
    this.built = buildSongList(context, collection.songs, collection, filter);
    this.element.append(this.built.element);
    if (filter === null) this.element.append(el("p", { class: "hint" }, "Arrastra el control ⋮⋮ para reordenar las canciones."));
  }

  public destroy(): void {
    this.built?.destroy();
    this.context.setSearchContext(null);
  }
}
