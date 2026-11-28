import test from "node:test";
import assert from "node:assert/strict";
import { PlayerService, validateNickname } from "./player-service.js";

function fixture(user = null) {
  const calls = [];
  const stored = new Map();
  const storage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: key => stored.delete(key)
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: user ? { user } : null }, error: null }),
      signInAnonymously: async () => {
        calls.push("anonymous");
        user = { id: "guest-id", is_anonymous: true };
        return { data: { user }, error: null };
      },
      signInWithOtp: async options => { calls.push(options); return { error: null }; }
    },
    rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: name === "ensure_player_profile" ? "Invitado 1"
        : name === "prepare_guest_transfer" ? "transfer-token"
        : name === "start_game_run" ? "run-id" : name === "finish_game_run" ? true : [], error: null };
    }
  };
  return { service: new PlayerService(client, storage), client, calls, storage, setUser: value => { user = value; } };
}

test("guests receive one persistent anonymous identity and each run has its own server registration", async () => {
  const { service, calls } = fixture();
  const first = await service.startRun();
  await service.startRun();
  assert.deepEqual(first, { id: "run-id", userId: "guest-id", guest: true });
  assert.equal(calls.filter(call => call === "anonymous").length, 1);
  assert.equal(calls.filter(call => call.name === "start_game_run").length, 2);
  assert.equal(await service.finishRun(first, 50.9, 2, "crash"), true);
  assert.deepEqual(calls.at(-1).args, { run_id: "run-id", run_meters: 50, run_seconds: 2, run_outcome: "crash" });
});

test("registered accounts skip anonymous sign-in and can publish completed runs", async () => {
  const { service, calls } = fixture({ id: "member-id", is_anonymous: false });
  const run = await service.startRun();
  assert.equal(run.guest, false);
  assert.equal(await service.finishRun(run, 100, 3, "crash"), true);
  assert.equal(calls.includes("anonymous"), false);
});

test("invalid results and account changes cannot submit a run under another player", async () => {
  const { service, calls, setUser } = fixture({ id: "member-id", is_anonymous: false });
  const run = await service.startRun();
  for (const [meters, seconds, outcome] of [[NaN, 1, "crash"], [1, Infinity, "crash"], [-1, 1, "crash"], [1000, 1, "crash"], [1, 1, "other"]]) {
    await assert.rejects(service.finishRun(run, meters, seconds, outcome), /no valido/);
  }
  setUser({ id: "different-member", is_anonymous: false });
  await assert.rejects(service.finishRun(run, 20, 1, "crash"), /cuenta cambio/);
  assert.equal(calls.filter(call => call.name === "finish_game_run").length, 0);
});

test("magic links include a validated public nickname and the allowed return address", async () => {
  const { service, calls } = fixture();
  await service.requestLink(" player@example.com ", " Bachenorero ", "https://example.com/game/");
  assert.deepEqual(calls.find(call => call.email), {
    email: "player@example.com",
    options: { emailRedirectTo: "https://example.com/game/", data: { nickname: "Bachenorero" } }
  });
  for (const nickname of ["ab", "x".repeat(21), "<img src=x>", "hola\nmundo"]) {
    assert.throws(() => validateNickname(nickname), /apodo/);
  }
});

test("concurrent identity requests create only one guest and nickname changes need no email", async () => {
  const { service, calls } = fixture();
  const [first, second] = await Promise.all([service.ensureIdentity(), service.ensureIdentity()]);
  assert.equal(first.nickname, "Invitado 1");
  assert.equal(second.user.id, first.user.id);
  assert.equal(calls.filter(call => call === "anonymous").length, 1);
  await service.saveNickname("Mi carro");
  assert.deepEqual(calls.at(-1), { name: "set_player_nickname", args: { new_nickname: "Mi carro" } });
});

test("email linking saves guest proof before sending and claims it before creating the account profile", async () => {
  const { service, calls, storage, setUser } = fixture();
  await service.requestLink("player@example.com", "Mi carro", "https://example.com/");
  assert.equal(storage.getItem("bachenora-guest-transfer"), "transfer-token");
  const prepared = calls.findIndex(call => call.name === "prepare_guest_transfer");
  assert.ok(prepared < calls.findIndex(call => call.email));
  setUser({ id: "existing-account", is_anonymous: false });
  calls.length = 0;
  const identity = await service.ensureIdentity();
  assert.equal(identity.synced, true);
  assert.equal(calls[0].name, "claim_guest_results");
  assert.equal(calls[1].name, "ensure_player_profile");
  assert.equal(storage.getItem("bachenora-guest-transfer"), null);
  await service.ensureIdentity();
  assert.equal(calls.filter(call => call.name === "claim_guest_results").length, 1);
});

test("failed synchronization keeps proof for a retry and does not claim success", async () => {
  const { service, client, storage } = fixture({ id: "account", is_anonymous: false });
  storage.setItem("bachenora-guest-transfer", "transfer-token");
  client.rpc = async () => ({ error: new Error("wrong verified email") });
  await assert.rejects(service.ensureIdentity(), /wrong verified email/);
  assert.equal(storage.getItem("bachenora-guest-transfer"), "transfer-token");
  service.discardTransfer();
  assert.equal(storage.getItem("bachenora-guest-transfer"), null);
});

test("linking does not send an email when the browser cannot preserve guest proof", async () => {
  const { service, storage, calls } = fixture();
  storage.setItem = () => { throw new Error("storage unavailable"); };
  await assert.rejects(service.requestLink("player@example.com", "Mi carro", "https://example.com/"), /storage unavailable/);
  assert.equal(calls.some(call => call.email), false);
});

test("auth and database failures are propagated and malformed rankings are rejected", async () => {
  const { service, client } = fixture();
  client.auth.signInAnonymously = async () => ({ error: new Error("Anonymous sign-ins are disabled") });
  await assert.rejects(service.startRun(), /disabled/);
  client.rpc = async () => ({ error: new Error("migration missing") });
  await assert.rejects(service.leaderboard(), /migration missing/);
  client.rpc = async () => ({ data: [{ nickname: "driver", meters: "123" }], error: null });
  await assert.rejects(service.leaderboard(), /formato valido/);
  client.rpc = async () => ({ data: [{ nickname: "driver", meters: 123 }], error: null });
  assert.deepEqual(await service.leaderboard(), [{ nickname: "driver", meters: 123 }]);
});
