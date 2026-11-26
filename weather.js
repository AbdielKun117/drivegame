import * as THREE from "three";

export function createWeather(random = Math.random) {
  return { raining: false, remaining: 0, nextRoll: 10 + random() * 8, intensity: 0 };
}

export function updateWeather(weather, dt, runTime, random = Math.random) {
  let transition = null;
  if (weather.raining) {
    weather.remaining -= dt;
    if (weather.remaining <= 0) {
      weather.raining = false;
      weather.nextRoll = 15 + random() * 15;
      transition = "ended";
    }
  } else {
    weather.nextRoll -= dt;
    if (weather.nextRoll <= 0) {
      if (random() < 0.55) {
        weather.raining = true;
        weather.remaining = Math.min(32, 10 + runTime * 0.12);
        transition = "started";
      } else {
        weather.nextRoll = 5 + random() * 8;
      }
    }
  }
  const target = weather.raining ? 1 : 0;
  weather.intensity = THREE.MathUtils.clamp(weather.intensity + Math.sign(target - weather.intensity) * dt / 2, 0, 1);
  return transition;
}

export function createRainVisuals(scene) {
  const positions = new Float32Array(280 * 6);
  for (let i = 0; i < positions.length; i += 6) {
    positions[i] = (Math.random() - 0.5) * 35;
    positions[i + 1] = Math.random() * 24;
    positions[i + 2] = 15 - Math.random() * 110;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const rain = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: "#c9e4ed", transparent: true, opacity: 0, depthWrite: false
  }));
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);
  const clouds = new THREE.Group();
  const cloudGeometry = new THREE.SphereGeometry(1, 7, 5);
  const cloudMaterial = new THREE.MeshLambertMaterial({ color: "#687b87", transparent: true, opacity: 0 });
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Mesh(cloudGeometry, cloudMaterial);
    cloud.position.set((i % 5 - 2) * 12, 16 + i % 3 * 2, -40 - Math.floor(i / 5) * 30);
    cloud.scale.set(13, 3, 8);
    clouds.add(cloud);
  }
  clouds.visible = false;
  scene.add(clouds);
  return { rain, clouds, positions, cloudMaterial };
}

export function updateRainVisuals(visuals, intensity, dt, speed) {
  visuals.rain.visible = intensity > 0;
  visuals.clouds.visible = intensity > 0;
  visuals.rain.material.opacity = intensity * 0.65;
  visuals.cloudMaterial.opacity = intensity * 0.85;
  const positions = visuals.positions;
  for (let i = 0; i < positions.length; i += 6) {
    positions[i + 1] -= dt * 28;
    positions[i + 2] += dt * speed;
    if (positions[i + 1] < 0) positions[i + 1] += 24;
    if (positions[i + 2] > 16) positions[i + 2] -= 110;
    positions[i + 3] = positions[i] - 0.12;
    positions[i + 4] = positions[i + 1] + 0.8;
    positions[i + 5] = positions[i + 2];
  }
  visuals.rain.geometry.attributes.position.needsUpdate = true;
}
