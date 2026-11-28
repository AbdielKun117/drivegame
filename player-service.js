export function validateNickname(value) {
  const nickname = value.trim();
  if (!/^[A-Za-z0-9_ -]{3,20}$/.test(nickname)) {
    throw new Error("Usa un apodo de 3 a 20 caracteres: letras sin acentos, numeros, espacios, guiones o guion bajo.");
  }
  return nickname;
}

export class PlayerService {
  constructor(client) {
    this.client = client;
  }

  async user() {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    return data.session?.user ?? null;
  }

  async requestLink(email, nickname, redirectTo) {
    const { error } = await this.client.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo,
        data: { nickname: validateNickname(nickname) }
      }
    });
    if (error) throw error;
  }

  async profile(user) {
    const { data, error } = await this.client.from("player_profiles")
      .select("nickname").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async saveNickname(nickname) {
    const user = await this.user();
    if (!user || user.is_anonymous) throw new Error("Abre primero el enlace de tu correo.");
    const { error } = await this.client.from("player_profiles")
      .upsert({ user_id: user.id, nickname: validateNickname(nickname) }, { onConflict: "user_id" });
    if (error) throw error;
  }

  async startRun() {
    let user = await this.user();
    if (!user) {
      const { data, error } = await this.client.auth.signInAnonymously();
      if (error) throw error;
      user = data.user;
    }
    if (!user) throw new Error("No se pudo iniciar la sesion de invitado.");
    const { data, error } = await this.client.rpc("start_game_run");
    if (error) throw error;
    if (typeof data !== "string") throw new Error("El servidor no devolvio una partida valida.");
    return { id: data, userId: user.id, guest: Boolean(user.is_anonymous) };
  }

  async finishRun(run, meters, seconds, outcome) {
    if (!Number.isFinite(meters) || !Number.isFinite(seconds) || meters < 0 || seconds < 0
      || meters > seconds * 63 + 5 || !["crash", "menu"].includes(outcome)) {
      throw new Error("Resultado de partida no valido.");
    }
    const user = await this.user();
    if (user?.id !== run.userId) throw new Error("La cuenta cambio durante la partida; no se pudo guardar.");
    const { data, error } = await this.client.rpc("finish_game_run", {
      run_id: run.id,
      run_meters: Math.floor(meters),
      run_seconds: seconds,
      run_outcome: outcome
    });
    if (error) throw error;
    if (typeof data !== "boolean") throw new Error("El servidor no confirmo el resultado.");
    return data;
  }

  async leaderboard() {
    const { data, error } = await this.client.rpc("get_leaderboard");
    if (error) throw error;
    if (!Array.isArray(data) || data.some(row => typeof row.nickname !== "string"
      || !Number.isInteger(row.meters) || row.meters < 0)) {
      throw new Error("La tabla de puntuaciones no tiene un formato valido.");
    }
    return data;
  }
}
