import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { MAX_SPEED, getRunSpeed, chooseHazard, nextSpawnDelay, createRoadHazard, updateRoadHazard, collidesWithHazard, disposeRoadHazard } from "./road-hazards.js";

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const diskGeometry = new THREE.CircleGeometry(1, 12);
const materials = new Map();
const helpers = {
  material(color) {
    if (!materials.has(color)) materials.set(color, new THREE.MeshLambertMaterial({ color }));
    return materials.get(color);
  },
  box(parent, color, x, y, z, width, height, depth) {
    const mesh = new THREE.Mesh(boxGeometry, helpers.material(color));
    mesh.position.set(x, y, z);
    mesh.scale.set(width, height, depth);
    parent.add(mesh);
    return mesh;
  },
  disk(parent, color, x, y, z, width, depth) {
    const mesh = new THREE.Mesh(diskGeometry, helpers.material(color));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.scale.set(width, depth, 1);
    parent.add(mesh);
    return mesh;
  },
  createCar(color) {
    const car = new THREE.Group();
    helpers.box(car, color, 0, 0.6, 0, 1.85, 0.65, 3.3);
    return car;
  }
};

test("random selection covers every hazard and always reserves a lane", () => {
  const types = new Set();
  for (let i = 0; i < 9; i++) {
    for (const laneRoll of [0, 0.5, 0.999]) {
      const rolls = [(i + 0.5) / 9, laneRoll];
      const hazard = chooseHazard(() => rolls.shift());
      types.add(hazard.type);
      assert.ok(hazard.span < 3);
      assert.ok(hazard.firstLane >= 0 && hazard.firstLane + hazard.span <= 3);
    }
  }
  assert.deepEqual([...types], ["pothole", "wide-pothole", "sinkhole", "manhole", "sewage", "car", "closed-manhole", "stuck-car-dry"]);
});

test("two-lane damage hits both occupied lanes but never the free lane", () => {
  for (const type of ["wide-pothole", "sinkhole", "sewage"]) {
    for (const firstLane of [0, 1]) {
      const hazard = createRoadHazard(type, firstLane, helpers, () => 0.5);
      hazard.active = true;
      hazard.object.position.z = 3;
      const collisions = [-3, 0, 3].map(x => collidesWithHazard(hazard, x, 3));
      assert.deepEqual(collisions, firstLane === 0 ? [true, true, false] : [false, true, true]);
      hazard.object.position.z = -20;
      assert.equal(collidesWithHazard(hazard, hazard.object.position.x, 3), false);
      disposeRoadHazard(hazard);
    }
  }
});

test("event animations precede activation and provide reaction time at maximum speed", () => {
  for (const type of ["sinkhole", "manhole", "sewage"]) {
    const hazard = createRoadHazard(type, 0, helpers, () => 0.5);
    hazard.object.position.z = -140;
    updateRoadHazard(hazard, 0.05, MAX_SPEED, 3);
    assert.equal(hazard.eventTime, null);
    assert.equal(hazard.active, false);
    hazard.object.position.z = 3 - hazard.depth / 2 - 1.65 - MAX_SPEED * (hazard.triggerSeconds - 0.01);
    updateRoadHazard(hazard, 0, MAX_SPEED, 3);
    assert.equal(hazard.eventTime, 0);
    assert.equal(hazard.active, false);
    updateRoadHazard(hazard, hazard.activationDelay - 0.01, MAX_SPEED, 3);
    assert.equal(hazard.active, false);
    updateRoadHazard(hazard, 0.02, MAX_SPEED, 3);
    assert.equal(hazard.active, true);
    assert.ok(hazard.triggerSeconds - hazard.eventTime > 0.65);
    updateRoadHazard(hazard, 0.4, MAX_SPEED, 3);
    if (type === "sinkhole") assert.equal(hazard.effects.hole.scale.x, 1);
    if (type === "manhole") assert.ok(hazard.effects.hinge.rotation.x < -1.5);
    if (type === "sewage") assert.equal(hazard.effects.water.scale.x, 1);
    hazard.object.position.z = 3;
    assert.equal(collidesWithHazard(hazard, hazard.object.position.x, 3), true);
    disposeRoadHazard(hazard);
  }
});

test("traffic stays collidable and hazards leave time to change lanes", () => {
  const car = { object: new THREE.Group(), active: true, width: 1.85, depth: 3.3, elapsed: 0, effects: {} };
  car.object.position.z = 3;
  updateRoadHazard(car, 0.1, MAX_SPEED, 3);
  assert.equal(collidesWithHazard(car, 0, 3), true);
  assert.equal(collidesWithHazard(car, 3, 3), false);
  for (const speed of [23, 30, MAX_SPEED]) {
    const gap = nextSpawnDelay(speed) * speed;
    const collisionLength = 4.6 + 2.8;
    assert.ok((gap - collisionLength) / MAX_SPEED >= 0.5);
  }
});

test("a run accelerates to a cap and progressively spawns substantially more objects", () => {
  let distance = 0;
  let timer = 0.8;
  let previousSpeed = getRunSpeed(0);
  let firstSpawns = 0;
  let lastSpawns = 0;
  for (let tick = 0; tick < 1500; tick++) {
    const time = tick * 0.05;
    const speed = getRunSpeed(distance);
    assert.ok(speed >= previousSpeed && speed <= MAX_SPEED);
    distance += speed * 0.05;
    timer -= 0.05;
    if (timer <= 0) {
      if (time < 15) firstSpawns++;
      if (time >= 60) lastSpawns++;
      timer = nextSpawnDelay(speed);
    }
    previousSpeed = speed;
  }
  assert.ok(firstSpawns >= 9, `Too few initial objects: ${firstSpawns}`);
  assert.ok(lastSpawns >= 17, `Too few late objects: ${lastSpawns}`);
  assert.ok(lastSpawns >= firstSpawns + 5);
  assert.ok(nextSpawnDelay(previousSpeed) * previousSpeed < nextSpawnDelay(getRunSpeed(0)) * getRunSpeed(0),
    "Late objects should also be physically closer together");
  assert.equal(getRunSpeed(distance + 10000), previousSpeed);
});

test("sinkholes remain unformed until less than a second before contact", () => {
  const hazard = createRoadHazard("sinkhole", 1, helpers, () => 0.5);
  hazard.object.position.z = 3 - hazard.depth / 2 - 1.65 - MAX_SPEED * 1.2;
  updateRoadHazard(hazard, 0.05, MAX_SPEED, 3);
  assert.equal(hazard.effects.cracks.visible, false);
  assert.equal(hazard.effects.hole.visible, false);
  hazard.object.position.z = 3 - hazard.depth / 2 - 1.65 - MAX_SPEED * 0.9;
  updateRoadHazard(hazard, 0.05, MAX_SPEED, 3);
  assert.equal(hazard.effects.cracks.visible, true);
  updateRoadHazard(hazard, 0.3, MAX_SPEED, 3);
  assert.equal(hazard.effects.hole.visible, true);
  disposeRoadHazard(hazard);
});

test("quiet manholes are passable while dangerous lids shake only when close", () => {
  const safe = createRoadHazard("closed-manhole", 1, helpers, () => 0.5);
  const dangers = ["manhole", "sewage"].map(type => createRoadHazard(type, 1, helpers, () => 0.5));
  for (const hazard of dangers) {
    hazard.object.position.z = -90;
    updateRoadHazard(hazard, 0.05, MAX_SPEED, 3);
    assert.equal(hazard.effects.hinge.rotation.x, 0);
    assert.equal(hazard.active, false);
    hazard.object.position.z = 3 - hazard.depth / 2 - 1.65 - MAX_SPEED * 1.2;
    updateRoadHazard(hazard, 0.05, MAX_SPEED, 3);
    assert.notEqual(hazard.effects.hinge.rotation.x, 0);
    assert.equal(hazard.active, false);
    updateRoadHazard(hazard, 0.6, MAX_SPEED, 3);
    assert.equal(hazard.active, true);
    hazard.object.position.z = 3;
    assert.equal(collidesWithHazard(hazard, 0, 3), true);
    disposeRoadHazard(hazard);
  }
  for (let tick = 0; tick < 80; tick++) {
    safe.object.position.z = -90 + tick * 1.5;
    updateRoadHazard(safe, 0.05, MAX_SPEED, 3);
    assert.equal(safe.effects.hinge.rotation.x, 0);
    assert.equal(collidesWithHazard(safe, 0, 3), false);
  }
  disposeRoadHazard(safe);
});

test("a driver reacting to the road animation can cross both lanes before a collapse", () => {
  const hazard = createRoadHazard("sinkhole", 0, helpers, () => 0.5);
  hazard.object.position.z = -120;
  let playerX = -3;
  let reacted = false;
  for (let i = 0; i < 200; i++) {
    const dt = 1 / 60;
    hazard.object.position.z += MAX_SPEED * dt;
    updateRoadHazard(hazard, dt, MAX_SPEED, 3);
    if (hazard.eventTime !== null) reacted = true;
    if (reacted) playerX += (3 - playerX) * dt * 10;
    assert.equal(collidesWithHazard(hazard, playerX, 3), false);
  }
  assert.equal(reacted, true);
  assert.ok(hazard.object.position.z > 3);
  disposeRoadHazard(hazard);
});

test("damaged surfaces remain above asphalt and private geometries are disposed", () => {
  for (const type of ["pothole", "wide-pothole", "sinkhole", "manhole", "sewage", "closed-manhole"]) {
    const hazard = createRoadHazard(type, 0, helpers, () => 0.5);
    hazard.object.position.z = 0;
    updateRoadHazard(hazard, 1.1, MAX_SPEED, 3);
    const scene = new THREE.Scene();
    helpers.box(scene, "#696d67", 0, 0, 0, 10, 0.08, 10);
    scene.add(hazard.object);
    scene.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(hazard.object.position.x, 10, 0), new THREE.Vector3(0, -1, 0));
    const visibleHits = ray.intersectObjects(scene.children, true).filter(hit => {
      for (let node = hit.object; node; node = node.parent) if (!node.visible) return false;
      return true;
    });

    assert.ok(visibleHits[0].point.y > 0.04, `${type} must not be hidden by asphalt`);
    let disposed = 0;
    for (const geometry of hazard.geometries) geometry.addEventListener("dispose", () => disposed++);
    disposeRoadHazard(hazard);
    assert.equal(disposed, hazard.geometries.length);
  }
});

test("rain introduces passable puddles, hidden holes and flooded obstacles", () => {
  const dry = new Set();
  const wet = new Set();
  for (let i = 0; i < 100; i++) {
    const roll = (i + 0.5) / 100;
    dry.add(chooseHazard(() => roll, false).type);
    wet.add(chooseHazard(() => roll, true).type);
  }
  for (const type of ["puddle", "puddle-hole", "flooded-sinkhole", "stuck-car"]) {
    assert.equal(dry.has(type), false);
    assert.equal(wet.has(type), true);
  }
  const safe = createRoadHazard("puddle", 1, helpers, () => 0.5);
  const hidden = createRoadHazard("puddle-hole", 1, helpers, () => 0.5);
  const stuck = createRoadHazard("stuck-car", 1, helpers, () => 0.5);
  for (const hazard of [safe, hidden, stuck]) {
    hazard.object.position.z = 3;
    updateRoadHazard(hazard, 0.2, MAX_SPEED, 3);
  }
  assert.equal(collidesWithHazard(safe, 0, 3), false);
  assert.equal(safe.effects.bubbles, null);
  assert.equal(collidesWithHazard(hidden, 0, 3), true);
  assert.ok(hidden.effects.bubbles.children.every(bubble => bubble.position.y > 0.09));
  assert.equal(collidesWithHazard(stuck, 0, 3), true);
  for (const hazard of [safe, hidden, stuck]) disposeRoadHazard(hazard);
});

test("spawning preserves the escape lane during an overtake in dry and wet weather", () => {
  for (const raining of [false, true]) {
    for (const reservedLane of [0, 1, 2]) {
      for (let i = 0; i < 100; i++) {
        const selected = chooseHazard(() => (i + 0.5) / 100, raining, reservedLane);
        if (["puddle", "closed-manhole"].includes(selected.type)) continue;
        assert.ok(reservedLane < selected.firstLane || reservedLane >= selected.firstLane + selected.span);
      }
    }
  }
});

test("dry weather can produce a smoking car trapped in a pothole", () => {
  const selected = chooseHazard(() => 0.99, false);
  assert.equal(selected.type, "stuck-car-dry");
  const hazard = createRoadHazard(selected.type, selected.firstLane, helpers, () => 0.5);
  hazard.object.position.z = 3;
  const smokeBefore = hazard.effects.smoke.children[0].position.y;
  updateRoadHazard(hazard, 0.5, MAX_SPEED, 3);
  assert.notEqual(hazard.effects.smoke.children[0].position.y, smokeBefore);
  assert.equal(collidesWithHazard(hazard, hazard.object.position.x, 3), true);
  disposeRoadHazard(hazard);
});
