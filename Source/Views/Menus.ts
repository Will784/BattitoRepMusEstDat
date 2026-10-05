import type { Collection } from "../Models/Collection";
import type { Song } from "../Models/Song";
import { PopoverMenu } from "../Components/Popover";
import { pluralize } from "../Utils/Format";
import { icon } from "../Utils/Icons";
import type { AppContext } from "./AppContext";
import { showAddToPlaylistDialog, showConfirm, showRenameDialog } from "./Dialogs";
import { showAppearanceDialog } from "./MediaDialogs";

export function showSongMenu(context: AppContext, song: Song, anchor: HTMLElement, onPlay: () => void): void {
  PopoverMenu.open(
    [
      { label: "Reproducir", iconNode: icon("play", 16), onSelect: onPlay },
      { label: "Agregar a playlist", iconNode: icon("playlist", 16), onSelect: () => showAddToPlaylistDialog(context, song) },
      { label: "Personalizar", iconNode: icon("color", 16), onSelect: () => showAppearanceDialog(context, song) },

      {
        label: "Eliminar",
        iconNode: icon("trash", 16),
        danger: true,
        onSelect: () =>
          showConfirm("Eliminar canción", `¿Quieres eliminar "${song.title}" de tu biblioteca?`, "Eliminar", async () => {
            try {
              await context.library.deleteSong(song);
              context.toast("Canción eliminada.", "success");
            } catch (error) {
              context.handleError(error);
            }
          })
      }
    ],
    anchor
  );
}

export function showCollectionMenu(context: AppContext, collection: Collection, anchor: HTMLElement, onOpen: () => void): void {
  PopoverMenu.open(
    [
      { label: "Abrir", iconNode: icon("play", 16), onSelect: onOpen },
      { label: "Cambiar nombre", iconNode: icon("lyrics", 16), onSelect: () => showRenameDialog(context, collection) },
      {
        label: "Eliminar",
        iconNode: icon("trash", 16),
        danger: true,
        onSelect: () =>
          showConfirm(
            collection.isFolder ? "Eliminar carpeta" : "Eliminar playlist",
            `¿Quieres eliminar "${collection.name}" y sus ${pluralize(collection.songs.size, "canción", "canciones")}?`,
            "Eliminar",
            async () => {
              try {
                await context.library.deleteCollection(collection);
                context.toast("Eliminado correctamente.", "success");
              } catch (error) {
                context.handleError(error);
              }
            }
          )
      }
    ],
    anchor
  );
}
