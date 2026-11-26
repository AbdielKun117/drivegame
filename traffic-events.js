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
  return {
    object: car, lights, type: "overtaker", active: true, width: 1.85, depth: 3.3,
    escapeLane: plan.escapeLane, targetLane: plan.lane, crashed: false, effects: {}
  };
}

function visibleDanger(obstacle) {
  return obstacle.active || (obstacle.dynamic && obstacle.eventTime !== null);
}

function chooseAvoidanceLane(car, threat, obstacles, speed, playerZ, playerX) {
  const time = Math.max(0, (car.object.position.z - threat.object.position.z - threat.depth / 2 - 1.65) / (speed + 18));
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
      const reach = obstacle.depth / 2 + 1.65;
      const gapNow = car.object.position.z - obstacle.object.position.z;
      const gapThen = gapNow - (speed + 18) * time;
      const onRoute = obstacle.object.position.x >= Math.min(x, car.object.position.x) - obstacle.width / 2 - 0.7 &&
        obstacle.object.position.x <= Math.max(x, car.object.position.x) + obstacle.width / 2 + 0.7;
      if (onRoute && Math.abs(gapNow) < reach + 4) return false;
      return Math.abs(gapThen) >= reach + (speed + 18) * 0.15 ||
        Math.abs(x - obstacle.object.position.x) >= obstacle.width / 2 + 0.7;
    });
  });
  candidates.sort((a, b) => Math.abs(-3 + a * 3 - car.object.position.x) - Math.abs(-3 + b * 3 - car.object.position.x));
  return candidates[0] ?? null;
}

export function updateOvertaker(overtaker, dt, playerZ, obstacles = [], speed = 23, playerX = null) {
  if (overtaker.crashed) return false;
  const targetX = -3 + overtaker.targetLane * 3;
  let threat = null;
  let contactTime = Infinity;
  for (const obstacle of obstacles) {
    if (!visibleDanger(obstacle) || Math.abs(targetX - obstacle.object.position.x) >= obstacle.width / 2 + 0.7) continue;
    const time = (overtaker.object.position.z - obstacle.object.position.z - obstacle.depth / 2 - 1.65) / (speed + 18);
    if (time >= 0 && time < contactTime) {
      threat = obstacle;
      contactTime = time;
    }
  }
  if (threat && contactTime <= 0.9 && contactTime > 0.3) {
    const lane = chooseAvoidanceLane(overtaker, threat, obstacles, speed, playerZ, playerX);
    if (lane !== null) overtaker.targetLane = lane;
  }
  const deltaX = -3 + overtaker.targetLane * 3 - overtaker.object.position.x;
  overtaker.object.position.x += deltaX * Math.min(1, dt * 10);
  overtaker.object.rotation.z = -deltaX * 0.035;
  overtaker.object.position.z -= dt * 18;
  overtaker.lights.visible = overtaker.object.position.z > playerZ - 4;
  if (obstacles.some(obstacle => collidesWithHazard(obstacle, overtaker.object.position.x, overtaker.object.position.z))) {
    overtaker.crashed = true;
    overtaker.lights.visible = false;
    overtaker.object.rotation.set(-0.12, 0, 0.1);
    overtaker.effects.smoke = createSmoke(overtaker.object);
  }
  return overtaker.object.position.z < -100;
}
