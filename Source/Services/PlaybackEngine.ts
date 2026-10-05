import type { Song } from "../Models/Song";

export interface PlaybackCallbacks {
  onEnded: () => void;
  onPlaying: (playing: boolean) => void;
  onError: (message: string) => void;
  onMetadata: (durationSeconds: number) => void;
}

export interface PlaybackEngine {
  load(song: Song, autoplay: boolean): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  readonly currentTime: number;
  readonly duration: number;
  readonly frequencyData: Uint8Array | null;
}

export class HtmlAudioEngine implements PlaybackEngine {
  private readonly audio = new Audio();
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer: Uint8Array<ArrayBuffer> | null = null;

  public constructor(
    private readonly callbacks: PlaybackCallbacks,
    private readonly useAnalyser: boolean
  ) {
    this.audio.preload = "auto";
    this.audio.addEventListener("ended", () => this.callbacks.onEnded());
    this.audio.addEventListener("play", () => this.callbacks.onPlaying(true));
    this.audio.addEventListener("pause", () => this.callbacks.onPlaying(false));
    this.audio.addEventListener("loadedmetadata", () => this.callbacks.onMetadata(this.audio.duration));
    this.audio.addEventListener("error", () => {
      if (this.audio.getAttribute("src") === null) return;
      this.callbacks.onError("No pudimos reproducir esta canción. El archivo o la dirección no están disponibles.");
    });
  }

  public get currentTime(): number {
    return this.audio.currentTime;
  }

  public get duration(): number {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
  }

  public get frequencyData(): Uint8Array | null {
    if (this.analyser === null || this.buffer === null) return null;
    this.analyser.getByteFrequencyData(this.buffer);
    return this.buffer;
  }

  public async load(song: Song, autoplay: boolean): Promise<void> {
    const url = song.audioUrl;
    if (url === null) {
      this.callbacks.onError("Esta canción no tiene un archivo de audio disponible.");
      return;
    }
    this.audio.src = url;
    this.audio.load();
    if (autoplay) {
      await this.play();
    }
  }

  public async play(): Promise<void> {
    this.ensureAnalyser();
    if (this.context !== null && this.context.state === "suspended") {
      await this.context.resume().catch(() => undefined);
    }
    try {
      await this.audio.play();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      this.callbacks.onError("No pudimos iniciar la reproducción. Toca reproducir nuevamente.");
    }
  }

  public pause(): void {
    this.audio.pause();
  }

  public stop(): void {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
  }

  public seek(seconds: number): void {
    if (Number.isFinite(seconds)) this.audio.currentTime = Math.max(0, seconds);
  }

  public setVolume(volume: number): void {
    this.audio.volume = Math.min(1, Math.max(0, volume));
  }

  private ensureAnalyser(): void {
    if (!this.useAnalyser || this.context !== null) return;
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Context === undefined) return;
    try {
      this.context = new Context();
      const source = this.context.createMediaElementSource(this.audio);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.82;
      source.connect(this.analyser);
      this.analyser.connect(this.context.destination);
      this.buffer = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
    } catch {
      this.analyser = null;
      this.context = null;
    }
  }
}

interface YouTubePlayer {
  loadVideoById(videoId: string): void;
  cueVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

interface YouTubeNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: () => void;
        onStateChange: (event: { data: number }) => void;
        onError: (event: { data: number }) => void;
      };
    }
  ) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<YouTubeNamespace> | null = null;

function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player !== undefined) return Promise.resolve(window.YT);
  if (youtubeApiPromise === null) {
    youtubeApiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT !== undefined) resolve(window.YT);
      };
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.addEventListener("error", () => {
        youtubeApiPromise = null;
        reject(new Error("YouTube API unavailable"));
      });
      document.head.appendChild(script);
    });
  }
  return youtubeApiPromise;
}

export class YouTubeEngine implements PlaybackEngine {
  private player: YouTubePlayer | null = null;
  private ready = false;
  private pending: { videoId: string; autoplay: boolean } | null = null;
  private volume = 100;

  public constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: PlaybackCallbacks
  ) {}

  public get currentTime(): number {
    return this.ready && this.player !== null ? this.player.getCurrentTime() || 0 : 0;
  }

  public get duration(): number {
    return this.ready && this.player !== null ? this.player.getDuration() || 0 : 0;
  }

  public get frequencyData(): Uint8Array | null {
    return null;
  }

  public async load(song: Song, autoplay: boolean): Promise<void> {
    if (song.sourceRef === null) {
      this.callbacks.onError("Este video no tiene un identificador válido.");
      return;
    }
    this.pending = { videoId: song.sourceRef, autoplay };
    this.host.hidden = false;
    let api: YouTubeNamespace;
    try {
      api = await loadYouTubeApi();
    } catch {
      this.callbacks.onError("No pudimos cargar el reproductor de YouTube. Revisa tu conexión.");
      return;
    }
    if (this.player === null) {
      const mount = document.createElement("div");
      this.host.appendChild(mount);
      this.player = new api.Player(mount, {
        width: "100%",
        height: "100%",
        playerVars: { playsinline: 1, rel: 0, controls: 1, origin: window.location.origin },
        events: {
          onReady: () => {
            this.ready = true;
            this.player?.setVolume(this.volume);
            this.flush();
          },
          onStateChange: (event) => this.handleState(event.data),
          onError: (event) => this.handleError(event.data)
        }
      });
      return;
    }
    if (this.ready) this.flush();
  }

  public async play(): Promise<void> {
    this.player?.playVideo();
  }

  public pause(): void {
    this.player?.pauseVideo();
  }

  public stop(): void {
    this.pending = null;
    if (this.ready) this.player?.stopVideo();
    this.host.hidden = true;
  }

  public seek(seconds: number): void {
    if (this.ready) this.player?.seekTo(Math.max(0, seconds), true);
  }

  public setVolume(volume: number): void {
    this.volume = Math.round(Math.min(1, Math.max(0, volume)) * 100);
    if (this.ready) this.player?.setVolume(this.volume);
  }

  private flush(): void {
    if (this.pending === null || this.player === null) return;
    const { videoId, autoplay } = this.pending;
    this.pending = null;
    if (autoplay) this.player.loadVideoById(videoId);
    else this.player.cueVideoById(videoId);
  }

  private handleState(state: number): void {
    if (state === 0) {
      this.callbacks.onEnded();
    } else if (state === 1) {
      this.callbacks.onPlaying(true);
      const duration = this.duration;
      if (duration > 0) this.callbacks.onMetadata(duration);
    } else if (state === 2) {
      this.callbacks.onPlaying(false);
    }
  }

  private handleError(code: number): void {
    if (code === 101 || code === 150) {
      this.callbacks.onError("El propietario del video no permite reproducirlo fuera de YouTube.");
    } else if (code === 100) {
      this.callbacks.onError("Este video ya no está disponible.");
    } else {
      this.callbacks.onError("YouTube no pudo reproducir este video.");
    }
  }
}
