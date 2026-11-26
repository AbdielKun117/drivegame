import * as THREE from "three";
import { createSmoke, updateSmoke } from "./vehicle-effects.js";

export const MAX_SPEED = 42;
const START_SPEED = 23;
const EVENT_TRIGGER_SECONDS = 1.25;
const ACTIVATION_DELAY = 0.55;
const SURFACE_Y = 0.04;
const HAZARD_TYPES = ["pothole", "wide-pothole", "sinkhole", "manhole", "sewage", "car", "car", "closed-manhole", "stuck-car-dry"];
const RAIN_HAZARDS = ["puddle", "puddle", "puddle-hole", "flooded-sinkhole", "flooded-sinkhole", "sewage", "sewage", "stuck-car", "car", "closed-manhole"];
const DETAILS = {
  pothole: { width: 2.5, depth: 2.3, cause: "Caíste en un bache." },
  "wide-pothole": { width: 5.5, depth: 3.6, cause: "Caíste en un bache gigante." },
  sinkhole: { width: 5.5, depth: 4.6, cause: "Caíste en un socavón.", dynamic: true, triggerSeconds: 0.95, activationDelay: 0.25 },
  manhole: { width: 2.2, depth: 2.2, cause: "Caíste en una alcantarilla abierta.", dynamic: true },
  sewage: { width: 5.5, depth: 4.6, cause: "Entraste en el desbordamiento de aguas negras.", dynamic: true },
  car: { width: 1.85, depth: 3.3, cause: "Chocaste con otro carro." },
  "closed-manhole": { width: 2.2, depth: 2.2, passable: true },
  puddle: { width: 2.8, depth: 3.8, passable: true },
  "puddle-hole": { width: 2.8, depth: 3.8, cause: "Caíste en un bache escondido bajo un charco." },
  "flooded-sinkhole": { width: 5.5, depth: 4.6, cause: "Caíste en un socavón inundado.", dynamic: true, triggerSeconds: 0.95, activationDelay: 0.25 },
  "stuck-car": { width: 2.8, depth: 4.2, cause: "Chocaste con un carro atrapado en un charco." },
  "stuck-car-dry": { width: 2.8, depth: 4.2, cause: "Chocaste con un carro atrapado en un bache." },
  wreck: { width: 1.85, depth: 3.3, cause: "Chocaste con un carro accidentado." },
  overtaker: { cause: "Te chocó un carro que venía rebasando desde atrás." }
};
const coverGeometry = new THREE.CylinderGeometry(0.85, 0.85, 0.1, 16);
const dropletGeometry = new THREE.IcosahedronGeometry(0.12, 0);

export function chooseHazard(random = Math.random, raining = false, reservedLane = null) {
  const availableStarts = type => {
    const span = DETAILS[type].width > 3 ? 2 : 1;
    return Array.from({ length: 4 - span }, (_, lane) => lane).filter(lane =>
      DETAILS[type].passable || reservedLane === null || reservedLane < lane || reservedLane >= lane + span);
  };
  const candidates = (raining ? RAIN_HAZARDS : HAZARD_TYPES).filter(type => availableStarts(type).length);
  const type = candidates[Math.floor(random() * candidates.length)];
  const span = DETAILS[type].width > 3 ? 2 : 1;
  const starts = availableStarts(type);
  return { type, firstLane: starts[Math.floor(random() * starts.length)], span };
}

export function nextSpawnDelay(speed) {
  const progress = THREE.MathUtils.clamp((speed - START_SPEED) / (MAX_SPEED - START_SPEED), 0, 1);
  return 1.6 - progress * 0.9;
}

export function getRunSpeed(distance) {
  return START_SPEED + (MAX_SPEED - START_SPEED) * THREE.MathUtils.clamp(distance / 1400, 0, 1);
}

export function hazardCause(type) {
  if (!DETAILS[type]?.cause) throw new Error(`No hay causa de colisión para el obstáculo: ${type}`);
  return DETAILS[type].cause;
}

function jaggedSurface(parent, color, width, depth, y, helpers, geometries, random) {
  const shape = new THREE.Shape();
  const points = [];
  for (let i = 0; i < 18; i++) {
    const angle = i / 18 * Math.PI * 2;
    const radius = 0.78 + random() * 0.22;
    const x = Math.cos(angle) * width / 2 * radius;
    const z = Math.sin(angle) * depth / 2 * radius;
    points.push({ x, z });
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  }
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometries.push(geometry);
  const mesh = new THREE.Mesh(geometry, helpers.material(color));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  parent.add(mesh);
  return points;
}

function crater(width, depth, helpers, geometries, random) {
  const group = new THREE.Group();
  const points = jaggedSurface(group, "#997e60", width, depth, SURFACE_Y + 0.01, helpers, geometries, random);
  jaggedSurface(group, "#242925", width * 0.83, depth * 0.83, SURFACE_Y + 0.02, helpers, geometries, random);
  for (const point of points) {
    const rock = helpers.box(group, random() < 0.5 ? "#77746a" : "#ab9272",
      point.x * 0.93, 0.12 + random() * 0.1, point.z * 0.93,
      0.25 + random() * 0.3, 0.15 + random() * 0.22, 0.3 + random() * 0.25);
    rock.rotation.set(random() * 0.35, random() * Math.PI, random() * 0.3);
  }
  return group;
}

function cracks(parent, width, depth, helpers, random) {
  const group = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const x = (random() - 0.5) * width * 0.7;
    const z = (random() - 0.5) * depth * 0.7;
    const crack = helpers.box(group, "#292e2b", x, SURFACE_Y + 0.008, z, 0.06, 0.009, 0.6 + random());
    crack.rotation.y = random() * Math.PI;
    const branch = helpers.box(group, "#292e2b", x + 0.15, SURFACE_Y + 0.008, z, 0.045, 0.009, 0.55);
    branch.rotation.y = crack.rotation.y + 0.9;
  }
  parent.add(group);
  return group;
}

function pool(parent, width, depth, helpers, geometries, random, bubbling) {
  const water = new THREE.Group();
  jaggedSurface(water, "#506e79", width, depth, SURFACE_Y + 0.025, helpers, geometries, random);
  parent.add(water);
  if (!bubbling) return null;
  const bubbles = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const bubble = new THREE.Mesh(dropletGeometry, helpers.material("#b2c7ad"));
    bubble.userData.x = (random() - 0.5) * width * 0.6;
    bubble.userData.z = (random() - 0.5) * depth * 0.6;
    bubbles.add(bubble);
  }
  water.add(bubbles);
  return bubbles;
}

export function createRoadHazard(type, firstLane, helpers, random = Math.random) {
  const details = DETAILS[type];
  if (!details || ["car", "overtaker", "wreck"].includes(type)) throw new Error(`Obstáculo vial no válido: ${type}`);
  const span = details.width > 3 ? 2 : 1;
  if (!Number.isInteger(firstLane) || firstLane < 0 || firstLane + span > 3) {
    throw new Error(`Carriles no válidos: ${firstLane}, ${span}`);
  }
  const object = new THREE.Group();
  object.position.x = -3 + firstLane * 3 + (span - 1) * 1.5;
  const geometries = [];
  const hazard = {
    object, type, ...details, firstLane, span, active: !details.dynamic && !details.passable,
    triggerSeconds: details.triggerSeconds ?? EVENT_TRIGGER_SECONDS,
    activationDelay: details.activationDelay ?? ACTIVATION_DELAY,
    eventTime: null, elapsed: 0, geometries, effects: {}
  };

  if (["pothole", "wide-pothole", "sinkhole", "flooded-sinkhole"].includes(type)) {
    const hole = crater(details.width, details.depth, helpers, geometries, random);
    object.add(hole);
    if (type === "sinkhole" || type === "flooded-sinkhole") {
      hole.visible = false;
      hazard.effects.hole = hole;
      hazard.effects.cracks = cracks(object, details.width, details.depth, helpers, random);
      hazard.effects.cracks.visible = false;
      if (type === "flooded-sinkhole") {
        hazard.effects.bubbles = pool(hole, details.width * 0.72, details.depth * 0.72, helpers, geometries, random, true);
      }
    } else if (random() < 0.5) {
      jaggedSurface(hole, "#806c49", details.width * 0.65, details.depth * 0.62, SURFACE_Y + 0.025, helpers, geometries, random);
    }
  } else if (["puddle", "puddle-hole", "stuck-car", "stuck-car-dry"].includes(type)) {
    if (type === "stuck-car-dry") {
      object.add(crater(details.width, details.depth, helpers, geometries, random));
    } else {
      hazard.effects.bubbles = pool(object, details.width, details.depth, helpers, geometries, random, type === "puddle-hole");
    }
    if (type === "stuck-car" || type === "stuck-car-dry") {
      const car = helpers.createCar("#b1a38c");
      car.rotation.set(-0.08, 0.12, 0.08);
      car.position.y = type === "stuck-car-dry" ? -0.25 : -0.12;
      object.add(car);
      hazard.effects.smoke = createSmoke(car);
    }
  } else {
    helpers.disk(object, "#443f34", 0, SURFACE_Y + 0.01, 0, 1.02, 1.02);
    helpers.disk(object, "#1d2621", 0, SURFACE_Y + 0.02, 0, 0.8, 0.8);
    const hinge = new THREE.Group();
    hinge.position.set(0, SURFACE_Y + 0.08, -0.82);
    const cover = new THREE.Mesh(coverGeometry, helpers.material("#857957"));
    cover.position.z = 0.82;
    hinge.add(cover);
    for (let i = -2; i <= 2; i++) helpers.box(hinge, "#3c423a", i * 0.24, 0.057, 0.82, 0.08, 0.014, 1.05);
    object.add(hinge);
    hazard.effects.hinge = hinge;
    if (type === "sewage") {
      const water = new THREE.Group();
      jaggedSurface(water, "#4c5030", details.width, details.depth, SURFACE_Y + 0.025, helpers, geometries, random);
      const ripples = [];
      for (let i = 0; i < 5; i++) {
        const ripple = helpers.disk(water, "#7c7b45", (random() - 0.5) * 3.2, SURFACE_Y + 0.03, (random() - 0.5) * 2.6, 0.2, 0.12);
        ripples.push(ripple);
      }
      water.visible = false;
      object.add(water);
      hazard.effects.water = water;
      hazard.effects.ripples = ripples;
      const droplets = new THREE.Group();
      for (let i = 0; i < 8; i++) {
        const drop = new THREE.Mesh(dropletGeometry, helpers.material("#797b46"));
        droplets.add(drop);
      }
      droplets.visible = false;
      object.add(droplets);
      hazard.effects.droplets = droplets;
    }
  }
  return hazard;
}

export function updateRoadHazard(hazard, dt, speed, playerZ) {
  hazard.elapsed += dt;
  const untilContact = (playerZ - hazard.object.position.z - hazard.depth / 2 - 1.65) / speed;
  if (hazard.dynamic && hazard.eventTime === null && untilContact <= hazard.triggerSeconds) {
    hazard.eventTime = 0;
  }
  if (hazard.dynamic && hazard.eventTime !== null) {
    hazard.eventTime += dt;
    hazard.active = hazard.eventTime >= hazard.activationDelay;
    const progress = Math.min(1, Math.max(0, (hazard.eventTime - hazard.activationDelay) / 0.35));
    if (hazard.effects.hole) {
      hazard.effects.hole.visible = hazard.active;
      hazard.effects.hole.scale.set(0.15 + progress * 0.85, 1, 0.15 + progress * 0.85);
      hazard.effects.cracks.visible = true;
      hazard.effects.cracks.scale.setScalar(1 + Math.min(hazard.eventTime, hazard.activationDelay) * 0.2);
    }
    if (hazard.effects.hinge) {
      const shake = hazard.active ? 0 : Math.sin(hazard.eventTime * 45) * 0.16;
      hazard.effects.hinge.rotation.x = -progress * 1.8 + shake;
    }
    if (hazard.effects.water) {
      hazard.effects.water.visible = hazard.active;
      hazard.effects.water.scale.set(0.1 + progress * 0.9, 1, 0.1 + progress * 0.9);
      for (let i = 0; i < hazard.effects.ripples.length; i++) {
        hazard.effects.ripples[i].scale.set(0.15 + Math.sin(hazard.elapsed * 4 + i) * 0.05, 0.1, 1);
      }
      hazard.effects.droplets.visible = hazard.active;
      hazard.effects.droplets.children.forEach((drop, i) => {
        const phase = (hazard.elapsed * 1.8 + i / 8) % 1;
        const angle = i / 8 * Math.PI * 2;
        drop.position.set(Math.cos(angle) * phase * 0.8, 0.1 + Math.sin(phase * Math.PI) * 1.5, Math.sin(angle) * phase * 0.8);
      });
    }
  }
  if (hazard.effects.bubbles) {
    hazard.effects.bubbles.children.forEach((bubble, i) => {
      const phase = (hazard.elapsed * 1.4 + i / 8) % 1;
      bubble.position.set(bubble.userData.x, 0.09 + phase * 0.5, bubble.userData.z);
      bubble.scale.setScalar(0.5 + Math.sin(phase * Math.PI) * 1.1);
    });
  }
  if (hazard.effects.smoke) updateSmoke(hazard.effects.smoke, dt);
}

export function collidesWithHazard(hazard, playerX, playerZ) {
  return hazard.active &&
    Math.abs(playerX - hazard.object.position.x) < hazard.width / 2 + 0.7 &&
    Math.abs(playerZ - hazard.object.position.z) < hazard.depth / 2 + 1.4;
}

export function disposeRoadHazard(hazard) {
  for (const geometry of hazard.geometries ?? []) geometry.dispose();
}
