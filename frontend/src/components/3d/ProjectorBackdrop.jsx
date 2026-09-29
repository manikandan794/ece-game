import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function ProjectorBackdrop({ urgency = false, isPaused = false }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a1128, 0.04);

    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 14);

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(1);
    container.appendChild(renderer.domElement);

    // Deep-Navy Grid Floor
    const gridHelper = new THREE.GridHelper(50, 50, 0x00f0ff, 0x122448);
    gridHelper.position.y = -5;
    gridHelper.rotation.x = 0.18;
    scene.add(gridHelper);

    // Floating 3D Circuit Conduits
    const conduitGroup = new THREE.Group();
    scene.add(conduitGroup);

    const boxGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const boxMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.25 });

    for (let i = 0; i < 8; i++) {
      const b = new THREE.Mesh(boxGeo, boxMat);
      b.position.set((Math.random() - 0.5) * 24, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 10);
      conduitGroup.add(b);
    }

    // Floating Atmospheric Particles
    const count = 160;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 36;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 24;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 18;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.14,
      color: urgency ? 0xff0055 : 0x00f0ff,
      transparent: true,
      opacity: 0.65
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    let animId;
    let clock = new THREE.Clock();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      if (!isPaused) {
        gridHelper.position.z = (t * 1.8) % 2;
        points.rotation.y = t * 0.025;
        conduitGroup.rotation.y = t * 0.04;
        conduitGroup.rotation.x = Math.sin(t * 0.02) * 0.1;
      }

      // Dynamic color shift on urgency
      if (urgency) {
        mat.color.setHex(0xff0055);
        boxMat.color.setHex(0xff0055);
      } else {
        mat.color.setHex(0x00f0ff);
        boxMat.color.setHex(0x00f0ff);
      }

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [urgency, isPaused]);

  return (
    <div ref={containerRef} className="absolute inset-0 w-full h-full pointer-events-none opacity-50 z-0" />
  );
}
