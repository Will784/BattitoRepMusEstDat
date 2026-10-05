import { test } from "node:test";
import assert from "node:assert/strict";
import { ApiClient, PngBytes, TestServer, audioForm, imageForm } from "./ApiTestHarness";
import { LyricsService } from "../Server/Services/LyricsService";
import { YouTubeService, parseIsoDuration } from "../Server/Services/YouTubeService";
import { extractVideoId } from "../Server/Routes/SearchRoutes";

async function register(client: ApiClient, email: string) {
  const response = await client.send("POST", "/api/auth/register", { email, password: "supersecret1", displayName: "Tester" });
  assert.equal(response.status, 201);
  return response.data.user;
}

test("health reports database connectivity", async () => {
  const server = new TestServer();
  await server.start();
  const response = await server.client().send("GET", "/api/health");
  assert.equal(response.status, 200);
  assert.deepEqual(response.data, { status: "ok", database: true });
  await server.stop();
});

test("authentication: register, duplicate, login, bad password, logout, protected routes", async () => {
  const server = new TestServer();
  await server.start();
  const client = server.client();
  assert.equal((await client.send("GET", "/api/library")).status, 401);
  assert.equal((await client.send("POST", "/api/auth/register", { email: "a@b.co", password: "short" })).status, 400);
  await register(client, "ana@example.com");
  assert.equal((await client.send("GET", "/api/auth/me")).data.user.email, "ana@example.com");
  assert.equal((await client.send("POST", "/api/auth/register", { email: "ana@example.com", password: "supersecret1" })).status, 409);
  await client.send("POST", "/api/auth/logout");
  assert.equal((await client.send("GET", "/api/auth/me")).status, 401);
  const other = server.client();
  assert.equal((await other.send("POST", "/api/auth/login", { email: "ana@example.com", password: "wrongwrong" })).status, 401);
  assert.equal((await other.send("POST", "/api/auth/login", { email: "ana@example.com", password: "supersecret1" })).status, 200);
  assert.equal((await other.send("GET", "/api/library")).status, 200);
  const row = server.configuration.databasePath;
  const Database = (await import("better-sqlite3")).default;
  const raw = new Database(row, { readonly: true });
  const stored = raw.prepare("SELECT passwordHash FROM users").get() as { passwordHash: string };
  raw.close();
  assert.ok(stored.passwordHash.startsWith("$2"));
  assert.ok(!stored.passwordHash.includes("supersecret1"));
  await server.stop();
});

test("full persistence scenario survives a server restart", async () => {
  const server = new TestServer();
  await server.start();
  const client = server.client();
  await register(client, "persist@example.com");
  const playlist = (await client.send("POST", "/api/collections", { kind: "playlist", name: "Rock Clásico" })).data;
  const folder = (await client.send("POST", "/api/collections", { kind: "folder", name: "Mi Música" })).data;
  assert.equal(playlist.kind, "playlist");
  const ids: string[] = [];
  for (const title of ["A", "B", "C", "D"]) {
    const created = await client.send("POST", "/api/songs/upload", audioForm({ title, artist: "Artista", durationSeconds: "120", collectionId: playlist.id }));
    assert.equal(created.status, 201);
    ids.push(created.data.id);
  }
  const remote = await client.send("POST", "/api/songs/remote", {
    title: "Video",
    artist: "Canal",
    durationSeconds: 200,
    source: "youtube",
    sourceRef: "dQw4w9WgXcQ",
    coverUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
    collectionId: null
  });
  assert.equal(remote.status, 201);
  const [a, b, c, d] = ids as [string, string, string, string];
  assert.equal((await client.send("PUT", "/api/order", { scope: "collection", collectionId: playlist.id, ids: [a, d, b, c] })).status, 204);
  assert.equal((await client.send("PUT", "/api/order", { scope: "collection", collectionId: playlist.id, ids: [a, d, b] })).status, 409);
  assert.equal((await client.send("DELETE", `/api/songs/${c}`)).status, 204);
  const image = await client.send("POST", "/api/images", undefined, imageForm());
  assert.equal(image.status, 201);
  const fileId = image.data.fileId as string;
  assert.equal((await client.send("PATCH", `/api/songs/${a}`, { coverFileId: fileId })).status, 200);
  const preferences = { theme: "light", appearance: { mode: "color", color: "#ff0066" } };
  assert.equal((await client.send("PUT", "/api/preferences", preferences)).status, 200);
  assert.equal((await client.send("POST", "/api/songs/upload", audioForm({ title: "Suelta" }))).status, 201);
  await client.send("POST", "/api/auth/logout");
  await server.stop();

  const restarted = new TestServer(server.directory);
  await restarted.start();
  const again = restarted.client();
  assert.equal((await again.send("POST", "/api/auth/login", { email: "persist@example.com", password: "supersecret1" })).status, 200);
  const library = (await again.send("GET", "/api/library")).data;
  assert.equal(library.folders.length, 1);
  assert.equal(library.folders[0].name, "Mi Música");
  assert.equal(library.playlists[0].name, "Rock Clásico");
  assert.deepEqual(library.playlists[0].songs.map((song: { title: string }) => song.title), ["A", "D", "B"]);
  assert.equal(library.playlists[0].songs[0].coverFileId, fileId);
  assert.deepEqual(library.songs.map((song: { title: string }) => song.title), ["Video", "Suelta"]);
  assert.deepEqual(library.preferences, preferences);
  const file = await again.send("GET", `/api/files/${fileId}`);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(file.raw), PngBytes);
  assert.ok(folder.id);
  await restarted.stop();
});

test("users cannot read or modify each other's data", async () => {
  const server = new TestServer();
  await server.start();
  const first = server.client();
  const second = server.client();
  await register(first, "one@example.com");
  await register(second, "two@example.com");
  const playlist = (await first.send("POST", "/api/collections", { kind: "playlist", name: "Privada" })).data;
  const song = (await first.send("POST", "/api/songs/upload", audioForm({ title: "Secreta", collectionId: playlist.id }))).data;
  const image = (await first.send("POST", "/api/images", undefined, imageForm())).data;
  assert.equal((await second.send("GET", `/api/files/${image.fileId}`)).status, 404);
  assert.equal((await second.send("GET", `/api/files/${song.audioFileId}`)).status, 404);
  assert.equal((await second.send("DELETE", `/api/songs/${song.id}`)).status, 404);
  assert.equal((await second.send("DELETE", `/api/collections/${playlist.id}`)).status, 404);
  assert.equal((await second.send("PATCH", `/api/songs/${song.id}`, { title: "Hack" })).status, 404);
  assert.equal((await second.send("PATCH", `/api/songs/${song.id}`, { coverFileId: image.fileId })).status, 404);
  assert.equal((await second.send("POST", "/api/songs/upload", audioForm({ title: "X", collectionId: playlist.id }))).status, 404);
  assert.equal((await second.send("PUT", "/api/order", { scope: "collection", collectionId: playlist.id, ids: [song.id] })).status, 404);
  const library = (await second.send("GET", "/api/library")).data;
  assert.equal(library.playlists.length, 0);
  assert.equal(library.songs.length, 0);
  assert.equal((await first.send("GET", "/api/library")).data.playlists[0].songs.length, 1);
  await server.stop();
});

test("uploads are validated", async () => {
  const server = new TestServer();
  await server.start();
  const client = server.client();
  await register(client, "files@example.com");
  const fakeImage = await client.send("POST", "/api/images", undefined, imageForm(Buffer.from("<svg onload=alert(1)>"), "Evil.png"));
  assert.equal(fakeImage.status, 415);
  const svg = await client.send("POST", "/api/images", undefined, imageForm(Buffer.from("<svg></svg>"), "Evil.svg"));
  assert.equal(svg.status, 415);
  const badAudio = await client.send("POST", "/api/songs/upload", audioForm({ title: "Falso" }, Buffer.from("this is plain text, not audio"), "Falso.mp3"));
  assert.equal(badAudio.status, 415);
  const missing = await client.send("POST", "/api/songs/upload", new FormData());
  assert.equal(missing.status, 400);
  const badVideo = await client.send("POST", "/api/songs/remote", { title: "X", artist: "", durationSeconds: 1, source: "youtube", sourceRef: "no", coverUrl: null });
  assert.equal(badVideo.status, 400);
  const badUrl = await client.send("POST", "/api/songs/remote", { title: "X", artist: "", durationSeconds: 1, source: "url", sourceRef: "javascript:alert(1)", coverUrl: null });
  assert.equal(badUrl.status, 400);
  const badColor = await client.send("PUT", "/api/preferences", { theme: "dark", appearance: { mode: "color", color: "red" } });
  assert.equal(badColor.status, 400);
  assert.equal((await client.send("POST", "/api/collections", { kind: "playlist", name: "   " })).status, 400);
  await server.stop();
});

test("orphaned files are removed when song copies are deleted", async () => {
  const server = new TestServer();
  await server.start();
  const client = server.client();
  await register(client, "download@example.com");
  const playlist = (await client.send("POST", "/api/collections", { kind: "playlist", name: "Mix" })).data;
  const uploaded = (await client.send("POST", "/api/songs/upload", audioForm({ title: "Local", artist: "Yo", collectionId: playlist.id }))).data;
  const copy = await client.send("POST", `/api/songs/${uploaded.id}/copy`, { collectionId: null });
  assert.equal(copy.status, 201);
  await client.send("DELETE", `/api/songs/${uploaded.id}`);
  assert.equal((await client.send("GET", `/api/files/${uploaded.audioFileId}`)).status, 200);
  await client.send("DELETE", `/api/songs/${copy.data.id}`);
  assert.equal((await client.send("GET", `/api/files/${uploaded.audioFileId}`)).status, 404);
  await server.stop();
});

test("search endpoints validate input and report missing YouTube configuration", async () => {
  const server = new TestServer();
  await server.start();
  const client = server.client();
  const notConfigured = await client.send("GET", "/api/search?q=billie");
  assert.equal(notConfigured.status, 503);
  assert.match(notConfigured.data.message, /YouTube/);
  assert.equal((await client.send("GET", "/api/search?q=")).status, 400);
  const direct = await client.send("GET", `/api/resolve?url=${encodeURIComponent("https://example.com/audio/Mi%20Cancion.mp3")}`);
  assert.equal(direct.status, 200);
  assert.equal(direct.data.kind, "url");
  assert.equal(direct.data.result.title, "Mi Cancion");
  assert.equal((await client.send("GET", `/api/resolve?url=${encodeURIComponent("ftp://example.com/x.mp3")}`)).status, 400);
  await server.stop();
});

test("YouTube service maps API responses and lyrics service caches results", async () => {
  const calls: string[] = [];
  const youtube = new YouTubeService("key", async (url) => {
    calls.push(url);
    if (url.includes("/search?")) {
      return { ok: true, status: 200, json: async () => ({ items: [{ id: { videoId: "aaaaaaaaaaa" } }, { id: { videoId: "bbbbbbbbbbb" } }] }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          { id: "aaaaaaaaaaa", snippet: { title: "Uno", channelTitle: "Canal", thumbnails: { medium: { url: "https://i.ytimg.com/a.jpg" } } }, contentDetails: { duration: "PT3M21S" }, status: { embeddable: true } },
          { id: "bbbbbbbbbbb", snippet: { title: "Dos" }, contentDetails: { duration: "PT1H" }, status: { embeddable: false } }
        ]
      })
    };
  });
  const results = await youtube.search("billie", "songs");
  assert.equal(results.length, 1);
  assert.equal(results[0]?.durationSeconds, 201);
  assert.ok(calls[0]?.includes("videoCategoryId=10"));
  assert.equal(parseIsoDuration("PT1H2M3S"), 3723);
  assert.equal(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(extractVideoId("https://youtu.be/dQw4w9WgXcQ?t=3"), "dQw4w9WgXcQ");
  assert.equal(extractVideoId("https://example.com/watch?v=dQw4w9WgXcQ"), null);

  const { DatabaseConnection } = await import("../Server/Database/DatabaseConnection");
  let providerCalls = 0;
  const lyrics = new LyricsService(new DatabaseConnection(":memory:"), async () => {
    providerCalls += 1;
    return { ok: true, status: 200, json: async () => ({ lyrics: "Línea uno\r\nLínea dos" }) };
  });
  assert.equal(await lyrics.find("Artista (Official)", "Titulo [Video]"), "Línea uno\nLínea dos");
  assert.equal(await lyrics.find("Artista", "Titulo"), "Línea uno\nLínea dos");
  assert.equal(providerCalls, 1);
  const missing = new LyricsService(new DatabaseConnection(":memory:"), async () => ({ ok: false, status: 404, json: async () => ({}) }));
  assert.equal(await missing.find("X", "Y"), null);
});

test("lyrics endpoint prefers custom lyrics stored by the user", async () => {
  const server = new TestServer();
  await server.start({ lyrics: { find: async () => null } as unknown as LyricsService });
  const client = server.client();
  await register(client, "lyrics@example.com");
  const song = (await client.send("POST", "/api/songs/upload", audioForm({ title: "Mia", artist: "Yo" }))).data;
  const none = await client.send("GET", `/api/lyrics?artist=Yo&title=Mia&songId=${song.id}`);
  assert.deepEqual(none.data, { lyrics: null, origin: "none" });
  await client.send("PATCH", `/api/songs/${song.id}`, { lyrics: "Mi letra propia" });
  const custom = await client.send("GET", `/api/lyrics?artist=Yo&title=Mia&songId=${song.id}`);
  assert.deepEqual(custom.data, { lyrics: "Mi letra propia", origin: "custom" });
  await server.stop();
});
