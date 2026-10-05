import { DragSorter } from "../Components/DragSorter";
import { collectionRow, songRow } from "../Components/Rows";
import type { Collection } from "../Models/Collection";
import type { Song } from "../Models/Song";
import type { DoubleLinkedList } from "../Structures/DoubleLinkedList";
import { el } from "../Utils/Dom";
import type { AppContext } from "./AppContext";
import { showCollectionMenu, showSongMenu } from "./Menus";

export interface BuiltList {
  element: HTMLElement;
  destroy: () => void;
}

export function buildSongList(context: AppContext, list: DoubleLinkedList<Song>, owner: Collection | null, filter: Set<string> | null): BuiltList {
  const container = el("div", { class: "rowList", role: "list" });
  const sortable = filter === null;
  const currentId = context.player.song?.id ?? null;
  for (const node of list.nodes()) {
    const song = node.value;
    if (filter !== null && !filter.has(song.id)) continue;
    const play = (): void => void context.player.playFrom(list, node);
    container.appendChild(
      songRow(song, {
        isCurrent: song.id === currentId,
        isPlaying: song.id === currentId && context.player.isPlaying,
        sortable,
        onPlay: play,
        onMenu: (anchor) => showSongMenu(context, song, anchor, play)
      })
    );
  }
  let sorter: DragSorter | null = null;
  if (sortable) {
    sorter = new DragSorter({
      container,
      itemSelector: ".songRow",
      handleSelector: ".dragHandle",
      orientation: "vertical",
      onDrop: (draggedId, beforeId) => void context.library.moveSong(list, draggedId, beforeId, owner)
    });
  }
  return { element: container, destroy: () => sorter?.destroy() };
}

export function buildCollectionList(context: AppContext, kind: "folder" | "playlist"): BuiltList {
  const container = el("div", { class: "rowList", role: "list" });
  const list = context.library.collectionsOf(kind);
  for (const collection of list) {
    const open = (): void => context.navigate(`#/collection/${collection.id}`, { autoplay: true });
    container.appendChild(
      collectionRow(collection, {
        sortable: true,
        onOpen: open,
        onMenu: (anchor) => showCollectionMenu(context, collection, anchor, open)
      })
    );
  }
  const sorter = new DragSorter({
    container,
    itemSelector: ".collectionRow",
    handleSelector: ".dragHandle",
    orientation: "vertical",
    onDrop: (draggedId, beforeId) => void context.library.moveCollection(kind, draggedId, beforeId)
  });
  return { element: container, destroy: () => sorter.destroy() };
}
