import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createSignal, updateSignal, drivingSpeed, createPursuit, updatePursuit } from "./intersection-events.js";

const helpers = { box() {} };

test("signals approach in green, flash yellow, and boosting can beat a red crossing at every run speed", () => {
  for (const base of [23, 30, 42]) {
    const normal = createSignal(base, 3, helpers);
    assert.equal(normal.phase, "green");
    updateSignal(normal, normal.greenSeconds, base, 3);
    assert.equal(normal.phase, "yellow");
    const yellow = normal.lamps.find(entry => entry.phase === "yellow").lamp.material;
    updateSignal(normal, 0.25, base, 3);
    assert.notEqual(normal.lamps.find(entry => entry.phase === "yellow").lamp.material, yellow);
    let normalResult = null;
    while (!normal.passed) normalResult = updateSignal(normal, 0.01, base, 3);
    assert.equal(normalResult, "violation");
    assert.equal(updateSignal(normal, 1, base, 3), null);
    const boosted = createSignal(base, 3, helpers);
    let boostResult = null;
    while (!boosted.passed) boostResult = updateSignal(boosted, 0.01, drivingSpeed(base, true), 3);
    assert.equal(boostResult, "passed");
    assert.equal(boosted.object.visible, false);
  }
});

test("holding the accelerator boosts every run speed without a signal and releasing restores normal speed", () => {
  for (const base of [23, 30, 42]) {
    assert.equal(drivingSpeed(base, true), base * 1.5);
    assert.equal(drivingSpeed(base, false), base);
  }
});

test("crossings use the light at contact, not a later red in the same frame", () => {
  const safe = createSignal(23, 3, helpers);
  safe.elapsed = safe.redAt - 0.02;
  safe.object.position.z = 2.77;
  assert.equal(updateSignal(safe, 0.05, 23, 3), "passed");
  assert.equal(safe.phase, "red");
  const red = createSignal(23, 3, helpers);
  red.elapsed = red.redAt - 0.02;
  red.object.position.z = 2.31;
  assert.equal(updateSignal(red, 0.05, 23, 3), "violation");
  const boundary = createSignal(23, 3, helpers);
  boundary.elapsed = boundary.redAt;
  boundary.object.position.z = 2.9;
  assert.equal(updateSignal(boundary, 0.05, 23, 3), "violation");
});

test("a pursuit follows at a safe distance, alternates beacons, and stops following after ten seconds", () => {
  const car = new THREE.Group();
  car.userData.beacons = [true, false].map(red => ({ userData: { red }, visible: false }));
  const pursuit = createPursuit(car, 0, 3);
  updatePursuit(pursuit, 0.05, 3, 3);
  const first = car.userData.beacons[0].visible;
  updatePursuit(pursuit, 0.1, 3, 3);
  assert.notEqual(car.userData.beacons[0].visible, first);
  assert.ok(car.position.x > 0 && car.position.x < 3);
  assert.ok(car.position.z >= 8);
  updatePursuit(pursuit, 9.8, 3, 3);
  assert.ok(pursuit.remaining > 0);
  assert.equal(updatePursuit(pursuit, 0.05, 3, 3), true);
  assert.equal(pursuit.remaining, 0);
  assert.ok(car.position.z > 8);
});
