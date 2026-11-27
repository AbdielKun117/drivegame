import * as THREE from "three";

const lensGeometry = new THREE.CircleGeometry(0.24, 16);
const lampMaterials = {
  green: new THREE.MeshBasicMaterial({ color: "#45ff79" }),
  yellow: new THREE.MeshBasicMaterial({ color: "#ffd23c" }),
  red: new THREE.MeshBasicMaterial({ color: "#ff3548" }),
  off: new THREE.MeshBasicMaterial({ color: "#242c29" })
};

export function createSignal(speed, playerZ, helpers) {
  const object = new THREE.Group();
  object.position.z = -120;
  helpers.box(object, "#525d60", 5.6, 3.3, 0, 0.2, 6.6, 0.2);
  helpers.box(object, "#525d60", 0.5, 6.5, 0, 10.4, 0.18, 0.18);
  helpers.box(object, "#fff6df", 0, 0.055, 0, 9, 0.025, 0.35);
  const lamps = [];
  for (const x of [-3, 0, 3]) {
    helpers.box(object, "#20282b", x, 5.9, 0.1, 0.72, 1.85, 0.38);
    for (const [index, phase] of ["red", "yellow", "green"].entries()) {
      const lamp = new THREE.Mesh(lensGeometry, lampMaterials.off);
      lamp.position.set(x, 6.45 - index * 0.55, 0.31);
      object.add(lamp);
      lamps.push({ lamp, phase });
    }
  }
  const greenSeconds = (playerZ - object.position.z - 48) / speed;
  const signal = {
    object, lamps, elapsed: 0, greenSeconds, redAt: greenSeconds + 48 / speed * 0.82,
    phase: "green", passed: false
  };
  paintSignal(signal);
  return signal;
}

function phaseAt(signal, elapsed) {
  if (elapsed >= signal.redAt) return "red";
  return elapsed >= signal.greenSeconds ? "yellow" : "green";
}

function paintSignal(signal) {
  const lit = signal.phase !== "yellow" || Math.floor(signal.elapsed * 4) % 2 === 0;
  for (const { lamp, phase } of signal.lamps) {
    lamp.material = phase === signal.phase && lit ? lampMaterials[phase] : lampMaterials.off;
  }
}

export function drivingSpeed(baseSpeed, held) {
  return baseSpeed * (held ? 1.5 : 1);
}

export function updateSignal(signal, dt, speed, playerZ) {
  const previousZ = signal.object.position.z;
  const previousTime = signal.elapsed;
  signal.elapsed += dt;
  signal.object.position.z += speed * dt;
  signal.phase = phaseAt(signal, signal.elapsed);
  paintSignal(signal);
  if (!signal.passed && previousZ < playerZ && signal.object.position.z >= playerZ) {
    const crossingTime = previousTime + (playerZ - previousZ) / speed;
    signal.passed = true;
    signal.object.visible = false;
    return phaseAt(signal, crossingTime) === "red" ? "violation" : "passed";
  }
  return null;
}

export function createPursuit(object, playerX, playerZ) {
  object.position.set(playerX, 0, playerZ + 12);
  return { object, remaining: 10, elapsed: 0 };
}

export function updatePursuit(pursuit, dt, playerX, playerZ) {
  pursuit.elapsed += dt;
  pursuit.remaining = Math.max(0, 10 - pursuit.elapsed);
  pursuit.object.position.x += (playerX - pursuit.object.position.x) * Math.min(1, dt * 3);
  const targetZ = playerZ + (pursuit.remaining > 0 ? 5 : 22);
  pursuit.object.position.z += (targetZ - pursuit.object.position.z) * Math.min(1, dt * 3);
  const red = Math.floor(pursuit.elapsed * 10) % 2 === 0;
  for (const lamp of pursuit.object.userData.beacons) {
    lamp.visible = lamp.userData.red === red;
  }
  return pursuit.remaining === 0;
}
