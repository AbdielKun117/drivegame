import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createWeather, updateWeather } from "./weather.js";
import { planOvertake, createOvertaker, updateOvertaker } from "./traffic-events.js";
import { collidesWithHazard } from "./road-hazards.js";

test("rain starts probabilistically, lasts longer in long runs, and ends", () => {
  const early = createWeather(() => 0);
  assert.equal(updateWeather(early, 10, 10, () => 0.9), null);
  assert.equal(early.raining, false);
  early.nextRoll = 0;
  assert.equal(updateWeather(early, 0, 15, () => 0.2), "started");
  const late = createWeather(() => 0);
  late.nextRoll = 0;
  updateWeather(late, 0, 180, () => 0.2);
  assert.ok(late.remaining > early.remaining);
  assert.ok(late.remaining <= 32);
  updateWeather(early, 1, 16);
  assert.ok(early.intensity > 0);
  assert.equal(updateWeather(early, early.remaining, 40, () => 0.5), "ended");
  assert.equal(early.raining, false);
  updateWeather(early, 2, 42);
  assert.equal(early.intensity, 0);
  assert.ok(early.nextRoll > 0);
});

test("overtakes reserve a free escape lane and postpone impossible situations", () => {
  const obstacle = { object: new THREE.Group(), active: true, width: 2.5, depth: 2.3 };
  obstacle.object.position.set(-3, 0, 3 - 42 * 2.1);
  const plan = planOvertake([obstacle], 3, 42, () => 0);
  assert.deepEqual(plan, { lane: 1, escapeLane: 2 });
  obstacle.width = 5.5;
  obstacle.object.position.x = -1.5;
  assert.equal(planOvertake([obstacle], 3, 42), null);
  obstacle.active = false;
  assert.ok(planOvertake([obstacle], 3, 42));
});

test("a rear car illuminates its lane before reaching the player and moves forward", () => {
  const car = createOvertaker(new THREE.Group(), { lane: 1, escapeLane: 0 });
  car.object.updateMatrixWorld(true);
  const illuminated = new THREE.Box3().setFromObject(car.lights);
  assert.ok(illuminated.min.z < 3);
  assert.equal(car.lights.visible, true);
  let contactTime = null;
  for (let i = 1; i <= 60; i++) {
    updateOvertaker(car, 0.05, 3);
    assert.equal(collidesWithHazard(car, -3, 3), false);
    if (collidesWithHazard(car, 0, 3) && contactTime === null) contactTime = i * 0.05;
  }
  assert.ok(contactTime >= 2);
  assert.ok(car.object.position.z < 3);
  assert.equal(car.lights.visible, false);
  assert.equal(updateOvertaker(car, 10, 3), true);
});
