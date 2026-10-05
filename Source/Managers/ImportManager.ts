import { AcceptedAudioExtensions } from "../../Shared/Constants";
import type { CollectionKind } from "../../Shared/Types";
import { parseSongName } from "../Utils/Format";
import type { SongInput } from "./LibraryManager";

export interface ImportGroup {
  kind: CollectionKind;
  name: string;
  inputs: SongInput[];
}

export interface ImportResult {
  inputs: SongInput[];
  ignored: number;
}

export class ImportManager {
  public isAudioFile(file: File): boolean {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    return (AcceptedAudioExtensions as readonly string[]).includes(extension) && file.size > 0;
  }

  public async readAudioFiles(files: File[]): Promise<ImportResult> {
    const audio = files.filter((file) => this.isAudioFile(file));
    const inputs: SongInput[] = [];
    for (const file of audio) {
      inputs.push(await this.toInput(file));
    }
    return { inputs, ignored: files.length - audio.length };
  }

  public async readFolder(files: File[]): Promise<{ name: string; result: ImportResult }> {
    const first = files.find((file) => (file.webkitRelativePath ?? "").includes("/"));
    const name = first?.webkitRelativePath.split("/")[0] ?? "Carpeta";
    const ordered = [...files].sort((left, right) => (left.webkitRelativePath || left.name).localeCompare(right.webkitRelativePath || right.name, "es", { numeric: true }));
    return { name, result: await this.readAudioFiles(ordered) };
  }

  public async readPlaylist(files: File[], name: string): Promise<{ name: string; result: ImportResult }> {
    const listFile = files.find((file) => /\.(m3u8?|txt)$/i.test(file.name));
    const audio = files.filter((file) => this.isAudioFile(file));
    let ordered = audio;
    let resolvedName = name;
    if (listFile !== undefined) {
      const text = await listFile.text();
      const byName = new Map(audio.map((file) => [file.name.toLowerCase(), file]));
      const listed: File[] = [];
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line.length === 0 || line.startsWith("#")) continue;
        const base = line.split(/[\\/]/).pop()?.toLowerCase() ?? "";
        const match = byName.get(base);
        if (match !== undefined && !listed.includes(match)) listed.push(match);
      }
      ordered = [...listed, ...audio.filter((file) => !listed.includes(file))];
      if (resolvedName.trim().length === 0) resolvedName = listFile.name.replace(/\.[^.]+$/, "");
    }
    if (resolvedName.trim().length === 0) resolvedName = "Mi playlist";
    const result = await this.readAudioFiles(ordered);
    return { name: resolvedName.trim(), result: { inputs: result.inputs, ignored: files.length - audio.length - (listFile ? 1 : 0) } };
  }

  public async collectFromDataTransfer(transfer: DataTransfer): Promise<File[]> {
    const entries: FileSystemEntry[] = [];
    for (const item of Array.from(transfer.items ?? [])) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) entries.push(entry);
    }
    if (entries.length === 0) {
      return Array.from(transfer.files);
    }
    const collected: File[] = [];
    for (const entry of entries) {
      await this.walk(entry, "", collected);
    }
    return collected;
  }

  private async walk(entry: FileSystemEntry, prefix: string, target: File[]): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      Object.defineProperty(file, "webkitRelativePath", { value: `${prefix}${entry.name}` });
      target.push(file);
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (batch.length === 0) break;
      for (const child of batch) {
        await this.walk(child, `${prefix}${entry.name}/`, target);
      }
    }
  }

  private async toInput(file: File): Promise<SongInput> {
    const parsed = parseSongName(file.name);
    return {
      title: parsed.title,
      artist: parsed.artist,
      durationSeconds: await this.probeDuration(file),
      source: "upload",
      sourceRef: null,
      coverUrl: null,
      file
    };
  }

  private probeDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      let finished = false;
      const finish = (value: number): void => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        audio.removeAttribute("src");
        audio.load();
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(value) ? Math.round(value * 10) / 10 : 0);
      };
      const timer = setTimeout(() => finish(0), 6000);
      audio.preload = "metadata";
      audio.addEventListener("loadedmetadata", () => finish(audio.duration));
      audio.addEventListener("error", () => finish(0));
      audio.src = url;
    });
  }
}
