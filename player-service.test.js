import test from "node:test";
import assert from "node:assert/strict";
import { PlayerService, validateNickname } from "./player-service.js";

function fixture(user = null) {
  const calls = [];
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
      return { data: name === "start_game_run" ? "run-id" : name === "finish_game_run" ? !user.is_anonymous : [], error: null };
    }
  };
  return { service: new PlayerService(client), client, calls, setUser: value => { user = value; } };
}

test("guests receive one persistent anonymous identity and each run has its own server registration", async () => {
  const { service, calls } = fixture();
  const first = await service.startRun();
  await service.startRun();
  assert.deepEqual(first, { id: "run-id", userId: "guest-id", guest: true });
  assert.equal(calls.filter(call => call === "anonymous").length, 1);
  assert.equal(calls.filter(call => call.name === "start_game_run").length, 2);
  assert.equal(await service.finishRun(first, 50.9, 2, "crash"), false);
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
  assert.deepEqual(calls[0], {
    email: "player@example.com",
    options: { emailRedirectTo: "https://example.com/game/", data: { nickname: "Bachenorero" } }
  });
  for (const nickname of ["ab", "x".repeat(21), "<img src=x>", "hola\nmundo"]) {
    assert.throws(() => validateNickname(nickname), /apodo/);
  }
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
