import * as THREE from "three";

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
  return { object: car, lights, type: "overtaker", active: true, width: 1.85, depth: 3.3, escapeLane: plan.escapeLane };
}

export function updateOvertaker(overtaker, dt, playerZ) {
  overtaker.object.position.z -= dt * 18;
  overtaker.lights.visible = overtaker.object.position.z > playerZ - 4;
  return overtaker.object.position.z < -100;
}
