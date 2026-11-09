// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { CURATED_3D_ASSETS } from '../src/stores/useAssetLibraryStore';
import {
  POLYFORK_KITS_CATALOG,
  SANDFLOW_DATASETS_CATALOG,
  resolvePolyforkGlbUrl,
} from '../src/data/externalCatalogsRegistry';
import { resolveObjectArchetype } from '../src/engine/procedural3D/archetypeResolver';
import { extractCharacterFeaturesFromModelOutput } from '../src/engine/procedural3D/characterClayCompiler';
import { createRiggedCostumeAccessories } from '../src/engine/kinematics/characterDresser';
import { createSubjectMesh, applyObjectTargetColor } from '../src/engine/staging/subjectMeshFactory';

function countMeshes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) count++;
  });
  return count;
}

describe('Curated 200 Open .GLB Asset Library & External Catalogs Registry', () => {
  beforeAll(() => {
    if (typeof HTMLCanvasElement !== 'undefined') {
      HTMLCanvasElement.prototype.getContext = (() => ({
        fillRect: () => {},
        clearRect: () => {},
        getImageData: () => ({ data: new Array(4) }),
        putImageData: () => {},
        createImageData: () => ({ data: new Array(4) }),
        setTransform: () => {},
        drawImage: () => {},
        save: () => {},
        fillText: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        stroke: () => {},
        translate: () => {},
        scale: () => {},
        rotate: () => {},
        arc: () => {},
        fill: () => {},
        measureText: () => ({ width: 80 }),
        transform: () => {},
        rect: () => {},
        roundRect: () => {},
        clip: () => {},
      })) as any;
    }
  });

  it('contains 208 curated items with real Polyfork/bundled .GLB URLs and 2 Posable 19-bone IK/FK Director Rigs', () => {
    expect(CURATED_3D_ASSETS.length).toBe(208);

    const posableRigs = CURATED_3D_ASSETS.filter((a) => a.modelUrl?.endsWith('.fbx'));
    expect(posableRigs.map((r) => r.id)).toEqual([
      'char-director-rig-male',
      'char-director-rig-female',
    ]);
    for (const rig of posableRigs) {
      expect(rig.rigType).toBe('humanoid');
      expect(rig.category).toBe('character');
    }

    const glbItems = CURATED_3D_ASSETS.filter((a) => a.modelUrl?.endsWith('.glb'));
    expect(glbItems.length).toBe(206);

    for (const item of glbItems) {
      expect(item.modelUrl, `Item ${item.id} should have a valid Polyfork CDN or bundled .glb URL`).toMatch(
        /^(https:\/\/polyfork\.dev\/cdn\/[A-Za-z0-9_-]+\.glb|\.?\/models\/[A-Za-z0-9_.-]+\.glb)$/
      );
      expect(
        item.conceptImageUrl,
        `Item ${item.id} should have a valid Polyfork CDN or bundled library thumbnail`
      ).toMatch(
        /^(https:\/\/polyfork\.dev\/files\/[A-Za-z0-9_-]+\/renders\/hero\.png|data:image\/svg\+xml|\.?\/images\/library\/[A-Za-z0-9_.-]+\.(jpg|png|svg))/
      );
    }

    // Verify all 43 Polyfork Kits and 5 Sandflow Sand3D Datasets are registered
    expect(POLYFORK_KITS_CATALOG.length).toBe(43);
    expect(SANDFLOW_DATASETS_CATALOG.length).toBe(5);
    const totalSandflowAssets = SANDFLOW_DATASETS_CATALOG.reduce((sum, d) => sum + d.count, 0);
    expect(totalSandflowAssets).toBe(106094);

    // Verify semantic .GLB resolver maps prompts to real .GLB URLs
    expect(resolvePolyforkGlbUrl('Helicopter flying', 'a helicopter', 'vehicle')).toBe(
      'https://polyfork.dev/cdn/air-ambulance-helicopter-ed9acc.glb'
    );
    expect(resolvePolyforkGlbUrl('Police Car', 'law enforcement cruiser', 'car')).toMatch(
      /^https:\/\/polyfork\.dev\/cdn\/[A-Za-z0-9_-]+\.glb$/
    );
    expect(resolvePolyforkGlbUrl('Pine Tree', 'tall forest tree', 'tree')).toMatch(
      /^https:\/\/polyfork\.dev\/cdn\/[A-Za-z0-9_-]+\.glb$/
    );
  });

  it('distinguishes previously colliding architecture, vehicle, creature, furniture, prop, weapon, and sci-fi blueprints', () => {
    const cases: Array<[string, string, string]> = [
      ['Windmill Millhouse', 'architecture', 'archetype.architecture.windmill'],
      ['Modern Skyscraper Tower', 'architecture', 'archetype.architecture.skyscraper'],
      ['Coastal Striped Lighthouse', 'architecture', 'archetype.architecture.lighthouse'],
      ['East Asian Pagoda', 'architecture', 'archetype.architecture.pagoda'],
      ['Domed Desert Mosque', 'architecture', 'archetype.architecture.mosque'],
      ['Twin-Spire Gothic Cathedral', 'architecture', 'archetype.architecture.cathedral'],
      ['Vintage Steam Locomotive', 'vehicle', 'archetype.vehicle.locomotive'],
      ['Agricultural Farm Tractor', 'vehicle', 'archetype.vehicle.tractor'],
      ['Law Enforcement Police Car', 'vehicle', 'archetype.vehicle.police_car'],
      ['Aerial Ladder Fire Engine', 'vehicle', 'archetype.vehicle.fire_engine'],
      ['Soaring Golden Eagle', 'creature', 'archetype.creature.eagle'],
      ['Immortal Fire Phoenix', 'creature', 'archetype.creature.phoenix'],
      ['Abyssal Sea Kraken', 'creature', 'archetype.creature.kraken'],
      ['Horned Minotaur Guardian', 'creature', 'archetype.creature.minotaur'],
      ['Tall Grandfather Clock', 'furniture', 'archetype.furniture.grandfather_clock'],
      ['Ornate Royal Throne', 'furniture', 'archetype.furniture.throne'],
      ['Director Clapperboard Slate', 'props', 'archetype.prop.clapperboard'],
      ['Forged Blacksmith Anvil', 'props', 'archetype.prop.anvil'],
      ['Double-Bitted Battleaxe', 'weapons', 'archetype.weapon.battleaxe'],
      ['Samurai Katana Sword', 'weapons', 'archetype.weapon.katana'],
      ['Heavy Tactical Crossbow', 'weapons', 'archetype.weapon.crossbow'],
      ['Marksman Sniper Rifle', 'weapons', 'archetype.weapon.sniper_rifle'],
      ['Retro Atomic Raygun', 'weapons', 'archetype.weapon.raygun'],
      ['Four-Pointed Ninja Shuriken', 'weapons', 'archetype.weapon.shuriken'],
      ['Vertical Cryo-Stasis Pod', 'scifi', 'archetype.scifi.cryo_pod'],
      ['Toroidal Tokamak Fusion Reactor', 'scifi', 'archetype.scifi.tokamak'],
      ['Orbital Hyperspace Jump Gate', 'scifi', 'archetype.scifi.hyperspace_gate'],
      ['Cryogenic Quantum Computer', 'scifi', 'archetype.scifi.quantum_computer'],
    ];

    for (const [query, category, expectedId] of cases) {
      const res = resolveObjectArchetype(query, category);
      expect(res.matchedArchetype?.id, `Query "${query}" should match ${expectedId}`).toBe(expectedId);
    }
  });

  it('extracts authentic character features and 3D costume accessories for all curated human characters without false female/elven defaults', () => {
    const knight = extractCharacterFeaturesFromModelOutput({}, 'Medieval Plate Knight in steel armor with sword and shield');
    expect(knight.archetype).toBe('knight');
    expect(knight.gender).toBe('male');
    expect(knight.costume.hasAntlersOrPins).toBe(false);
    expect(knight.costume.hasHelmet).toBe(true);
    expect(knight.costume.helmetStyle).toBe('knight');
    expect(knight.equipment.hasSword).toBe(true);
    expect(knight.equipment.hasShield).toBe(true);
    expect(knight.equipment.hasBow).toBe(false);

    const astronaut = extractCharacterFeaturesFromModelOutput({}, 'EVA Space Astronaut in white pressurized suit with gold visor helmet');
    expect(astronaut.archetype).toBe('astronaut');
    expect(astronaut.costume.hasHelmet).toBe(true);
    expect(astronaut.costume.helmetStyle).toBe('astronaut');
    const astroAttachments = createRiggedCostumeAccessories(astronaut, 1.0);
    expect((astroAttachments.get('Head') || []).some((m) => m.name === 'Costume_Helmet')).toBe(true);

    const samurai = extractCharacterFeaturesFromModelOutput({}, 'Feudal Samurai Warrior in lamellar armor and kabuto helmet');
    expect(samurai.archetype).toBe('samurai');
    expect(samurai.costume.helmetStyle).toBe('kabuto');
    const samAttachments = createRiggedCostumeAccessories(samurai, 1.0);
    expect((samAttachments.get('Head') || []).some((m) => m.name === 'Costume_Helmet')).toBe(true);

    const wizard = extractCharacterFeaturesFromModelOutput({}, 'Mystical Robed Wizard with pointed hat and glowing staff');
    expect(wizard.archetype).toBe('mage');
    expect(wizard.costume.hatStyle).toBe('wizard');
    expect(wizard.equipment.hasStaff).toBe(true);

    const chef = extractCharacterFeaturesFromModelOutput({}, 'Master Culinary Chef in white toque hat and apron');
    expect(chef.archetype).toBe('chef');
    expect(chef.costume.hatStyle).toBe('toque');
    expect(chef.costume.hasApron).toBe(true);
  });

  it('preserves multi-tone material contrast and modelSize bounding metadata when applying actor target colors in createSubjectMesh', () => {
    const meshGroup = createSubjectMesh({
      name: 'Rotary Helicopter',
      kind: 'vehicle' as any,
      colorHex: 0xef4444,
      tokenPrompt: 'rotary helicopter with glass cockpit canopy and dark landing skids',
      showLabels: false,
    });
    applyObjectTargetColor(meshGroup, 0xef4444);

    const hexColors = new Set<string>();
    meshGroup.traverse((child) => {
      if ((child as THREE.Mesh).isMesh && !child.userData?.isBaseRing) {
        const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
        if (mat && mat.color) {
          hexColors.add(mat.color.getHexString());
        }
      }
    });

    // Multi-tone shading must preserve distinct material tones rather than 1 flat monochrome hex
    expect(hexColors.size).toBeGreaterThanOrEqual(3);
    // Must also populate modelSize for 3D XYZ Transform Gizmo placement on Stage
    expect(meshGroup.userData.modelSize).toBeDefined();
    expect(meshGroup.userData.modelSize.y).toBeGreaterThan(0.5);

    // Even when kind is left as default ('human'), text-created vehicles/creatures/props must NOT become humanoid mannequins
    const textHeli = createSubjectMesh({
      name: 'Helicopter',
      kind: 'human',
      tokenPrompt: 'tactical helicopter flying',
      showLabels: false,
    });
    expect(textHeli.userData.rig).toBeUndefined();
    expect(textHeli.userData.archetypeId).toBe('archetype.aerospace.helicopter');
    expect(textHeli.userData.modelSize).toBeDefined();
    expect(textHeli.userData.modelSize.y).toBeGreaterThan(0.5);

    // Multi-clause prompt ("Helicopter flying" + "a helicopter flying in the air over a forest") with kind: 'vehicle'
    // must resolve strictly to 'archetype.aerospace.helicopter' and NEVER to hovercraft ('air cushion') or forest tree!
    const forestHeli = createSubjectMesh({
      name: 'Helicopter flying',
      kind: 'vehicle' as any,
      tokenPrompt: 'a helicopter flying in the air over a forest',
      showLabels: false,
    });
    expect(forestHeli.userData.archetypeId).toBe('archetype.aerospace.helicopter');

    // Stage human characters (e.g. "Agent Kael") must render as clean humanoid mannequins with zero floating TorusGeometry rings or shoulder cylinders
    const agentKael = createSubjectMesh({
      name: 'Agent Kael',
      kind: 'human',
      tokenPrompt: 'cyberpunk operative in a rain-slicked charcoal trenchcoat with glowing cyan collar',
      showLabels: false,
    });
    expect(agentKael.userData.rig).toBeDefined();
    let hasCostumeAccessoryOnStageMannequin = false;
    agentKael.traverse((c) => {
      if (c.userData?.isCostumeAccessory) {
        hasCostumeAccessoryOnStageMannequin = true;
      }
    });
    expect(hasCostumeAccessoryOnStageMannequin).toBe(false);

    // Image import cutout/standee must also populate modelSize for 3D XYZ Transform Gizmo placement
    const imageCutout = createSubjectMesh({
      name: 'Imported Reference Subject',
      kind: 'cutout' as any,
      conceptImageUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      showLabels: false,
    });
    expect(imageCutout.userData.modelSize).toBeDefined();
    expect(imageCutout.userData.modelSize.y).toBeGreaterThan(0.5);
  });

  it('end-to-end: createSubjectMesh builds all 207 CURATED_3D_ASSETS at camera-friendly stage scale without legacy CURATED_SCULPT_SPECS hijacking', () => {
    for (const asset of CURATED_3D_ASSETS) {
      const stageGroup = createSubjectMesh({
        name: asset.name,
        kind: asset.kind,
        tokenPrompt: asset.tokenPrompt,
        isSelected: true,
        showLabels: false,
      });

      const modelSize = stageGroup.userData.modelSize as THREE.Vector3;
      expect(modelSize, `Asset "${asset.id}" (${asset.name}) missing modelSize`).toBeDefined();
      const maxSpan = Math.max(modelSize.x, modelSize.y, modelSize.z);
      expect(
        maxSpan,
        `Asset "${asset.id}" (${asset.name}) is too microscopic on stage (maxSpan=${maxSpan.toFixed(2)})`
      ).toBeGreaterThanOrEqual(2.0);
      expect(
        modelSize.y,
        `Asset "${asset.id}" (${asset.name}) is too colossal on stage (height=${modelSize.y.toFixed(2)})`
      ).toBeLessThanOrEqual(9.5);

      const isHumanCharacter =
        asset.category === 'character' &&
        asset.id !== 'char-robot-mecha' &&
        asset.id !== 'char-quaternius-robot-expressive';
      if (isHumanCharacter) {
        expect(
          stageGroup.userData.rig,
          `Human character "${asset.id}" (${asset.name}) should have a humanoid rig`
        ).toBeDefined();
      } else {
        expect(
          stageGroup.userData.rig,
          `Non-human asset "${asset.id}" (${asset.name}) was misrouted to humanoid mannequin!`
        ).toBeUndefined();
        expect(
          stageGroup.userData.archetypeId,
          `Non-human asset "${asset.id}" (${asset.name}) missing archetypeId`
        ).toBeTruthy();
        const meshCount = countMeshes(stageGroup);
        expect(
          meshCount,
          `Non-human asset "${asset.id}" (${asset.name}) has too few meshes (${meshCount})`
        ).toBeGreaterThanOrEqual(4);
      }
    }
  });
});

