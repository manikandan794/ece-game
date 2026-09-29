import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function CircuitBoardScene({ isGlitching = false }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene & Deep Navy Cyber Fog
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a1128, 0.038);

    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 5.5, 8.5);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Balanced Lighting for Deep-Navy Atmosphere
    const ambientLight = new THREE.AmbientLight(0x22365a, 2.8);
    scene.add(ambientLight);

    const cyanSpot = new THREE.PointLight(0x00f0ff, 4.5, 20);
    cyanSpot.position.set(0, 5, 2);
    scene.add(cyanSpot);

    const pinkSpot = new THREE.PointLight(0xff0055, 3.5, 20);
    pinkSpot.position.set(5, 3, -3);
    scene.add(pinkSpot);

    const amberSpot = new THREE.PointLight(0xffaa00, 2.5, 15);
    amberSpot.position.set(-5, 2, -2);
    scene.add(amberSpot);

    const pcbGroup = new THREE.Group();
    scene.add(pcbGroup);

    // 1. Multi-Layer PCB Substrate (Deep Navy Matte Finish)
    const pcbGeo = new THREE.BoxGeometry(15, 0.35, 11);
    const pcbMat = new THREE.MeshStandardMaterial({
      color: 0x0c1b33,
      roughness: 0.25,
      metalness: 0.5
    });
    const pcb = new THREE.Mesh(pcbGeo, pcbMat);
    pcb.position.y = -0.175;
    pcbGroup.add(pcb);

    // PCB Gold Trim Border
    const borderGeo = new THREE.BoxGeometry(15.1, 0.36, 11.1);
    const borderEdges = new THREE.EdgesGeometry(borderGeo);
    const borderLine = new THREE.LineSegments(borderEdges, new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.5 }));
    borderLine.position.y = -0.175;
    pcbGroup.add(borderLine);

    // 2. Copper Traces (Luminous Multi-Path Lines)
    const traceMaterial = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      linewidth: 2,
      transparent: true,
      opacity: 0.8
    });

    const tracePointsList = [
      [new THREE.Vector3(-6, 0.05, -4), new THREE.Vector3(-3, 0.05, -4), new THREE.Vector3(-1.5, 0.05, -1.5), new THREE.Vector3(0, 0.05, 0)],
      [new THREE.Vector3(6, 0.05, 4), new THREE.Vector3(3, 0.05, 4), new THREE.Vector3(1.5, 0.05, 1.5), new THREE.Vector3(0, 0.05, 0)],
      [new THREE.Vector3(-5, 0.05, 3), new THREE.Vector3(-2.5, 0.05, 3), new THREE.Vector3(-1.5, 0.05, 0.8), new THREE.Vector3(0, 0.05, 0)],
      [new THREE.Vector3(5, 0.05, -3), new THREE.Vector3(2.5, 0.05, -3), new THREE.Vector3(1.5, 0.05, -0.8), new THREE.Vector3(0, 0.05, 0)],
      [new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0, 0.05, 3.5), new THREE.Vector3(4, 0.05, 4.5)],
      [new THREE.Vector3(-4, 0.05, -1), new THREE.Vector3(-4, 0.05, 3.5), new THREE.Vector3(-6, 0.05, 3.5)],
      [new THREE.Vector3(0, 0.05, -1), new THREE.Vector3(3, 0.05, -1), new THREE.Vector3(4.5, 0.05, -3.5)]
    ];

    tracePointsList.forEach(pts => {
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, traceMaterial);
      pcbGroup.add(line);
    });

    // 3. Central Dual-In-Line Microchip (IC Chip)
    const icGroup = new THREE.Group();
    const chipGeo = new THREE.BoxGeometry(2.8, 0.5, 1.8);
    const chipMat = new THREE.MeshStandardMaterial({
      color: 0x141a29,
      roughness: 0.15,
      metalness: 0.85
    });
    const chip = new THREE.Mesh(chipGeo, chipMat);
    chip.position.y = 0.25;
    icGroup.add(chip);

    // IC Silver Connector Pins
    const pinGeo = new THREE.BoxGeometry(0.16, 0.2, 0.35);
    const pinMat = new THREE.MeshStandardMaterial({ color: 0xdde5ed, metalness: 0.95, roughness: 0.1 });
    for (let i = -1.1; i <= 1.1; i += 0.38) {
      const pinL = new THREE.Mesh(pinGeo, pinMat);
      pinL.position.set(i, 0.1, 1.05);
      icGroup.add(pinL);

      const pinR = new THREE.Mesh(pinGeo, pinMat);
      pinR.position.set(i, 0.1, -1.05);
      icGroup.add(pinR);
    }
    pcbGroup.add(icGroup);

    // 4. Cylindrical Capacitors (Electrolytic)
    const capGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.3, 24);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x0055aa, metalness: 0.6, roughness: 0.3 });
    const capTopGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.06, 24);
    const capTopMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.1 });

    const createCapacitor = (x, z) => {
      const capG = new THREE.Group();
      const body = new THREE.Mesh(capGeo, capMat);
      body.position.y = 0.65;
      const top = new THREE.Mesh(capTopGeo, capTopMat);
      top.position.y = 1.32;
      capG.add(body);
      capG.add(top);
      capG.position.set(x, 0, z);
      return capG;
    };

    pcbGroup.add(createCapacitor(-4, -2.5));
    pcbGroup.add(createCapacitor(-5.2, -1.8));
    pcbGroup.add(createCapacitor(4, 2.5));
    pcbGroup.add(createCapacitor(5.2, 1.8));

    // 5. Ceramic Resistors (Color-Banded Cylinders)
    const resGeo = new THREE.CylinderGeometry(0.18, 0.18, 1.0, 16);
    const resMat = new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.4 });
    const createResistor = (x, z, rotY = 0) => {
      const res = new THREE.Mesh(resGeo, resMat);
      res.rotation.z = Math.PI / 2;
      res.rotation.y = rotY;
      res.position.set(x, 0.18, z);
      return res;
    };

    pcbGroup.add(createResistor(-2.2, 2.5, 0.5));
    pcbGroup.add(createResistor(2.2, -2.5, -0.4));
    pcbGroup.add(createResistor(3.5, -1.2, 0.8));
    pcbGroup.add(createResistor(-3.5, 1.2, -0.7));

    // 6. Inductor Coil (Helical Torus)
    const inductorGeo = new THREE.TorusGeometry(0.35, 0.12, 12, 24);
    const inductorMat = new THREE.MeshStandardMaterial({ color: 0xcc7722, metalness: 0.8, roughness: 0.2 });
    const inductor = new THREE.Mesh(inductorGeo, inductorMat);
    inductor.rotation.x = Math.PI / 2;
    inductor.position.set(-2, 0.2, -2.5);
    pcbGroup.add(inductor);

    // 7. Glass Signal Diodes
    const diodeGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.7, 12);
    const diodeMat = new THREE.MeshStandardMaterial({ color: 0xff3300, roughness: 0.1, transparent: true, opacity: 0.85 });
    const diode = new THREE.Mesh(diodeGeo, diodeMat);
    diode.rotation.z = Math.PI / 2;
    diode.position.set(2, 0.15, 2.2);
    pcbGroup.add(diode);

    // 8. Communication Antenna Mast with Pulsed Waves
    const antennaGroup = new THREE.Group();
    const mastGeo = new THREE.CylinderGeometry(0.08, 0.14, 3.2, 16);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.95, roughness: 0.15 });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.y = 1.6;
    antennaGroup.add(mast);

    const tipGeo = new THREE.SphereGeometry(0.22, 16, 16);
    const tipMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
    const tip = new THREE.Mesh(tipGeo, tipMat);
    tip.position.y = 3.2;
    antennaGroup.add(tip);

    antennaGroup.position.set(5.2, 0, -3.8);
    pcbGroup.add(antennaGroup);

    // Expanding Radio Wave Rings
    const waveRings = [];
    for (let i = 0; i < 3; i++) {
      const ringGeo = new THREE.RingGeometry(0.35, 0.45, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(5.2, 3.2, -3.8);
      scene.add(ring);
      waveRings.push(ring);
    }

    // 9. Moving Signal Pulses (Glowing Packets along Traces)
    const pulseGeo = new THREE.SphereGeometry(0.14, 12, 12);
    const signalPulse1 = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color: 0x00ff88 }));
    const signalPulse2 = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
    const signalPulse3 = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
    scene.add(signalPulse1);
    scene.add(signalPulse2);
    scene.add(signalPulse3);

    // 10. Floating Circuit Particles
    const pCount = 100;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 16;
      pPos[i * 3 + 1] = Math.random() * 6;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({ size: 0.06, color: 0x00f0ff, transparent: true, opacity: 0.6 });
    const pSystem = new THREE.Points(pGeo, pMat);
    scene.add(pSystem);

    // Animation Loop
    let clock = new THREE.Clock();
    let animId;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Smooth Motherboard Orbit
      pcbGroup.rotation.y = Math.sin(t * 0.18) * 0.14;
      pcbGroup.rotation.x = -0.32 + Math.cos(t * 0.14) * 0.04;

      // Animate Antenna Radio Waves
      waveRings.forEach((ring, idx) => {
        const progress = ((t * 1.6) + idx * 0.7) % 2.5;
        ring.scale.set(1 + progress * 2.6, 1 + progress * 2.6, 1);
        ring.material.opacity = Math.max(0, 1 - progress / 2.5);
      });

      // Animate Signal Pulses
      const s1 = (t * 2.2) % 7;
      signalPulse1.position.set(-6 + s1 * 0.85, 0.22, -4 + s1 * 0.55);

      const s2 = (t * 2.6) % 7;
      signalPulse2.position.set(6 - s2 * 0.85, 0.22, 4 - s2 * 0.55);

      const s3 = (t * 1.8) % 6;
      signalPulse3.position.set(-5 + s3 * 0.8, 0.22, 3 - s3 * 0.5);

      // Rotate particle field
      pSystem.rotation.y = t * 0.02;

      // Controlled Glitch Distortion
      if (isGlitching) {
        camera.position.x = (Math.random() - 0.5) * 0.5;
        camera.position.y = 5.5 + (Math.random() - 0.5) * 0.4;
        renderer.domElement.style.filter = `hue-rotate(${Math.sin(t * 25) * 120}deg) saturate(2.5) contrast(1.2)`;
      } else {
        camera.position.x = 0;
        camera.position.y = 5.5;
        renderer.domElement.style.filter = 'none';
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
  }, [isGlitching]);

  return (
    <div className="relative w-full h-full min-h-[480px] flex items-center justify-center overflow-hidden rounded-3xl border border-cyan-500/30 bg-[#0a1128]/90 backdrop-blur-md shadow-2xl">
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a1128]/70 via-transparent to-[#0a1128]/90 pointer-events-none" />

      {/* Floating HUD Badges */}
      <div className="absolute top-4 left-4 flex flex-col space-y-1 pointer-events-none">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-mono text-emerald-300 tracking-wider">
            PCB_CIRCUIT_WORLD // HARDWARE NODE ONLINE
          </span>
        </div>
        <div className="text-[11px] font-mono text-slate-300">
          SIGNALS: 100MHz | DIP-IC | CAPACITOR BANK | RF TRANSMITTER
        </div>
      </div>

      <div className="absolute bottom-4 left-4 pointer-events-none">
        <div className="text-xs font-mono text-cyan-300">
          DEPARTMENT OF ECE // THE LIVING CIRCUIT REALM
        </div>
      </div>
    </div>
  );
}
