import type { AppearanceData, PreferencesData, ThemeMode, UploadedImageData } from "../../Shared/Types";
import type { Song } from "../Models/Song";
import { ApiClient } from "../Services/ApiClient";
import { Emitter } from "../Utils/Emitter";
import { findPreset, presetDataUrl } from "../Utils/Presets";
import type { UserManager } from "./UserManager";

export interface ResolvedBackdrop {
  kind: "none" | "color" | "image";
  value: string;
}

export class AppearanceManager extends Emitter<{ changed: void }> {
  private themeMode: ThemeMode = "dark";
  private globalAppearance: AppearanceData = { mode: "default" };
  private guestImageUrl: string | null = null;

  public constructor(
    private readonly api: ApiClient,
    private readonly user: UserManager
  ) {
    super();
  }

  public get theme(): ThemeMode {
    return this.themeMode;
  }

  public get appearance(): AppearanceData {
    return this.globalAppearance;
  }

  public initialize(): void {
    const stored = window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
    this.themeMode = stored;
    this.apply();
  }

  public loadPreferences(preferences: PreferencesData): void {
    this.releaseGuestImage();
    this.themeMode = preferences.theme;
    this.globalAppearance = preferences.appearance;
    this.apply();
  }

  public resetForGuest(): void {
    this.releaseGuestImage();
    this.globalAppearance = { mode: "default" };
    this.apply();
  }

  public async setTheme(theme: ThemeMode): Promise<void> {
    this.themeMode = theme;
    this.apply();
    await this.persist();
  }

  public async setGlobalAppearance(appearance: AppearanceData, localImage: File | null): Promise<void> {
    if (this.user.isAuthenticated) {
      const resolved = await this.prepareAppearance(appearance, localImage);
      this.globalAppearance = resolved;
      await this.persist();
    } else {
      this.releaseGuestImage();
      if (appearance.mode === "image" && localImage !== null) {
        this.guestImageUrl = URL.createObjectURL(localImage);
      }
      this.globalAppearance = appearance;
    }
    this.apply();
  }

  public async uploadImage(file: File): Promise<string> {
    const form = new FormData();
    form.append("image", file, file.name);
    const uploaded = await this.api.upload<UploadedImageData>("/images", form);
    return uploaded.fileId;
  }

  public async prepareAppearance(appearance: AppearanceData, localImage: File | null): Promise<AppearanceData> {
    if (appearance.mode === "image" && localImage !== null) {
      return { mode: "image", fileId: await this.uploadImage(localImage) };
    }
    return appearance;
  }

  public resolve(appearance: AppearanceData | null, localUrl: string | null): ResolvedBackdrop {
    if (appearance === null || appearance.mode === "default") return { kind: "none", value: "" };
    if (appearance.mode === "color" && appearance.color !== undefined) return { kind: "color", value: appearance.color };
    if (appearance.mode === "preset") {
      const preset = findPreset(appearance.presetId);
      return preset === null ? { kind: "none", value: "" } : { kind: "image", value: presetDataUrl(preset) };
    }
    if (appearance.mode === "image") {
      if (localUrl !== null) return { kind: "image", value: localUrl };
      if (appearance.fileId !== undefined) return { kind: "image", value: `/api/files/${appearance.fileId}` };
    }
    return { kind: "none", value: "" };
  }

  public resolveGlobal(): ResolvedBackdrop {
    return this.resolve(this.globalAppearance, this.guestImageUrl);
  }

  public resolveSong(song: Song): ResolvedBackdrop {
    const own = this.resolve(song.appearance, song.localBackgroundUrl);
    return own.kind === "none" ? { kind: "none", value: "" } : own;
  }

  public apply(): void {
    const root = document.documentElement;
    root.dataset["theme"] = this.themeMode;
    const backdrop = this.resolveGlobal();
    root.style.setProperty("--custom-color", backdrop.kind === "color" ? backdrop.value : "transparent");
    root.style.setProperty("--custom-image", backdrop.kind === "image" ? `url("${backdrop.value}")` : "none");
    root.dataset["backdrop"] = backdrop.kind;
    this.emit("changed", undefined);
  }

  private async persist(): Promise<void> {
    if (!this.user.isAuthenticated) return;
    await this.api.put("/preferences", { theme: this.themeMode, appearance: this.globalAppearance });
  }

  private releaseGuestImage(): void {
    if (this.guestImageUrl !== null) {
      URL.revokeObjectURL(this.guestImageUrl);
      this.guestImageUrl = null;
    }
  }
}
