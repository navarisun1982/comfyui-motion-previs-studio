/**
 * Concept Previs Generator
 * Generates stylized cinematic concept art plates for subjects/actors/props
 * based on the director's prompt token and semantic archetype.
 */

export interface ConceptGenerationOptions {
  name: string;
  kind: string;
  token: string;
  aspectRatio?: '16:9' | '1:1' | '4:3';
  theme?: 'cinematic' | 'scifi' | 'noir' | 'blueprint';
}

/**
 * Generates a high-fidelity director concept plate canvas
 */
export function generateConceptPrevisPlate(options: ConceptGenerationOptions): string {
  const { name, kind, token } = options;
  const width = 640;
  const height = 360; // 16:9

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const promptLower = `${name} ${kind} ${token}`.toLowerCase();

  // Background gradient: cinematic deep moody atmosphere
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  if (promptLower.includes('space') || promptLower.includes('star') || promptLower.includes('ship') || promptLower.includes('ufo')) {
    bgGrad.addColorStop(0, '#040714');
    bgGrad.addColorStop(0.5, '#0b1329');
    bgGrad.addColorStop(1, '#020308');
  } else if (promptLower.includes('mountain') || promptLower.includes('nature') || promptLower.includes('tree')) {
    bgGrad.addColorStop(0, '#0f172a');
    bgGrad.addColorStop(0.5, '#1e293b');
    bgGrad.addColorStop(1, '#090d16');
  } else if (promptLower.includes('cyber') || promptLower.includes('neon') || promptLower.includes('robot')) {
    bgGrad.addColorStop(0, '#090514');
    bgGrad.addColorStop(0.5, '#180d2e');
    bgGrad.addColorStop(1, '#05030a');
  } else {
    bgGrad.addColorStop(0, '#0b0d14');
    bgGrad.addColorStop(0.5, '#151926');
    bgGrad.addColorStop(1, '#07080d');
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Background stars / atmospheric dust motes
  const seed = (name.length * 37 + token.length * 19) % 1000;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  for (let i = 0; i < 60; i++) {
    const sx = ((i * 47 + seed * 23) % width);
    const sy = ((i * 29 + seed * 41) % (height * 0.85));
    const sSize = ((i % 3) + 1) * 0.7;
    ctx.beginPath();
    ctx.arc(sx, sy, sSize, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nebula / Atmospheric Glow
  const glowX = width * 0.65;
  const glowY = height * 0.45;
  const glowGrad = ctx.createRadialGradient(glowX, glowY, 10, glowX, glowY, 200);
  if (promptLower.includes('space') || promptLower.includes('ship')) {
    glowGrad.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
    glowGrad.addColorStop(0.6, 'rgba(129, 140, 248, 0.08)');
    glowGrad.addColorStop(1, 'transparent');
  } else {
    glowGrad.addColorStop(0, 'rgba(245, 158, 11, 0.18)');
    glowGrad.addColorStop(0.6, 'rgba(217, 119, 6, 0.06)');
    glowGrad.addColorStop(1, 'transparent');
  }
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, width, height);

  // Ground Horizon or Space Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  const horizonY = height * 0.78;
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  ctx.lineTo(width, horizonY);
  ctx.stroke();

  // Draw Primary Subject Based on Semantic Content
  ctx.save();
  const centerX = width * 0.5;
  const centerY = height * 0.52;

  if (
    promptLower.includes('spaceship') ||
    promptLower.includes('space ship') ||
    promptLower.includes('starship') ||
    promptLower.includes('spacecraft') ||
    promptLower.includes('craft') ||
    promptLower.includes('shuttle') ||
    promptLower.includes('ufo') ||
    promptLower.includes('fighter')
  ) {
    // === CINEMATIC SCI-FI SPACESHIP ===
    const isRectangular = promptLower.includes('rectangular') || promptLower.includes('box');

    // Thruster exhaust trail & plasma glow
    const thrusterGrad = ctx.createRadialGradient(centerX - 130, centerY, 5, centerX - 130, centerY, 80);
    thrusterGrad.addColorStop(0, '#38bdf8');
    thrusterGrad.addColorStop(0.4, 'rgba(14, 165, 233, 0.6)');
    thrusterGrad.addColorStop(0.8, 'rgba(59, 130, 246, 0.15)');
    thrusterGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = thrusterGrad;
    ctx.fillRect(centerX - 240, centerY - 50, 160, 100);

    // Twin Blue Plasma Jet Trails
    ctx.fillStyle = '#60a5fa';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.ellipse(centerX - 120, centerY - 14, 28, 6, 0, 0, Math.PI * 2);
    ctx.ellipse(centerX - 120, centerY + 14, 28, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Main Spaceship Hull
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;

    if (isRectangular) {
      // Sleek Rectangular Heavy Corvette / Frigate Hull
      ctx.beginPath();
      ctx.moveTo(centerX - 110, centerY - 28);
      ctx.lineTo(centerX + 60, centerY - 28);
      ctx.lineTo(centerX + 120, centerY - 10);
      ctx.lineTo(centerX + 135, centerY);
      ctx.lineTo(centerX + 120, centerY + 10);
      ctx.lineTo(centerX + 60, centerY + 28);
      ctx.lineTo(centerX - 110, centerY + 28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Top Armor Plating / Bevel
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(centerX - 90, centerY - 22);
      ctx.lineTo(centerX + 50, centerY - 22);
      ctx.lineTo(centerX + 100, centerY - 8);
      ctx.lineTo(centerX - 90, centerY - 8);
      ctx.closePath();
      ctx.fill();

      // Upper Bridge / Cockpit Module
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(centerX + 10, centerY - 42, 45, 14);
      ctx.strokeRect(centerX + 10, centerY - 42, 45, 14);

      // Emissive Cockpit Visor / Command Windows
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 12;
      ctx.fillRect(centerX + 35, centerY - 40, 18, 10);
      ctx.shadowBlur = 0;

      // Cantilevered Wing Pylons
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(centerX - 40, centerY - 28);
      ctx.lineTo(centerX - 10, centerY - 58);
      ctx.lineTo(centerX + 30, centerY - 58);
      ctx.lineTo(centerX + 20, centerY - 28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(centerX - 40, centerY + 28);
      ctx.lineTo(centerX - 10, centerY + 58);
      ctx.lineTo(centerX + 30, centerY + 58);
      ctx.lineTo(centerX + 20, centerY + 28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Wingtip Navigation Beacons
      ctx.fillStyle = '#10b981'; // starboard green
      ctx.beginPath();
      ctx.arc(centerX + 28, centerY - 58, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ef4444'; // port red
      ctx.beginPath();
      ctx.arc(centerX + 28, centerY + 58, 3, 0, Math.PI * 2);
      ctx.fill();

      // Dual Heavy Warp Nacelles
      ctx.fillStyle = '#090d16';
      ctx.fillRect(centerX - 118, centerY - 24, 22, 16);
      ctx.fillRect(centerX - 118, centerY + 8, 22, 16);
    } else {
      // Angular Aerodynamic Starfighter Hull
      ctx.beginPath();
      ctx.moveTo(centerX - 100, centerY - 18);
      ctx.lineTo(centerX + 40, centerY - 14);
      ctx.lineTo(centerX + 140, centerY);
      ctx.lineTo(centerX + 40, centerY + 14);
      ctx.lineTo(centerX - 100, centerY + 18);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Swept Delta Wings
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.moveTo(centerX - 50, centerY - 16);
      ctx.lineTo(centerX - 20, centerY - 65);
      ctx.lineTo(centerX + 30, centerY - 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(centerX - 50, centerY + 16);
      ctx.lineTo(centerX - 20, centerY + 65);
      ctx.lineTo(centerX + 30, centerY + 14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Cockpit Canopy (Amber or Cyan)
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.ellipse(centerX + 30, centerY, 28, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  } else if (promptLower.includes('mountain') || promptLower.includes('hill') || promptLower.includes('peak')) {
    // === MAJESTIC ALPINE MOUNTAIN PEAK ===
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.moveTo(centerX - 200, horizonY);
    ctx.lineTo(centerX - 60, centerY - 90);
    ctx.lineTo(centerX, centerY - 110);
    ctx.lineTo(centerX + 70, centerY - 70);
    ctx.lineTo(centerX + 210, horizonY);
    ctx.closePath();
    ctx.fill();

    // Snow Cap
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(centerX - 40, centerY - 65);
    ctx.lineTo(centerX, centerY - 110);
    ctx.lineTo(centerX + 35, centerY - 55);
    ctx.lineTo(centerX + 10, centerY - 45);
    ctx.lineTo(centerX - 15, centerY - 55);
    ctx.closePath();
    ctx.fill();

    // Shaded Ridge
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 110);
    ctx.lineTo(centerX + 70, centerY - 70);
    ctx.lineTo(centerX + 210, horizonY);
    ctx.lineTo(centerX + 10, horizonY);
    ctx.closePath();
    ctx.fill();
  } else if (promptLower.includes('robot') || promptLower.includes('mech') || promptLower.includes('droid')) {
    // === MECHA DROID / ROBOT ===
    // Torso
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.fillRect(centerX - 35, centerY - 40, 70, 75);
    ctx.strokeRect(centerX - 35, centerY - 40, 70, 75);

    // Glowing Core Reactor
    ctx.fillStyle = '#06b6d4';
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(centerX, centerY - 10, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Head Unit & Visor
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(centerX - 22, centerY - 80, 44, 34);
    ctx.strokeRect(centerX - 22, centerY - 80, 44, 34);

    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.fillRect(centerX - 18, centerY - 68, 36, 8);
    ctx.shadowBlur = 0;

    // Shoulders
    ctx.fillStyle = '#475569';
    ctx.fillRect(centerX - 55, centerY - 38, 18, 30);
    ctx.fillRect(centerX + 37, centerY - 38, 18, 30);

    // Legs
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(centerX - 28, centerY + 38, 22, 60);
    ctx.fillRect(centerX + 6, centerY + 38, 22, 60);
  } else if (
    promptLower.includes('food') ||
    promptLower.includes('plate') ||
    promptLower.includes('macaroni') ||
    promptLower.includes('pasta') ||
    promptLower.includes('spaghetti') ||
    promptLower.includes('dish') ||
    promptLower.includes('pizza') ||
    promptLower.includes('burger') ||
    promptLower.includes('meal') ||
    promptLower.includes('bowl')
  ) {
    // === CULINARY ART / GOURMET FOOD DISH (e.g. Plate of Macaroni & Cheese) ===
    // Table surface reflection
    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.fillRect(centerX - 180, centerY + 45, 360, 40);

    // Porcelain dinner plate base
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 25, 130, 42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Inner plate recess
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 23, 105, 32, 0, 0, Math.PI * 2);
    ctx.fill();

    // Golden Macaroni & Cheese / Pasta Mound
    const cheeseGrad = ctx.createRadialGradient(centerX, centerY - 5, 10, centerX, centerY + 15, 80);
    cheeseGrad.addColorStop(0, '#fbbf24');
    cheeseGrad.addColorStop(0.5, '#f59e0b');
    cheeseGrad.addColorStop(1, '#d97706');
    ctx.fillStyle = cheeseGrad;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 10, 85, 32, 0, 0, Math.PI * 2);
    ctx.fill();

    // Curved macaroni noodle florets
    ctx.fillStyle = '#fef08a';
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2;
      const r = 25 + (i % 3) * 16;
      const nx = centerX + Math.cos(angle) * r;
      const ny = centerY + 10 + Math.sin(angle) * (r * 0.35);
      ctx.beginPath();
      ctx.arc(nx, ny, 8, 0, Math.PI, false);
      ctx.stroke();
      ctx.fill();
    }

    // Fresh chopped parsley sprinkles (green garnish)
    ctx.fillStyle = '#16a34a';
    for (let i = 0; i < 18; i++) {
      const gx = centerX - 40 + ((i * 19) % 80);
      const gy = centerY - 5 + ((i * 13) % 28);
      ctx.fillRect(gx, gy, 3, 2.5);
    }

    // Stainless steel fork resting to the side
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(centerX + 115, centerY - 25, 6, 85);
    // Fork tines
    for (let t = 0; t < 4; t++) {
      ctx.fillRect(centerX + 111 + t * 4, centerY - 45, 2, 22);
    }
  } else if (
    promptLower.includes('console') ||
    promptLower.includes('playstation') ||
    promptLower.includes('ps5') ||
    promptLower.includes('ps4') ||
    promptLower.includes('xbox') ||
    promptLower.includes('nintendo') ||
    promptLower.includes('gaming') ||
    promptLower.includes('pc case') ||
    promptLower.includes('gpu')
  ) {
    // === NEXT-GEN TECH / PLAYSTATION 5 CONSOLE PACKSHOT ===
    // Circular studio platform
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 78, 90, 22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Central matte black body core
    ctx.fillStyle = '#090d16';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.fillRect(centerX - 18, centerY - 85, 36, 155);
    ctx.strokeRect(centerX - 18, centerY - 85, 36, 155);

    // Glowing PlayStation signature blue LED light piping
    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#0284c7';
    ctx.shadowBlur = 18;
    ctx.fillRect(centerX - 20, centerY - 84, 3, 145);
    ctx.fillRect(centerX + 17, centerY - 84, 3, 145);
    ctx.shadowBlur = 0;

    // Sculpted aerodynamic curved white outer wing plates
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    // Left Wing Plate (curved top fin)
    ctx.beginPath();
    ctx.moveTo(centerX - 24, centerY + 72);
    ctx.lineTo(centerX - 26, centerY - 70);
    ctx.quadraticCurveTo(centerX - 35, centerY - 95, centerX - 18, centerY - 105);
    ctx.lineTo(centerX - 15, centerY - 95);
    ctx.lineTo(centerX - 18, centerY + 72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Right Wing Plate (curved top fin)
    ctx.beginPath();
    ctx.moveTo(centerX + 24, centerY + 72);
    ctx.lineTo(centerX + 26, centerY - 70);
    ctx.quadraticCurveTo(centerX + 35, centerY - 95, centerX + 18, centerY - 105);
    ctx.lineTo(centerX + 15, centerY - 95);
    ctx.lineTo(centerX + 18, centerY + 72);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Technical vents & power indicator
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(centerX - 4, centerY - 72, 8, 2);
  } else if (
    promptLower.includes('drink') ||
    promptLower.includes('coffee') ||
    promptLower.includes('tea') ||
    promptLower.includes('cup') ||
    promptLower.includes('mug') ||
    promptLower.includes('bottle') ||
    promptLower.includes('wine')
  ) {
    // === BEVERAGE / COFFEE MUG PROP ===
    ctx.fillStyle = '#e2e8f0';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.fillRect(centerX - 35, centerY - 30, 70, 75);
    ctx.strokeRect(centerX - 35, centerY - 30, 70, 75);

    // Mug handle
    ctx.beginPath();
    ctx.arc(centerX + 40, centerY + 5, 20, -Math.PI / 2, Math.PI / 2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();

    // Coffee rim & surface
    ctx.fillStyle = '#451a03';
    ctx.beginPath();
    ctx.ellipse(centerX, centerY - 30, 32, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Warm steam wisps
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - 10, centerY - 45);
    ctx.bezierCurveTo(centerX - 18, centerY - 65, centerX - 5, centerY - 75, centerX - 12, centerY - 90);
    ctx.stroke();
  } else if (
    promptLower.includes('weapon') ||
    promptLower.includes('sword') ||
    promptLower.includes('blade') ||
    promptLower.includes('gun') ||
    promptLower.includes('dagger')
  ) {
    // === CINEMATIC WEAPON / BLADE PROP ===
    // Polished steel blade
    ctx.fillStyle = '#e2e8f0';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(centerX - 6, centerY + 20);
    ctx.lineTo(centerX - 6, centerY - 80);
    ctx.lineTo(centerX, centerY - 105);
    ctx.lineTo(centerX + 6, centerY - 80);
    ctx.lineTo(centerX + 6, centerY + 20);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Gold crossguard
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(centerX - 28, centerY + 20, 56, 8);

    // Leather wrapped grip
    ctx.fillStyle = '#78350f';
    ctx.fillRect(centerX - 5, centerY + 28, 10, 36);

    // Pommel
    ctx.fillStyle = '#d4af37';
    ctx.beginPath();
    ctx.arc(centerX, centerY + 70, 8, 0, Math.PI * 2);
    ctx.fill();
  } else if (
    promptLower.includes('human') ||
    promptLower.includes('person') ||
    promptLower.includes('actor') ||
    promptLower.includes('man') ||
    promptLower.includes('woman') ||
    promptLower.includes('detective') ||
    promptLower.includes('character') ||
    promptLower.includes('figure') ||
    kind === 'human'
  ) {
    // === DRAMATIC HUMAN CHARACTER SILHOUETTE & WARDROBE ===
    ctx.fillStyle = '#090d16';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;

    // Head & Face
    ctx.beginPath();
    ctx.arc(centerX, centerY - 70, 18, 0, Math.PI * 2);
    ctx.fill();

    // Hair / Hat / Fedora rim if detective
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(centerX - 24, centerY - 88, 48, 8);
    ctx.fillRect(centerX - 16, centerY - 100, 32, 14);

    // Long Trenchcoat / Jacket Body
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(centerX - 35, centerY - 50);
    ctx.lineTo(centerX + 35, centerY - 50);
    ctx.lineTo(centerX + 48, centerY + 45);
    ctx.lineTo(centerX - 48, centerY + 45);
    ctx.closePath();
    ctx.fill();

    // Collar Lapels
    ctx.strokeStyle = '#d97706';
    ctx.beginPath();
    ctx.moveTo(centerX - 20, centerY - 50);
    ctx.lineTo(centerX, centerY - 25);
    ctx.lineTo(centerX + 20, centerY - 50);
    ctx.stroke();

    // Legs
    ctx.fillStyle = '#090d16';
    ctx.fillRect(centerX - 22, centerY + 45, 18, 55);
    ctx.fillRect(centerX + 4, centerY + 45, 18, 55);
  } else {
    // === UNIVERSAL STUDIO PRODUCT SHOWCASE PEDESTAL (Clean Custom Prop) ===
    // Studio plinth base
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 65, 80, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Showcase cylinder column
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(centerX - 60, centerY + 15, 120, 50);

    // Glowing accent rim
    ctx.fillStyle = '#0284c7';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 15, 60, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Geometric prop box in studio illumination
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(centerX - 40, centerY - 15);
    ctx.lineTo(centerX, centerY - 45);
    ctx.lineTo(centerX + 40, centerY - 15);
    ctx.lineTo(centerX, centerY + 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();

  // 4. Director HUD & Spec Overlay
  // Vignette
  const vigGrad = ctx.createRadialGradient(width / 2, height / 2, width * 0.35, width / 2, height / 2, width * 0.7);
  vigGrad.addColorStop(0, 'transparent');
  vigGrad.addColorStop(1, 'rgba(0, 0, 0, 0.75)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, width, height);

  // Technical Director Framing Crosshairs
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
  ctx.lineWidth = 1;
  const chSize = 14;
  // Top-Left Crosshair
  ctx.beginPath();
  ctx.moveTo(24, 24 + chSize);
  ctx.lineTo(24, 24);
  ctx.lineTo(24 + chSize, 24);
  ctx.stroke();
  // Top-Right Crosshair
  ctx.beginPath();
  ctx.moveTo(width - 24 - chSize, 24);
  ctx.lineTo(width - 24, 24);
  ctx.lineTo(width - 24, 24 + chSize);
  ctx.stroke();
  // Bottom-Left Crosshair
  ctx.beginPath();
  ctx.moveTo(24, height - 24 - chSize);
  ctx.lineTo(24, height - 24);
  ctx.lineTo(24 + chSize, height - 24);
  ctx.stroke();
  // Bottom-Right Crosshair
  ctx.beginPath();
  ctx.moveTo(width - 24 - chSize, height - 24);
  ctx.lineTo(width - 24, height - 24);
  ctx.lineTo(width - 24, height - 24 - chSize);
  ctx.stroke();

  // Top Director Classification Header
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`DIRECTOR PREVIS CONCEPT • ${name.toUpperCase()}`, 30, 42);

  // Token Prompt Badge
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(26, height - 48, width - 52, 28);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.strokeRect(26, height - 48, width - 52, 28);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 10px monospace';
  ctx.fillText('PROMPT TOKEN:', 34, height - 30);

  ctx.fillStyle = '#ffffff';
  ctx.font = '10px monospace';
  const displayToken = token.length > 68 ? `${token.substring(0, 65)}...` : token;
  ctx.fillText(displayToken, 126, height - 30);

  return canvas.toDataURL('image/jpeg', 0.94);
}
