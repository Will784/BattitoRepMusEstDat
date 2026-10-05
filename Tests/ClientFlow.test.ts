import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { Mp3Bytes, PngBytes, TestServer } from "./ApiTestHarness";
import { GuestLimitError } from "../Source/Managers/GuestLimitPolicy";
import { AuthenticationRequiredError } from "../Source/Managers/LibraryManager";
import type { BattitoApplication } from "../Source/Application";

class FakeAudio extends EventTarget {
  public volume = 1;
  public currentTime = 0;
  public duration = 120;
  public preload = "";
  private source: string | null = null;
  public set src(value: string) {
    this.source = value;
    queueMicrotask(() => this.dispatchEvent(new Event("loadedmetadata")));
  }
  public get src(): string {
    return this.source ?? "";
  }
  public getAttribute(name: string): string | null {
    return name === "src" ? this.source : null;
  }
  public removeAttribute(): void {
    this.source = null;
  }
  public load(): void {}
  public async play(): Promise<void> {
    this.dispatchEvent(new Event("play"));
  }
  public pause(): void {
    this.dispatchEvent(new Event("pause"));
  }
}

interface Booted {
  app: BattitoApplication;
  dom: JSDOM;
  root: HTMLElement;
  jar: { cookie: string };
}

const nativeFetch = globalThis.fetch;
let counter = 0;

async function boot(baseUrl: string, jar: { cookie: string }): Promise<Booted> {
  const dom = new JSDOM(`<!doctype html><html lang="es"><body><div id="root"></div></body></html>`, { url: `${baseUrl}/`, pretendToBeVisual: true });
  const window = dom.window as unknown as Window & typeof globalThis;
  const assign = (name: string, value: unknown): void => {
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };
  assign("window", window);
  assign("document", window.document);
  for (const name of ["HTMLElement", "HTMLInputElement", "KeyboardEvent", "MouseEvent", "Node", "Element", "Image", "HTMLAnchorElement"]) {
    assign(name, (window as unknown as Record<string, unknown>)[name]);
  }
  assign("getComputedStyle", window.getComputedStyle.bind(window));
  assign("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 1));
  assign("cancelAnimationFrame", (id: number) => clearTimeout(id));
  assign("Audio", FakeAudio);
  (window as unknown as Record<string, unknown>)["Audio"] = FakeAudio;
  (window as unknown as Record<string, unknown>)["requestAnimationFrame"] = globalThis.requestAnimationFrame;
  (window as unknown as Record<string, unknown>)["cancelAnimationFrame"] = globalThis.cancelAnimationFrame;
  URL.createObjectURL = () => `blob:test/${(counter += 1)}`;
  URL.revokeObjectURL = () => undefined;
  window.HTMLElement.prototype.scrollIntoView = () => undefined;
  window.HTMLElement.prototype.focus = function focus() {};
  assign("fetch", async (input: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (jar.cookie) headers.set("Cookie", jar.cookie);
    const response = await nativeFetch(input.startsWith("/") ? `${baseUrl}${input}` : input, { ...init, headers });
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const pair = (setCookie.split(";")[0] ?? "").trim();
      jar.cookie = pair.endsWith("=") ? "" : pair;
    }
    return response;
  });
  const { BattitoApplication: Application } = await import("../Source/Application");
  const root = window.document.getElementById("root") as HTMLElement;
  const app = new Application(root);
  await app.start();
  return { app, dom, root, jar };
}

async function waitFor(condition: () => boolean, label: string, timeout = 5000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeout) throw new Error(`Timed out waiting for: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

function songFile(name: string): File {
  return new File([new Uint8Array(Mp3Bytes)], name, { type: "audio/mpeg" });
}

async function add(app: BattitoApplication, names: string[], target: Parameters<BattitoApplication["library"]["addSongs"]>[1] = null) {
  const result = await app.imports.readAudioFiles(names.map(songFile));
  return app.library.addSongs(result.inputs, target);
}

function patchRects(dom: JSDOM): void {
  const window = dom.window as unknown as Window & typeof globalThis;
  window.HTMLElement.prototype.getBoundingClientRect = function rect(this: HTMLElement) {
    let index = 0;
    if (this.classList.contains("listRow") && this.parentElement) {
      index = Array.from(this.parentElement.children).filter((child) => child.classList.contains("listRow")).indexOf(this);
    }
    const top = index * 64;
    return { top, bottom: top + 56, left: 0, right: 500, width: 500, height: 56, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  };
}

function pointer(dom: JSDOM, type: string, x: number, y: number): Event {
  const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  return event;
}

function dragRow(booted: Booted, title: string, dropY: number): void {
  const rows = Array.from(booted.root.querySelectorAll<HTMLElement>(".songRow"));
  const row = rows.find((candidate) => candidate.querySelector(".rowTitle")?.textContent === title);
  assert.ok(row, `row ${title} exists`);
  const handle = row.querySelector(".dragHandle") as HTMLElement;
  handle.dispatchEvent(pointer(booted.dom, "pointerdown", 10, 10));
  booted.dom.window.document.dispatchEvent(pointer(booted.dom, "pointermove", 10, 40));
  booted.dom.window.document.dispatchEvent(pointer(booted.dom, "pointermove", 10, dropY));
  assert.ok(booted.dom.window.document.querySelector(".dropIndicator"), "drop indicator visible while dragging");
  assert.ok(booted.dom.window.document.querySelector(".dragGhost"), "drag ghost visible while dragging");
  booted.dom.window.document.dispatchEvent(pointer(booted.dom, "pointerup", 10, dropY));
}

function titles(list: Iterable<{ title: string }>): string[] {
  return Array.from(list).map((song) => song.title);
}

test("client end to end: guest mode, limit, login, drag and drop, playback and persistence", { timeout: 60000 }, async () => {
  const server = new TestServer();
  await server.start();
  const jar = { cookie: "" };

  const guest = await boot(server.baseUrl, jar);
  assert.ok(guest.root.textContent?.includes("Bienvenido a Battito"));
  assert.ok(guest.root.textContent?.includes("Tu música, a tu manera."));
  assert.ok(guest.root.textContent?.includes("Agrega una canción, carpeta o playlist para comenzar."));
  assert.equal(guest.app.library.isEmpty, true);
  assert.equal(guest.app.user.isAuthenticated, false);

  await add(guest.app, ["Artist - A.mp3", "Artist - B.mp3", "Artist - C.mp3"]);
  assert.equal(guest.app.library.totalSongCount, 3);
  await assert.rejects(add(guest.app, ["D.mp3"]), GuestLimitError);
  const twenty = Array.from({ length: 20 }, (_, index) => `Track ${index}.mp3`);
  const folderInputs = (await guest.app.imports.readAudioFiles(twenty.map(songFile))).inputs;
  await assert.rejects(guest.app.library.importCollection({ kind: "folder", name: "Grande", inputs: folderInputs }), GuestLimitError);
  await assert.rejects(guest.app.library.importCollection({ kind: "playlist", name: "Grande", inputs: folderInputs }), GuestLimitError);
  assert.equal(guest.app.library.totalSongCount, 3);
  assert.equal(guest.app.library.folders.size, 0);
  await assert.rejects(guest.app.library.createCollection("playlist", "Nueva"), AuthenticationRequiredError);

  guest.app.handleError(new GuestLimitError(3, 1));
  const limitText = guest.dom.window.document.body.textContent ?? "";
  assert.ok(limitText.includes("Has alcanzado el límite de 3 canciones"));
  assert.ok(limitText.includes("Inicia sesión para continuar utilizando Battito sin esta limitación."));
  const buttons = Array.from(guest.dom.window.document.querySelectorAll(".modalPanel button")).map((button) => button.textContent);
  assert.ok(buttons.includes("Iniciar sesión") && buttons.includes("Cancelar"));
  (Array.from(guest.dom.window.document.querySelectorAll(".modalPanel button")).find((button) => button.textContent === "Cancelar") as HTMLElement).click();
  await waitFor(() => guest.dom.window.document.querySelector(".modalBackdrop") === null, "limit dialog closes");

  guest.app.navigate("#/library");
  await waitFor(() => guest.root.querySelectorAll(".songRow").length === 3, "guest library rows");
  patchRects(guest.dom);
  dragRow(guest, "C", 5);
  assert.deepEqual(titles(guest.app.library.songs), ["C", "A", "B"]);
  assert.equal(guest.app.library.songs.validateIntegrity(), true);
  await waitFor(() => Array.from(guest.root.querySelectorAll(".songRow .rowTitle")).map((node) => node.textContent).join() === "C,A,B", "rows re-rendered in new order");

  const guestFirst = guest.app.library.songs.head;
  assert.ok(guestFirst);
  await guest.app.player.playFrom(guest.app.library.songs, guestFirst);
  assert.equal(guest.app.player.song?.title, "C");
  assert.equal(guest.app.player.isPlaying, true);
  await guest.app.player.next();
  assert.equal(guest.app.player.song?.title, "A");
  await guest.app.player.previous();
  assert.equal(guest.app.player.song?.title, "C");
  await guest.app.player.previous();
  assert.equal(guest.app.player.song?.title, "C");

  guest.app.requireAuthentication("Inicia sesión para continuar.");
  const document = guest.dom.window.document;
  (Array.from(document.querySelectorAll(".modalPanel .linkButton")).find((node) => node.textContent === "Crear cuenta") as HTMLElement).click();
  const email = document.querySelector<HTMLInputElement>('.modalPanel input[name="email"]');
  const name = document.querySelector<HTMLInputElement>('.modalPanel input[name="displayName"]');
  const password = document.querySelector<HTMLInputElement>('.modalPanel input[name="password"]');
  assert.ok(email && name && password);
  email.value = "flow@example.com";
  name.value = "Flow";
  password.value = "supersecret1";
  document.querySelector(".modalPanel form")?.dispatchEvent(new guest.dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await waitFor(() => guest.app.user.isAuthenticated, "registration");
  await waitFor(() => guest.app.library.totalSongCount === 0 && !guest.app.player.song, "guest data replaced by account library");
  assert.equal(guest.app.user.user?.email, "flow@example.com");

  const app = guest.app;
  const playlist = await app.library.createCollection("playlist", "Rock Clásico");
  const folder = await app.library.createCollection("folder", "Mi Música");
  assert.ok(folder.id);
  await add(app, ["Band - A.mp3", "Band - B.mp3", "Band - C.mp3", "Band - D.mp3", "Band - E.mp3"], playlist);
  assert.equal(playlist.songs.size, 5);
  await app.library.addSongs([{ title: "Video", artist: "Canal", durationSeconds: 200, source: "youtube", sourceRef: "dQw4w9WgXcQ", coverUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg", file: null }], null);
  await add(app, ["Extra.mp3"], null);
  assert.equal(app.library.songs.size, 2);

  app.navigate(`#/collection/${playlist.id}`);
  await waitFor(() => guest.root.querySelectorAll(".songRow").length === 5, "collection rows");
  patchRects(guest.dom);
  dragRow(guest, "D", 5 + 64 * 0.2);
  assert.deepEqual(titles(playlist.songs), ["D", "A", "B", "C", "E"]);
  await waitFor(() => Array.from(guest.root.querySelectorAll(".songRow .rowTitle")).map((node) => node.textContent).join() === "D,A,B,C,E", "re-render after first drop");
  dragRow(guest, "D", 64 * 1 + 40);
  assert.deepEqual(titles(playlist.songs), ["A", "D", "B", "C", "E"]);
  await waitFor(() => Array.from(guest.root.querySelectorAll(".songRow .rowTitle")).map((node) => node.textContent).join() === "A,D,B,C,E", "re-render after second drop");
  dragRow(guest, "A", 64 * 6);
  assert.deepEqual(titles(playlist.songs), ["D", "B", "C", "E", "A"]);
  assert.equal(playlist.songs.validateIntegrity(), true);
  assert.equal(playlist.songs.head?.previous, null);
  assert.equal(playlist.songs.tail?.next, null);
  assert.equal(playlist.songs.tail?.value.title, "A");

  const storedOrder = async (): Promise<string[]> => {
    const library = await app.api.get<{ playlists: { songs: { title: string }[] }[] }>("/library");
    return library.playlists[0]?.songs.map((song) => song.title) ?? [];
  };
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(await storedOrder(), ["D", "B", "C", "E", "A"]);

  const toDelete = playlist.songs.find((song) => song.title === "C")?.value;
  assert.ok(toDelete);
  await app.library.deleteSong(toDelete);
  assert.deepEqual(titles(playlist.songs), ["D", "B", "E", "A"]);
  assert.deepEqual(await storedOrder(), ["D", "B", "E", "A"]);

  const imageFile = new File([new Uint8Array(PngBytes)], "Cover.png", { type: "image/png" });
  const fileId = await app.appearance.uploadImage(imageFile);
  const target = playlist.songs.head?.value;
  assert.ok(target);
  await app.library.updateSong(target, { coverFileId: fileId });
  await app.appearance.setGlobalAppearance({ mode: "color", color: "#ff0066" }, null);
  await app.appearance.setTheme("light");
  assert.equal(guest.dom.window.document.documentElement.dataset["theme"], "light");
  await app.appearance.setGlobalAppearance({ mode: "image" }, imageFile);
  assert.equal(app.appearance.appearance.mode, "image");
  assert.ok(app.appearance.appearance.fileId);
  await app.appearance.setGlobalAppearance({ mode: "color", color: "#ff0066" }, null);

  await app.player.playFirstOf(playlist.songs);
  assert.equal(app.player.song?.title, "D");
  assert.equal(app.player.node?.next?.value.title, "B");
  await app.player.next();
  await app.player.next();
  await app.player.next();
  assert.equal(app.player.song?.title, "A");
  assert.equal(app.player.hasNext, false);
  await app.player.next();
  assert.equal(app.player.song?.title, "A");
  app.player.cycleRepeat();
  assert.equal(app.player.repeat, "all");
  await app.player.next();
  assert.equal(app.player.song?.title, "D");
  await app.player.previous();
  assert.equal(app.player.song?.title, "A");
  const current = app.player.song;
  assert.ok(current);
  await app.library.deleteSong(current);
  assert.notEqual(app.player.song?.title, "A");
  assert.deepEqual(titles(playlist.songs), ["D", "B", "E"]);
  await new Promise((resolve) => setTimeout(resolve, 100));

  const expectedSongs = titles(app.library.songs);
  const reloaded = await boot(server.baseUrl, jar);
  assert.equal(reloaded.app.user.isAuthenticated, true);
  assert.equal(reloaded.app.library.folders.size, 1);
  assert.equal(reloaded.app.library.playlists.size, 1);
  const restored = reloaded.app.library.playlists.head?.value;
  assert.equal(restored?.name, "Rock Clásico");
  assert.deepEqual(titles(restored?.songs ?? []), ["D", "B", "E"]);
  assert.equal(restored?.songs.head?.value.coverFileId, fileId);
  assert.deepEqual(titles(reloaded.app.library.songs), expectedSongs);
  assert.equal(reloaded.app.appearance.theme, "light");
  assert.deepEqual(reloaded.app.appearance.appearance, { mode: "color", color: "#ff0066" });
  assert.equal(reloaded.dom.window.document.documentElement.dataset["theme"], "light");
  assert.equal(reloaded.dom.window.document.documentElement.dataset["backdrop"], "color");

  await reloaded.app.user.logout();
  await waitFor(() => reloaded.app.library.isEmpty && !reloaded.app.user.isAuthenticated, "logout clears library");
  await reloaded.app.user.login("flow@example.com", "supersecret1");
  await waitFor(() => reloaded.app.library.playlists.size === 1, "login restores library");
  assert.deepEqual(titles(reloaded.app.library.playlists.head?.value.songs ?? []), ["D", "B", "E"]);

  const anonymous = await boot(server.baseUrl, { cookie: "" });
  assert.equal(anonymous.app.library.isEmpty, true);
  assert.ok(anonymous.root.textContent?.includes("Bienvenido a Battito"));

  for (const instance of [guest, reloaded, anonymous]) instance.dom.window.close();
  await server.stop();
});
