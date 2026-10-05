import type { MusicPlayer } from "../Managers/MusicPlayer";
import type { Song } from "../Models/Song";
import { el } from "../Utils/Dom";
import { icon } from "../Utils/Icons";
import { coverElement } from "./Rows";

export class MiniPlayer {
  public readonly element: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly info: HTMLElement;
  private readonly playButton: HTMLButtonElement;
  private readonly previousButton: HTMLButtonElement;
  private readonly nextButton: HTMLButtonElement;
  private readonly volumeButton: HTMLButtonElement;
  private readonly volumeSlider: HTMLInputElement;
  private readonly volumeText: HTMLElement;
  private readonly volumeContainer: HTMLElement;
  private timer = 0;
  private lastVolume = 1;

  public constructor(
    private readonly player: MusicPlayer,
    private readonly onOpen: () => void
  ) {
    this.fill = el("div", { class: "miniFill" });
    this.info = el("button", { class: "miniInfo", type: "button", onClick: () => this.onOpen(), "aria-label": "Abrir reproductor" });
    this.previousButton = el("button", { class: "iconButton", type: "button", "aria-label": "Anterior", onClick: () => void this.player.previous() }, icon("prev", 20));
    this.playButton = el("button", { class: "iconButton playToggle", type: "button", "aria-label": "Reproducir", onClick: () => void this.player.togglePlayback() }, icon("play", 22));
    this.nextButton = el("button", { class: "iconButton", type: "button", "aria-label": "Siguiente", onClick: () => void this.player.next() }, icon("next", 20));

    this.volumeButton = el(
      "button",
      {
        class: "iconButton volumeButton",
        type: "button",
        "aria-label": "Volumen",
        onClick: () => {
          if (this.player.volume > 0) {
            this.lastVolume = this.player.volume;
            this.player.setVolume(0);
          } else {
            this.player.setVolume(this.lastVolume > 0 ? this.lastVolume : 1);
          }
        }
      },
      icon("volume", 18)
    );

    this.volumeSlider = el("input", {
      class: "miniVolumeSlider",
      type: "range",
      min: 0,
      max: 100,
      value: Math.round(this.player.volume * 100),
      step: 1,
      "aria-label": "Nivel de volumen"
    });

    this.volumeSlider.addEventListener("input", () => {
      const vol = Number(this.volumeSlider.value) / 100;
      this.player.setVolume(vol);
    });

    this.volumeText = el("span", { class: "volumeText" }, `${Math.round(this.player.volume * 100)}%`);

    this.volumeContainer = el(
      "div",
      { class: "miniVolume" },
      this.volumeButton,
      this.volumeSlider,
      this.volumeText
    );

    this.element = el(
      "div",
      { class: "miniPlayer", hidden: true, role: "region", "aria-label": "Reproductor" },
      el("div", { class: "miniProgress" }, this.fill),
      this.info,
      el("div", { class: "miniControls" }, this.previousButton, this.playButton, this.nextButton),
      this.volumeContainer
    );
    player.on("songchange", (song) => this.renderSong(song));
    player.on("playing", () => this.renderState());
    player.on("options", () => this.renderState());
    player.on("volumechange", (vol) => this.renderVolume(vol));
    this.renderVolume(player.volume);
    this.timer = window.setInterval(() => this.tick(), 250);
  }

  public destroy(): void {
    clearInterval(this.timer);
  }

  public refresh(): void {
    this.renderSong(this.player.song);
    this.renderVolume(this.player.volume);
  }

  private renderSong(song: Song | null): void {
    this.element.hidden = song === null;
    document.body.classList.toggle("hasMiniPlayer", song !== null);
    this.info.replaceChildren();
    if (song !== null) {
      this.info.append(coverElement(song.coverImage, "music", "cover small"), el("span", { class: "rowText" }, el("span", { class: "rowTitle" }, song.title), el("span", { class: "rowSub" }, song.subtitle)));
    }
    this.renderState();
  }

  private renderState(): void {
    const playing = this.player.isPlaying;
    this.playButton.replaceChildren(icon(playing ? "pause" : "play", 22));
    this.playButton.setAttribute("aria-label", playing ? "Pausar" : "Reproducir");
    this.previousButton.disabled = this.player.song === null;
    this.nextButton.disabled = !this.player.hasNext;
  }

  private renderVolume(vol: number): void {
    const pct = Math.round(vol * 100);
    this.volumeSlider.value = String(pct);
    this.volumeSlider.style.setProperty("--vol", `${pct}%`);
    this.volumeText.textContent = `${pct}%`;
    const iconName = vol === 0 ? "volumeMute" : "volume";
    this.volumeButton.replaceChildren(icon(iconName, 18));
    this.volumeButton.setAttribute("aria-label", vol === 0 ? "Desactivar silencio" : "Silenciar");
  }

  private tick(): void {
    if (this.element.hidden) return;
    const duration = this.player.duration;
    this.fill.style.width = duration > 0 ? `${Math.min(100, (this.player.currentTime / duration) * 100)}%` : "0%";
  }
}
