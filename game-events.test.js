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

function roadObstacle(x, z, width = 2.5, active = true) {
  const obstacle = { object: new THREE.Group(), active, width, depth: 2.3 };
  obstacle.object.position.set(x, 0, z);
  return obstacle;
}

test("a passing car changes lane early enough to avoid a visible obstacle", () => {
  const car = createOvertaker(new THREE.Group(), { lane: 1, escapeLane: 0 });
  car.object.position.z = -2;
  const obstacle = roadObstacle(0, -30);
  for (let i = 0; i < 80; i++) {
    obstacle.object.position.z += 23 / 60;
    updateOvertaker(car, 1 / 60, 3, [obstacle], 23, 0);
    assert.equal(car.crashed, false);
  }
  assert.notEqual(car.targetLane, 1);
  assert.ok(Math.abs(car.object.position.x) > 2.8);
  assert.ok(car.object.position.z < obstacle.object.position.z);
});

test("an obstacle that appears too close causes a stopped, smoking car", () => {
  const car = createOvertaker(new THREE.Group(), { lane: 1, escapeLane: 0 });
  car.object.position.z = 3;
  const obstacle = roadObstacle(0, -6);
  for (let i = 0; i < 20 && !car.crashed; i++) {
    obstacle.object.position.z += 23 / 60;
    updateOvertaker(car, 1 / 60, 3, [obstacle], 23, -3);
  }
  assert.equal(car.crashed, true);
  assert.equal(car.lights.visible, false);
  assert.ok(car.effects.smoke.visible);
  assert.ok(car.effects.smoke.children.length > 0);
  const stoppedZ = car.object.position.z;
  updateOvertaker(car, 1, 3, [obstacle], 23, -3);
  assert.equal(car.object.position.z, stoppedZ);
});

test("a car cannot evade into blocked lanes or the player's escape lane during a pass", () => {
  const car = createOvertaker(new THREE.Group(), { lane: 1, escapeLane: 0 });
  car.object.position.z = 3;
  const obstacles = [roadObstacle(0, -30), roadObstacle(3, -30)];
  for (let i = 0; i < 80 && !car.crashed; i++) {
    for (const obstacle of obstacles) obstacle.object.position.z += 23 / 60;
    updateOvertaker(car, 1 / 60, 3, obstacles, 23, -3);
  }
  assert.equal(car.crashed, true);
  assert.equal(car.targetLane, 1);
});

test("passing cars cross harmless puddles and closed lids without crashing", () => {
  const car = createOvertaker(new THREE.Group(), { lane: 1, escapeLane: 0 });
  car.object.position.z = 3;
  const harmless = roadObstacle(0, -6, 2.8, false);
  for (let i = 0; i < 30; i++) {
    harmless.object.position.z += 23 / 60;
    updateOvertaker(car, 1 / 60, 3, [harmless], 23, -3);
  }
  assert.equal(car.crashed, false);
  assert.equal(car.targetLane, 1);
});

test("a cover that suddenly opens beside a passing car can cause a crash", () => {
  const car = createOvertaker(new THREE.Group(), { lane: 1, escapeLane: 0 });
  car.object.position.z = 3;
  const obstacle = roadObstacle(0, -2, 2.2, false);
  obstacle.dynamic = true;
  obstacle.eventTime = null;
  updateOvertaker(car, 0.05, 3, [obstacle], 23, -3);
  assert.equal(car.crashed, false);
  assert.equal(car.targetLane, 1);
  obstacle.active = true;
  obstacle.eventTime = 0.6;
  updateOvertaker(car, 0.1, 3, [obstacle], 23, -3);
  assert.equal(car.crashed, true);
});
