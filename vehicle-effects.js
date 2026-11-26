import * as THREE from "three";

const smokeGeometry = new THREE.SphereGeometry(1, 6, 4);
const smokeMaterial = new THREE.MeshLambertMaterial({
  color: "#555c60", transparent: true, opacity: 0.55, depthWrite: false
});

export function createSmoke(car) {
  const smoke = new THREE.Group();
  smoke.position.set(0, 1.1, -1.2);
  smoke.userData.elapsed = 0;
  for (let i = 0; i < 8; i++) smoke.add(new THREE.Mesh(smokeGeometry, smokeMaterial));
  car.add(smoke);
  updateSmoke(smoke, 0);
  return smoke;
}

export function updateSmoke(smoke, dt) {
  smoke.userData.elapsed += dt;
  smoke.children.forEach((puff, index) => {
    const phase = (smoke.userData.elapsed * 0.45 + index / smoke.children.length) % 1;
    puff.position.set(Math.sin(phase * 5 + index) * phase * 0.5, phase * 3.5, phase * 0.7);
    puff.scale.setScalar(0.15 + phase * 0.65);
  });
}
