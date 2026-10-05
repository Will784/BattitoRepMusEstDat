import type { CollectionData, CollectionKind, LibraryData, OrderScope, SongData, SongSource, UpdateSongData } from "../../Shared/Types";
import { Collection, Folder, Playlist } from "../Models/Collection";
import { Song } from "../Models/Song";
import { ApiClient, ApiError } from "../Services/ApiClient";
import { DoubleLinkedList } from "../Structures/DoubleLinkedList";
import type { ListNode } from "../Structures/ListNode";
import { Emitter } from "../Utils/Emitter";
import { GuestLimitPolicy } from "./GuestLimitPolicy";
import type { ImportGroup } from "./ImportManager";
import type { UserManager } from "./UserManager";

export interface SongInput {
  title: string;
  artist: string;
  durationSeconds: number;
  source: SongSource;
  sourceRef: string | null;
  coverUrl: string | null;
  file: File | null;
}

export class AuthenticationRequiredError extends Error {}

export interface GuestSnapshot {
  songs: SongInput[];
  groups: ImportGroup[];
}

interface LibraryEvents extends Record<string, unknown> {
  changed: void;
  removing: Song;
  failure: string;
}

export class LibraryManager extends Emitter<LibraryEvents> {
  public readonly songs = new DoubleLinkedList<Song>();
  public readonly folders = new DoubleLinkedList<Collection>();
  public readonly playlists = new DoubleLinkedList<Collection>();

  public constructor(
    private readonly api: ApiClient,
    private readonly user: UserManager,
    private readonly policy: GuestLimitPolicy
  ) {
    super();
  }

  public get totalSongCount(): number {
    let total = this.songs.size;
    for (const folder of this.folders) total += folder.songs.size;
    for (const playlist of this.playlists) total += playlist.songs.size;
    return total;
  }

  public get isEmpty(): boolean {
    return this.totalSongCount === 0 && this.folders.isEmpty && this.playlists.isEmpty;
  }

  public collectionsOf(kind: CollectionKind): DoubleLinkedList<Collection> {
    return kind === "folder" ? this.folders : this.playlists;
  }

  public findCollection(id: string): Collection | null {
    return this.folders.find((item) => item.id === id)?.value ?? this.playlists.find((item) => item.id === id)?.value ?? null;
  }

  public locateSong(songId: string): { list: DoubleLinkedList<Song>; node: ListNode<Song>; collection: Collection | null } | null {
    const loose = this.songs.find((song) => song.id === songId);
    if (loose !== null) return { list: this.songs, node: loose, collection: null };
    for (const collection of [...this.folders, ...this.playlists]) {
      const node = collection.songs.find((song) => song.id === songId);
      if (node !== null) return { list: collection.songs, node, collection };
    }
    return null;
  }

  public async loadForUser(): Promise<LibraryData> {
    const data = await this.api.get<LibraryData>("/library");
    this.resetState();
    for (const song of data.songs) this.songs.insertLast(Song.fromData(song));
    for (const folder of data.folders) this.folders.insertLast(this.buildCollection(folder));
    for (const playlist of data.playlists) this.playlists.insertLast(this.buildCollection(playlist));
    this.emit("changed", undefined);
    return data;
  }

  public resetToGuest(): void {
    this.resetState();
    this.emit("changed", undefined);
  }

  public snapshotGuest(): GuestSnapshot {
    const toInput = (song: Song): SongInput => ({
      title: song.title,
      artist: song.artist,
      durationSeconds: song.durationSeconds,
      source: song.source,
      sourceRef: song.sourceRef,
      coverUrl: song.coverUrl,
      file: song.localFile
    });
    const groups: ImportGroup[] = [];
    for (const collection of [...this.folders, ...this.playlists]) {
      groups.push({ kind: collection.kind, name: collection.name, inputs: collection.songs.snapshotForward().map(toInput) });
    }
    return { songs: this.songs.snapshotForward().map(toInput), groups };
  }

  public async adoptSnapshot(snapshot: GuestSnapshot): Promise<void> {
    if (snapshot.songs.length > 0) await this.addSongs(snapshot.songs, null);
    for (const group of snapshot.groups) await this.importCollection(group);
  }

  public async addSongs(inputs: SongInput[], target: Collection | null, onProgress?: (done: number, total: number) => void): Promise<Song[]> {
    if (!this.user.isAuthenticated) {
      this.policy.assertAllowed(this.totalSongCount, inputs.length);
    }
    const created: Song[] = [];
    for (const input of inputs) {
      created.push(await this.createSong(input, target));
      onProgress?.(created.length, inputs.length);
    }
    this.emit("changed", undefined);
    return created;
  }

  public async importCollection(group: ImportGroup, onProgress?: (done: number, total: number) => void): Promise<Collection> {
    if (!this.user.isAuthenticated) {
      this.policy.assertAllowed(this.totalSongCount, group.inputs.length);
    }
    const collection = await this.createCollectionInternal(group.kind, group.name);
    try {
      let done = 0;
      for (const input of group.inputs) {
        await this.createSong(input, collection);
        done += 1;
        onProgress?.(done, group.inputs.length);
      }
    } finally {
      this.emit("changed", undefined);
    }
    return collection;
  }

  public async createCollection(kind: CollectionKind, name: string): Promise<Collection> {
    if (!this.user.isAuthenticated) {
      throw new AuthenticationRequiredError();
    }
    const collection = await this.createCollectionInternal(kind, name);
    this.emit("changed", undefined);
    return collection;
  }

  public async renameCollection(collection: Collection, name: string): Promise<void> {
    if (this.user.isAuthenticated) {
      await this.api.patch(`/collections/${collection.id}`, { name });
    }
    collection.name = name;
    this.emit("changed", undefined);
  }

  public async deleteCollection(collection: Collection): Promise<void> {
    const list = this.collectionsOf(collection.kind);
    const node = list.find((item) => item.id === collection.id);
    if (node === null) return;
    for (const song of collection.songs) this.emit("removing", song);
    if (this.user.isAuthenticated) {
      await this.api.delete(`/collections/${collection.id}`);
    }
    list.removeNode(node);
    for (const song of collection.songs) song.releaseLocalResources();
    if (collection.localCoverUrl !== null) URL.revokeObjectURL(collection.localCoverUrl);
    this.emit("changed", undefined);
  }

  public async deleteSong(song: Song): Promise<void> {
    const location = this.locateSong(song.id);
    if (location === null) return;
    this.emit("removing", song);
    if (this.user.isAuthenticated) {
      await this.api.delete(`/songs/${song.id}`);
    }
    location.list.removeNode(location.node);
    song.releaseLocalResources();
    this.emit("changed", undefined);
  }

  public async copySongToCollection(song: Song, target: Collection | null): Promise<void> {
    if (!this.user.isAuthenticated) {
      throw new AuthenticationRequiredError();
    }
    const data = await this.api.post<SongData>(`/songs/${song.id}/copy`, { collectionId: target?.id ?? null });
    (target?.songs ?? this.songs).insertLast(Song.fromData(data));
    this.emit("changed", undefined);
  }

  public async updateSong(song: Song, patch: UpdateSongData): Promise<void> {
    if (this.user.isAuthenticated) {
      const data = await this.api.patch<SongData>(`/songs/${song.id}`, patch);
      song.title = data.title;
      song.artist = data.artist;
      song.lyrics = data.lyrics;
      song.coverFileId = data.coverFileId;
      song.coverUrl = data.coverUrl;
      song.appearance = data.appearance;
      song.durationSeconds = data.durationSeconds;
    } else {
      if (patch.title !== undefined) song.title = patch.title;
      if (patch.artist !== undefined) song.artist = patch.artist;
      if (patch.lyrics !== undefined) song.lyrics = patch.lyrics;
      if (patch.durationSeconds !== undefined) song.durationSeconds = patch.durationSeconds;
      if (patch.appearance !== undefined) song.appearance = patch.appearance;
    }
    this.emit("changed", undefined);
  }

  public async moveSong(list: DoubleLinkedList<Song>, songId: string, targetId: string | null, collection: Collection | null): Promise<void> {
    const node = list.find((song) => song.id === songId);
    if (node === null) return;
    if (targetId === null) {
      list.moveToLast(node);
    } else {
      const reference = list.find((song) => song.id === targetId);
      if (reference === null) return;
      list.moveBefore(node, reference);
    }
    this.emit("changed", undefined);
    await this.persistOrder(collection === null ? "songs" : "collection", list.snapshotForward().map((song) => song.id), collection?.id ?? null);
  }

  public async moveCollection(kind: CollectionKind, collectionId: string, targetId: string | null): Promise<void> {
    const list = this.collectionsOf(kind);
    const node = list.find((item) => item.id === collectionId);
    if (node === null) return;
    if (targetId === null) {
      list.moveToLast(node);
    } else {
      const reference = list.find((item) => item.id === targetId);
      if (reference === null) return;
      list.moveBefore(node, reference);
    }
    this.emit("changed", undefined);
    await this.persistOrder(kind === "folder" ? "folders" : "playlists", list.snapshotForward().map((item) => item.id), null);
  }

  private async persistOrder(scope: OrderScope, ids: string[], collectionId: string | null): Promise<void> {
    if (!this.user.isAuthenticated) return;
    try {
      await this.api.put("/order", { scope, collectionId, ids });
    } catch (error) {
      this.emit("failure", error instanceof ApiError ? error.message : "No pudimos guardar el nuevo orden.");
      await this.loadForUser().catch(() => undefined);
    }
  }

  private async createCollectionInternal(kind: CollectionKind, name: string): Promise<Collection> {
    let collection: Collection;
    if (this.user.isAuthenticated) {
      const data = await this.api.post<CollectionData>("/collections", { kind, name });
      collection = this.buildCollection(data);
    } else {
      collection = kind === "folder" ? new Folder(crypto.randomUUID(), name, null) : new Playlist(crypto.randomUUID(), name, null);
    }
    this.collectionsOf(kind).insertLast(collection);
    return collection;
  }

  private async createSong(input: SongInput, target: Collection | null): Promise<Song> {
    let song: Song;
    if (this.user.isAuthenticated) {
      if (input.source === "upload") {
        if (input.file === null) throw new Error("Missing file");
        const form = new FormData();
        form.append("title", input.title);
        form.append("artist", input.artist);
        form.append("durationSeconds", String(input.durationSeconds));
        if (target !== null) form.append("collectionId", target.id);
        form.append("audio", input.file, input.file.name);
        song = Song.fromData(await this.api.upload<SongData>("/songs/upload", form));
      } else {
        song = Song.fromData(
          await this.api.post<SongData>("/songs/remote", {
            title: input.title,
            artist: input.artist,
            durationSeconds: input.durationSeconds,
            source: input.source,
            sourceRef: input.sourceRef,
            coverUrl: input.coverUrl,
            collectionId: target?.id ?? null
          })
        );
      }
    } else {
      song = new Song(crypto.randomUUID(), target?.id ?? null, input.title, input.artist, input.durationSeconds, input.source, input.sourceRef, null, input.coverUrl, null, null, null, input.file?.name ?? null);
      if (input.file !== null) {
        song.localFile = input.file;
        song.localAudioUrl = URL.createObjectURL(input.file);
      }
    }
    (target?.songs ?? this.songs).insertLast(song);
    return song;
  }

  private buildCollection(data: CollectionData): Collection {
    const collection = data.kind === "folder" ? new Folder(data.id, data.name, data.coverFileId) : new Playlist(data.id, data.name, data.coverFileId);
    for (const song of data.songs) collection.songs.insertLast(Song.fromData(song));
    return collection;
  }

  private resetState(): void {
    for (const song of this.songs) song.releaseLocalResources();
    for (const collection of [...this.folders, ...this.playlists]) {
      for (const song of collection.songs) song.releaseLocalResources();
    }
    this.songs.clear();
    this.folders.clear();
    this.playlists.clear();
  }
}
