import type { Song } from "../Models/Song";
import { HtmlAudioEngine, YouTubeEngine, type PlaybackCallbacks, type PlaybackEngine } from "../Services/PlaybackEngine";
import type { DoubleLinkedList } from "../Structures/DoubleLinkedList";
import type { ListNode } from "../Structures/ListNode";
import { Emitter } from "../Utils/Emitter";

export type RepeatMode = "off" | "all" | "one";

interface PlayerEvents extends Record<string, unknown> {
  songchange: Song | null;
  playing: boolean;
  error: string;
  options: void;
  volumechange: number;
}

export class MusicPlayer extends Emitter<PlayerEvents> {
  private queue: DoubleLinkedList<Song> | null = null;
  private currentNode: ListNode<Song> | null = null;
  private activeEngine: PlaybackEngine | null = null;
  private readonly localEngine: HtmlAudioEngine;
  private readonly remoteEngine: HtmlAudioEngine;
  private readonly youtubeEngine: YouTubeEngine;
  private playing = false;
  private shuffleEnabled = false;
  private repeatMode: RepeatMode = "off";
  private volumeLevel = 1;

  public constructor(youtubeHost: HTMLElement) {
    super();
    const callbacksFor = (engine: () => PlaybackEngine): PlaybackCallbacks => ({
      onEnded: () => {
        if (this.activeEngine === engine()) this.handleEnded();
      },
      onPlaying: (value) => {
        if (this.activeEngine === engine()) this.setPlaying(value);
      },
      onError: (message) => {
        if (this.activeEngine === engine()) {
          this.setPlaying(false);
          this.emit("error", message);
        }
      },
      onMetadata: (duration) => {
        const song = this.currentNode?.value;
        if (this.activeEngine === engine() && song !== undefined && duration > 0 && Math.abs(song.durationSeconds - duration) > 1) {
          song.durationSeconds = Math.round(duration);
          this.emit("options", undefined);
        }
      }
    });
    this.localEngine = new HtmlAudioEngine(callbacksFor(() => this.localEngine), true);
    this.remoteEngine = new HtmlAudioEngine(callbacksFor(() => this.remoteEngine), false);
    this.youtubeEngine = new YouTubeEngine(youtubeHost, callbacksFor(() => this.youtubeEngine));
    youtubeHost.hidden = true;
  }

  public get song(): Song | null {
    return this.currentNode?.value ?? null;
  }

  public get node(): ListNode<Song> | null {
    return this.currentNode;
  }

  public get activeQueue(): DoubleLinkedList<Song> | null {
    return this.queue;
  }

  public get isPlaying(): boolean {
    return this.playing;
  }

  public get shuffle(): boolean {
    return this.shuffleEnabled;
  }

  public get repeat(): RepeatMode {
    return this.repeatMode;
  }

  public get currentTime(): number {
    return this.activeEngine?.currentTime ?? 0;
  }

  public get duration(): number {
    const measured = this.activeEngine?.duration ?? 0;
    return measured > 0 ? measured : (this.song?.durationSeconds ?? 0);
  }

  public get frequencyData(): Uint8Array | null {
    return this.activeEngine?.frequencyData ?? null;
  }

  public get hasPrevious(): boolean {
    return this.currentNode !== null && this.queue !== null && (this.currentNode.previous !== null || this.repeatMode === "all");
  }

  public get hasNext(): boolean {
    return this.currentNode !== null && this.queue !== null && (this.currentNode.next !== null || this.repeatMode === "all" || this.shuffleEnabled);
  }

  public async playFrom(list: DoubleLinkedList<Song>, node: ListNode<Song>): Promise<void> {
    if (!list.contains(node)) return;
    this.queue = list;
    await this.activate(node, true);
  }

  public async playFirstOf(list: DoubleLinkedList<Song>): Promise<boolean> {
    const first = list.head;
    if (first === null) return false;
    await this.playFrom(list, first);
    return true;
  }

  public async togglePlayback(): Promise<void> {
    if (this.activeEngine === null || this.currentNode === null) return;
    if (this.playing) this.activeEngine.pause();
    else await this.activeEngine.play();
  }

  public async next(): Promise<void> {
    const target = this.resolveNext();
    if (target === null) {
      this.activeEngine?.pause();
      this.activeEngine?.seek(0);
      return;
    }
    await this.activate(target, true);
  }

  public async previous(): Promise<void> {
    if (this.currentNode === null || this.queue === null) return;
    if (this.currentTime > 3) {
      this.seek(0);
      return;
    }
    const target = this.currentNode.previous ?? (this.repeatMode === "all" ? this.queue.tail : null);
    if (target === null || target === this.currentNode) {
      this.seek(0);
      return;
    }
    await this.activate(target, true);
  }

  public seek(seconds: number): void {
    this.activeEngine?.seek(seconds);
  }

  public setVolume(volume: number): void {
    this.volumeLevel = Math.min(1, Math.max(0, volume));
    for (const engine of [this.localEngine, this.remoteEngine, this.youtubeEngine]) engine.setVolume(this.volumeLevel);
    this.emit("volumechange", this.volumeLevel);
  }

  public get volume(): number {
    return this.volumeLevel;
  }

  public toggleShuffle(): void {
    this.shuffleEnabled = !this.shuffleEnabled;
    this.emit("options", undefined);
  }

  public cycleRepeat(): void {
    this.repeatMode = this.repeatMode === "off" ? "all" : this.repeatMode === "all" ? "one" : "off";
    this.emit("options", undefined);
  }

  public handleSongRemoval(song: Song): void {
    const node = this.currentNode;
    if (node === null || node.value !== song) return;
    const wasPlaying = this.playing;
    const replacement = node.next ?? node.previous;
    this.stopEngines();
    this.currentNode = null;
    if (replacement !== null) {
      void this.activate(replacement, wasPlaying);
    } else {
      this.queue = null;
      this.setPlaying(false);
      this.emit("songchange", null);
    }
  }

  public stop(): void {
    this.stopEngines();
    this.currentNode = null;
    this.queue = null;
    this.setPlaying(false);
    this.emit("songchange", null);
  }

  private async activate(node: ListNode<Song>, autoplay: boolean): Promise<void> {
    this.stopEngines();
    this.currentNode = node;
    const song = node.value;
    this.activeEngine = song.source === "youtube" ? this.youtubeEngine : song.isAnalysable || song.localAudioUrl !== null ? this.localEngine : this.remoteEngine;
    this.setPlaying(false);
    this.emit("songchange", song);
    await this.activeEngine.load(song, autoplay);
    this.updateMediaSession(song);
  }

  private stopEngines(): void {
    this.localEngine.stop();
    this.remoteEngine.stop();
    this.youtubeEngine.stop();
    this.activeEngine = null;
  }

  private resolveNext(): ListNode<Song> | null {
    const queue = this.queue;
    const node = this.currentNode;
    if (queue === null || node === null) return null;
    if (this.shuffleEnabled && queue.size > 1) {
      let candidate = node;
      while (candidate === node) {
        candidate = queue.nodeAt(Math.floor(Math.random() * queue.size)) ?? node;
      }
      return candidate;
    }
    return node.next ?? (this.repeatMode === "all" ? queue.head : null);
  }

  private handleEnded(): void {
    if (this.repeatMode === "one") {
      this.seek(0);
      void this.activeEngine?.play();
      return;
    }
    void this.next();
  }

  private setPlaying(value: boolean): void {
    if (this.playing !== value) {
      this.playing = value;
      this.emit("playing", value);
    }
  }

  private updateMediaSession(song: Song): void {
    if (!("mediaSession" in navigator)) return;
    const artwork = song.coverImage === null ? [] : [{ src: song.coverImage }];
    navigator.mediaSession.metadata = new MediaMetadata({ title: song.title, artist: song.artist, artwork });
    navigator.mediaSession.setActionHandler("play", () => void this.togglePlayback());
    navigator.mediaSession.setActionHandler("pause", () => void this.togglePlayback());
    navigator.mediaSession.setActionHandler("nexttrack", () => void this.next());
    navigator.mediaSession.setActionHandler("previoustrack", () => void this.previous());
  }
}
