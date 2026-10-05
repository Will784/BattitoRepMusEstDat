import { MiniPlayer } from "./Components/MiniPlayer";
import { ToastCenter, type ToastKind } from "./Components/Toast";
import { AppearanceManager } from "./Managers/AppearanceManager";
import { GuestLimitError, GuestLimitPolicy } from "./Managers/GuestLimitPolicy";
import { ImportManager } from "./Managers/ImportManager";
import { AuthenticationRequiredError, LibraryManager } from "./Managers/LibraryManager";
import { MusicPlayer } from "./Managers/MusicPlayer";
import { SearchManager } from "./Managers/SearchManager";
import { UserManager } from "./Managers/UserManager";
import { ApiClient, ApiError } from "./Services/ApiClient";
import { el } from "./Utils/Dom";
import { icon, logoMark } from "./Utils/Icons";
import type { AppContext, SearchContext, View } from "./Views/AppContext";
import { CollectionView } from "./Views/CollectionView";
import { showLimitDialog, showLoginDialog } from "./Views/Dialogs";
import { DevicesView } from "./Views/DevicesView";
import { HomeView } from "./Views/HomeView";
import { LibraryView } from "./Views/LibraryView";
import { PlayerView } from "./Views/PlayerView";
import { SearchView, searchState } from "./Views/SearchView";
import { SettingsView } from "./Views/SettingsView";

interface NavigationItem {
  id: string;
  label: string;
  route: string;
  iconName: string;
}

const navigationItems: NavigationItem[] = [
  { id: "home", label: "Inicio", route: "#/home", iconName: "home" },
  { id: "search", label: "Buscar", route: "#/search", iconName: "search" },
  { id: "library", label: "Biblioteca", route: "#/library", iconName: "library" },
  { id: "devices", label: "Dispositivos", route: "#/devices", iconName: "devices" },
  { id: "settings", label: "Ajustes", route: "#/settings", iconName: "settings" }
];

export class BattitoApplication implements AppContext {
  public readonly api = new ApiClient();
  public readonly user = new UserManager(this.api);
  public readonly policy = new GuestLimitPolicy();
  public readonly library = new LibraryManager(this.api, this.user, this.policy);
  public readonly appearance = new AppearanceManager(this.api, this.user);
  public readonly search = new SearchManager(this.api);
  public readonly imports = new ImportManager();
  public readonly player: MusicPlayer;

  private readonly toasts: ToastCenter;
  private readonly content = el("main", { class: "content", id: "content", tabIndex: -1 });
  private readonly sidebarNav = el("nav", { class: "sidebarNav", "aria-label": "Principal" });
  private readonly bottomNav = el("nav", { class: "bottomNav", "aria-label": "Principal móvil" });
  private readonly searchInput = el("input", { class: "searchInput", type: "search", "aria-label": "Buscar", autocomplete: "off", enterKeyHint: "search" });
  private readonly accountSlot = el("div", { class: "accountSlot" });
  private readonly themeSlot = el("div", { class: "themeSlot" });
  private readonly themeToggle = el(
    "button",
    {
      class: "themeToggle",
      type: "button",
      role: "switch",
      "aria-checked": "false",
      "aria-label": "Modo oscuro",
      onClick: () => {
        const dark = this.appearance.theme === "dark";
        this.appearance.setTheme(dark ? "light" : "dark").catch((error: unknown) => this.handleError(error));
      }
    },
    el("span", { class: "themeLabel light" }, icon("sun", 14), "Claro"),
    el("span", { class: "switchTrack" }, el("span", { class: "switchThumb" })),
    el("span", { class: "themeLabel dark" }, "Oscuro", icon("moon", 14))
  );
  private readonly youtubeHost = el("div", { class: "youtubeHost", hidden: true });
  private readonly miniPlayer: MiniPlayer;
  private readonly playerView: PlayerView;
  private view: View | null = null;
  private searchContext: SearchContext | null = null;
  private autoplayRequested = false;
  private refreshQueued = false;

  public constructor(private readonly root: HTMLElement) {
    this.player = new MusicPlayer(this.youtubeHost);
    this.toasts = new ToastCenter(document.body);
    this.miniPlayer = new MiniPlayer(this.player, () => this.openPlayer());
    this.playerView = new PlayerView(this, this.youtubeHost);
  }

  public async start(): Promise<void> {
    this.buildShell();
    this.appearance.initialize();
    this.wireEvents();
    try {
      const user = await this.user.restore();
      if (user !== null) await this.loadUserData();
    } catch (error) {
      this.handleError(error);
    }
    this.renderChrome();
    window.addEventListener("hashchange", () => this.route());
    this.route();
  }

  public navigate(route: string, options?: { autoplay?: boolean }): void {
    this.autoplayRequested = options?.autoplay === true;
    if (window.location.hash === route) {
      this.route();
    } else {
      window.location.hash = route;
    }
  }

  public toast(message: string, kind: ToastKind = "info"): void {
    this.toasts.show(message, kind);
  }

  public requireAuthentication(reason: string): boolean {
    if (this.user.isAuthenticated) return true;
    showLoginDialog(this, reason);
    return false;
  }

  public handleError(error: unknown): void {
    if (error instanceof GuestLimitError) {
      showLimitDialog(this, error.incomingCount);
    } else if (error instanceof AuthenticationRequiredError) {
      showLoginDialog(this, "Inicia sesión para usar esta función.");
    } else if (error instanceof ApiError) {
      if (error.status === 401 && this.user.isAuthenticated) {
        void this.user.restore().then(() => {
          if (!this.user.isAuthenticated) {
            this.library.resetToGuest();
            this.renderChrome();
            showLoginDialog(this, "Tu sesión expiró. Inicia sesión nuevamente.");
          }
        });
      } else if (error.status === 401) {
        showLoginDialog(this, "Inicia sesión para usar esta función.");
      } else {
        this.toast(error.message, "error");
      }
    } else {
      this.toast("Ocurrió un error inesperado. Inténtalo de nuevo.", "error");
    }
  }

  public openPlayer(): void {
    this.playerView.open();
  }

  public setSearchContext(context: SearchContext | null): void {
    this.searchContext = context;
    const active = context ?? this.defaultSearchContext();
    this.searchInput.placeholder = active.placeholder;
    this.searchInput.value = active.value;
  }

  private defaultSearchContext(): SearchContext {
    return {
      placeholder: "Buscar canciones, artistas o videos…",
      value: "",
      live: false,
      onChange: () => undefined,
      onSubmit: (value) => {
        searchState.query = value.trim();
        searchState.pending = value.trim().length > 0;
        this.navigate("#/search");
      }
    };
  }

  private buildShell(): void {
    const brand = el("a", { class: "brand", href: "#/home", "aria-label": "Battito, ir al inicio" }, logoMark(30), el("span", {}, "Battito"));
    const form = el("form", { class: "searchForm", role: "search" }, icon("search", 18), this.searchInput);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      (this.searchContext ?? this.defaultSearchContext()).onSubmit(this.searchInput.value);
    });
    this.searchInput.addEventListener("input", () => {
      const active = this.searchContext;
      if (active?.live === true) active.onChange(this.searchInput.value);
    });
    const topbar = el(
      "header",
      { class: "topbar" },
      el("div", { class: "mobileBrand" }, logoMark(26)),
      form,
      el("button", { class: "iconButton", type: "button", "aria-label": "Personalizar apariencia", title: "Personalizar apariencia", onClick: () => void import("./Views/MediaDialogs").then((module) => module.showAppearanceDialog(this, null)) }, icon("color", 20)),
      this.accountSlot
    );
    const sidebar = el("aside", { class: "sidebar" }, brand, this.sidebarNav, el("div", { class: "sidebarFooter" }, this.themeSlot));
    this.root.replaceChildren(
      el("a", { class: "skipLink", href: "#content", onClick: (event: Event) => {
        event.preventDefault();
        this.content.focus();
      } }, "Saltar al contenido"),
      el("div", { class: "appShell" }, sidebar, el("div", { class: "mainColumn" }, topbar, this.content)),
      this.bottomNav,
      this.miniPlayer.element,
      this.playerView.element,
      this.youtubeHost
    );
    this.renderNavigation("home");
  }

  private wireEvents(): void {
    this.user.on("changed", (user) => void this.handleUserChange(user !== null));
    this.library.on("changed", () => this.scheduleRefresh());
    this.library.on("removing", (song) => this.player.handleSongRemoval(song));
    this.library.on("failure", (message) => this.toast(message, "error"));
    this.player.on("songchange", () => this.scheduleRefresh());
    this.player.on("playing", () => this.scheduleRefresh());
    this.player.on("error", (message) => this.toast(message, "error"));
    this.appearance.on("changed", () => this.renderChrome());
  }

  private async handleUserChange(authenticated: boolean): Promise<void> {
    this.player.stop();
    try {
      if (authenticated) {
        await this.loadUserData();
      } else {
        this.library.resetToGuest();
        this.appearance.resetForGuest();
      }
    } catch (error) {
      this.handleError(error);
    }
    this.renderChrome();
    this.navigate(authenticated ? "#/library" : "#/home");
  }

  private async loadUserData(): Promise<void> {
    const data = await this.library.loadForUser();
    this.appearance.loadPreferences(data.preferences);
  }

  private route(): void {
    const hash = window.location.hash || "#/home";
    const segments = hash.replace(/^#\/?/, "").split("/");
    const name = segments[0] || "home";
    this.view?.destroy();
    this.view = null;
    this.setSearchContext(null);
    const autoplay = this.autoplayRequested;
    this.autoplayRequested = false;
    switch (name) {
      case "search":
        this.view = new SearchView(this);
        break;
      case "library":
        this.view = new LibraryView(this);
        break;
      case "devices":
        this.view = new DevicesView(this);
        break;
      case "settings":
        this.view = new SettingsView(this);
        break;
      case "collection": {
        const id = segments[1] ?? "";
        if (this.library.findCollection(id) === null) {
          this.view = new LibraryView(this);
          this.renderNavigation("library");
          this.content.replaceChildren(this.view.element);
          return;
        }
        this.view = new CollectionView(this, id, autoplay);
        break;
      }
      default:
        this.view = new HomeView(this);
    }
    this.renderNavigation(name === "collection" ? "library" : name === "" ? "home" : name);
    this.content.replaceChildren(this.view.element);
    this.content.scrollTop = 0;
    document.title = "Battito";
  }

  private scheduleRefresh(): void {
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    requestAnimationFrame(() => {
      this.refreshQueued = false;
      if (document.body.classList.contains("dragActive")) {
        this.scheduleRefresh();
        return;
      }
      this.view?.refresh();
      this.miniPlayer.refresh();
      this.playerView.refresh();
      this.renderAccount();
    });
  }

  private renderChrome(): void {
    this.renderAccount();
    this.renderTheme();
    this.view?.refresh();
  }

  private renderNavigation(active: string): void {
    const build = (className: string): HTMLElement[] =>
      navigationItems.map((item) =>
        el("a", { class: `${className} ${item.id === active ? "active" : ""}`, href: item.route, "aria-current": item.id === active ? "page" : null }, icon(item.iconName, 22), el("span", {}, item.label))
      );
    this.sidebarNav.replaceChildren(...build("navItem"));
    this.bottomNav.replaceChildren(...build("bottomItem"));
  }

  private renderAccount(): void {
    const user = this.user.user;
    this.accountSlot.replaceChildren(
      user === null
        ? el("button", { class: "button primary small", type: "button", onClick: () => showLoginDialog(this) }, "Iniciar sesión")
        : el("button", { class: "avatar", type: "button", title: user.email, "aria-label": `Cuenta de ${user.displayName}`, onClick: () => this.navigate("#/settings") }, (user.displayName[0] ?? "B").toUpperCase())
    );
  }

  private renderTheme(): void {
    const dark = this.appearance.theme === "dark";
    this.themeToggle.setAttribute("aria-checked", String(dark));
    if (!this.themeSlot.contains(this.themeToggle)) {
      this.themeSlot.replaceChildren(this.themeToggle);
    }
  }
}
