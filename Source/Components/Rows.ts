import type { Collection } from "../Models/Collection";
import type { Song } from "../Models/Song";
import { el } from "../Utils/Dom";
import { formatTime, pluralize } from "../Utils/Format";
import { icon } from "../Utils/Icons";

export function coverElement(image: string | null, fallbackIcon: string, className = "cover"): HTMLElement {
  const wrapper = el("div", { class: className });
  if (image !== null) {
    const picture = el("img", { src: image, alt: "", loading: "lazy", draggable: false });
    picture.addEventListener("error", () => {
      picture.remove();
      wrapper.classList.add("coverFallback");
      wrapper.appendChild(icon(fallbackIcon, 22));
    });
    wrapper.appendChild(picture);
  } else {
    wrapper.classList.add("coverFallback");
    wrapper.appendChild(icon(fallbackIcon, 22));
  }
  return wrapper;
}

export interface SongRowActions {
  onPlay: () => void;
  onMenu: (anchor: HTMLElement) => void;
  isCurrent: boolean;
  isPlaying: boolean;
  sortable: boolean;
}

export function songRow(song: Song, actions: SongRowActions): HTMLElement {
  const handle = actions.sortable
    ? el("button", { class: "dragHandle", type: "button", "aria-label": `Reordenar ${song.title}`, title: "Arrastra para reordenar" }, icon("drag", 18))
    : null;
  const menu = el(
    "button",
    {
      class: "iconButton",
      type: "button",
      "aria-label": `Más opciones de ${song.title}`,
      onClick: (event: Event) => {
        event.stopPropagation();
        actions.onMenu(event.currentTarget as HTMLElement);
      }
    },
    icon("more", 18)
  );
  const row = el(
    "div",
    {
      class: `listRow songRow ${actions.isCurrent ? "current" : ""} ${actions.isPlaying ? "playing" : ""}`,
      "data-sort-id": song.id,
      role: "listitem"
    },
    handle,
    el(
      "button",
      { class: "rowMain", type: "button", onClick: actions.onPlay, "aria-label": `Reproducir ${song.title}` },
      coverElement(song.coverImage, "music", "cover small"),
      el(
        "span",
        { class: "rowText" },
        el("span", { class: "rowTitle" }, song.title),
        el("span", { class: "rowSub" }, song.source === "youtube" ? el("span", { class: "sourceTag" }, icon("youtube", 13), "YouTube") : null, song.subtitle)
      ),
      actions.isCurrent ? el("span", { class: "equalizer", "aria-hidden": "true" }, el("i"), el("i"), el("i")) : null,
      el("span", { class: "rowMeta" }, song.durationSeconds > 0 ? formatTime(song.durationSeconds) : "")
    ),
    menu
  );
  return row;
}

export interface CollectionRowActions {
  onOpen: () => void;
  onMenu: (anchor: HTMLElement) => void;
  sortable: boolean;
}

export function collectionRow(collection: Collection, actions: CollectionRowActions): HTMLElement {
  const handle = actions.sortable
    ? el("button", { class: "dragHandle", type: "button", "aria-label": `Reordenar ${collection.name}`, title: "Arrastra para reordenar" }, icon("drag", 18))
    : null;
  return el(
    "div",
    { class: "listRow collectionRow", "data-sort-id": collection.id, role: "listitem" },
    handle,
    el(
      "button",
      { class: "rowMain", type: "button", onClick: actions.onOpen, "aria-label": `Abrir ${collection.name}` },
      coverElement(collection.coverImage, collection.isFolder ? "folder" : "playlist", "cover small"),
      el(
        "span",
        { class: "rowText" },
        el("span", { class: "rowTitle" }, collection.name),
        el("span", { class: "rowSub" }, pluralize(collection.songs.size, "canción", "canciones"))
      )
    ),
    el(
      "button",
      {
        class: "iconButton",
        type: "button",
        "aria-label": `Más opciones de ${collection.name}`,
        onClick: (event: Event) => {
          event.stopPropagation();
          actions.onMenu(event.currentTarget as HTMLElement);
        }
      },
      icon("more", 18)
    )
  );
}

export function emptyState(iconName: string, title: string, text: string, action?: HTMLElement): HTMLElement {
  return el("div", { class: "emptyState" }, el("div", { class: "emptyIcon" }, icon(iconName, 34)), el("h3", {}, title), el("p", {}, text), action ?? null);
}

export function button(label: string, onClick: () => void, className = "secondary", iconName?: string, type: "button" | "submit" = "button"): HTMLButtonElement {
  return el("button", { class: `button ${className}`, type, onClick }, iconName === undefined ? null : icon(iconName, 18), el("span", {}, label));
}
