import * as THREE from "three";
import { collidesWithHazard } from "./road-hazards.js";
import { createSmoke } from "./vehicle-effects.js";

const beamGeometry = new THREE.BufferGeometry();
beamGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
  -1.25, 0, -45, 1.25, 0, -45, 0, 0, 0
], 3));
beamGeometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2));
beamGeometry.computeVertexNormals();
const beamPixels = new Uint8Array(32 * 64 * 4);
for (let y = 0; y < 64; y++) {
  for (let x = 0; x < 32; x++) {
    const offset = (y * 32 + x) * 4;
    const reach = y / 63;
    const softness = Math.sin(x / 31 * Math.PI) ** 2 * Math.sqrt(reach) * Math.min((1 - reach) * 12, 1);
    beamPixels.set([255, 255, 255, Math.round(softness * 190)], offset);
  }
}
const beamTexture = new THREE.DataTexture(beamPixels, 32, 64);
beamTexture.magFilter = THREE.LinearFilter;
beamTexture.minFilter = THREE.LinearFilter;
beamTexture.needsUpdate = true;
const beamMaterial = new THREE.MeshBasicMaterial({
  color: "#fff3b3", map: beamTexture, transparent: true, opacity: 0.42,
  depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
});
const indicatorGeometry = new THREE.BoxGeometry(0.2, 0.16, 0.06);
const indicatorMaterial = new THREE.MeshBasicMaterial({ color: "#ffbd28" });

export function createTrafficVehicle(object, type = "car", random = Math.random) {
  const size = object.userData.vehicleSize ?? { width: 1.85, depth: 3.3 };
  const indicators = [];
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const lamp = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
      lamp.position.set(side * (size.width / 2 - 0.12), type === "bus" ? 1.15 : 0.76, end * (size.depth / 2 + 0.05));
      lamp.userData.side = side;
      lamp.visible = false;
      object.add(lamp);
      indicators.push(lamp);
    }
  }
  return {
    object, type, vehicleKind: type, ...size, active: true, elapsed: 0, effects: {}, indicators,
    maneuver: random() < (type === "bus" ? 0.6 : 0.35) ?
      { state: "waiting", elapsed: 0, targetLane: null, fromX: 0 } : null
  };
}

function laneChangeClear(vehicle, targetX, obstacles, reservedLane) {
  if (reservedLane !== null && targetX === -3 + reservedLane * 3) return false;
  const left = Math.min(targetX, vehicle.object.position.x) - vehicle.width / 2;
  const right = Math.max(targetX, vehicle.object.position.x) + vehicle.width / 2;
  return obstacles.every(obstacle => obstacle === vehicle || !visibleDanger(obstacle) ||
    Math.abs(obstacle.object.position.z - vehicle.object.position.z) > (vehicle.depth + obstacle.depth) / 2 + 12 ||
    obstacle.object.position.x + obstacle.width / 2 < left ||
    obstacle.object.position.x - obstacle.width / 2 > right);
}

export function updateLaneChange(vehicle, dt, playerX, playerZ, obstacles, reservedLane = null, approachSpeed = 23) {
  const maneuver = vehicle.maneuver;
  if (!maneuver || maneuver.state === "done") return;
  const gap = playerZ - vehicle.object.position.z;
  if (maneuver.state === "waiting") {
    const rear = vehicle.type === "overtaker";
    if (gap > (rear ? 30 : approachSpeed * 1.8 + vehicle.depth / 2)) {
      if (rear) maneuver.state = "done";
      return;
    }
    if (gap < (rear ? 10 : vehicle.depth / 2 + 3)) {
      if (!rear && gap >= 0) maneuver.state = "done";
      return;
    }
    const currentLane = Math.round((vehicle.object.position.x + 3) / 3);
    const playerLane = Math.max(0, Math.min(2, Math.round((playerX + 3) / 3)));
    if (currentLane === playerLane) {
      maneuver.state = "done";
      return;
    }
    maneuver.targetLane = currentLane + Math.sign(playerLane - currentLane);
    if (!laneChangeClear(vehicle, -3 + maneuver.targetLane * 3, obstacles, reservedLane)) {
      maneuver.state = "done";
      return;
    }
    maneuver.fromX = vehicle.object.position.x;
    maneuver.state = "warning";
  }
  maneuver.elapsed += dt;
  const targetX = -3 + maneuver.targetLane * 3;
  if (maneuver.state === "warning") {
    if (!laneChangeClear(vehicle, targetX, obstacles, reservedLane)) {
      maneuver.state = "done";
    } else if (maneuver.elapsed >= 1) {
      maneuver.state = "turning";
      maneuver.elapsed = 0;
    }
  } else if (maneuver.state === "turning") {
    const progress = Math.min(1, maneuver.elapsed / 0.85);
    vehicle.object.position.x = THREE.MathUtils.lerp(maneuver.fromX, targetX, progress);
    vehicle.object.rotation.z = (maneuver.fromX - targetX) * 0.035 * Math.sin(progress * Math.PI);
    if (progress === 1) {
      maneuver.state = "done";
      maneuver.completed = true;
      vehicle.targetLane = maneuver.targetLane;
    }
  }
  const side = Math.sign(targetX - maneuver.fromX);
  for (const lamp of vehicle.indicators) {
    lamp.visible = maneuver.state !== "done" && lamp.userData.side === side && Math.floor(maneuver.elapsed * 4) % 2 === 0;
  }
}

export function planOvertake(obstacles, playerZ, speed, random = Math.random) {
  const blocked = new Set();
  for (const obstacle of obstacles) {
    if (!obstacle.active && !obstacle.dynamic) continue;
    const entry = (playerZ - obstacle.object.position.z - obstacle.depth / 2 - 1.4) / speed;
    const exit = (playerZ - obstacle.object.position.z + obstacle.depth / 2 + 1.4) / speed;
    if (entry > 2.8 || exit < 1.4) continue;
    for (let lane = 0; lane < 3; lane++) {
      if (Math.abs(-3 + lane * 3 - obstacle.object.position.x) < obstacle.width / 2 + 0.7) blocked.add(lane);
    }
  }
  const free = [0, 1, 2].filter(lane => !blocked.has(lane));
  if (free.length < 2) return null;
  const lane = free[Math.floor(random() * free.length)];
  return { lane, escapeLane: free.find(candidate => candidate !== lane) };
}

export function createOvertaker(car, plan) {
  car.position.set(-3 + plan.lane * 3, 0, 44);
  const lights = new THREE.Group();
  for (const x of [-0.6, 0.6]) {
    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
    beam.position.set(x, 0.075, -1.7);
    lights.add(beam);
  }
  car.add(lights);
  const vehicle = createTrafficVehicle(car, car.userData.vehicleSize ? "bus" : "car");
  return { ...vehicle, lights, type: "overtaker", escapeLane: plan.escapeLane, targetLane: plan.lane, crashed: false };
}

function visibleDanger(obstacle) {
  return obstacle.active || (obstacle.dynamic && obstacle.eventTime !== null);
}

function chooseAvoidanceLane(car, threat, obstacles, closingSpeed, playerZ, playerX) {
  const time = Math.max(0, (car.object.position.z - threat.object.position.z - (threat.depth + car.depth) / 2) / closingSpeed);
  const candidates = [0, 1, 2].filter(lane => {
    const x = -3 + lane * 3;
    if (lane === car.targetLane) return false;
    if (lane === car.escapeLane && car.object.position.z > playerZ - 4) return false;
    if (playerX !== null && Math.abs(car.object.position.z - playerZ) < 10) {
      const left = Math.min(car.object.position.x, x);
      const right = Math.max(car.object.position.x, x);
      if (Math.abs(x - playerX) < 1.8 || (playerX > left + 0.8 && playerX < right - 0.8)) return false;
    }
    return obstacles.every(obstacle => {
      if (!visibleDanger(obstacle)) return true;
      const reach = (obstacle.depth + car.depth) / 2;
      const gapNow = car.object.position.z - obstacle.object.position.z;
      const gapThen = gapNow - closingSpeed * time;
      const onRoute = obstacle.object.position.x >= Math.min(x, car.object.position.x) - (obstacle.width + car.width) / 2 &&
        obstacle.object.position.x <= Math.max(x, car.object.position.x) + (obstacle.width + car.width) / 2;
      if (onRoute && Math.abs(gapNow) < reach + 4) return false;
      return Math.abs(gapThen) >= reach + closingSpeed * 0.15 ||
        Math.abs(x - obstacle.object.position.x) >= (obstacle.width + car.width) / 2;
    });
  });
  candidates.sort((a, b) => Math.abs(-3 + a * 3 - car.object.position.x) - Math.abs(-3 + b * 3 - car.object.position.x));
  return candidates[0] ?? null;
}

export function updateOvertaker(overtaker, dt, playerZ, obstacles = [], speed = 23, playerX = null, relativeSpeed = 18) {
  if (overtaker.crashed) return false;
  const targetX = -3 + overtaker.targetLane * 3;
  let threat = null;
  let contactTime = Infinity;
  const closingSpeed = speed + relativeSpeed;
  for (const obstacle of obstacles) {
    if (!visibleDanger(obstacle) || Math.abs(targetX - obstacle.object.position.x) >= (obstacle.width + overtaker.width) / 2) continue;
    const time = (overtaker.object.position.z - obstacle.object.position.z - (obstacle.depth + overtaker.depth) / 2) / closingSpeed;
    if (time >= 0 && time < contactTime) {
      threat = obstacle;
      contactTime = time;
    }
  }
  if (threat && contactTime <= 0.9 && contactTime > 0.3) {
    const lane = chooseAvoidanceLane(overtaker, threat, obstacles, closingSpeed, playerZ, playerX);
    if (lane !== null) {
      overtaker.targetLane = lane;
      if (overtaker.maneuver) overtaker.maneuver.state = "done";
      for (const lamp of overtaker.indicators) lamp.visible = false;
    }
  }
  const deltaX = -3 + overtaker.targetLane * 3 - overtaker.object.position.x;
  if (overtaker.maneuver?.state !== "turning") {
    overtaker.object.position.x += deltaX * Math.min(1, dt * 10);
    overtaker.object.rotation.z = -deltaX * 0.035;
  }
  overtaker.object.position.z -= dt * relativeSpeed;
  if (playerX !== null) updateLaneChange(overtaker, dt, playerX, playerZ, obstacles);
  overtaker.lights.visible = overtaker.object.position.z > playerZ - 4;
  if (obstacles.some(obstacle => collidesWithHazard(obstacle, overtaker.object.position.x, overtaker.object.position.z, overtaker))) {
    overtaker.crashed = true;
    if (overtaker.maneuver) {
      overtaker.maneuver.state = "done";
      overtaker.maneuver.completed = false;
    }
    overtaker.lights.visible = false;
    for (const lamp of overtaker.indicators) lamp.visible = false;
    overtaker.object.rotation.set(-0.12, 0, 0.1);
    overtaker.effects.smoke = createSmoke(overtaker.object);
  }
  return overtaker.object.position.z < -100;
}
