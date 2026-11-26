import * as THREE from "three";

const busWheelGeometry = new THREE.CylinderGeometry(0.48, 0.48, 0.28, 12);
const glowGeometry = new THREE.CircleGeometry(1, 16);
const redMaterial = new THREE.MeshBasicMaterial({ color: "#ff2547", transparent: true, opacity: 0.7, depthWrite: false });
const blueMaterial = new THREE.MeshBasicMaterial({ color: "#3286ff", transparent: true, opacity: 0.7, depthWrite: false });

export function createBus(helpers, random = Math.random) {
  const color = ["#b82f50", "#ed702f", "#35b7b3"][Math.floor(random() * 3)];
  const bus = new THREE.Group();
  bus.userData.vehicleSize = { width: 2.35, depth: 7.5 };
  helpers.disk(bus, "#55564f", 0, 0.045, 0, 1.35, 4);
  helpers.box(bus, color, 0, 1.55, 0, 2.35, 2.6, 7.5);
  helpers.box(bus, "#f2efe8", 0, 2.97, 0, 2.38, 0.24, 7.55);
  helpers.box(bus, "#24373e", 0, 2.28, -3.77, 2.08, 1.12, 0.05);
  helpers.box(bus, "#24373e", 0, 2.3, 3.77, 1.8, 0.85, 0.05);
  helpers.box(bus, "#252c30", 0, 0.95, -3.79, 1.6, 0.36, 0.06);
  helpers.box(bus, "#e7e2d7", 0, 0.54, -3.8, 2.3, 0.2, 0.08);
  for (const side of [-1, 1]) {
    helpers.box(bus, "#f2efe8", side * 1.18, 1.25, 1, 0.035, 0.65, 4.7);
    for (let i = 0; i < 6; i++) {
      helpers.box(bus, "#24373e", side * 1.19, 2.35, -2.7 + i * 1.08, 0.04, 0.9, 0.93);
    }
    helpers.box(bus, "#fff3c3", side * 0.9, 1.06, -3.8, 0.3, 0.27, 0.05);
    helpers.box(bus, "#f65a42", side * 0.92, 1.06, 3.8, 0.26, 0.34, 0.05);
    helpers.box(bus, "#252c30", side * 1.4, 2.25, -3.1, 0.26, 0.45, 0.24);
    for (const z of [-2.55, 2.35]) {
      const wheel = new THREE.Mesh(busWheelGeometry, helpers.material("#262e30"));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.18, 0.48, z);
      bus.add(wheel);
      helpers.disk(bus, "#b0b7b5", side * 1.33, 0.48, z, 0.23, 0.23).rotation.set(0, side * Math.PI / 2, 0);
    }
  }
  helpers.box(bus, "#263b43", 1.2, 1.66, -2.55, 0.04, 2.1, 0.82);
  helpers.box(bus, "#dee7e6", 1.23, 1.65, -2.55, 0.04, 2.05, 0.04);
  return bus;
}

export function createPatrol(helpers, random = Math.random) {
  const body = random() < 0.5 ? "#eeeae3" : "#242c32";
  const patrol = helpers.createCar(body);
  helpers.box(patrol, body, 0, 0.85, 0, 2.12, 0.9, 4.2);
  helpers.box(patrol, body, 0, 1.58, 0.4, 1.9, 1.02, 2.6);
  helpers.box(patrol, "#243c50", 0, 1.62, -0.93, 1.7, 0.65, 0.05);
  helpers.box(patrol, "#243c50", 0, 1.65, 1.72, 1.7, 0.62, 0.05);
  helpers.box(patrol, "#152c50", 0, 0.92, 2.13, 2.1, 0.35, 0.04);
  helpers.box(patrol, "#252e33", 0, 0.7, -2.25, 1.75, 0.16, 0.2);
  for (const side of [-1, 1]) {
    helpers.box(patrol, "#152c50", side * 1.07, 1.03, 0.3, 0.035, 0.46, 3.55);
    helpers.box(patrol, "#243c50", side * 0.97, 1.65, 0.4, 0.04, 0.55, 2.05);
    helpers.box(patrol, "#29333b", side * 0.98, 2.17, 0.35, 0.09, 0.1, 2.8);
    helpers.box(patrol, "#fc5244", side * 0.88, 0.95, 2.14, 0.24, 0.45, 0.05);
    helpers.box(patrol, "#252e33", side * 0.7, 0.94, -2.25, 0.12, 0.68, 0.18);
  }
  helpers.box(patrol, "#27313b", 0, 2.22, 0, 1.8, 0.1, 0.4);
  const beacons = [];
  for (const red of [true, false]) {
    const color = red ? "#ff2547" : "#3286ff";
    const lamp = helpers.box(patrol, color, red ? -0.5 : 0.5, 2.34, 0, 0.8, 0.2, 0.4);
    lamp.material = red ? redMaterial : blueMaterial;
    lamp.userData.red = red;
    beacons.push(lamp);
    const glow = new THREE.Mesh(glowGeometry, lamp.material);
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(red ? -0.8 : 0.8, 0.065, -1.2);
    glow.scale.set(1.8, 3.8, 1);
    glow.userData.red = red;
    patrol.add(glow);
    beacons.push(glow);
  }
  patrol.userData.beacons = beacons;
  return patrol;
}
