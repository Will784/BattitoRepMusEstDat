import type { AppearanceManager } from "../Managers/AppearanceManager";
import type { GuestLimitPolicy } from "../Managers/GuestLimitPolicy";
import type { ImportManager } from "../Managers/ImportManager";
import type { LibraryManager } from "../Managers/LibraryManager";
import type { MusicPlayer } from "../Managers/MusicPlayer";
import type { SearchManager } from "../Managers/SearchManager";
import type { UserManager } from "../Managers/UserManager";
import type { ApiClient } from "../Services/ApiClient";
import type { ToastKind } from "../Components/Toast";

export interface SearchContext {
  placeholder: string;
  value: string;
  live: boolean;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

export interface AppContext {
  readonly api: ApiClient;
  readonly user: UserManager;
  readonly library: LibraryManager;
  readonly player: MusicPlayer;
  readonly appearance: AppearanceManager;
  readonly search: SearchManager;
  readonly imports: ImportManager;
  readonly policy: GuestLimitPolicy;
  navigate(route: string, options?: { autoplay?: boolean }): void;
  toast(message: string, kind?: ToastKind): void;
  requireAuthentication(reason: string): boolean;
  handleError(error: unknown): void;
  openPlayer(): void;
  setSearchContext(context: SearchContext | null): void;
}

export interface View {
  readonly element: HTMLElement;
  refresh(): void;
  destroy(): void;
}
