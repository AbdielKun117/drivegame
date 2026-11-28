export function validateNickname(value) {
  const nickname = value.trim();
  if (!/^[A-Za-z0-9_ -]{3,20}$/.test(nickname)) {
    throw new Error("Usa un apodo de 3 a 20 caracteres: letras sin acentos, numeros, espacios, guiones o guion bajo.");
  }
  return nickname;
}

export class PlayerService {
  constructor(client, storage = globalThis.localStorage) {
    this.client = client;
    this.storage = storage;
    this.identityPromise = null;
    this.syncPromise = null;
  }

  async user() {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    return data.session?.user ?? null;
  }

  async requestLink(email, nickname, redirectTo) {
    await this.saveNickname(nickname);
    const user = await this.user();
    if (user?.is_anonymous) {
      const { data, error } = await this.client.rpc("prepare_guest_transfer", { email_address: email.trim() });
      if (error) throw error;
      if (typeof data !== "string") throw new Error("No se pudo preparar la sincronizacion.");
      this.storage.setItem("bachenora-guest-transfer", data);
    }
    const { error } = await this.client.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo,
        data: { nickname: validateNickname(nickname) }
      }
    });
    if (error) throw error;
  }

  async saveNickname(nickname) {
    await this.ensureIdentity();
    const { error } = await this.client.rpc("set_player_nickname", { new_nickname: validateNickname(nickname) });
    if (error) throw error;
  }

  async syncGuest(user) {
    if (user.is_anonymous) return false;
    if (this.syncPromise) return this.syncPromise;
    this.syncPromise = (async () => {
      const token = this.storage.getItem("bachenora-guest-transfer");
      if (!token) return false;
      const { error } = await this.client.rpc("claim_guest_results", { transfer_token: token });
      if (error) throw error;
      if (this.storage.getItem("bachenora-guest-transfer") === token) {
        this.storage.removeItem("bachenora-guest-transfer");
      }
      return true;
    })();
    try {
      return await this.syncPromise;
    } finally {
      this.syncPromise = null;
    }
  }

  discardTransfer() {
    this.storage.removeItem("bachenora-guest-transfer");
  }

  async ensureIdentity() {
    if (this.identityPromise) return this.identityPromise;
    this.identityPromise = (async () => {
      let user = await this.user();
      if (!user) {
        const { data, error } = await this.client.auth.signInAnonymously();
        if (error) throw error;
        user = data.user;
      }
      if (!user) throw new Error("No se pudo iniciar la sesion de invitado.");
      const synced = await this.syncGuest(user);
      const { data, error } = await this.client.rpc("ensure_player_profile");
      if (error) throw error;
      if (typeof data !== "string") throw new Error("El servidor no devolvio un apodo valido.");
      return { user, nickname: data, synced };
    })();
    try {
      return await this.identityPromise;
    } finally {
      this.identityPromise = null;
    }
  }

  async startRun() {
    const { user } = await this.ensureIdentity();
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
