import * as THREE from "three";
import { getRunSpeed, chooseHazard, nextSpawnDelay, createRoadHazard, updateRoadHazard, collidesWithHazard, disposeRoadHazard, hazardCause } from "./road-hazards.js";
import { GameAudio } from "./audio.js";
import { createWeather, updateWeather, createRainVisuals, updateRainVisuals } from "./weather.js";
import { planOvertake, createOvertaker, updateOvertaker } from "./traffic-events.js";

const canvas = document.getElementById("game");
const scoreElement = document.getElementById("score");
const bestElement = document.getElementById("best");
const overlay = document.getElementById("overlay");
const kicker = document.getElementById("overlay-kicker");
const title = document.getElementById("overlay-title");
const message = document.getElementById("overlay-text");
const startButton = document.getElementById("start");
const mainMenu = document.getElementById("main-menu");
const playButton = document.getElementById("play");
const gameInterface = document.getElementById("game-interface");
const menuBest = document.getElementById("menu-best");
const controlHint = document.getElementById("control-hint");
const settingsStatus = document.getElementById("settings-status");
const settingInputs = {
  buttons: document.getElementById("setting-buttons"),
  music: document.getElementById("setting-music"),
  effects: document.getElementById("setting-effects")
};
const LANES = [-3, 0, 3];
const PLAYER_Z = 3;
const ROAD_SURFACE_Y = 0.04;
const BEST_KEY = "hermosillo-drive-best";
const SETTINGS_KEY = "bachenora-settings";
let settings = { buttons: true, music: true, effects: true };
try {
  const savedText = localStorage.getItem(SETTINGS_KEY);
  if (savedText !== null) {
    const saved = JSON.parse(savedText);
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new Error("Configuración guardada no válida.");
    const restored = { ...settings };
    for (const key of Object.keys(settings)) {
      if (typeof saved[key] !== "boolean") throw new Error(`Configuración no válida: ${key}`);
      restored[key] = saved[key];
    }
    settings = restored;
  }
} catch (error) {
  console.warn("No se pudo leer la configuración.", error);
  settingsStatus.textContent = "No se pudo recuperar la configuración guardada.";
  settingsStatus.hidden = false;
}
const audio = new GameAudio(error => {
  console.error("No se pudo reproducir el audio.", error);
  settingsStatus.textContent = "No se pudo iniciar el audio. Comprueba los permisos de sonido del navegador.";
  settingsStatus.hidden = false;
});

function applySettings() {
  document.body.classList.toggle("direction-buttons-hidden", !settings.buttons);
  audio.setSettings(settings);
  for (const [key, input] of Object.entries(settingInputs)) input.checked = settings[key];
}
applySettings();
for (const [key, input] of Object.entries(settingInputs)) {
  input.addEventListener("change", () => {
    settings[key] = input.checked;
    applySettings();
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.warn("No se pudo guardar la configuración.", error);
      settingsStatus.textContent = "Los cambios funcionan, pero no se pudieron guardar en este navegador.";
      settingsStatus.hidden = false;
    }
  });
}

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (error) {
  console.error("No se pudo iniciar WebGL.", error);
  kicker.textContent = "NO SE PUDO INICIAR";
  title.textContent = "3D no disponible";
  message.textContent = "Este navegador no pudo iniciar WebGL. Prueba otro navegador o activa la aceleración gráfica.";
  startButton.disabled = true;
  playButton.disabled = true;
  mainMenu.hidden = true;
  overlay.hidden = false;
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#f6c797");
scene.fog = new THREE.Fog("#f6c797", 42, 145);
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
camera.position.set(0, 7.5, 15);
camera.lookAt(0, 0.5, -12);
const ambientLight = new THREE.HemisphereLight("#fff5db", "#a77763", 2.2);
scene.add(ambientLight);
const sunlight = new THREE.DirectionalLight("#fff0d3", 2.5);
sunlight.position.set(-15, 30, 20);
scene.add(sunlight);
const rainVisuals = createRainVisuals(scene);
const drySky = new THREE.Color("#f6c797");
const rainySky = new THREE.Color("#6c7e8c");

const materials = new Map();
const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.24, 10);
const diskGeometry = new THREE.CircleGeometry(1, 12);

function material(color) {
  if (!materials.has(color)) materials.set(color, new THREE.MeshLambertMaterial({ color }));
  return materials.get(color);
}

function box(parent, color, x, y, z, width, height, depth) {
  const mesh = new THREE.Mesh(boxGeometry, material(color));
  mesh.position.set(x, y, z);
  mesh.scale.set(width, height, depth);
  parent.add(mesh);
  return mesh;
}

function disk(parent, color, x, y, z, width, depth) {
  const mesh = new THREE.Mesh(diskGeometry, material(color));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, y, z);
  mesh.scale.set(width, depth, 1);
  parent.add(mesh);
  return mesh;
}

function createCar(color) {
  const car = new THREE.Group();
  disk(car, "#55564f", 0, ROAD_SURFACE_Y + 0.005, 0, 1.05, 2);
  box(car, color, 0, 0.62, 0, 1.85, 0.65, 3.3);
  box(car, color, 0, 1.14, 0.15, 1.55, 0.55, 1.8);
  box(car, "#a9d8d3", 0, 1.18, 1.07, 1.35, 0.38, 0.04);
  box(car, "#a9d8d3", 0, 1.18, -0.77, 1.35, 0.38, 0.04);
  for (const side of [-1, 1]) {
    box(car, "#b8dcda", side * 0.79, 1.17, 0.1, 0.04, 0.35, 1.35);
    box(car, "#e65c42", side * 0.61, 0.64, 1.66, 0.4, 0.18, 0.05);
    box(car, "#fff0bc", side * 0.61, 0.64, -1.66, 0.4, 0.18, 0.05);
    for (const z of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeometry, material("#323b3a"));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 0.95, 0.36, z);
      car.add(wheel);
    }
  }
  return car;
}

function cactus(parent, x, z, size) {
  const plant = new THREE.Group();
  plant.position.set(x, 0, z);
  plant.scale.setScalar(size);
  box(plant, "#62845b", 0, 1, 0, 0.4, 2, 0.4);
  box(plant, "#62845b", -0.48, 1.1, 0, 0.65, 0.28, 0.3);
  box(plant, "#62845b", -0.75, 1.45, 0, 0.25, 0.8, 0.3);
  box(plant, "#62845b", 0.45, 0.8, 0, 0.6, 0.28, 0.3);
  box(plant, "#62845b", 0.7, 1.1, 0, 0.25, 0.7, 0.3);
  parent.add(plant);
}

const buildingColors = ["#f3d0a4", "#e7ae82", "#f0d7b4", "#dba38a", "#e9c199"];
function createBlock(index) {
  const group = new THREE.Group();
  for (const side of [-1, 1]) {
    const height = 3.4 + (index % 3) * 0.8;
    const x = side * 9.5;
    box(group, buildingColors[(index + (side === 1 ? 2 : 0)) % buildingColors.length], x, height / 2, 0, 5, height, 7);
    box(group, "#b97e5d", x, height + 0.12, 0, 5.3, 0.24, 7.3);
    for (const z of [-2, 1.4]) {
      box(group, "#8c6454", x - side * 2.52, height * 0.55, z, 0.05, 1.15, 1.2);
      box(group, "#efd5b2", x - side * 2.55, height * 0.35, z, 0.08, 0.12, 1.4);
    }
    box(group, "#8c6454", x, height * 0.55, 3.52, 1.2, 1.15, 0.05);
    cactus(group, side * 6.7, 5.3, 0.75);
    box(group, "#796f60", side * 5.7, 2.3, -5.2, 0.14, 4.6, 0.14);
    box(group, "#796f60", side * 5.45, 4.5, -5.2, 0.6, 0.12, 0.18);
    box(group, "#ffe4a0", side * 5.15, 4.43, -5.2, 0.22, 0.12, 0.25);
  }
  return group;
}

box(scene, "#d4a47b", 0, -0.2, -60, 120, 0.35, 260);
box(scene, "#696d67", 0, 0, -60, 9.4, ROAD_SURFACE_Y * 2, 260);
for (const side of [-1, 1]) {
  box(scene, "#e4c4a0", side * 5.2, 0.13, -60, 1, 0.25, 260);
  box(scene, "#ead9b9", side * 4.52, 0.05, -60, 0.12, 0.03, 260);
}

const movingScenery = [];
for (let i = 0; i < 10; i++) {
  const block = createBlock(i);
  block.position.z = 15 - i * 15;
  scene.add(block);
  movingScenery.push({ object: block, length: 150 });
}
for (let i = 0; i < 20; i++) {
  const lines = new THREE.Group();
  for (const x of [-1.5, 1.5]) box(lines, "#f5e8c9", x, 0.06, 0, 0.12, 0.03, 3.5);
  lines.position.z = 15 - i * 7.5;
  scene.add(lines);
  movingScenery.push({ object: lines, length: 150 });
}
for (let i = 0; i < 8; i++) {
  const mountain = new THREE.Mesh(
    new THREE.ConeGeometry(13 + i % 3 * 3, 17 + i % 3 * 4, 5),
    material(i % 2 ? "#cb8d75" : "#d99f80")
  );
  mountain.position.set((i - 3.5) * 17, 5, -115 - (i % 2) * 8);
  mountain.rotation.y = i;
  scene.add(mountain);
}

const player = createCar("#ed7848");
player.position.z = PLAYER_Z;
scene.add(player);

let best = 0;
try {
  best = Number(localStorage.getItem(BEST_KEY)) || 0;
} catch (error) {
  console.warn("No se pudo leer el récord guardado.", error);
}
bestElement.textContent = `${best} m`;
menuBest.textContent = `${best} m`;

let playing = false;
let lane = 1;
let obstacles = [];
let distance = 0;
let spawnTimer = 0;
let lastTime = null;
let touchStartX = null;
let controlHintTimer = null;
let runTime = 0;
let weather = createWeather();
let overtaker = null;
let overtakeTimer = 8;

function updateSky(dt, speed) {
  scene.background.copy(drySky).lerp(rainySky, weather.intensity);
  scene.fog.color.copy(scene.background);
  sunlight.intensity = 2.5 - weather.intensity * 1.6;
  ambientLight.intensity = 2.2 - weather.intensity * 0.6;
  updateRainVisuals(rainVisuals, weather.intensity, dt, speed);
}

function hideControlHint() {
  clearTimeout(controlHintTimer);
  controlHintTimer = null;
  controlHint.hidden = true;
}

function resize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

function move(direction) {
  if (playing) lane = Math.max(0, Math.min(LANES.length - 1, lane + direction));
}

function clearObstacles() {
  for (const obstacle of obstacles) {
    scene.remove(obstacle.object);
    disposeRoadHazard(obstacle);
  }
  obstacles = [];
  if (overtaker) scene.remove(overtaker.object);
  overtaker = null;
}

function start() {
  clearObstacles();
  hideControlHint();
  controlHint.hidden = false;
  controlHintTimer = setTimeout(hideControlHint, 3000);
  lane = 1;
  player.position.x = LANES[lane];
  player.rotation.z = 0;
  distance = 0;
  runTime = 0;
  weather = createWeather();
  overtakeTimer = 6 + Math.random() * 5;
  updateSky(0, 0);
  spawnTimer = 0.8;
  lastTime = null;
  scoreElement.textContent = "0 m";
  overlay.hidden = true;
  mainMenu.hidden = true;
  gameInterface.hidden = false;
  gameInterface.inert = false;
  playing = true;
  void audio.start();
  playButton.blur();
  startButton.blur();
}

function showMenu() {
  playing = false;
  audio.stop();
  hideControlHint();
  lastTime = null;
  touchStartX = null;
  clearObstacles();
  weather = createWeather();
  updateSky(0, 0);
  player.position.x = 0;
  player.rotation.z = 0;
  overlay.hidden = true;
  gameInterface.hidden = true;
  mainMenu.hidden = false;
  playButton.focus();
}

function finish(obstacleType) {
  playing = false;
  audio.stop();
  audio.effect("crash");
  hideControlHint();
  const score = Math.floor(distance);
  if (score > best) {
    best = score;
    bestElement.textContent = `${best} m`;
    menuBest.textContent = `${best} m`;
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch (error) {
      console.warn("No se pudo guardar el récord.", error);
    }
  }
  kicker.textContent = "FIN DEL RECORRIDO";
  title.textContent = "¡Chocaste!";
  const cause = hazardCause(obstacleType);
  message.textContent = `${cause} Recorriste ${score} metros. ¡Inténtalo de nuevo!`;
  startButton.firstChild.textContent = "Volver a jugar ";
  overlay.hidden = false;
  gameInterface.inert = true;
  startButton.focus();
}

function update(dt) {
  const speed = getRunSpeed(distance);
  runTime += dt;
  updateWeather(weather, dt, runTime);
  updateSky(dt, speed);
  audio.tick(dt, weather.raining);
  distance += speed * dt;
  scoreElement.textContent = `${Math.floor(distance)} m`;
  const deltaX = LANES[lane] - player.position.x;
  player.position.x += deltaX * Math.min(1, dt * 10);
  player.rotation.z = -deltaX * 0.045;
  for (const item of movingScenery) {
    item.object.position.z += speed * dt;
    if (item.object.position.z > 22) item.object.position.z -= item.length;
  }

  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    const reservedLane = overtaker && overtaker.object.position.z > PLAYER_Z - 4 ? overtaker.escapeLane : null;
    const { type, firstLane } = chooseHazard(Math.random, weather.raining, reservedLane);
    const colors = ["#7da9a2", "#dbbd8c", "#b98176", "#9397b1"];
    let obstacle;
    if (type === "car") {
      const object = createCar(colors[Math.floor(Math.random() * colors.length)]);
      object.position.x = LANES[firstLane];
      obstacle = { object, type, active: true, width: 1.85, depth: 3.3, elapsed: 0, effects: {} };
    } else {
      obstacle = createRoadHazard(type, firstLane, { box, disk, material, createCar });
    }
    obstacle.object.position.z = -90;
    scene.add(obstacle.object);
    obstacles.push(obstacle);
    spawnTimer = nextSpawnDelay(speed);
  }
  for (const obstacle of obstacles) {
    obstacle.object.position.z += speed * dt;
    const wasActive = obstacle.active;
    const wasForming = obstacle.eventTime !== null;
    updateRoadHazard(obstacle, dt, speed, PLAYER_Z);
    if (obstacle.dynamic && !wasForming && obstacle.eventTime !== null && obstacle.effects.hinge) audio.effect("rattle");
    if (obstacle.dynamic && !wasActive && obstacle.active) {
      audio.effect(obstacle.effects.hole ? "collapse" : obstacle.type === "sewage" ? "overflow" : "open");
    }
    const nearby = Math.abs(obstacle.object.position.z - PLAYER_Z) < 16;
    if (nearby && !obstacle.soundPlayed && ["pothole", "wide-pothole"].includes(obstacle.type)) {
      audio.effect("pothole");
      obstacle.soundPlayed = true;
    }
    if (obstacle.type === "puddle" && !obstacle.soundPlayed &&
        Math.abs(obstacle.object.position.x - player.position.x) < 1.5 && Math.abs(obstacle.object.position.z - PLAYER_Z) < 2) {
      audio.effect("splash");
      obstacle.soundPlayed = true;
    }
    if (collidesWithHazard(obstacle, player.position.x, PLAYER_Z)) {
      finish(obstacle.type);
      break;
    }
  }
  obstacles = obstacles.filter(obstacle => {
    // Rear traffic still needs to react to hazards the player has passed.
    if (obstacle.object.position.z <= 50) return true;
    scene.remove(obstacle.object);
    disposeRoadHazard(obstacle);
    return false;
  });
  if (!playing) return;
  overtakeTimer -= dt;
  if (!overtaker && overtakeTimer <= 0) {
    const plan = planOvertake(obstacles, PLAYER_Z, speed);
    if (plan) {
      overtaker = createOvertaker(createCar("#658eb0"), plan);
      scene.add(overtaker.object);
      audio.effect("horn");
      overtakeTimer = 8 + Math.random() * 8;
    } else {
      overtakeTimer = 0.5;
    }
  }
  if (overtaker) {
    const passed = updateOvertaker(overtaker, dt, PLAYER_Z, obstacles, speed, player.position.x);
    if (overtaker.crashed) {
      overtaker.type = "wreck";
      overtaker.elapsed = 0;
      obstacles.push(overtaker);
      if (collidesWithHazard(overtaker, player.position.x, PLAYER_Z)) finish("wreck");
      else audio.effect("crash");
      overtaker = null;
    } else if (collidesWithHazard(overtaker, player.position.x, PLAYER_Z)) {
      finish("overtaker");
    } else if (passed) {
      scene.remove(overtaker.object);
      overtaker = null;
    }
  }
}

function frame(time) {
  if (playing && lastTime !== null) update(Math.min((time - lastTime) / 1000, 0.05));
  lastTime = playing ? time : null;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

startButton.addEventListener("click", start);
playButton.addEventListener("click", start);
document.getElementById("back-menu").addEventListener("click", showMenu);
document.getElementById("result-menu").addEventListener("click", showMenu);
document.getElementById("left").addEventListener("click", () => move(-1));
document.getElementById("right").addEventListener("click", () => move(1));
document.addEventListener("keydown", event => {
  if (playing && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    event.preventDefault();
    if (!event.repeat) move(event.key === "ArrowLeft" ? -1 : 1);
  }
});
canvas.addEventListener("pointerdown", event => {
  touchStartX = event.clientX;
  canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener("pointerup", event => {
  if (touchStartX !== null) {
    const delta = event.clientX - touchStartX;
    if (Math.abs(delta) > 25) move(delta < 0 ? -1 : 1);
  }
  touchStartX = null;
});
canvas.addEventListener("pointercancel", () => { touchStartX = null; });
document.addEventListener("visibilitychange", () => {
  lastTime = null;
  void audio.setVisible(!document.hidden);
});
requestAnimationFrame(frame);
