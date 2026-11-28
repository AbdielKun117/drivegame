import { createClient } from "@supabase/supabase-js";
import { PlayerService } from "./player-service.js";

export function setupPlayers() {
  const status = document.getElementById("player-status");
  const resultStatus = document.getElementById("result-save-status");
  const identity = document.getElementById("player-identity");
  const form = document.getElementById("player-form");
  const email = document.getElementById("player-email");
  const nickname = document.getElementById("player-nickname");
  const submit = document.getElementById("player-submit");
  const logout = document.getElementById("player-logout");
  const ranking = document.getElementById("leaderboard-list");
  const rankingStatus = document.getElementById("leaderboard-status");
  const refreshButton = document.getElementById("leaderboard-refresh");
  let service = null;
  let registered = false;
  let refreshVersion = 0;
  let runVersion = 0;

  function report(error, target = status) {
    console.error("No se pudo completar la operacion de jugadores.", error);
    target.textContent = `No se pudo completar: ${error.message}. Puedes seguir jugando sin guardar en linea.`;
  }

  async function refreshIdentity() {
    const version = ++refreshVersion;
    const user = await service.user();
    let profile = null;
    if (user && !user.is_anonymous) {
      profile = await service.profile(user);
      if (!profile && user.user_metadata?.nickname) {
        await service.saveNickname(user.user_metadata.nickname);
        profile = { nickname: user.user_metadata.nickname };
      }
    }
    if (version !== refreshVersion) return;
    registered = Boolean(user && !user.is_anonymous);
    identity.textContent = registered ? `Tu cuenta · ${profile?.nickname ?? "Elige un apodo"}` : "Jugando como invitado";
    email.closest("label").hidden = registered;
    email.required = !registered;
    submit.textContent = registered ? "Guardar apodo" : "Enviar enlace de acceso";
    logout.hidden = !registered;
    if (profile) nickname.value = profile.nickname;
  }

  async function refreshRanking() {
    refreshButton.disabled = true;
    rankingStatus.textContent = "Cargando puntuaciones…";
    try {
      if (!service) throw new Error("Supabase no esta configurado");
      const rows = await service.leaderboard();
      const items = rows.map(row => {
        const item = document.createElement("li");
        const name = document.createElement("span");
        const score = document.createElement("strong");
        name.textContent = row.nickname;
        score.textContent = `${row.meters.toLocaleString("es-MX")} m`;
        item.append(name, score);
        return item;
      });
      ranking.replaceChildren(...items);
      rankingStatus.textContent = rows.length ? "Mejor recorrido de cada jugador · Top 20" : "Todavia no hay puntuaciones. ¡Estrena la tabla!";
    } catch (error) {
      ranking.replaceChildren();
      report(error, rankingStatus);
    } finally {
      refreshButton.disabled = false;
    }
  }

  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key?.startsWith("sb_publishable_")) {
      throw new Error("Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY");
    }
    const client = createClient(url, key);
    service = new PlayerService(client);
    const linkError = new URLSearchParams(window.location.hash.slice(1)).get("error_description");
    if (linkError) report(new Error(linkError));
    client.auth.onAuthStateChange(() => {
      // Run database requests after the auth callback releases its internal lock.
      setTimeout(() => { void refreshIdentity().catch(error => report(error)); }, 0);
    });
    void refreshIdentity().catch(error => report(error));
    logout.addEventListener("click", async () => {
      logout.disabled = true;
      try {
        const { error } = await client.auth.signOut();
        if (error) throw error;
        await refreshIdentity();
        status.textContent = "Sesion cerrada. Puedes seguir como invitado.";
      } catch (error) {
        report(error);
      } finally {
        logout.disabled = false;
      }
    });
  } catch (error) {
    report(error);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    submit.disabled = true;
    try {
      if (!service) throw new Error("Supabase no esta configurado");
      if (registered) {
        await service.saveNickname(nickname.value);
        await refreshIdentity();
        status.textContent = "Apodo guardado.";
      } else {
        const redirect = new URL(window.location.pathname, window.location.origin).href;
        await service.requestLink(email.value, nickname.value, redirect);
        status.textContent = "Revisa tu correo y abre el enlace en este dispositivo. Si no llega, revisa spam. Espera un minuto antes de reenviar.";
      }
    } catch (error) {
      report(error);
    } finally {
      submit.disabled = false;
    }
  });
  refreshButton.addEventListener("click", () => { void refreshRanking(); });
  document.getElementById("leaderboard").addEventListener("toggle", event => {
    if (event.target.open) void refreshRanking();
  });

  return {
    beginRun() {
      const version = ++runVersion;
      resultStatus.textContent = "";
      const pending = (async () => {
        try {
          if (!service) throw new Error("Supabase no esta configurado");
          return await service.startRun();
        } catch (error) {
          if (version === runVersion) {
            report(error);
            resultStatus.textContent = "Esta partida no se guardara en linea. Tu record local sigue funcionando.";
          } else {
            console.error("No se pudo iniciar el registro de una partida anterior.", error);
          }
          return null;
        }
      })();
      return { pending, version };
    },
    async endRun(handle, meters, seconds, outcome) {
      if (!handle) return;
      if (outcome === "crash" && handle.version === runVersion) resultStatus.textContent = "Guardando partida…";
      try {
        const run = await handle.pending;
        if (!run) {
          if (handle.version === runVersion) resultStatus.textContent = "Sin registro en linea; conservas tu record local.";
          return;
        }
        const published = await service.finishRun(run, meters, seconds, outcome);
        if (handle.version === runVersion && outcome === "crash") {
          resultStatus.textContent = published
            ? "Partida guardada. La tabla conserva tu mejor recorrido."
            : run.guest
              ? "Partida de invitado guardada. Entra con tu correo desde el menu para publicar tus proximas puntuaciones."
              : "Partida guardada, pero no publicada. Guarda tu apodo en Mi cuenta para publicar tus proximas puntuaciones.";
        }
      } catch (error) {
        report(error, handle.version === runVersion && outcome === "crash" ? resultStatus : status);
      }
    }
  };
}
