import type { AppearanceData, SearchResultData } from "../../Shared/Types";
import type { Collection } from "../Models/Collection";
import type { Song } from "../Models/Song";
import { Modal } from "../Components/Modal";
import { button, coverElement } from "../Components/Rows";
import { GuestLimitError } from "../Managers/GuestLimitPolicy";
import type { SongInput } from "../Managers/LibraryManager";
import { ApiError } from "../Services/ApiClient";
import { el, replaceChildren } from "../Utils/Dom";
import { formatTime, pluralize } from "../Utils/Format";
import { icon } from "../Utils/Icons";
import type { AppContext } from "./AppContext";
import { showLimitDialog, showLoginDialog } from "./Dialogs";

type AddMode = "song" | "folder" | "playlist" | "youtube" | "url";

function pickFiles(options: { accept: string; multiple: boolean; directory: boolean }): Promise<File[]> {
  return new Promise((resolve) => {
    const input = el("input", { type: "file", accept: options.accept, multiple: options.multiple, hidden: true });
    if (options.directory) {
      input.setAttribute("webkitdirectory", "");
    }
    input.addEventListener("change", () => {
      resolve(Array.from(input.files ?? []));
      input.remove();
    });
    input.addEventListener("cancel", () => {
      resolve([]);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

export function showAddDialog(context: AppContext, target: Collection | null, initialMode: AddMode = "song"): void {
  let mode: AddMode = initialMode;
  let busy = false;
  const content = el("div", { class: "addDialog" });
  const modal = new Modal(content, { label: "Agregar", className: "wide" });
  const audioAccept = "audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.flac,.weba,.webm";
  const playlistName = el("input", { type: "text", maxLength: 80, placeholder: "Nombre de la playlist" });

  const reportLimit = (incoming: number): void => {
    modal.close();
    showLimitDialog(context, incoming);
  };

  const showProgress = (label: string): ((done: number, total: number) => void) => {
    busy = true;
    modal.setDismissible(false);
    const bar = el("div", { class: "progressBar" }, el("div", { class: "progressFill" }));
    const text = el("p", { class: "muted center" }, label);
    content.replaceChildren(el("div", { class: "importProgress" }, icon("upload", 34), el("h3", {}, "Importando…"), bar, text));
    return (done, total) => {
      (bar.firstElementChild as HTMLElement).style.width = `${Math.round((done / Math.max(total, 1)) * 100)}%`;
      text.textContent = `Importando ${done} de ${total}…`;
    };
  };

  const finish = (message: string): void => {
    busy = false;
    modal.setDismissible(true);
    modal.close();
    context.toast(message, "success");
  };

  const fail = (error: unknown, incoming: number): void => {
    busy = false;
    modal.setDismissible(true);
    if (error instanceof GuestLimitError) {
      reportLimit(error.incomingCount || incoming);
      return;
    }
    context.handleError(error);
    render();
  };

  const importSongs = async (files: File[]): Promise<void> => {
    const audio = files.filter((file) => context.imports.isAudioFile(file));
    if (audio.length === 0) {
      context.toast("No encontramos archivos de audio compatibles en tu selección.", "error");
      return;
    }
    if (!context.user.isAuthenticated && context.policy.wouldExceed(context.library.totalSongCount, audio.length)) {
      reportLimit(audio.length);
      return;
    }
    const progress = showProgress("Leyendo archivos…");
    try {
      const result = await context.imports.readAudioFiles(files);
      const created = await context.library.addSongs(result.inputs, target, progress);
      if (created.length > 0) {
        if (target !== null) {
          const firstNode = target.songs.head;
          if (firstNode !== null) await context.player.playFrom(target.songs, firstNode);
        } else {
          const firstNode = context.library.songs.head;
          if (firstNode !== null) await context.player.playFrom(context.library.songs, firstNode);
        }
      }
      finish(`Se agregó ${pluralize(created.length, "canción", "canciones")}.${result.ignored > 0 ? ` Se omitieron ${result.ignored} archivos no compatibles.` : ""}`);
    } catch (error) {
      fail(error, audio.length);
    }
  };

  const importFolder = async (files: File[]): Promise<void> => {
    const audio = files.filter((file) => context.imports.isAudioFile(file));
    if (audio.length === 0) {
      context.toast("La carpeta no contiene canciones compatibles.", "error");
      return;
    }
    if (!context.user.isAuthenticated && context.policy.wouldExceed(context.library.totalSongCount, audio.length)) {
      reportLimit(audio.length);
      return;
    }
    const progress = showProgress("Leyendo carpeta…");
    try {
      const { name, result } = await context.imports.readFolder(files);
      const collection = await context.library.importCollection({ kind: "folder", name, inputs: result.inputs }, progress);
      if (!collection.songs.isEmpty) {
        const firstNode = collection.songs.head;
        if (firstNode !== null) await context.player.playFrom(collection.songs, firstNode);
      }
      finish(`Carpeta "${name}" importada con ${pluralize(result.inputs.length, "canción", "canciones")}.`);
    } catch (error) {
      fail(error, audio.length);
    }
  };

  const importPlaylist = async (files: File[]): Promise<void> => {
    const audio = files.filter((file) => context.imports.isAudioFile(file));
    if (audio.length === 0) {
      context.toast("No encontramos archivos de audio compatibles para crear la playlist.", "error");
      return;
    }
    if (!context.user.isAuthenticated && context.policy.wouldExceed(context.library.totalSongCount, audio.length)) {
      reportLimit(audio.length);
      return;
    }
    const progress = showProgress("Leyendo archivos…");
    try {
      const { name, result } = await context.imports.readPlaylist(files, playlistName.value);
      const collection = await context.library.importCollection({ kind: "playlist", name, inputs: result.inputs }, progress);
      if (!collection.songs.isEmpty) {
        const firstNode = collection.songs.head;
        if (firstNode !== null) await context.player.playFrom(collection.songs, firstNode);
      }
      finish(`Playlist "${name}" importada con ${pluralize(result.inputs.length, "canción", "canciones")}.`);
    } catch (error) {
      fail(error, audio.length);
    }
  };

  const handleFiles = async (files: File[], fromMode: AddMode): Promise<void> => {
    if (files.length === 0 || busy) return;
    if (fromMode === "folder") await importFolder(files);
    else if (fromMode === "playlist") await importPlaylist(files);
    else await importSongs(files);
  };

  const chooseFiles = async (forMode: AddMode): Promise<void> => {
    const files = await pickFiles({
      accept: forMode === "playlist" ? `${audioAccept},.m3u,.m3u8` : forMode === "folder" ? "" : audioAccept,
      multiple: forMode !== "folder",
      directory: forMode === "folder"
    });
    await handleFiles(files, forMode);
  };

  const addRemote = async (inputs: SongInput[]): Promise<void> => {
    try {
      await context.library.addSongs(inputs, target);
      context.toast(`Se agregó ${pluralize(inputs.length, "canción", "canciones")}.`, "success");
    } catch (error) {
      if (error instanceof GuestLimitError) reportLimit(inputs.length);
      else context.handleError(error);
    }
  };

  const resultToInput = (result: SearchResultData): SongInput => ({
    title: result.title,
    artist: result.channelTitle,
    durationSeconds: result.durationSeconds ?? 0,
    source: "youtube",
    sourceRef: result.id,
    coverUrl: result.thumbnailUrl,
    file: null
  });

  const dropzone = (forMode: AddMode): HTMLElement => {
    const label =
      forMode === "folder" ? "Arrastra una carpeta aquí" : forMode === "playlist" ? "Arrastra las canciones de la playlist aquí" : "Arrastra el archivo o carpeta aquí";
    const zone = el(
      "div",
      { class: "dropzone", role: "button", tabIndex: 0, "aria-label": "Seleccionar desde tu dispositivo" },
      icon("upload", 40),
      el("p", {}, label),
      el("span", { class: "linkText" }, "o selecciona desde tu dispositivo")
    );
    const open = (): void => void chooseFiles(forMode);
    zone.addEventListener("click", open);
    zone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("over"));
    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("over");
      if (event.dataTransfer === null) return;
      void context.imports.collectFromDataTransfer(event.dataTransfer).then((files) => {
        const hasDirectory = files.some((file) => (file.webkitRelativePath ?? "").includes("/"));
        const resolvedMode = forMode === "song" && hasDirectory && target === null ? "folder" : forMode;
        void handleFiles(files, resolvedMode);
      });
    });
    return zone;
  };

  const youtubePanel = (): HTMLElement => {
    const input = el("input", { type: "search", placeholder: "Buscar en YouTube", "data-autofocus": true });
    const results = el("div", { class: "resultList" });
    const form = el("form", { class: "inlineForm" }, input, el("button", { class: "button primary", type: "submit" }, "Buscar"));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = input.value.trim();
      if (query.length === 0) return;
      results.replaceChildren(el("p", { class: "muted center" }, "Buscando…"));
      context.search
        .searchWeb(query, "songs")
        .then((found) => {
          results.replaceChildren(
            ...(found.length === 0
              ? [el("p", { class: "muted center" }, "No encontramos resultados.")]
              : found.map((result) =>
                  el(
                    "div",
                    { class: "listRow" },
                    el("span", { class: "rowMain static" }, coverElement(result.thumbnailUrl, "youtube", "cover small"), el("span", { class: "rowText" }, el("span", { class: "rowTitle" }, result.title), el("span", { class: "rowSub" }, `${result.channelTitle}${result.durationSeconds ? ` · ${formatTime(result.durationSeconds)}` : ""}`))),
                    el("button", { class: "iconButton accent", type: "button", "aria-label": `Agregar ${result.title}`, onClick: () => void addRemote([resultToInput(result)]) }, icon("plus", 18))
                  )
                ))
          );
        })
        .catch((error: unknown) => {
          results.replaceChildren(el("p", { class: "formError" }, error instanceof ApiError ? error.message : "No pudimos buscar en YouTube."));
        });
    });
    return el("div", { class: "stack" }, el("h3", {}, "Desde YouTube"), form, results);
  };

  const urlPanel = (): HTMLElement => {
    const input = el("input", { type: "url", placeholder: "https://…", "data-autofocus": true });
    const error = el("p", { class: "formError", role: "alert", hidden: true });
    const submit = el("button", { class: "button primary", type: "submit" }, "Agregar");
    const form = el("form", { class: "stack", noValidate: true }, el("div", { class: "inlineForm" }, input, submit), error);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      error.hidden = true;
      const value = input.value.trim();
      if (value.length === 0) {
        error.textContent = "Pega una dirección.";
        error.hidden = false;
        return;
      }
      submit.disabled = true;
      context.search
        .resolveUrl(value)
        .then(async (resolved) => {
          const result = resolved.result;
          const entry: SongInput =
            resolved.kind === "youtube"
              ? resultToInput(result)
              : { title: result.title, artist: result.channelTitle, durationSeconds: 0, source: "url", sourceRef: result.id, coverUrl: null, file: null };
          await addRemote([entry]);
          input.value = "";
        })
        .catch((failure: unknown) => {
          error.textContent = failure instanceof ApiError ? failure.message : "No pudimos leer esa dirección.";
          error.hidden = false;
        })
        .finally(() => {
          submit.disabled = false;
        });
    });
    return el("div", { class: "stack" }, el("h3", {}, "Desde URL"), el("p", { class: "muted small" }, "Pega un enlace de YouTube o la dirección directa de un archivo de audio."), form);
  };

  const render = (): void => {
    const tabs: { id: AddMode; label: string; iconName: string }[] = [{ id: "song", label: "Canción", iconName: "music" }];
    if (target === null) {
      tabs.push({ id: "folder", label: "Carpeta", iconName: "folder" }, { id: "playlist", label: "Playlist", iconName: "playlist" });
    }
    const sidebar = el(
      "div",
      { class: "addTabs", role: "tablist" },
      ...tabs.map((tab) =>
        el("button", { class: `addTab ${mode === tab.id ? "selected" : ""}`, type: "button", role: "tab", "aria-selected": mode === tab.id, onClick: () => {
          mode = tab.id;
          render();
        } }, icon(tab.iconName, 18), el("span", {}, tab.label))
      )
    );
    let panel: HTMLElement;
    if (mode === "youtube") panel = youtubePanel();
    else if (mode === "url") panel = urlPanel();
    else {
      panel = el(
        "div",
        { class: "stack" },
        el("h3", {}, target === null ? "Agregar desde tu dispositivo" : `Agregar a "${target.name}"`),
        mode === "playlist" ? el("label", { class: "field" }, el("span", {}, "Nombre de la playlist"), playlistName) : null,
        dropzone(mode),
        el("p", { class: "muted small" }, mode === "playlist" ? "Puedes incluir un archivo .m3u para conservar el orden." : "Formatos: MP3, M4A, AAC, WAV, OGG, FLAC, OPUS y WEBM.")
      );
    }
    const alternatives = el(
      "div",
      { class: "alternatives" },
      el("p", { class: "eyebrow" }, "También puedes:"),
      el("button", { class: `altButton ${mode === "youtube" ? "selected" : ""}`, type: "button", onClick: () => {
        mode = "youtube";
        render();
      } }, icon("youtube", 20), el("span", {}, "Desde YouTube")),
      el("button", { class: `altButton ${mode === "url" ? "selected" : ""}`, type: "button", onClick: () => {
        mode = "url";
        render();
      } }, icon("link", 20), el("span", {}, "Desde URL")),
      el("button", { class: "altButton", type: "button", onClick: () => {
        const forMode: AddMode = mode === "folder" || mode === "playlist" ? mode : "song";
        mode = forMode;
        void chooseFiles(forMode);
      } }, icon("devices", 20), el("span", {}, "Desde tu dispositivo"))
    );
    const guestNote = context.user.isAuthenticated
      ? null
      : el("p", { class: "guestNote" }, `Modo invitado: ${context.library.totalSongCount} de ${context.policy.limit} canciones usadas.`);
    content.replaceChildren(el("h2", {}, "Agregar"), el("div", { class: "addLayout" }, sidebar, el("div", { class: "addMain" }, panel, alternatives, guestNote)));
  };
  render();
}



const SwatchColors = ["#4f46e5", "#a21caf", "#f43f5e", "#f59e0b", "#10b981", "#06b6d4"];

export function showAppearanceDialog(context: AppContext, song: Song | null = null): void {
  let draft: AppearanceData = { mode: "color", color: "#4f46e5" };
  let saving = false;
  const content = el("div", { class: "appearanceDialog" });
  const modal = new Modal(content, {
    label: "Personalizar apariencia",
    className: "medium"
  });
  const error = el("p", { class: "formError", role: "alert", hidden: true });

  const currentFor = (): AppearanceData => {
    if (song === null) {
      const app = context.appearance.appearance;
      if (app.mode === "color" && app.color) return app;
      if (app.mode === "default") return { mode: "color", color: "#4f46e5" };
      return { mode: "color", color: "#4f46e5" };
    }
    const s = song?.appearance;
    if (s && s.mode === "color" && s.color) return s;
    return { mode: "color", color: "#4f46e5" };
  };
  draft = currentFor();

  const previewSource = (): { kind: "color"; value: string } => {
    if (draft.mode === "color" && draft.color) return { kind: "color", value: draft.color };
    return { kind: "color", value: "#4f46e5" };
  };

  function showError(message: string): void {
    error.textContent = message;
    error.hidden = false;
  }

  const apply = async (): Promise<void> => {
    if (saving) return;
    saving = true;
    error.hidden = true;
    try {
      if (song === null) {
        await context.appearance.setGlobalAppearance(draft, null);
      } else {
        await context.library.updateSong(song, { appearance: draft });
      }
      modal.close();
      context.toast("Apariencia aplicada.", "success");
    } catch (failure) {
      saving = false;
      showError(failure instanceof ApiError ? failure.message : "No pudimos aplicar los cambios.");
    }
  };

  const reset = async (): Promise<void> => {
    if (saving) return;
    saving = true;
    try {
      if (song === null) {
        await context.appearance.setGlobalAppearance({ mode: "default" }, null);
      } else {
        await context.library.updateSong(song, { appearance: null });
      }
      modal.close();
      context.toast("Apariencia restablecida.", "success");
    } catch (failure) {
      saving = false;
      showError(failure instanceof ApiError ? failure.message : "No pudimos restablecer la apariencia.");
    }
  };

  const render = (): void => {
    const preview = el("div", { class: "appearancePreview", "aria-label": "Vista previa" });
    const source = previewSource();
    if (source.kind === "color") preview.style.background = source.value;
    preview.appendChild(el("span", { class: "previewLabel" }, "Vista previa"));

    const colorPanel = el(
      "div",
      { class: "stack" },
      el("p", { class: "eyebrow" }, "Colores sólidos"),
      el(
        "div",
        { class: "swatches" },
        ...SwatchColors.map((color) =>
          el("button", { class: `swatch ${draft.mode === "color" && draft.color === color ? "selected" : ""}`, type: "button", style: { background: color }, "aria-label": `Color ${color}`, "aria-pressed": draft.mode === "color" && draft.color === color, onClick: () => {
            draft = { mode: "color", color };
            render();
          } })
        ),
        el("label", { class: "swatch custom", title: "Elegir otro color" }, el("input", { type: "color", value: draft.mode === "color" && draft.color ? draft.color : "#4f46e5", "aria-label": "Color personalizado", onInput: (event: Event) => {
          draft = { mode: "color", color: (event.target as HTMLInputElement).value };
          render();
        } }), icon("plus", 16))
      )
    );

    const apply$ = el("button", { class: "button primary block", type: "button", onClick: () => void apply() }, "Aplicar");
    replaceChildren(
      content,
      el("h2", {}, "Personalizar apariencia"),
      preview,
      colorPanel,
      error,
      apply$,
      el("div", { class: "buttonRow" }, button("Cancelar", () => modal.close(), "outline"), button("Restablecer", () => void reset(), "ghost"))
    );
  };
  render();
}

export function showSignInPrompt(context: AppContext, reason: string): void {
  showLoginDialog(context, reason);
}
