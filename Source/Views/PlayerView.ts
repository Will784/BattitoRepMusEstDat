import type { LyricsResponseData } from "../../Shared/Types";
import { coverElement } from "../Components/Rows";
import type { Song } from "../Models/Song";
import { ApiError } from "../Services/ApiClient";
import { el } from "../Utils/Dom";
import { formatTime, parseSongName } from "../Utils/Format";
import { icon } from "../Utils/Icons";
import type { AppContext } from "./AppContext";

import { showAppearanceDialog } from "./MediaDialogs";
import { showSongMenu } from "./Menus";

interface LyricsState {
  status: "loading" | "ready" | "missing" | "error";
  text: string | null;
  message?: string;
}

interface ParsedLyricLine {
  time: number;
  element: HTMLElement;
}

export class PlayerView {
  public readonly element: HTMLElement;
  private readonly background: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly disc: HTMLElement;
  private readonly discHolder: HTMLElement;
  private readonly videoSlot: HTMLElement;
  private readonly titleNode: HTMLElement;
  private readonly artistNode: HTMLElement;
  private readonly contextNode: HTMLElement;
  private readonly seek: HTMLInputElement;
  private readonly elapsed: HTMLElement;
  private readonly total: HTMLElement;
  private readonly controls: HTMLElement;
  private readonly lyricsPanel: HTMLElement;
  private readonly lyricsBody: HTMLElement;
  private readonly lyricsButton: HTMLButtonElement;
  private readonly lyricsCache = new Map<string, LyricsState>();
  private parsedLyrics: ParsedLyricLine[] = [];
  private currentActiveIndex = -1;
  private userScrollTimeout = 0;
  private userIsScrollingLyrics = false;
  private frame = 0;
  private opened = false;
  private seeking = false;
  private lyricsOpen = false;
  private phase = 0;
  private readonly youtubeHost: HTMLElement;

  public constructor(
    private readonly context: AppContext,
    youtubeHost: HTMLElement
  ) {
    this.youtubeHost = youtubeHost;
    this.background = el("div", { class: "playerBackdrop" });
    this.canvas = el("canvas", { class: "pulseCanvas", width: 560, height: 560, "aria-hidden": "true" });
    this.disc = el("div", { class: "disc" });
    this.discHolder = el("div", { class: "discHolder" }, this.canvas, this.disc);
    this.videoSlot = el("div", { class: "videoSlot", hidden: true });
    this.titleNode = el("h2", { class: "trackTitle" });
    this.artistNode = el("p", { class: "trackArtist" });
    this.contextNode = el("span", { class: "playerContext" }, "Reproduciendo");
    this.elapsed = el("span", {}, "0:00");
    this.total = el("span", {}, "0:00");
    this.seek = el("input", { class: "seekBar", type: "range", min: 0, max: 1000, value: 0, step: 1, "aria-label": "Progreso de la canción" });
    this.seek.addEventListener("input", () => {
      this.seeking = true;
      this.elapsed.textContent = formatTime((Number(this.seek.value) / 1000) * this.context.player.duration);
      this.paintSeek();
    });
    this.seek.addEventListener("change", () => {
      this.context.player.seek((Number(this.seek.value) / 1000) * this.context.player.duration);
      this.seeking = false;
    });
    this.controls = el("div", { class: "playerControls" });
    this.lyricsBody = el("div", { class: "lyricsBody" });
    const pauseLyricsAutoscroll = (): void => {
      this.userIsScrollingLyrics = true;
      clearTimeout(this.userScrollTimeout);
      this.userScrollTimeout = window.setTimeout(() => {
        this.userIsScrollingLyrics = false;
      }, 3500);
    };
    this.lyricsBody.addEventListener("wheel", pauseLyricsAutoscroll, { passive: true });
    this.lyricsBody.addEventListener("touchstart", pauseLyricsAutoscroll, { passive: true });
    this.lyricsBody.addEventListener("pointerdown", pauseLyricsAutoscroll);
    this.lyricsPanel = el(
      "section",
      { class: "lyricsPanel", "aria-label": "Letra", hidden: true },
      el("div", { class: "lyricsHeader" }, el("h3", {}, "Letra")),
      this.lyricsBody,
      el("div", { class: "lyricsFooter" }, el("button", { class: "button outline", type: "button", onClick: () => this.toggleLyrics(false) }, "Volver al reproductor"))
    );
    this.lyricsButton = el("button", { class: "playerAction", type: "button", "aria-pressed": false, onClick: () => this.toggleLyrics() }, icon("lyrics", 22), el("span", {}, "Letra"));
    const actions = el(
      "div",
      { class: "playerActions" },
      this.lyricsButton,
      el("button", { class: "playerAction", type: "button", onClick: () => this.withSong((song) => showAppearanceDialog(this.context, song)) }, icon("color", 22), el("span", {}, "Color")),

      el("button", { class: "playerAction", type: "button", onClick: (event: Event) => this.withSong((song) => showSongMenu(this.context, song, event.currentTarget as HTMLElement, () => undefined)) }, icon("more", 22), el("span", {}, "Más"))
    );
    this.element = el(
      "div",
      { class: "playerView", hidden: true, role: "dialog", "aria-label": "Reproductor", "aria-modal": "true" },
      this.background,
      el("div", { class: "playerShade" }),
      el(
        "header",
        { class: "playerHeader" },
        el("button", { class: "iconButton", type: "button", "aria-label": "Cerrar reproductor", onClick: () => this.close() }, icon("back", 22)),
        el("div", { class: "playerHeading" }, el("span", { class: "eyebrow" }, "Battito"), this.contextNode),
        el("div", { style: "width: 38px;" })
      ),
      el("main", { class: "playerStage" }, this.discHolder, this.videoSlot, el("div", { class: "trackInfo" }, this.titleNode, this.artistNode)),
      el("div", { class: "seekRow" }, this.elapsed, this.seek, this.total),
      this.controls,
      actions,
      this.lyricsPanel
    );
    this.element.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.opened && document.querySelector(".modalBackdrop") === null) this.close();
      if (event.key === " " && this.opened && document.querySelector(".modalBackdrop") === null) {
        event.preventDefault();
        void this.context.player.togglePlayback();
      }
    });
    context.player.on("songchange", (song) => this.renderSong(song));
    context.player.on("playing", () => this.renderControls());
    context.player.on("options", () => {
      this.renderControls();
      this.total.textContent = formatTime(this.context.player.duration);
    });
    context.appearance.on("changed", () => this.paintBackground());
    this.renderControls();
  }

  public get isOpen(): boolean {
    return this.opened;
  }

  public open(): void {
    if (this.context.player.song === null) return;
    this.opened = true;
    this.element.hidden = false;
    document.body.classList.add("playerOpen");
    this.renderSong(this.context.player.song);
    this.loop();
    (this.element.querySelector(".playerControls .playButton") as HTMLElement | null)?.focus({ preventScroll: true });
  }

  public close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.element.hidden = true;
    document.body.classList.remove("playerOpen");
    cancelAnimationFrame(this.frame);
    this.youtubeHost.classList.remove("inPlayer");
    this.youtubeHost.style.removeProperty("left");
    this.youtubeHost.style.removeProperty("top");
    this.youtubeHost.style.removeProperty("width");
    this.youtubeHost.style.removeProperty("height");
  }

  public refresh(): void {
    if (this.opened) this.renderSong(this.context.player.song);
  }

  private withSong(action: (song: Song) => void): void {
    const song = this.context.player.song;
    if (song !== null) action(song);
  }

  private renderSong(song: Song | null): void {
    if (song === null) {
      this.close();
      return;
    }
    this.titleNode.textContent = song.title;
    this.artistNode.textContent = song.subtitle;
    this.total.textContent = formatTime(this.context.player.duration);
    const queue = this.context.player.activeQueue;
    const owner = song.collectionId === null ? null : this.context.library.findCollection(song.collectionId);
    this.contextNode.textContent = owner !== null ? owner.name : queue !== null && queue === this.context.library.songs ? "Tus canciones" : "Reproduciendo";
    this.disc.replaceChildren(coverElement(song.coverImage, "music", "discCover"));
    const isVideo = song.source === "youtube";
    this.videoSlot.hidden = !isVideo;
    this.discHolder.classList.toggle("hidden", isVideo);
    this.paintBackground();
    this.renderControls();
    void this.loadLyrics(song);
  }

  private paintBackground(): void {
    const song = this.context.player.song;
    this.background.style.backgroundImage = "";
    this.background.style.backgroundColor = "";
    this.background.classList.remove("hasImage", "hasColor");
    if (song === null) return;
    const own = this.context.appearance.resolveSong(song);
    if (own.kind === "color") {
      this.background.style.backgroundColor = own.value;
      this.background.classList.add("hasColor");
    } else if (own.kind === "image") {
      this.background.style.backgroundImage = `url("${own.value}")`;
      this.background.classList.add("hasImage");
    } else if (song.coverImage !== null) {
      this.background.style.backgroundImage = `url("${song.coverImage}")`;
      this.background.classList.add("hasImage", "fromCover");
    }
  }

  private renderControls(): void {
    const player = this.context.player;
    const playing = player.isPlaying;
    const repeatIcon = player.repeat === "one" ? "repeatOne" : "repeat";
    this.controls.replaceChildren(
      el("button", { class: `iconButton toggle ${player.shuffle ? "on" : ""}`, type: "button", "aria-label": "Aleatorio", "aria-pressed": player.shuffle, onClick: () => player.toggleShuffle() }, icon("shuffle", 22)),
      el("button", { class: "iconButton", type: "button", "aria-label": "Anterior", disabled: player.song === null, onClick: () => void player.previous() }, icon("prev", 26)),
      el("button", { class: "playButton", type: "button", "aria-label": playing ? "Pausar" : "Reproducir", onClick: () => void player.togglePlayback() }, icon(playing ? "pause" : "play", 32)),
      el("button", { class: "iconButton", type: "button", "aria-label": "Siguiente", disabled: !player.hasNext, onClick: () => void player.next() }, icon("next", 26)),
      el("button", { class: `iconButton toggle ${player.repeat !== "off" ? "on" : ""}`, type: "button", "aria-label": `Repetir: ${player.repeat === "off" ? "desactivado" : player.repeat === "all" ? "todas" : "una"}`, "aria-pressed": player.repeat !== "off", onClick: () => player.cycleRepeat() }, icon(repeatIcon, 22))
    );
    this.element.classList.toggle("isPlaying", playing);
  }

  private toggleLyrics(force?: boolean): void {
    this.lyricsOpen = force ?? !this.lyricsOpen;
    this.lyricsPanel.hidden = !this.lyricsOpen;
    this.lyricsButton.setAttribute("aria-pressed", String(this.lyricsOpen));
    this.element.classList.toggle("lyricsVisible", this.lyricsOpen);
    const song = this.context.player.song;
    if (song !== null) void this.loadLyrics(song);
  }

  private async loadLyrics(song: Song): Promise<void> {
    if (song.lyrics !== null && song.lyrics.trim().length > 0) {
      this.renderLyrics(song, { status: "ready", text: song.lyrics });
      return;
    }
    const cached = this.lyricsCache.get(song.id);
    if (cached !== undefined && cached.status !== "error") {
      this.renderLyrics(song, cached);
      return;
    }
    this.renderLyrics(song, { status: "loading", text: null });

    let rawArtist = song.artist.replace(/\s*-\s*Topic$/i, "").trim();
    let rawTitle = song.title;

    if (rawArtist.length === 0 || song.source === "youtube" || rawTitle.includes(" - ")) {
      const parsed = parseSongName(rawTitle);
      if (parsed.artist.length > 0) {
        rawArtist = parsed.artist;
        rawTitle = parsed.title;
      }
    }

    try {
      const query = new URLSearchParams({ artist: rawArtist, title: rawTitle });
      if (this.context.user.isAuthenticated) query.set("songId", song.id);
      const response = await this.context.api.get<LyricsResponseData>(`/lyrics?${query.toString()}`);
      const state: LyricsState = response.lyrics === null ? { status: "missing", text: null } : { status: "ready", text: response.lyrics };
      this.lyricsCache.set(song.id, state);
      if (this.context.player.song === song) this.renderLyrics(song, state);
    } catch (error) {
      if (this.context.player.song === song) {
        this.renderLyrics(song, { status: "error", text: null, message: error instanceof ApiError ? error.message : "No pudimos consultar la letra." });
      }
    }
  }

  private renderLyrics(song: Song, state: LyricsState): void {
    this.lyricsBody.replaceChildren();
    this.parsedLyrics = [];
    this.currentActiveIndex = -1;

    if (state.status === "loading") {
      this.lyricsBody.append(el("p", { class: "lyricsNote" }, "Buscando la letra…"));
      return;
    }

    if (state.status === "ready" && state.text !== null && state.text.trim().length > 0) {
      const rawText = state.text.replace(/\r\n/g, "\n");
      const lines = rawText.split("\n");
      const lrcRegex = /^\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/;
      const hasLrc = lines.some((l) => lrcRegex.test(l.trim()));

      if (hasLrc) {
        for (const line of lines) {
          const match = lrcRegex.exec(line.trim());
          if (match) {
            const minutes = Number(match[1]);
            const seconds = Number(match[2]);
            const text = match[3]?.trim() ?? "";
            if (text.length > 0) {
              const time = minutes * 60 + seconds;
              const lineEl = el("p", { class: "lyricLine", onClick: () => this.context.player.seek(time) }, text);
              this.parsedLyrics.push({ time, element: lineEl });
              this.lyricsBody.append(lineEl);
            }
          }
        }
      } else {
        const textLines = lines.map((l) => l.trim()).filter((l) => l.length > 0);
        const duration = this.context.player.duration > 0 ? this.context.player.duration : song.durationSeconds;
        const total = textLines.length;

        textLines.forEach((text, i) => {
          const time = total > 0 ? (i / total) * (duration > 0 ? duration * 0.92 : 180) : 0;
          const lineEl = el("p", { class: "lyricLine", onClick: () => this.context.player.seek(time) }, text);
          this.parsedLyrics.push({ time, element: lineEl });
          this.lyricsBody.append(lineEl);
        });
      }

      if (this.parsedLyrics.length > 0) {
        this.updateActiveLyricsLine(this.context.player.currentTime);
      }
      return;
    }

    this.lyricsBody.append(
      el("p", { class: "lyricsNote" }, state.status === "error" ? (state.message ?? "No pudimos consultar la letra.") : "No encontramos la letra de esta canción.")
    );
  }

  private updateActiveLyricsLine(time: number): void {
    if (this.parsedLyrics.length === 0) return;
    const isYoutube = this.context.player.song?.source === "youtube";
    const offset = isYoutube ? 1.2 : 0.3;
    const adjustedTime = time + offset;
    let activeIndex = 0;
    for (let i = 0; i < this.parsedLyrics.length; i++) {
      if (this.parsedLyrics[i]!.time <= adjustedTime) {
        activeIndex = i;
      } else {
        break;
      }
    }

    if (this.currentActiveIndex !== activeIndex) {
      if (this.currentActiveIndex >= 0 && this.parsedLyrics[this.currentActiveIndex]) {
        this.parsedLyrics[this.currentActiveIndex]!.element.classList.remove("active");
      }
      this.currentActiveIndex = activeIndex;
      const activeItem = this.parsedLyrics[activeIndex];
      if (activeItem) {
        activeItem.element.classList.add("active");
      }
    }

    if (this.userIsScrollingLyrics || this.lyricsBody.clientHeight === 0) return;
    const activeItem = this.parsedLyrics[activeIndex];
    if (activeItem === undefined) return;

    const bodyRect = this.lyricsBody.getBoundingClientRect();
    const centerScrollTop = (item: ParsedLyricLine): number => {
      const lineRect = item.element.getBoundingClientRect();
      return this.lyricsBody.scrollTop + lineRect.top - bodyRect.top + lineRect.height / 2 - bodyRect.height / 2;
    };

    let targetTop = centerScrollTop(activeItem);
    const nextItem = this.parsedLyrics[activeIndex + 1];
    if (nextItem !== undefined && nextItem.time > activeItem.time) {
      const progress = Math.max(0, Math.min(1, (adjustedTime - activeItem.time) / (nextItem.time - activeItem.time)));
      targetTop += (centerScrollTop(nextItem) - targetTop) * progress;
    }
    const maximumTop = Math.max(0, this.lyricsBody.scrollHeight - this.lyricsBody.clientHeight);
    targetTop = Math.max(0, Math.min(maximumTop, targetTop));
    this.lyricsBody.scrollTop += (targetTop - this.lyricsBody.scrollTop) * 0.18;
  }

  private loop = (): void => {
    if (!this.opened) return;
    const player = this.context.player;
    const duration = player.duration;
    const time = player.currentTime;
    if (!this.seeking) {
      this.seek.value = String(duration > 0 ? Math.min(1000, Math.round((time / duration) * 1000)) : 0);
      this.elapsed.textContent = formatTime(time);
      this.paintSeek();
    }
    if (this.lyricsOpen && this.parsedLyrics.length > 0) {
      this.updateActiveLyricsLine(time);
    }
    this.draw(player.frequencyData, player.isPlaying);
    this.placeVideo();
    this.frame = requestAnimationFrame(this.loop);
  };

  private paintSeek(): void {
    this.seek.style.setProperty("--seek", `${Number(this.seek.value) / 10}%`);
  }

  private placeVideo(): void {
    const song = this.context.player.song;
    const visible = song?.source === "youtube" && !this.lyricsOpen;
    this.youtubeHost.classList.toggle("inPlayer", visible);
    if (!visible) {
      if (song?.source === "youtube" && this.lyricsOpen) {
        this.youtubeHost.style.left = "-9999px";
        this.youtubeHost.style.top = "-9999px";
        this.youtubeHost.style.width = "0px";
        this.youtubeHost.style.height = "0px";
      }
      return;
    }
    const rect = this.videoSlot.getBoundingClientRect();
    this.youtubeHost.style.left = `${rect.left}px`;
    this.youtubeHost.style.top = `${rect.top}px`;
    this.youtubeHost.style.width = `${rect.width}px`;
    this.youtubeHost.style.height = `${rect.height}px`;
  }

  private draw(data: Uint8Array | null, playing: boolean): void {
    const context = this.canvas.getContext("2d");
    if (context === null) return;
    const size = this.canvas.width;
    const center = size / 2;
    const radius = size * 0.32;
    context.clearRect(0, 0, size, size);
    this.phase += playing ? 0.05 : 0.01;
    const bars = 72;
    const accent = getComputedStyle(this.element).getPropertyValue("--pulse").trim() || "#7c7dff";
    let bass = 0;
    context.lineCap = "round";
    context.lineWidth = 5;
    for (let index = 0; index < bars; index += 1) {
      let level: number;
      if (data !== null && data.length > 0) {
        const mirrored = index < bars / 2 ? index : bars - 1 - index;
        const bin = Math.floor((mirrored / (bars / 2)) * Math.min(data.length, 72) * 0.8);
        level = (data[bin] ?? 0) / 255;
      } else {
        level = playing ? 0.18 + 0.12 * Math.sin(this.phase * 2 + index * 0.45) + 0.08 * Math.sin(this.phase * 3.1 - index * 0.3) : 0.06;
      }
      if (index < 6) bass += level / 6;
      const angle = (index / bars) * Math.PI * 2 - Math.PI / 2;
      const inner = radius + 12;
      const outer = inner + 8 + level * 70;
      context.strokeStyle = accent;
      context.globalAlpha = 0.35 + level * 0.65;
      context.beginPath();
      context.moveTo(center + Math.cos(angle) * inner, center + Math.sin(angle) * inner);
      context.lineTo(center + Math.cos(angle) * outer, center + Math.sin(angle) * outer);
      context.stroke();
    }
    context.globalAlpha = 1;
    this.disc.style.transform = `scale(${1 + Math.min(bass, 1) * 0.06})`;
  }
}
