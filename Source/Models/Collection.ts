import type { CollectionKind } from "../../Shared/Types";
import { DoubleLinkedList } from "../Structures/DoubleLinkedList";
import { Song } from "./Song";

export class Collection {
  public readonly songs = new DoubleLinkedList<Song>();
  public localCoverUrl: string | null = null;

  public constructor(
    public readonly id: string,
    public readonly kind: CollectionKind,
    public name: string,
    public coverFileId: string | null
  ) {}

  public get coverImage(): string | null {
    if (this.localCoverUrl !== null) return this.localCoverUrl;
    if (this.coverFileId !== null) return `/api/files/${this.coverFileId}`;
    for (const song of this.songs) {
      if (song.coverImage !== null) return song.coverImage;
    }
    return null;
  }

  public get isFolder(): boolean {
    return this.kind === "folder";
  }
}

export class Folder extends Collection {
  public constructor(id: string, name: string, coverFileId: string | null) {
    super(id, "folder", name, coverFileId);
  }
}

export class Playlist extends Collection {
  public constructor(id: string, name: string, coverFileId: string | null) {
    super(id, "playlist", name, coverFileId);
  }
}
