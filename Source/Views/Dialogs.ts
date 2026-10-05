import type { Collection } from "../Models/Collection";
import type { Song } from "../Models/Song";
import { Modal } from "../Components/Modal";
import { button, coverElement } from "../Components/Rows";
import { ApiError } from "../Services/ApiClient";
import { el } from "../Utils/Dom";
import { pluralize } from "../Utils/Format";
import { icon, logoMark } from "../Utils/Icons";
import type { AppContext } from "./AppContext";

export function showLoginDialog(context: AppContext, reason?: string): void {
  let mode: "login" | "register" = "login";
  const content = el("div", { class: "authDialog" });
  const modal = new Modal(content, { label: "Inicio de sesión", className: "narrow" });

  const render = (): void => {
    const isLogin = mode === "login";
    const errorBox = el("p", { class: "formError", role: "alert", hidden: true });
    const email = el("input", { type: "email", name: "email", autocomplete: "email", placeholder: "tu@email.com", required: true, "data-autofocus": true });
    const name = el("input", { type: "text", name: "displayName", autocomplete: "nickname", placeholder: "Cómo quieres que te llamemos", maxLength: 60 });
    const password = el("input", {
      type: "password",
      name: "password",
      autocomplete: isLogin ? "current-password" : "new-password",
      placeholder: isLogin ? "Contraseña" : "Mínimo 8 caracteres",
      required: true,
      minLength: isLogin ? 1 : 8
    });
    const toggle = el("button", { class: "iconButton inputAction", type: "button", "aria-label": "Mostrar u ocultar contraseña", onClick: () => {
      password.type = password.type === "password" ? "text" : "password";
    } }, icon("eye", 18));
    const submit = el("button", { class: "button primary block", type: "submit" }, isLogin ? "Iniciar sesión" : "Crear cuenta");
    const form = el(
      "form",
      { class: "stack", noValidate: true },
      el("label", { class: "field" }, el("span", {}, "Correo electrónico"), email),
      isLogin ? null : el("label", { class: "field" }, el("span", {}, "Nombre (opcional)"), name),
      el("label", { class: "field" }, el("span", {}, "Contraseña"), el("div", { class: "inputWrap" }, password, toggle)),
      errorBox,
      submit
    );
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      errorBox.hidden = true;
      if (!email.value.includes("@")) {
        errorBox.textContent = "Ingresa un correo electrónico válido.";
        errorBox.hidden = false;
        return;
      }
      if (password.value.length === 0 || (!isLogin && password.value.length < 8)) {
        errorBox.textContent = isLogin ? "Ingresa tu contraseña." : "La contraseña debe tener al menos 8 caracteres.";
        errorBox.hidden = false;
        return;
      }
      submit.disabled = true;
      const action = isLogin ? context.user.login(email.value, password.value) : context.user.register(email.value, password.value, name.value);
      action
        .then(() => {
          modal.close();
          context.toast(isLogin ? "Sesión iniciada." : "Cuenta creada. ¡Bienvenido a Battito!", "success");
        })
        .catch((error: unknown) => {
          submit.disabled = false;
          errorBox.textContent = error instanceof ApiError ? error.message : "No pudimos completar la solicitud.";
          errorBox.hidden = false;
        });
    });
    const switcher = el("button", { class: "linkButton", type: "button", onClick: () => {
      mode = isLogin ? "register" : "login";
      render();
    } }, isLogin ? "Crear cuenta" : "Ya tengo una cuenta");
    content.replaceChildren(
      el("div", { class: "authBrand" }, logoMark(40), el("h2", {}, "Battito")),
      el("p", { class: "muted center" }, reason ?? (isLogin ? "Inicia sesión para desbloquear todas las funciones." : "Crea tu cuenta para guardar tu biblioteca en todos tus dispositivos.")),
      form,
      el("div", { class: "center" }, switcher)
    );
  };
  render();
}

export function showLimitDialog(context: AppContext, incoming = 1): void {
  const content = el(
    "div",
    { class: "limitDialog center" },
    el("div", { class: "limitIcon" }, icon("warning", 56)),
    el("h2", {}, "Has alcanzado el límite de 3 canciones"),
    el("p", { class: "muted" }, "Inicia sesión para continuar utilizando Battito sin esta limitación."),
    incoming > 1 ? el("p", { class: "muted small" }, `Lo que intentas agregar incluye ${pluralize(incoming, "canción", "canciones")} y no cabe en el modo invitado.`) : null
  );
  const modal = new Modal(content, { label: "Límite de canciones", className: "narrow" });
  content.appendChild(
    el(
      "div",
      { class: "stack" },
      button("Iniciar sesión", () => {
        modal.close();
        showLoginDialog(context, "Inicia sesión para agregar más canciones.");
      }, "primary block"),
      button("Cancelar", () => modal.close(), "outline block")
    )
  );
}

export function showConfirm(title: string, message: string, confirmLabel: string, onConfirm: () => void | Promise<void>): void {
  const content = el("div", { class: "stack" }, el("h2", {}, title), el("p", { class: "muted" }, message));
  const modal = new Modal(content, { label: title, className: "narrow", showClose: false });
  content.appendChild(
    el(
      "div",
      { class: "buttonRow" },
      button("Cancelar", () => modal.close(), "outline"),
      button(confirmLabel, () => {
        modal.close();
        void onConfirm();
      }, "danger")
    )
  );
}

export function showCreateDialog(context: AppContext, initialKind: "playlist" | "folder" = "playlist"): void {
  if (!context.requireAuthentication("Inicia sesión para crear playlists y carpetas que se guarden en tu cuenta.")) return;
  let kind: "playlist" | "folder" = initialKind;
  const content = el("div", { class: "stack" }, el("h2", {}, "Crear nueva playlist o carpeta"));
  const modal = new Modal(content, { label: "Crear playlist o carpeta" });
  const choices = el("div", { class: "choiceGrid" });
  const input = el("input", { type: "text", maxLength: 80, placeholder: "Ej. Mi playlist favorita", "data-autofocus": true });
  const error = el("p", { class: "formError", role: "alert", hidden: true });
  const renderChoices = (): void => {
    choices.replaceChildren(
      ...(["playlist", "folder"] as const).map((value) =>
        el(
          "button",
          { class: `choiceCard ${kind === value ? "selected" : ""}`, type: "button", "aria-pressed": kind === value, onClick: () => {
            kind = value;
            renderChoices();
          } },
          icon(value === "playlist" ? "playlist" : "folder", 28),
          el("span", {}, value === "playlist" ? "Playlist" : "Carpeta")
        )
      )
    );
  };
  renderChoices();
  const create = el("button", { class: "button primary block", type: "submit" }, "Crear");
  const form = el("form", { class: "stack", noValidate: true }, choices, el("label", { class: "field" }, el("span", {}, "Nombre"), input), error, create);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (name.length === 0) {
      error.textContent = "Escribe un nombre.";
      error.hidden = false;
      return;
    }
    create.disabled = true;
    context.library
      .createCollection(kind, name)
      .then((collection) => {
        modal.close();
        context.toast(`${kind === "playlist" ? "Playlist" : "Carpeta"} "${collection.name}" creada.`, "success");
        context.navigate(`#/collection/${collection.id}`);
      })
      .catch((failure: unknown) => {
        create.disabled = false;
        error.textContent = failure instanceof ApiError ? failure.message : "No pudimos crear el elemento.";
        error.hidden = false;
      });
  });
  content.appendChild(form);
}

export function showRenameDialog(context: AppContext, collection: Collection): void {
  const input = el("input", { type: "text", maxLength: 80, value: collection.name, "data-autofocus": true });
  const error = el("p", { class: "formError", role: "alert", hidden: true });
  const save = el("button", { class: "button primary block", type: "submit" }, "Guardar");
  const form = el("form", { class: "stack", noValidate: true }, el("h2", {}, "Cambiar nombre"), el("label", { class: "field" }, el("span", {}, "Nombre"), input), error, save);
  const modal = new Modal(form, { label: "Cambiar nombre", className: "narrow" });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (name.length === 0) {
      error.textContent = "Escribe un nombre.";
      error.hidden = false;
      return;
    }
    save.disabled = true;
    context.library
      .renameCollection(collection, name)
      .then(() => modal.close())
      .catch((failure: unknown) => {
        save.disabled = false;
        error.textContent = failure instanceof ApiError ? failure.message : "No pudimos guardar el nombre.";
        error.hidden = false;
      });
  });
}

export function showSongEditDialog(context: AppContext, song: Song): void {
  const title = el("input", { type: "text", maxLength: 200, value: song.title, "data-autofocus": true });
  const artist = el("input", { type: "text", maxLength: 200, value: song.artist });
  const lyrics = el("textarea", { rows: 7, maxLength: 20000, placeholder: "Pega aquí una letra que tengas derecho a usar. Se guardará solo en tu biblioteca." });
  lyrics.value = song.lyrics ?? "";
  const error = el("p", { class: "formError", role: "alert", hidden: true });
  const save = el("button", { class: "button primary block", type: "submit" }, "Guardar cambios");
  const form = el(
    "form",
    { class: "stack", noValidate: true },
    el("h2", {}, "Editar información"),
    el("label", { class: "field" }, el("span", {}, "Título"), title),
    el("label", { class: "field" }, el("span", {}, "Artista"), artist),
    el("label", { class: "field" }, el("span", {}, "Letra (opcional)"), lyrics),
    error,
    save
  );
  const modal = new Modal(form, { label: "Editar información" });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (title.value.trim().length === 0) {
      error.textContent = "La canción necesita un título.";
      error.hidden = false;
      return;
    }
    save.disabled = true;
    context.library
      .updateSong(song, { title: title.value.trim(), artist: artist.value.trim(), lyrics: lyrics.value.trim().length > 0 ? lyrics.value : null })
      .then(() => {
        modal.close();
        context.toast("Información actualizada.", "success");
      })
      .catch((failure: unknown) => {
        save.disabled = false;
        error.textContent = failure instanceof ApiError ? failure.message : "No pudimos guardar los cambios.";
        error.hidden = false;
      });
  });
}

export function showAddToPlaylistDialog(context: AppContext, song: Song): void {
  if (!context.requireAuthentication("Inicia sesión para organizar tus canciones en playlists.")) return;
  const list = el("div", { class: "stack" });
  const content = el("div", { class: "stack" }, el("h2", {}, "Agregar a playlist"), list);
  const modal = new Modal(content, { label: "Agregar a playlist", className: "narrow" });
  let any = false;
  context.library.playlists.forEachForward((playlist) => {
    any = true;
    list.appendChild(
      el(
        "button",
        { class: "listRow pickRow", type: "button", onClick: () => {
          context.library
            .copySongToCollection(song, playlist)
            .then(() => {
              modal.close();
              context.toast(`Agregada a "${playlist.name}".`, "success");
            })
            .catch((error: unknown) => context.handleError(error));
        } },
        coverElement(playlist.coverImage, "playlist", "cover small"),
        el("span", { class: "rowText" }, el("span", { class: "rowTitle" }, playlist.name), el("span", { class: "rowSub" }, pluralize(playlist.songs.size, "canción", "canciones")))
      )
    );
  });
  if (!any) {
    list.appendChild(el("p", { class: "muted" }, "Todavía no tienes playlists."));
    list.appendChild(button("Crear playlist", () => {
      modal.close();
      showCreateDialog(context, "playlist");
    }, "primary"));
  }
}
