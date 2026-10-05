import type { SearchFilter, SearchResultData } from "../../Shared/Types";
import { coverElement, emptyState } from "../Components/Rows";
import { GuestLimitError } from "../Managers/GuestLimitPolicy";
import type { SongInput } from "../Managers/LibraryManager";
import { ApiError } from "../Services/ApiClient";
import { el } from "../Utils/Dom";
import { formatTime } from "../Utils/Format";
import { icon } from "../Utils/Icons";
import type { AppContext, View } from "./AppContext";
import { showLimitDialog } from "./Dialogs";

export const searchState = {
  query: "",
  filter: "all" as SearchFilter,
  results: [] as SearchResultData[],
  status: "idle" as "idle" | "loading" | "done" | "error",
  message: "",
  pending: false
};

const filters: { id: SearchFilter; label: string }[] = [
  { id: "all", label: "Todo" },
  { id: "songs", label: "Canciones" },
  { id: "videos", label: "Videos" },
  { id: "artists", label: "Artistas" }
];

export class SearchView implements View {
  public readonly element = el("section", { class: "view searchView" });
  private token = 0;

  public constructor(private readonly context: AppContext) {
    context.setSearchContext({
      placeholder: "Buscar canciones, artistas o videos…",
      value: searchState.query,
      live: false,
      onChange: () => undefined,
      onSubmit: (value) => void this.run(value)
    });
    this.refresh();
    if (searchState.pending) {
      searchState.pending = false;
      void this.run(searchState.query);
    }
  }

  public refresh(): void {
    const context = this.context;
    const added = new Set<string>();
    const collect = (song: { sourceRef: string | null; source: string }): void => {
      if (song.sourceRef !== null && song.source === "youtube") added.add(song.sourceRef);
    };
    context.library.songs.forEachForward(collect);
    for (const collection of [...context.library.folders, ...context.library.playlists]) collection.songs.forEachForward(collect);
    const chips = el(
      "div",
      { class: "chipRow", role: "tablist" },
      ...filters.map((item) =>
        el("button", { class: `chip ${searchState.filter === item.id ? "selected" : ""}`, type: "button", role: "tab", "aria-selected": searchState.filter === item.id, onClick: () => {
          searchState.filter = item.id;
          if (searchState.query.trim().length > 0) void this.run(searchState.query);
          else this.refresh();
        } }, item.label)
      )
    );
    this.element.replaceChildren(el("div", { class: "viewHeader" }, el("h1", {}, "Buscar"), el("p", { class: "muted" }, "Resultados de Internet (YouTube)")), chips);
    if (searchState.status === "idle") {
      this.element.append(emptyState("search", "Busca música en Internet", "Escribe una canción, artista o video arriba. También puedes pegar un enlace de YouTube."));
      return;
    }
    if (searchState.status === "loading") {
      this.element.append(el("div", { class: "loading", role: "status" }, el("span", { class: "spinner" }), "Buscando…"));
      return;
    }
    if (searchState.status === "error") {
      this.element.append(emptyState("warning", "No pudimos completar la búsqueda", searchState.message));
      return;
    }
    if (searchState.results.length === 0) {
      this.element.append(emptyState("search", "Sin resultados", `No encontramos resultados para "${searchState.query}". Prueba con otras palabras.`));
      return;
    }
    const list = el("div", { class: "rowList", role: "list" });
    for (const result of searchState.results) {
      const isChannel = result.kind === "channel";
      const done = added.has(result.id);
      const meta = isChannel ? "Canal" : `${result.channelTitle}${result.durationSeconds ? ` · ${formatTime(result.durationSeconds)}` : ""}`;
      const main = el(
        "button",
        { class: "rowMain", type: "button", "aria-label": isChannel ? `Buscar ${result.title}` : `Agregar y reproducir ${result.title}`, onClick: () => {
          if (isChannel) {
            void this.run(result.title, "songs");
          } else {
            void this.add(result, true);
          }
        } },
        coverElement(result.thumbnailUrl, isChannel ? "user" : "youtube", `cover ${isChannel ? "round" : "wide"}`),
        el("span", { class: "rowText" }, el("span", { class: "rowTitle" }, result.title), el("span", { class: "rowSub" }, meta))
      );
      list.appendChild(
        el(
          "div",
          { class: "listRow resultRow", role: "listitem" },
          main,
          isChannel
            ? null
            : el("button", { class: `iconButton ${done ? "doneButton" : "accent"}`, type: "button", disabled: done, "aria-label": done ? "Ya está en tu biblioteca" : `Agregar ${result.title}`, onClick: () => void this.add(result, false) }, icon(done ? "check" : "plus", 18))
        )
      );
    }
    this.element.append(list);
  }

  public destroy(): void {
    this.token += 1;
    this.context.setSearchContext(null);
  }

  private async run(value: string, forcedFilter?: SearchFilter): Promise<void> {
    const query = value.trim();
    if (forcedFilter !== undefined) searchState.filter = forcedFilter;
    searchState.query = query;
    if (query.length === 0) {
      searchState.status = "idle";
      this.refresh();
      return;
    }
    const token = (this.token += 1);
    searchState.status = "loading";
    this.refresh();
    try {
      if (/^https?:\/\//i.test(query)) {
        const resolved = await this.context.search.resolveUrl(query);
        searchState.results = [resolved.result];
      } else {
        searchState.results = await this.context.search.searchWeb(query, searchState.filter);
      }
      searchState.status = "done";
    } catch (error) {
      searchState.status = "error";
      searchState.message = error instanceof ApiError ? error.message : "Ocurrió un error al buscar.";
    }
    if (token === this.token) this.refresh();
  }

  private async add(result: SearchResultData, play: boolean): Promise<void> {
    const context = this.context;
    const input: SongInput = {
      title: result.title,
      artist: result.channelTitle,
      durationSeconds: result.durationSeconds ?? 0,
      source: "youtube",
      sourceRef: result.id,
      coverUrl: result.thumbnailUrl,
      file: null
    };
    try {
      let existing = null as import("../Models/Song").Song | null;
      context.library.songs.forEachForward((song) => {
        if (song.source === "youtube" && song.sourceRef === result.id) existing = song;
      });
      if (existing === null) {
        const [song] = await context.library.addSongs([input], null);
        existing = song ?? null;
        context.toast(`"${result.title}" se agregó a tu biblioteca.`, "success");
      }
      if (play && existing !== null) {
        const node = context.library.songs.find((song) => song.id === (existing as import("../Models/Song").Song).id);
        if (node !== null) void context.player.playFrom(context.library.songs, node);
      }
    } catch (error) {
      if (error instanceof GuestLimitError) showLimitDialog(context, 1);
      else context.handleError(error);
    }
  }
}
