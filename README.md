# Battito

**Live Demo:** [https://battitorepmusestdat.onrender.com](https://battitorepmusestdat.onrender.com)

**Battito — A complete music management and playback application based on a real doubly linked list.**

All source code is TypeScript (frontend, backend, build scripts and tests). HTML and CSS are used only for markup and styling. The user interface is in Spanish; code, file names and this document are in English.

## 1. Project overview

Battito lets people import, organise and play their music. The in-memory model of the library and of the playback queue is a hand-written `DoubleLinkedList<T>` made of `ListNode<T>` objects (`previous` / `next`, with `head` / `tail` kept by the list). Next, previous, reordering by drag and drop and removal are all pointer operations on that structure. Authenticated users get a persistent library stored in a real database and file storage.

## 2. Features

- Songs, folders and playlists, shown separately in the library (open, play, delete, rename, reorder, search, download).
- Import songs, folders (via `webkitdirectory` or drag and drop) and playlists (multi-select plus optional `.m3u` ordering) from the device.
- YouTube search and playback (official Data API v3 + IFrame Player API), and "from URL" (YouTube link or direct audio URL).
- Original player: circular pulse visualiser around a disc cover (real frequency data for imported files), ambient backdrop from the cover, lyrics panel, per-song colour/background/cover customisation.
- Drag and drop reordering (pointer events, so it works with mouse and touch; keyboard with ArrowUp/ArrowDown on the handle).
- Lyrics through a public lyrics API, with the option to write your own lyrics per song.
- Light and dark mode, global background (solid colour, built-in image or your own image).
- Guest mode (no persistence, 3 song limit) and authenticated mode (unlimited, persisted, downloads).
- Responsive layout: sidebar on desktop, bottom navigation on mobile.

## 3. Technologies

TypeScript, Node.js 20+ (developed on 22), Express, SQLite (`better-sqlite3`), bcryptjs, JSON Web Tokens in an HttpOnly cookie, Zod, Multer, Archiver, Helmet, esbuild (bundling), tsx, Node's built-in test runner, jsdom (client tests).

## 4. Architecture

```text
Browser (HTML + CSS + TypeScript, bundled by esbuild)
   |  fetch /api/*  (same origin, cookie session)
Express server (TypeScript)
   |-- SQLite database  (Data/Battito.sqlite)
   |-- File storage     (Data/Uploads/<userId>/<uuid>.<ext>)
   |-- YouTube Data API v3 / lyrics provider (server side only)
```

The same Express process serves the API and the built frontend.

## 5. Frontend

`Source/` is organised as:

| Folder | Content |
| --- | --- |
| `Structures` | `ListNode`, `DoubleLinkedList` |
| `Models` | `Song`, `Collection`, `Folder`, `Playlist` |
| `Managers` | `LibraryManager`, `MusicPlayer`, `UserManager`, `AppearanceManager`, `SearchManager`, `DownloadManager`, `ImportManager`, `GuestLimitPolicy` |
| `Services` | `ApiClient`, playback engines (`HtmlAudioEngine`, `YouTubeEngine`) |
| `Components` | `Modal`, `PopoverMenu`, `DragSorter`, `MiniPlayer`, rows, toasts |
| `Views` | Home, Search, Library, Collection, Devices, Settings, Player, dialogs |
| `Application.ts` | Shell, router (hash routes), wiring |

## 6. Backend

`Server/` contains `Application.ts` (factory used by `Main.ts` and tests), `Routes/`, `Services/`, `Database/` (one repository per aggregate) and `Middleware/`. API summary (all under `/api`):

| Operation | Route |
| --- | --- |
| RegisterUser / LoginUser / logout / session | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` |
| GetUserLibrary | `GET /library` |
| CreatePlaylist / CreateFolder | `POST /collections` (`kind`) |
| DeletePlaylist / DeleteFolder | `DELETE /collections/:id` |
| Rename / cover | `PATCH /collections/:id` |
| AddSong (file) / AddSong (YouTube, URL) | `POST /songs/upload`, `POST /songs/remote` |
| Copy song to a playlist | `POST /songs/:id/copy` |
| UpdateSong (title, lyrics, cover, background) | `PATCH /songs/:id` |
| DeleteSong | `DELETE /songs/:id` |
| MoveSong / UpdateSongOrder | `PUT /order` (`songs`, `folders`, `playlists`, `collection`) |
| UpdateCustomization | `PUT /preferences` |
| UploadImage | `POST /images` |
| Private file access | `GET /files/:id` |
| SearchMusic / resolve link | `GET /search`, `GET /resolve` |
| GetLyrics | `GET /lyrics` |
| Downloads | `GET /download/song/:id`, `GET /download/collection/:id` |
| Health | `GET /health` |

## 7. Database

SQLite through `better-sqlite3`, created automatically on first start (`Server/Database/DatabaseConnection.ts`). Tables: `users`, `files`, `collections`, `songs`, `preferences`, `lyricsCache`. Foreign keys cascade on user/collection deletion. Order is stored in a `position` column and always written from the traversal of the linked list.

Why SQLite instead of Firebase: it is a real, durable, transactional database that survives page reloads, browser/app/computer/server restarts, and needs no external credentials to run or verify the project. The repositories isolate all SQL, so another store could replace it.

## 8. Authentication

Email + password. Passwords are hashed with bcrypt (never stored in plain text). The session is a signed JWT in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` when `SECURE_COOKIES=true`). Login and registration are rate limited. Every library route requires a session and every query is filtered by the authenticated `userId`; another user's songs, collections and files answer `404`.

## 9. Storage

Uploaded audio and images are written to `UPLOAD_DIRECTORY` under a per-user folder and registered in the `files` table. Files are validated by extension **and** magic bytes (PNG, JPEG, WEBP; MP3, M4A, OGG, FLAC, WAV, WEBM), size limited (8 MB images, 80 MB audio), served only to their owner, with `nosniff`. SVG is rejected on purpose. When a file is no longer referenced by any song, collection or preference it is deleted from disk. Local paths of the user's computer are never stored.

## 10. YouTube integration

Server-side search with the official YouTube Data API v3 (`search.list` + `videos.list` for duration and embeddability), restricted to embeddable videos. Playback uses the official IFrame Player API; the video player is always visible (inside the player view or as a floating panel) as required by YouTube's terms. Battito never extracts, proxies or downloads YouTube media. Set `YOUTUBE_API_KEY` to enable search; without it the UI shows a Spanish message and everything else keeps working.

## 11. Lyrics integration

`GET /lyrics` first returns lyrics the user wrote for that song, then queries the public `api.lyrics.ovh` service (cached in `lyricsCache`). If nothing is found the UI shows "No encontramos la letra de esta canción." Battito does not ship or invent lyrics.

## 12. Double linked list

`Source/Structures/DoubleLinkedList.ts`: `insertFirst`, `insertLast`, `insertBefore`, `insertAfter`, `insertAt`, `removeFirst`, `removeLast`, `removeNode`, `moveBefore`, `moveAfter`, `moveToFirst`, `moveToLast`, `getNext`, `getPrevious` (plus circular variants), forward/backward traversal and `validateIntegrity()`. Nodes know their `owner` list, so foreign nodes are rejected. Arrays only appear as derived snapshots for rendering and serialisation. The library keeps three lists (songs, folders, playlists); each folder/playlist owns a list of songs; `MusicPlayer` holds a node of the active list and moves with `node.next` / `node.previous`.

## 13. Object-oriented programming

Classes with single responsibilities: `Song`, `Collection` (`Folder`, `Playlist`), `ListNode`, `DoubleLinkedList`, `MusicPlayer`, `LibraryManager`, `SearchManager`, `UserManager`, `AppearanceManager`, `DownloadManager`, `ImportManager`, `GuestLimitPolicy`, playback engines behind a `PlaybackEngine` interface, and on the server `AuthenticationService`, `FileStorageService`, `FileValidator`, `YouTubeService`, `LyricsService` and the repositories.

## 14. Drag and Drop

`DragSorter` uses pointer events: a ghost of the row follows the pointer, a drop indicator shows the target position, the container auto-scrolls near its edges, and on release `LibraryManager.moveSong` / `moveCollection` calls `moveBefore` / `moveToLast` on the list (real pointer changes). The resulting order is sent to `PUT /order`. Works for songs, playlists and folders. Reordering is disabled while a search filter is active.

## 15. Guest limitations

Without a session the app starts empty (no demo content). Guests can add/import, play, reorder, delete, search, view lyrics, change theme and customise appearance (temporary, in memory, lost on reload). They cannot create playlists/folders, download, or keep data. A total of **3 songs** is enforced by `GuestLimitPolicy` for single files, YouTube, URLs, folders and playlists: an import whose song count would exceed the limit is rejected as a whole, so folders cannot be used to bypass it.

## 16. Authenticated users

Unlimited songs, create playlists/folders, copy songs to playlists, downloads, and a persistent library, order, images, colours and settings across sessions and devices.

## 17. Persistence

Everything an authenticated user does is saved through the API before/while the UI changes: songs, order, playlists, folders, covers, backgrounds, theme and colours. The automated tests restart the server and reload the client to verify nothing is lost (see Testing).

## 18. Image upload

"Personalizar apariencia → Imagen → Desde mi dispositivo" opens the native file picker (PNG, JPG, JPEG, WEBP), validates type, size and decodability, shows a preview, and applies it after "Aplicar". It can be used as app background, per-song player background or per-song cover.

## 19. Appearance customisation

Dialog with Color / Imagen tabs, 6 solid colours + custom picker, 10 built-in images, own image, live preview, Aplicar / Cancelar / Restablecer. Guests: temporary. Authenticated: saved in `preferences` and `songs`.

## 20. Installation

Requirements: Node.js 22.22.2+, 24.15.0+, or 26+. `better-sqlite3` compiles its native SQLite binding during installation, so Windows also needs the Visual Studio C++ build tools.

```powershell
npm ci
```

## 21. Environment variables

```bash
cp EnvironmentExample .env
```

| Variable | Description |
| --- | --- |
| `JWT_SECRET` | **Required**, at least 32 random characters. Generate one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `PORT` | HTTP port (default 3000) |
| `DATABASE_PATH` | SQLite file (default `Data/Battito.sqlite`) |
| `UPLOAD_DIRECTORY` | File storage folder (default `Data/Uploads`) |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key (optional, enables YouTube search) |
| `SECURE_COOKIES` | `true` when served over HTTPS |
| `PASSWORD_ROUNDS` | bcrypt cost (default 12) |

No secrets are committed; `.env`, `Data/` and `Dist/` are git-ignored.

## 22. Database configuration

Nothing to configure: the database file and tables are created on first start. Back up `Data/` (database + uploads) to back up everything.

## 23. API configuration

Create a key in Google Cloud Console (enable "YouTube Data API v3") and put it in `YOUTUBE_API_KEY`. The lyrics provider needs no key.

To enable search, create a Google Cloud project, enable YouTube Data API v3, and create an API key. Restrict the key to YouTube Data API v3, then put it in `.env` as `YOUTUBE_API_KEY=your-key` (keep the key private). Restart the server with `npm start`; the search results will then be playable in Battito's embedded YouTube player. Without the key, local audio imports and playback still work, but online YouTube search is disabled.

## 24. How to run

```bash
npm run build        # type-check, bundle frontend (Dist/Public) and backend (Dist/Server)
npm start            # production: http://localhost:3000
npm run dev          # build the frontend from TypeScript, then start the API with reload: http://localhost:3000
npm test             # all tests
npm run typecheck    # TypeScript only
```

On Windows, run these commands from the Battito folder in PowerShell. For development, run `npm ci` once after installation, make sure `.env` has a `JWT_SECRET`, then run `npm run dev`. For a production-style local run, run `npm run build` and then `npm start`. The browser and Node.js need the generated JavaScript bundles in `Dist` to execute TypeScript source; `Dist` can be deleted while the app is stopped and is regenerated by these commands.

## 25. Project structure

```text
Battito
├── Source        frontend (Structures, Models, Managers, Services, Components, Views, Utils)
├── Shared        types and constants used by frontend and backend
├── Server        Express API (Routes, Services, Database, Middleware)
├── Styles        CSS
├── Public        Index.html
├── Assets        favicon (fonts are bundled from @fontsource-variable)
├── Build         esbuild scripts (TypeScript)
├── Tests         unit, API and client flow tests
├── EnvironmentExample
└── package.json
```

## 26. Testing

`npm test` runs 21 tests:

- Doubly linked list: InsertFirst, InsertLast, InsertBetween, RemoveFirst, RemoveLast, RemoveNode, MoveNode, GetNext, GetPrevious, `head`/`tail`/`previous`/`next` verified after every operation, plus a 500-step randomised comparison against a reference model.
- API (real Express + SQLite on a temporary directory): registration, login, hashed passwords, 401s, ownership isolation between users, upload validation (fake images/audio, SVG, bad URLs), orphan file cleanup, downloads (single file, ZIP, blocked external songs), YouTube and lyrics services (with injected fetch), and the full persistence scenario across a **server restart**.
- Client flow (jsdom against the real server): empty guest start and welcome text, 3-song limit including a 20-song folder and playlist, limit dialog text, guest drag and drop with pointer events, playback through next/previous/repeat/removal, registration through the UI, the A,B,C,D → A,D,B,C → D,B,C,A drag and drop scenario with pointer integrity checks, server-side order, cover/colour/theme persistence, page reload, logout and login again.

## 27. Important technical decisions and limitations

- **SQLite + local disk instead of Firebase**: see section 7. Deploying on a read-only or ephemeral filesystem requires a persistent volume for `Data/`.
- **Downloads** only cover files the user imported (original file, or a ZIP for folders/playlists). YouTube and external URL songs are never downloadable (YouTube terms), and the UI says so. There is no format conversion, so the mock-up's MP3/MP4 and quality choices are replaced by "original file".
- **Visualiser**: real audio analysis for imported files; for URL and YouTube sources (cross-origin / iframe) the browser does not expose audio data, so the ring shows a gentle ambient animation instead.
- **Guest files** exist only as browser object URLs; nothing is uploaded and everything disappears on reload.
- **Lyrics** depend on a third-party public service that may not have every song.
- **Verification status**: all automated tests pass. The sandbox used to build the project had no browser binary and no YouTube API key, so the UI was verified with jsdom (DOM, events, pointer drag and drop, real HTTP/DB) rather than by eye, and live YouTube search/playback and the lyrics provider were verified only with injected responses. Please run the app once with your own `YOUTUBE_API_KEY` in a browser to check those parts visually.
