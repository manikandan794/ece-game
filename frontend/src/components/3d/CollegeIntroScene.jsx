import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function CollegeIntroScene({ onTransitionComplete }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene setup with balanced deep-navy atmosphere
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a1128, 0.035);

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 0, 9.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Balanced Cinematic Lighting
    const ambientLight = new THREE.AmbientLight(0xddeeff, 1.4);
    scene.add(ambientLight);

    const mainSpot = new THREE.DirectionalLight(0xffffff, 2.0);
    mainSpot.position.set(5, 8, 10);
    scene.add(mainSpot);

    const cyanRim = new THREE.PointLight(0x00f0ff, 4, 25);
    cyanRim.position.set(-6, 4, 4);
    scene.add(cyanRim);

    const pinkRim = new THREE.PointLight(0xff0055, 3, 20);
    pinkRim.position.set(6, -3, 3);
    scene.add(pinkRim);

    // Floating Architectural Panel Group
    const presentationGroup = new THREE.Group();
    scene.add(presentationGroup);

    // 1. Campus Photo Textured Architectural Monolith
    const textureLoader = new THREE.TextureLoader();
    let meshPlane = null;
    let panelFrame = null;

    textureLoader.load(
      '/assets/rrase_college.webp',
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        const aspect = texture.image.width / texture.image.height;
        const panelW = 6.2 * (aspect / 1.5);
        const panelH = 4.2;

        // Photo Panel
        const planeGeo = new THREE.PlaneGeometry(panelW, panelH, 32, 32);
        const planeMat = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.3,
          metalness: 0.15,
          side: THREE.DoubleSide
        });

        meshPlane = new THREE.Mesh(planeGeo, planeMat);
        meshPlane.position.z = 0.05;
        presentationGroup.add(meshPlane);

        // Architectural Beveled Backing Frame
        const frameGeo = new THREE.BoxGeometry(panelW + 0.35, panelH + 0.35, 0.2);
        const frameMat = new THREE.MeshStandardMaterial({
          color: 0x0f2240,
          roughness: 0.2,
          metalness: 0.8,
          wireframe: false
        });
        panelFrame = new THREE.Mesh(frameGeo, frameMat);
        panelFrame.position.z = -0.05;
        presentationGroup.add(panelFrame);

        // Cyber Accent Border Glow
        const borderGeo = new THREE.EdgesGeometry(frameGeo);
        const borderMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.6 });
        const borderLine = new THREE.LineSegments(borderGeo, borderMat);
        panelFrame.add(borderLine);
      },
      undefined,
      (err) => console.warn('Campus texture fallback:', err)
    );

    // 2. 3D Traces Extending from the Panel into 3D Space
    const traceMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.7 });
    const tracePoints = [
      [new THREE.Vector3(-3.2, 1.5, 0), new THREE.Vector3(-5, 1.5, -1), new THREE.Vector3(-6, 3, -2)],
      [new THREE.Vector3(-3.2, -1.2, 0), new THREE.Vector3(-4.5, -2, -0.5), new THREE.Vector3(-5.5, -2, -2)],
      [new THREE.Vector3(3.2, 1.2, 0), new THREE.Vector3(4.8, 2, -1), new THREE.Vector3(6, 2, -3)],
      [new THREE.Vector3(3.2, -1.5, 0), new THREE.Vector3(5, -1.5, -0.5), new THREE.Vector3(6, -3, -2)]
    ];

    tracePoints.forEach(pts => {
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, traceMat);
      scene.add(line);
    });

    // 3. Floating ECE Component Satellites around the Panel
    const componentsGroup = new THREE.Group();
    scene.add(componentsGroup);

    // Microchip Model
    const chipGeo = new THREE.BoxGeometry(0.8, 0.2, 0.5);
    const chipMat = new THREE.MeshStandardMaterial({ color: 0x111625, metalness: 0.8, roughness: 0.2 });
    const chip = new THREE.Mesh(chipGeo, chipMat);
    chip.position.set(-4.5, 2.2, 1);
    componentsGroup.add(chip);

    // Electrolytic Capacitor
    const capGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.8, 16);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x0055aa, metalness: 0.6, roughness: 0.3 });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(4.2, -2.2, 0.5);
    componentsGroup.add(cap);

    // Resistor
    const resGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.6, 12);
    const resMat = new THREE.MeshStandardMaterial({ color: 0xc89666, roughness: 0.5 });
    const res = new THREE.Mesh(resGeo, resMat);
    res.rotation.z = Math.PI / 3;
    res.position.set(-4, -2, 0.5);
    componentsGroup.add(res);

    // 4. Floating Atmospheric Electrical Dust Particles
    const particleCount = 220;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 18;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 12;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10;

      colors[i * 3] = 0.0;
      colors[i * 3 + 1] = 0.94; // Cyan #00f0ff
      colors[i * 3 + 2] = 1.0;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.07,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // 5. Interactive Mouse Parallax
    let mouseX = 0;
    let mouseY = 0;
    let targetX = 0;
    let targetY = 0;

    const handleMouseMove = (e) => {
      mouseX = (e.clientX / window.innerWidth) * 2 - 1;
      mouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', handleMouseMove);

    // 6. Render Loop with Smooth Damping
    let clock = new THREE.Clock();
    let animId;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Smooth camera parallax
      targetX += (mouseX * 0.9 - targetX) * 0.04;
      targetY += (mouseY * 0.9 - targetY) * 0.04;
      camera.position.x = targetX;
      camera.position.y = targetY;
      camera.lookAt(0, 0, 0);

      // Subtle breathing motion
      camera.position.z = 9.5 - Math.sin(t * 0.35) * 0.25;

      // Rotate panel slightly with parallax
      presentationGroup.rotation.y = targetX * 0.12;
      presentationGroup.rotation.x = -targetY * 0.12;

      // Orbit floating ECE satellites
      chip.rotation.x = t * 0.5;
      chip.rotation.y = t * 0.3;
      cap.rotation.y = t * 0.4;
      res.rotation.z = Math.PI / 3 + Math.sin(t) * 0.2;

      // Slowly rotate particle field
      particles.rotation.y = t * 0.02;
      particles.rotation.x = Math.sin(t * 0.015) * 0.04;

      // Moving light sweep
      cyanRim.position.x = Math.sin(t * 0.8) * 6;
      cyanRim.position.y = Math.cos(t * 0.6) * 4;

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
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-full min-h-[460px] flex items-center justify-center overflow-hidden rounded-3xl border border-cyan-500/30 bg-[#0e1a38]/80 backdrop-blur-md shadow-2xl">
      <div ref={containerRef} className="absolute inset-0 w-full h-full" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0a1128] via-transparent to-[#0a1128]/60 pointer-events-none" />
      
      {/* HUD Telemetry Overlay */}
      <div className="absolute top-4 left-4 flex items-center space-x-2.5 pointer-events-none">
        <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
        <span className="text-xs font-mono text-cyan-300 tracking-widest uppercase">
          CAMPUS ARCHITECTURAL NODE // 3D DEPTH PERSPECTIVE
        </span>
      </div>

      <div className="absolute bottom-4 right-4 text-right pointer-events-none">
        <div className="text-[11px] font-mono text-slate-300">ECE HARDWARE REALM TELEMETRY</div>
        <div className="text-sm font-display font-bold text-cyan-300">RRASE COLLEGE OF ENGINEERING</div>
      </div>
    </div>
  );
}
