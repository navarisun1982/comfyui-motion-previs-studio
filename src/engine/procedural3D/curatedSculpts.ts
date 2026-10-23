/**
 * Curated High-Fidelity PartGraph Catalog for ComfyUI Motion Previs Studio.
 * Reviewed and generated using the 3Dviz Pro Max Object Reasoning specification.
 * Each entry replaces heuristic fallback boxes with an authentic, multi-part assembly
 * featuring real-world proportions (heightMeters), PBR materials, hierarchical rigging,
 * and physical kinematics (rotations, pendulums, thrusters).
 *
 * Entries are stored in the original v1 PartGraph vocabulary (box / ellipsoid ...) and are
 * converted to SculptSpec v2 by sanitizeSculptSpec() on first lookup. Do not import sculptSpec.ts
 * here (it imports this file).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CURATED_SCULPT_SPECS: Record<string, any> = {
  // ================= 1. ARCHITECTURE =================
  'medieval round watchtower': {
    version: 1,
    name: 'Round Watchtower',
    route: 'author',
    heightMeters: 14.0,
    identity:
      'Tall cylindrical stone fortification tower with flared corbelled parapet, crenellated battlements, arrow slit embrasures, and arched timber doorway.',
    materials: [
      { id: 'granite_stone', color: '#6b7280', roughness: 0.85, metalness: 0.05 },
      { id: 'dark_timber', color: '#3e2723', roughness: 0.75, metalness: 0.0 },
      { id: 'iron_bands', color: '#1f2937', roughness: 0.4, metalness: 0.85 },
      { id: 'banner_crimson', color: '#b91c1c', roughness: 0.6, metalness: 0.0 },
    ],
    parts: [
      // Base plinth
      { id: 'base_plinth', shape: 'cylinder', size: [4.8, 0.8, 4.8], position: [0, 0.4, 0], rotation: [0, 0, 0], material: 'granite_stone' },
      // Main tapered tower shaft
      { id: 'tower_shaft', shape: 'cylinder', size: [4.2, 10.0, 4.2], position: [0, 5.8, 0], rotation: [0, 0, 0], material: 'granite_stone', taper: 0.88 },
      // Arched timber entrance door
      { id: 'door_frame', parent: 'tower_shaft', shape: 'box', size: [1.4, 2.4, 0.3], position: [0, 1.8, 2.05], rotation: [0, 0, 0], material: 'dark_timber' },
      // Arrow slit windows along the shaft
      { id: 'arrow_slit_1', parent: 'tower_shaft', shape: 'box', size: [0.25, 1.1, 0.2], position: [0, 5.2, 1.95], rotation: [0, 0, 0], material: 'iron_bands' },
      { id: 'arrow_slit_2', parent: 'tower_shaft', shape: 'box', size: [0.25, 1.1, 0.2], position: [1.9, 7.5, 0], rotation: [0, 90, 0], material: 'iron_bands', mirrorX: true },
      // Corbelled parapet ring (flaring out at the top)
      { id: 'corbel_ring', parent: 'tower_shaft', shape: 'cylinder', size: [4.6, 0.6, 4.6], position: [0, 11.1, 0], rotation: [0, 0, 0], material: 'granite_stone', taper: 1.15 },
      // Upper observation deck floor
      { id: 'parapet_floor', parent: 'corbel_ring', shape: 'cylinder', size: [4.9, 0.4, 4.9], position: [0, 11.5, 0], rotation: [0, 0, 0], material: 'granite_stone' },
      // Crenellated battlements (merlons)
      { id: 'crenell_front', parent: 'parapet_floor', shape: 'box', size: [1.1, 1.0, 0.35], position: [0, 12.1, 2.25], rotation: [0, 0, 0], material: 'granite_stone' },
      { id: 'crenell_back', parent: 'parapet_floor', shape: 'box', size: [1.1, 1.0, 0.35], position: [0, 12.1, -2.25], rotation: [0, 0, 0], material: 'granite_stone' },
      { id: 'crenell_side', parent: 'parapet_floor', shape: 'box', size: [0.35, 1.0, 1.1], position: [2.25, 12.1, 0], rotation: [0, 0, 0], material: 'granite_stone', mirrorX: true },
      { id: 'crenell_diag_f', parent: 'parapet_floor', shape: 'box', size: [1.0, 1.0, 0.35], position: [1.6, 12.1, 1.6], rotation: [0, 45, 0], material: 'granite_stone', mirrorX: true },
      { id: 'crenell_diag_b', parent: 'parapet_floor', shape: 'box', size: [1.0, 1.0, 0.35], position: [1.6, 12.1, -1.6], rotation: [0, -45, 0], material: 'granite_stone', mirrorX: true },
      // Flagpole and waving heraldic banner
      { id: 'flagpole', parent: 'parapet_floor', shape: 'cylinder', size: [0.08, 3.2, 0.08], position: [0, 13.0, 0], rotation: [0, 0, 0], material: 'iron_bands' },
      { id: 'banner', parent: 'flagpole', shape: 'box', size: [1.4, 0.7, 0.04], position: [0.75, 14.1, 0], rotation: [0, 0, 0], material: 'banner_crimson', motion: { type: 'swing', axis: 'y', speed: 4, amplitude: 15 } },
    ],
  },

  'timber cottage': {
    version: 1,
    name: 'Timber Cottage',
    route: 'author',
    heightMeters: 5.8,
    identity:
      'Rustic half-timbered medieval cottage with stone foundation plinth, pitched tiled roof, stone chimney stack, and timber framed windows.',
    materials: [
      { id: 'plaster_white', color: '#f3f4f6', roughness: 0.9, metalness: 0.0 },
      { id: 'dark_beams', color: '#3e2723', roughness: 0.8, metalness: 0.0 },
      { id: 'terracotta_tiles', color: '#9a3412', roughness: 0.7, metalness: 0.05 },
      { id: 'stone_chimney', color: '#57534e', roughness: 0.9, metalness: 0.05 },
      { id: 'warm_window', color: '#fef08a', roughness: 0.2, metalness: 0.1, emissive: true },
    ],
    parts: [
      // Stone foundation
      { id: 'cottage_foundation', shape: 'box', size: [5.8, 0.6, 4.4], position: [0, 0.3, 0], rotation: [0, 0, 0], material: 'stone_chimney' },
      // Main building volume
      { id: 'main_walls', shape: 'box', size: [5.4, 2.6, 4.0], position: [0, 1.9, 0], rotation: [0, 0, 0], material: 'plaster_white' },
      // Timber corner posts (mirrored)
      { id: 'corner_post_front', shape: 'box', size: [0.22, 2.6, 0.22], position: [2.65, 1.9, 1.95], rotation: [0, 0, 0], material: 'dark_beams', mirrorX: true },
      { id: 'corner_post_back', shape: 'box', size: [0.22, 2.6, 0.22], position: [2.65, 1.9, -1.95], rotation: [0, 0, 0], material: 'dark_beams', mirrorX: true },
      // Door
      { id: 'front_door', shape: 'box', size: [1.1, 1.9, 0.15], position: [-1.2, 1.55, 2.05], rotation: [0, 0, 0], material: 'dark_beams' },
      // Shuttered front window
      { id: 'front_window', shape: 'box', size: [1.2, 1.0, 0.12], position: [1.3, 2.0, 2.04], rotation: [0, 0, 0], material: 'warm_window' },
      // Pitched gabled roof
      { id: 'roof_left', shape: 'box', size: [3.3, 0.18, 4.8], position: [-1.45, 4.0, 0], rotation: [0, 0, 36], material: 'terracotta_tiles' },
      { id: 'roof_right', shape: 'box', size: [3.3, 0.18, 4.8], position: [1.45, 4.0, 0], rotation: [0, 0, -36], material: 'terracotta_tiles' },
      // Gable front & back triangular infill
      { id: 'gable_front', shape: 'box', size: [4.4, 1.6, 0.15], position: [0, 3.8, 1.92], rotation: [0, 0, 0], material: 'plaster_white' },
      { id: 'gable_back', shape: 'box', size: [4.4, 1.6, 0.15], position: [0, 3.8, -1.92], rotation: [0, 0, 0], material: 'plaster_white' },
      // Stone chimney stack
      { id: 'chimney', shape: 'box', size: [0.8, 3.8, 0.8], position: [1.8, 3.8, -0.6], rotation: [0, 0, 0], material: 'stone_chimney' },
      { id: 'chimney_pot', parent: 'chimney', shape: 'cylinder', size: [0.35, 0.6, 0.35], position: [1.8, 5.9, -0.6], rotation: [0, 0, 0], material: 'terracotta_tiles' },
    ],
  },

  'coastal lighthouse': {
    version: 1,
    name: 'Coastal Lighthouse',
    route: 'author',
    heightMeters: 26.0,
    identity:
      'Tall conical maritime lighthouse tower with iconic red and white masonry bands, upper gallery observation catwalk railing, cylindrical glass beacon room, and rotating Fresnel spotlight lens.',
    materials: [
      { id: 'tower_white', color: '#f8fafc', roughness: 0.5, metalness: 0.05 },
      { id: 'tower_red', color: '#dc2626', roughness: 0.55, metalness: 0.05 },
      { id: 'black_iron', color: '#1e293b', roughness: 0.35, metalness: 0.9 },
      { id: 'beacon_glass', color: '#e0f2fe', roughness: 0.1, metalness: 0.1, opacity: 0.6 },
      { id: 'fresnel_light', color: '#fef08a', roughness: 0.1, metalness: 0.2, emissive: true },
    ],
    parts: [
      // Octagonal granite base
      { id: 'lighthouse_base', shape: 'cylinder', size: [7.0, 1.6, 7.0], position: [0, 0.8, 0], rotation: [0, 0, 0], material: 'black_iron' },
      // Lower white section
      { id: 'tower_sec_1', shape: 'cylinder', size: [5.8, 6.0, 5.8], position: [0, 4.6, 0], rotation: [0, 0, 0], material: 'tower_white', taper: 0.92 },
      // Middle red band
      { id: 'tower_sec_2', shape: 'cylinder', size: [5.3, 5.5, 5.3], position: [0, 10.3, 0], rotation: [0, 0, 0], material: 'tower_red', taper: 0.92 },
      // Upper white section
      { id: 'tower_sec_3', shape: 'cylinder', size: [4.8, 5.5, 4.8], position: [0, 15.8, 0], rotation: [0, 0, 0], material: 'tower_white', taper: 0.92 },
      // Upper red collar
      { id: 'tower_sec_4', shape: 'cylinder', size: [4.4, 3.0, 4.4], position: [0, 20.0, 0], rotation: [0, 0, 0], material: 'tower_red', taper: 0.95 },
      // Gallery platform deck
      { id: 'gallery_deck', shape: 'cylinder', size: [5.2, 0.5, 5.2], position: [0, 21.75, 0], rotation: [0, 0, 0], material: 'black_iron' },
      // Gallery catwalk railing
      { id: 'gallery_rail', parent: 'gallery_deck', shape: 'torus', size: [5.1, 0.08, 0], position: [0, 22.4, 0], rotation: [90, 0, 0], material: 'black_iron' },
      // Lantern housing glass cylinder
      { id: 'lantern_glass', shape: 'cylinder', size: [3.4, 2.6, 3.4], position: [0, 23.3, 0], rotation: [0, 0, 0], material: 'beacon_glass' },
      // Rotating Fresnel beacon core
      { id: 'fresnel_lamp', parent: 'lantern_glass', shape: 'cylinder', size: [1.2, 1.4, 1.2], position: [0, 23.3, 0], rotation: [0, 0, 0], material: 'fresnel_light', motion: { type: 'spin', axis: 'y', speed: 2.5, amplitude: 0 } },
      // Domed lantern roof
      { id: 'lantern_dome', shape: 'cone', size: [3.8, 1.4, 3.8], position: [0, 25.3, 0], rotation: [0, 0, 0], material: 'black_iron' },
      // Weather vane / lightning rod finial
      { id: 'finial_rod', parent: 'lantern_dome', shape: 'cylinder', size: [0.08, 1.2, 0.08], position: [0, 26.5, 0], rotation: [0, 0, 0], material: 'black_iron' },
    ],
  },

  'windmill millhouse': {
    version: 1,
    name: 'Windmill',
    route: 'author',
    heightMeters: 16.5,
    identity:
      'Traditional octagonal brick and timber windmill tower with rotating cap dome, forward hub drive, and four large cross sail lattice arms with fabric sails.',
    materials: [
      { id: 'brick_base', color: '#991b1b', roughness: 0.85, metalness: 0.05 },
      { id: 'weathered_timber', color: '#451a03', roughness: 0.8, metalness: 0.0 },
      { id: 'sail_canvas', color: '#fef3c7', roughness: 0.9, metalness: 0.0 },
      { id: 'iron_hub', color: '#1f2937', roughness: 0.35, metalness: 0.9 },
    ],
    parts: [
      // Octagonal masonry tower body
      { id: 'tower_body', shape: 'cylinder', size: [6.4, 11.0, 6.4], position: [0, 5.5, 0], rotation: [0, 0, 0], material: 'brick_base', taper: 0.72 },
      // Rotating cap dome
      { id: 'cap_dome', shape: 'cone', size: [4.8, 2.2, 4.8], position: [0, 12.0, 0], rotation: [0, 0, 0], material: 'weathered_timber' },
      // Sail axle hub projecting forward (+Z)
      { id: 'hub_axle', shape: 'cylinder', size: [0.65, 1.2, 0.65], position: [0, 11.8, 2.6], rotation: [90, 0, 0], material: 'iron_hub', motion: { type: 'spin', axis: 'z', speed: 1.2, amplitude: 0 } },
      // 4 Cross Sail Arms attached to rotating hub
      { id: 'sail_arm_v', parent: 'hub_axle', shape: 'box', size: [0.18, 13.0, 0.18], position: [0, 11.8, 2.7], rotation: [0, 0, 0], material: 'weathered_timber' },
      { id: 'sail_arm_h', parent: 'hub_axle', shape: 'box', size: [13.0, 0.18, 0.18], position: [0, 11.8, 2.7], rotation: [0, 0, 0], material: 'weathered_timber' },
      // Fabric canvas blades on each arm
      { id: 'canvas_top', parent: 'hub_axle', shape: 'box', size: [1.2, 5.2, 0.04], position: [0.6, 14.8, 2.72], rotation: [0, 0, 0], material: 'sail_canvas' },
      { id: 'canvas_bottom', parent: 'hub_axle', shape: 'box', size: [1.2, 5.2, 0.04], position: [-0.6, 8.8, 2.72], rotation: [0, 0, 0], material: 'sail_canvas' },
      { id: 'canvas_right', parent: 'hub_axle', shape: 'box', size: [5.2, 1.2, 0.04], position: [3.0, 12.4, 2.72], rotation: [0, 0, 0], material: 'sail_canvas' },
      { id: 'canvas_left', parent: 'hub_axle', shape: 'box', size: [5.2, 1.2, 0.04], position: [-3.0, 11.2, 2.72], rotation: [0, 0, 0], material: 'sail_canvas' },
    ],
  },

  // ================= 2. VEHICLES =================
  'cyberpunk hover car': {
    version: 1,
    name: 'Cyberpunk Hover Car',
    route: 'author',
    heightMeters: 1.35,
    identity:
      'Futuristic aerodynamic groundcar chassis with enclosed cockpit bubble, angular rear fin spoilers, twin front headlights, and four gimballed hover repulsor turbine thrusters with cyan glow.',
    materials: [
      { id: 'carbon_matte', color: '#18181b', roughness: 0.4, metalness: 0.6 },
      { id: 'cyber_cyan', color: '#06b6d4', roughness: 0.1, metalness: 0.8, emissive: true },
      { id: 'cockpit_tint', color: '#0f172a', roughness: 0.15, metalness: 0.4, opacity: 0.85 },
      { id: 'thruster_core', color: '#38bdf8', roughness: 0.2, metalness: 0.9, emissive: true },
      { id: 'taillight_red', color: '#ef4444', roughness: 0.1, metalness: 0.1, emissive: true },
    ],
    parts: [
      // Main central wedge chassis (hovering 0.35m above ground)
      { id: 'chassis_main', shape: 'box', size: [2.1, 0.55, 4.4], position: [0, 0.6, 0], rotation: [0, 0, 0], material: 'carbon_matte' },
      // Sloped hood nose
      { id: 'nose_slope', shape: 'box', size: [1.9, 0.3, 1.4], position: [0, 0.5, 2.1], rotation: [-8, 0, 0], material: 'carbon_matte' },
      // Cockpit bubble canopy
      { id: 'cockpit_canopy', shape: 'ellipsoid', size: [1.6, 0.75, 2.2], position: [0, 0.98, -0.2], rotation: [0, 0, 0], material: 'cockpit_tint' },
      // Twin cyan front headlight strips
      { id: 'headlight_l', shape: 'box', size: [0.65, 0.08, 0.12], position: [0.65, 0.48, 2.75], rotation: [0, 0, 0], material: 'cyber_cyan', mirrorX: true },
      // Rear aerodynamic spoiler fins
      { id: 'fin_left', shape: 'box', size: [0.12, 0.55, 1.1], position: [1.0, 0.95, -1.8], rotation: [0, 0, 12], material: 'carbon_matte', mirrorX: true },
      { id: 'rear_tail_strip', shape: 'box', size: [1.9, 0.08, 0.08], position: [0, 0.65, -2.22], rotation: [0, 0, 0], material: 'taillight_red' },
      // 4 Hover Repulsor Thruster Pods (replaces wheels)
      { id: 'thruster_front_r', shape: 'cylinder', size: [0.7, 0.35, 0.7], position: [1.15, 0.35, 1.4], rotation: [0, 0, 0], material: 'thruster_core', mirrorX: true },
      { id: 'thruster_rear_r', shape: 'cylinder', size: [0.75, 0.35, 0.75], position: [1.15, 0.35, -1.4], rotation: [0, 0, 0], material: 'thruster_core', mirrorX: true },
      // Repulsor energy rings
      { id: 'energy_ring_f', shape: 'torus', size: [0.8, 0.06, 0], position: [1.15, 0.22, 1.4], rotation: [90, 0, 0], material: 'cyber_cyan', mirrorX: true },
      { id: 'energy_ring_r', shape: 'torus', size: [0.85, 0.06, 0], position: [1.15, 0.22, -1.4], rotation: [90, 0, 0], material: 'cyber_cyan', mirrorX: true },
    ],
  },

  'attack helicopter gunship': {
    version: 1,
    name: 'Attack Helicopter',
    route: 'author',
    heightMeters: 4.2,
    identity:
      'Military tandem-cockpit attack helicopter with stepped glass canopy, stub weapon wings, rotating main rotor blades, tail boom with vertical fin, and spinning tail rotor.',
    materials: [
      { id: 'olive_armor', color: '#3f4b3b', roughness: 0.65, metalness: 0.3 },
      { id: 'tinted_visor', color: '#1e293b', roughness: 0.15, metalness: 0.5, opacity: 0.8 },
      { id: 'dark_metal', color: '#18181b', roughness: 0.3, metalness: 0.85 },
      { id: 'sensor_amber', color: '#f59e0b', roughness: 0.2, metalness: 0.5, emissive: true },
    ],
    parts: [
      // Fuselage main cabin
      { id: 'fuselage', shape: 'capsule', size: [1.4, 2.2, 7.5], position: [0, 2.2, 0.2], rotation: [90, 0, 0], material: 'olive_armor' },
      // Stepped tandem cockpit glass
      { id: 'cockpit_front', shape: 'ellipsoid', size: [1.1, 0.9, 2.2], position: [0, 2.4, 2.4], rotation: [-12, 0, 0], material: 'tinted_visor' },
      // Nose chin sensor ball
      { id: 'sensor_ball', shape: 'ellipsoid', size: [0.65, 0.65, 0.65], position: [0, 1.5, 3.8], rotation: [0, 0, 0], material: 'sensor_amber' },
      // Landing skids
      { id: 'skid_left', shape: 'cylinder', size: [0.1, 5.2, 0.1], position: [1.1, 0.12, 0.2], rotation: [90, 0, 0], material: 'dark_metal', mirrorX: true },
      { id: 'skid_strut_f', shape: 'cylinder', size: [0.08, 1.4, 0.08], position: [0.8, 0.8, 1.8], rotation: [0, 0, 25], material: 'dark_metal', mirrorX: true },
      { id: 'skid_strut_r', shape: 'cylinder', size: [0.08, 1.4, 0.08], position: [0.8, 0.8, -1.4], rotation: [0, 0, 25], material: 'dark_metal', mirrorX: true },
      // Stub weapons wings
      { id: 'wing_stub', shape: 'box', size: [3.4, 0.18, 0.6], position: [0, 2.0, 0.4], rotation: [0, 0, 0], material: 'olive_armor' },
      { id: 'rocket_pod_r', shape: 'cylinder', size: [0.38, 1.4, 0.38], position: [1.5, 1.85, 0.4], rotation: [90, 0, 0], material: 'dark_metal', mirrorX: true },
      // Main Rotor Mast and Hub with fast spin
      { id: 'rotor_hub', shape: 'cylinder', size: [0.55, 0.6, 0.55], position: [0, 3.5, 0.4], rotation: [0, 0, 0], material: 'dark_metal', motion: { type: 'spin', axis: 'y', speed: 18, amplitude: 0 } },
      // 4 Main Rotor Blades
      { id: 'blade_a', parent: 'rotor_hub', shape: 'box', size: [0.3, 0.04, 11.0], position: [0, 3.65, 0.4], rotation: [0, 0, 0], material: 'dark_metal' },
      { id: 'blade_b', parent: 'rotor_hub', shape: 'box', size: [11.0, 0.04, 0.3], position: [0, 3.65, 0.4], rotation: [0, 0, 0], material: 'dark_metal' },
      // Tail boom
      { id: 'tail_boom', shape: 'cylinder', size: [0.55, 6.2, 0.55], position: [0, 2.3, -4.6], rotation: [90, 0, 0], material: 'olive_armor', taper: 0.6 },
      // Tail vertical stabilizer fin
      { id: 'tail_fin', parent: 'tail_boom', shape: 'box', size: [0.15, 1.8, 1.1], position: [0, 3.1, -7.4], rotation: [15, 0, 0], material: 'olive_armor' },
      // Tail rotor hub with spin
      { id: 'tail_rotor_hub', parent: 'tail_fin', shape: 'cylinder', size: [0.25, 0.25, 0.25], position: [0.2, 3.4, -7.5], rotation: [0, 0, 90], material: 'dark_metal', motion: { type: 'spin', axis: 'x', speed: 28, amplitude: 0 } },
      { id: 'tail_blade', parent: 'tail_rotor_hub', shape: 'box', size: [0.03, 1.8, 0.15], position: [0.25, 3.4, -7.5], rotation: [0, 0, 0], material: 'dark_metal' },
    ],
  },

  // ================= 3. SCI-FI & TECH =================
  'tokamak fusion reactor': {
    version: 1,
    name: 'Tokamak Fusion Reactor',
    route: 'author',
    heightMeters: 5.5,
    identity:
      'Industrial toroidal fusion tokamak vessel with massive circular vacuum chamber, central solenoid magnetic column, poloidal magnetic coil rings, diagnostic conduits, and an inner glowing stellar plasma core.',
    materials: [
      { id: 'brushed_titanium', color: '#94a3b8', roughness: 0.3, metalness: 0.9 },
      { id: 'copper_coils', color: '#b45309', roughness: 0.35, metalness: 0.85 },
      { id: 'plasma_cyan', color: '#38bdf8', roughness: 0.05, metalness: 0.1, emissive: true },
      { id: 'containment_dark', color: '#0f172a', roughness: 0.5, metalness: 0.8 },
      { id: 'amber_glow', color: '#f59e0b', roughness: 0.1, metalness: 0.2, emissive: true },
    ],
    parts: [
      // Heavy pedestal base
      { id: 'reactor_base', shape: 'cylinder', size: [6.4, 0.6, 6.4], position: [0, 0.3, 0], rotation: [0, 0, 0], material: 'containment_dark' },
      // Central solenoid magnetic pillar
      { id: 'central_solenoid', shape: 'cylinder', size: [1.4, 5.0, 1.4], position: [0, 2.8, 0], rotation: [0, 0, 0], material: 'copper_coils' },
      // Toroidal vacuum vessel chamber
      { id: 'vacuum_torus', shape: 'torus', size: [4.8, 0.95, 0], position: [0, 2.8, 0], rotation: [90, 0, 0], material: 'brushed_titanium' },
      // Inner glowing plasma core visible through diagnostic port
      { id: 'inner_plasma_ring', shape: 'torus', size: [4.6, 0.45, 0], position: [0, 2.8, 0], rotation: [90, 0, 0], material: 'plasma_cyan', motion: { type: 'spin', axis: 'y', speed: 3.5, amplitude: 0 } },
      // Upper and lower Poloidal magnetic field rings
      { id: 'poloidal_upper', shape: 'torus', size: [5.8, 0.25, 0], position: [0, 4.5, 0], rotation: [90, 0, 0], material: 'copper_coils' },
      { id: 'poloidal_lower', shape: 'torus', size: [5.8, 0.25, 0], position: [0, 1.1, 0], rotation: [90, 0, 0], material: 'copper_coils' },
      // 6 Vertical D-shaped structural magnet clamps around perimeter
      { id: 'magnet_clamp_1', shape: 'box', size: [0.45, 4.4, 1.8], position: [2.6, 2.8, 0], rotation: [0, 0, 0], material: 'containment_dark', mirrorX: true },
      { id: 'magnet_clamp_2', shape: 'box', size: [1.8, 4.4, 0.45], position: [0, 2.8, 2.6], rotation: [0, 0, 0], material: 'containment_dark' },
      { id: 'magnet_clamp_3', shape: 'box', size: [1.8, 4.4, 0.45], position: [0, 2.8, -2.6], rotation: [0, 0, 0], material: 'containment_dark' },
      // Cryogenic coolant conduits
      { id: 'coolant_pipe_r', shape: 'cylinder', size: [0.18, 4.0, 0.18], position: [1.8, 2.8, 1.8], rotation: [0, 0, 0], material: 'brushed_titanium', mirrorX: true },
      { id: 'coolant_pipe_b', shape: 'cylinder', size: [0.18, 4.0, 0.18], position: [1.8, 2.8, -1.8], rotation: [0, 0, 0], material: 'brushed_titanium', mirrorX: true },
    ],
  },

  'holographic projector pedestal': {
    version: 1,
    name: 'Holographic Projector',
    route: 'author',
    heightMeters: 2.1,
    identity:
      'Sleek hexagonal sci-fi projector dais with beveled floor plinth, glowing diagnostic ring, recessed emitter lens, and projecting a levitating 3D volumetric holo-mesh.',
    materials: [
      { id: 'dark_alloy', color: '#1e293b', roughness: 0.35, metalness: 0.8 },
      { id: 'cyan_glow', color: '#22d3ee', roughness: 0.1, metalness: 0.1, emissive: true },
      { id: 'holo_volumetric', color: '#38bdf8', roughness: 0.1, metalness: 0.1, opacity: 0.65, emissive: true },
    ],
    parts: [
      // Base floor dais
      { id: 'base_pedestal', shape: 'cylinder', size: [1.6, 0.25, 1.6], position: [0, 0.12, 0], rotation: [0, 0, 0], material: 'dark_alloy' },
      // Tapered central stand
      { id: 'central_stand', shape: 'cylinder', size: [1.0, 0.9, 1.0], position: [0, 0.7, 0], rotation: [0, 0, 0], material: 'dark_alloy', taper: 0.8 },
      // Glowing emitter ring
      { id: 'emitter_ring', shape: 'torus', size: [0.95, 0.06, 0], position: [0, 1.15, 0], rotation: [90, 0, 0], material: 'cyan_glow' },
      // Recessed optical lens
      { id: 'emitter_lens', shape: 'cylinder', size: [0.75, 0.1, 0.75], position: [0, 1.16, 0], rotation: [0, 0, 0], material: 'cyan_glow' },
      // Floating 3D holographic projection (geometric octahedron/orb with slow bob and spin)
      { id: 'holo_projection_core', shape: 'ellipsoid', size: [0.7, 0.7, 0.7], position: [0, 1.8, 0], rotation: [0, 0, 0], material: 'holo_volumetric', motion: { type: 'spin', axis: 'y', speed: 2.0, amplitude: 0 } },
      { id: 'holo_orbit_ring', shape: 'torus', size: [1.1, 0.04, 0], position: [0, 1.8, 0], rotation: [45, 0, 0], material: 'cyan_glow', motion: { type: 'spin', axis: 'z', speed: 3.0, amplitude: 0 } },
    ],
  },

  'quantum reactor core': {
    version: 1,
    name: 'Quantum Reactor Core',
    route: 'author',
    heightMeters: 3.4,
    identity:
      'Hexagonal magnetic containment pedestal with three curved stabilizer pylons and a central levitating pulsing energy orb.',
    materials: [
      { id: 'matte_slate', color: '#0f172a', roughness: 0.4, metalness: 0.7 },
      { id: 'quantum_plasma', color: '#a855f7', roughness: 0.1, metalness: 0.2, emissive: true },
      { id: 'gold_conductors', color: '#f59e0b', roughness: 0.25, metalness: 0.9 },
    ],
    parts: [
      { id: 'pedestal', shape: 'cylinder', size: [2.6, 0.4, 2.6], position: [0, 0.2, 0], rotation: [0, 0, 0], material: 'matte_slate' },
      { id: 'lower_emitter', shape: 'cylinder', size: [1.6, 0.5, 1.6], position: [0, 0.65, 0], rotation: [0, 0, 0], material: 'gold_conductors' },
      // 3 curved magnetic stabilizer pylons
      { id: 'pylon_a', shape: 'box', size: [0.35, 2.8, 0.5], position: [0, 1.7, 1.3], rotation: [-10, 0, 0], material: 'matte_slate' },
      { id: 'pylon_b', shape: 'box', size: [0.35, 2.8, 0.5], position: [1.12, 1.7, -0.65], rotation: [-10, 120, 0], material: 'matte_slate' },
      { id: 'pylon_c', shape: 'box', size: [0.35, 2.8, 0.5], position: [-1.12, 1.7, -0.65], rotation: [-10, -120, 0], material: 'matte_slate' },
      // Central levitating quantum core
      { id: 'quantum_orb', shape: 'ellipsoid', size: [1.1, 1.1, 1.1], position: [0, 1.85, 0], rotation: [0, 0, 0], material: 'quantum_plasma', motion: { type: 'bob', axis: 'y', speed: 2.2, amplitude: 8 } },
      { id: 'top_containment_cap', shape: 'cylinder', size: [1.8, 0.35, 1.8], position: [0, 3.2, 0], rotation: [0, 0, 0], material: 'gold_conductors' },
    ],
  },

  // ================= 4. FURNITURE & PROPS =================
  'commercial espresso machine': {
    version: 1,
    name: 'Espresso Machine',
    route: 'author',
    heightMeters: 0.65,
    identity:
      'Professional Italian commercial espresso machine with polished stainless steel body, twin group heads, dual angled portafilter handles, steam wands, drip tray grate, and cup warming top rail.',
    materials: [
      { id: 'polished_steel', color: '#e2e8f0', roughness: 0.15, metalness: 0.95 },
      { id: 'matte_black', color: '#18181b', roughness: 0.5, metalness: 0.1 },
      { id: 'brass_copper', color: '#b45309', roughness: 0.3, metalness: 0.85 },
      { id: 'pressure_gauge', color: '#f8fafc', roughness: 0.2, metalness: 0.1 },
    ],
    parts: [
      // Base frame and drip tray
      { id: 'drip_tray', shape: 'box', size: [0.75, 0.1, 0.55], position: [0, 0.05, 0], rotation: [0, 0, 0], material: 'matte_black' },
      { id: 'cup_grate', shape: 'box', size: [0.72, 0.02, 0.5], position: [0, 0.11, 0.02], rotation: [0, 0, 0], material: 'polished_steel' },
      // Main boiler body cabinet
      { id: 'main_cabinet', shape: 'box', size: [0.75, 0.45, 0.42], position: [0, 0.38, -0.06], rotation: [0, 0, 0], material: 'polished_steel' },
      // Twin group heads projecting forward
      { id: 'group_head_l', shape: 'cylinder', size: [0.12, 0.12, 0.12], position: [-0.18, 0.32, 0.16], rotation: [0, 0, 0], material: 'polished_steel' },
      { id: 'group_head_r', shape: 'cylinder', size: [0.12, 0.12, 0.12], position: [0.18, 0.32, 0.16], rotation: [0, 0, 0], material: 'polished_steel' },
      // Portafilter handles
      { id: 'portafilter_l', shape: 'cylinder', size: [0.035, 0.18, 0.035], position: [-0.18, 0.28, 0.26], rotation: [80, -15, 0], material: 'matte_black' },
      { id: 'portafilter_r', shape: 'cylinder', size: [0.035, 0.18, 0.035], position: [0.18, 0.28, 0.26], rotation: [80, 15, 0], material: 'matte_black' },
      // Dual steam wands
      { id: 'steam_wand_l', shape: 'cylinder', size: [0.018, 0.26, 0.018], position: [-0.34, 0.26, 0.18], rotation: [25, 0, -25], material: 'polished_steel' },
      { id: 'steam_wand_r', shape: 'cylinder', size: [0.018, 0.26, 0.018], position: [0.34, 0.26, 0.18], rotation: [25, 0, 25], material: 'polished_steel' },
      // Front pressure barometers
      { id: 'gauge_left', shape: 'cylinder', size: [0.07, 0.02, 0.07], position: [-0.28, 0.46, 0.16], rotation: [90, 0, 0], material: 'pressure_gauge' },
      { id: 'gauge_right', shape: 'cylinder', size: [0.07, 0.02, 0.07], position: [0.28, 0.46, 0.16], rotation: [90, 0, 0], material: 'pressure_gauge' },
      // Top cup warming guard rail
      { id: 'cup_rail', shape: 'torus', size: [0.65, 0.015, 0], position: [0, 0.63, -0.06], rotation: [90, 0, 0], material: 'polished_steel' },
    ],
  },

  'chesterfield leather sofa': {
    version: 1,
    name: 'Chesterfield Sofa',
    route: 'author',
    heightMeters: 0.85,
    identity:
      'Classic British deep button-tufted oxblood leather sofa with rolled scroll armrests, thick cushioned seat base, and turned wooden feet.',
    materials: [
      { id: 'oxblood_leather', color: '#581c1c', roughness: 0.45, metalness: 0.05 },
      { id: 'cushion_leather', color: '#451212', roughness: 0.5, metalness: 0.05 },
      { id: 'turned_wood', color: '#271206', roughness: 0.3, metalness: 0.0 },
      { id: 'brass_studs', color: '#d97706', roughness: 0.2, metalness: 0.9 },
    ],
    parts: [
      // 4 turned wooden feet
      { id: 'foot_fl', shape: 'cylinder', size: [0.1, 0.12, 0.1], position: [1.0, 0.06, 0.4], rotation: [0, 0, 0], material: 'turned_wood', mirrorX: true },
      { id: 'foot_bl', shape: 'cylinder', size: [0.1, 0.12, 0.1], position: [1.0, 0.06, -0.4], rotation: [0, 0, 0], material: 'turned_wood', mirrorX: true },
      // Base plinth
      { id: 'sofa_base', shape: 'box', size: [2.3, 0.25, 0.95], position: [0, 0.24, 0], rotation: [0, 0, 0], material: 'oxblood_leather' },
      // Twin seat cushions
      { id: 'cushion_left', shape: 'box', size: [0.82, 0.18, 0.72], position: [-0.43, 0.44, 0.05], rotation: [0, 0, 0], material: 'cushion_leather' },
      { id: 'cushion_right', shape: 'box', size: [0.82, 0.18, 0.72], position: [0.43, 0.44, 0.05], rotation: [0, 0, 0], material: 'cushion_leather' },
      // Deep button-tufted backrest
      { id: 'backrest', shape: 'box', size: [2.3, 0.48, 0.28], position: [0, 0.62, -0.34], rotation: [0, 0, 0], material: 'oxblood_leather' },
      // Rolled scroll armrests
      { id: 'armrest_roll_r', shape: 'cylinder', size: [0.32, 0.95, 0.32], position: [1.12, 0.58, 0], rotation: [90, 0, 0], material: 'oxblood_leather', mirrorX: true },
    ],
  },

  'grand concert piano': {
    version: 1,
    name: 'Grand Concert Piano',
    route: 'author',
    heightMeters: 1.45,
    identity:
      'Majestic acoustic concert grand piano with gloss black lacquer curved rim body, prop-supported open lid, white/ebony keyboard bed, lyre pedals, and tapered spade legs.',
    materials: [
      { id: 'black_lacquer', color: '#09090b', roughness: 0.1, metalness: 0.2 },
      { id: 'white_keys', color: '#f8fafc', roughness: 0.2, metalness: 0.0 },
      { id: 'gold_cast_iron', color: '#ca8a04', roughness: 0.35, metalness: 0.8 },
      { id: 'brass_pedals', color: '#eab308', roughness: 0.25, metalness: 0.9 },
    ],
    parts: [
      // 3 tapered legs with casters
      { id: 'leg_front_left', shape: 'cylinder', size: [0.12, 0.68, 0.12], position: [-0.68, 0.34, 0.8], rotation: [0, 0, 0], material: 'black_lacquer' },
      { id: 'leg_front_right', shape: 'cylinder', size: [0.12, 0.68, 0.12], position: [0.68, 0.34, 0.8], rotation: [0, 0, 0], material: 'black_lacquer' },
      { id: 'leg_tail', shape: 'cylinder', size: [0.12, 0.68, 0.12], position: [0.1, 0.34, -1.6], rotation: [0, 0, 0], material: 'black_lacquer' },
      // Main curved piano rim body
      { id: 'body_case', shape: 'box', size: [1.5, 0.36, 2.6], position: [0, 0.86, -0.3], rotation: [0, 0, 0], material: 'black_lacquer' },
      // Keyboard bed
      { id: 'keyboard_bed', shape: 'box', size: [1.3, 0.08, 0.24], position: [0, 0.74, 1.05], rotation: [0, 0, 0], material: 'white_keys' },
      // Gold cast-iron harp plate inside
      { id: 'cast_iron_harp', shape: 'box', size: [1.25, 0.04, 2.2], position: [0, 0.98, -0.3], rotation: [0, 0, 0], material: 'gold_cast_iron' },
      // Propped open lid
      { id: 'open_lid', shape: 'box', size: [1.5, 0.04, 2.6], position: [0.35, 1.5, -0.3], rotation: [0, 0, -28], material: 'black_lacquer' },
      { id: 'lid_prop_stick', shape: 'cylinder', size: [0.03, 0.75, 0.03], position: [0.68, 1.25, 0.2], rotation: [0, 0, 15], material: 'brass_pedals' },
      // Lyre pedal box
      { id: 'pedal_lyre', shape: 'box', size: [0.22, 0.45, 0.12], position: [0, 0.38, 0.3], rotation: [0, 0, 0], material: 'brass_pedals' },
    ],
  },

  'rustic stone fireplace': {
    version: 1,
    name: 'Rustic Stone Fireplace',
    route: 'author',
    heightMeters: 2.6,
    identity:
      'A rugged rustic stone fireplace crafted with rough-hewn fieldstone pillars, arched keystone lintel, dark soot firebox with glowing orange embers, cast iron log grate, charred firewood, and a heavy carved timber mantelpiece.',
    materials: [
      { id: 'rustic_fieldstone', color: '#57534e', roughness: 0.92, metalness: 0.04 },
      { id: 'soot_firebrick', color: '#1c1917', roughness: 0.95, metalness: 0.0 },
      { id: 'carved_timber', color: '#3e2723', roughness: 0.75, metalness: 0.05 },
      { id: 'glowing_embers', color: '#ea580c', roughness: 0.3, metalness: 0.0, emissive: true },
      { id: 'flickering_flame', color: '#fbbf24', roughness: 0.1, metalness: 0.0, emissive: true },
      { id: 'cast_iron', color: '#18181b', roughness: 0.45, metalness: 0.85 },
      { id: 'charred_logs', color: '#27201c', roughness: 0.9, metalness: 0.0 },
    ],
    parts: [
      // Extended slate/stone hearth floor slab
      { id: 'hearth_floor_slab', shape: 'box', size: [2.8, 0.12, 1.4], position: [0, 0.06, 0.3], rotation: [0, 0, 0], material: 'rustic_fieldstone' },
      // Recessed dark firebrick chamber (firebox)
      { id: 'firebox_chamber', shape: 'box', size: [1.8, 1.3, 0.8], position: [0, 0.77, -0.1], rotation: [0, 0, 0], material: 'soot_firebrick' },
      // Left stone pillar
      { id: 'pillar_left', shape: 'box', size: [0.55, 1.6, 0.75], position: [-1.15, 0.92, 0], rotation: [0, 0, 0], material: 'rustic_fieldstone' },
      // Right stone pillar
      { id: 'pillar_right', shape: 'box', size: [0.55, 1.6, 0.75], position: [1.15, 0.92, 0], rotation: [0, 0, 0], material: 'rustic_fieldstone' },
      // Arch stone lintel
      { id: 'arch_lintel', shape: 'box', size: [2.6, 0.38, 0.78], position: [0, 1.85, 0], rotation: [0, 0, 0], material: 'rustic_fieldstone' },
      // Heavy rustic carved timber mantelpiece
      { id: 'timber_mantel', shape: 'box', size: [3.0, 0.22, 0.92], position: [0, 2.08, 0.08], rotation: [0, 0, 0], material: 'carved_timber' },
      // Tapered stone chimney breast rising upward
      { id: 'chimney_breast', shape: 'box', size: [2.2, 1.2, 0.65], position: [0, 2.75, -0.05], rotation: [0, 0, 0], material: 'rustic_fieldstone', taper: 0.88 },
      // Cast iron log grate
      { id: 'iron_grate', shape: 'box', size: [1.1, 0.18, 0.55], position: [0, 0.22, 0], rotation: [0, 0, 0], material: 'cast_iron' },
      // Glowing incandescent ember bed
      { id: 'ember_bed', shape: 'box', size: [1.0, 0.08, 0.48], position: [0, 0.26, 0], rotation: [0, 0, 0], material: 'glowing_embers' },
      // Charred firewood logs
      { id: 'charred_log_1', shape: 'cylinder', size: [0.16, 0.95, 0.16], position: [-0.05, 0.38, -0.05], rotation: [0, 20, 90], material: 'charred_logs' },
      { id: 'charred_log_2', shape: 'cylinder', size: [0.15, 0.9, 0.15], position: [0.05, 0.42, 0.08], rotation: [0, -35, 85], material: 'charred_logs' },
      // Flickering golden flame core rising with subtle dynamic swing
      { id: 'flame_core', shape: 'cone', size: [0.5, 0.75, 0.5], position: [0, 0.65, 0], rotation: [0, 0, 0], material: 'flickering_flame', motion: { type: 'swing', axis: 'y', speed: 8, amplitude: 14 } },
    ],
  },
  'fireplace': null as any, // alias populated below
  'stone fireplace': null as any, // alias populated below

  // ================= 5. WEAPONS =================
  'gatling rotary cannon': {
    version: 1,
    name: 'Gatling Rotary Cannon',
    route: 'author',
    heightMeters: 1.15,
    identity:
      'Heavy six-barrel rotating rotary cannon with front clamp rings, central receiver housing, dual spade grips with butterfly trigger, and side-mounted ammo feed drum.',
    materials: [
      { id: 'gunmetal_steel', color: '#334155', roughness: 0.25, metalness: 0.9 },
      { id: 'matte_olive', color: '#365314', roughness: 0.6, metalness: 0.2 },
      { id: 'brass_casing', color: '#ca8a04', roughness: 0.25, metalness: 0.85 },
    ],
    parts: [
      // Receiver box housing
      { id: 'receiver_housing', shape: 'box', size: [0.38, 0.38, 0.65], position: [0, 0.8, -0.1], rotation: [0, 0, 0], material: 'matte_olive' },
      // Side ammo canister drum
      { id: 'ammo_drum', shape: 'cylinder', size: [0.35, 0.22, 0.35], position: [0.32, 0.8, -0.1], rotation: [0, 0, 90], material: 'brass_casing' },
      // Rotating barrel cluster hub
      { id: 'barrel_hub', shape: 'cylinder', size: [0.25, 1.1, 0.25], position: [0, 0.8, 0.75], rotation: [90, 0, 0], material: 'gunmetal_steel', motion: { type: 'spin', axis: 'z', speed: 24, amplitude: 0 } },
      // 6 rotary steel barrels
      { id: 'barrel_1', parent: 'barrel_hub', shape: 'cylinder', size: [0.045, 1.35, 0.045], position: [0, 0.92, 0.8], rotation: [90, 0, 0], material: 'gunmetal_steel' },
      { id: 'barrel_2', parent: 'barrel_hub', shape: 'cylinder', size: [0.045, 1.35, 0.045], position: [0, 0.68, 0.8], rotation: [90, 0, 0], material: 'gunmetal_steel' },
      { id: 'barrel_3', parent: 'barrel_hub', shape: 'cylinder', size: [0.045, 1.35, 0.045], position: [0.12, 0.86, 0.8], rotation: [90, 0, 0], material: 'gunmetal_steel', mirrorX: true },
      { id: 'barrel_4', parent: 'barrel_hub', shape: 'cylinder', size: [0.045, 1.35, 0.045], position: [0.12, 0.74, 0.8], rotation: [90, 0, 0], material: 'gunmetal_steel', mirrorX: true },
      // Front muzzle ring clamp
      { id: 'muzzle_clamp', parent: 'barrel_hub', shape: 'torus', size: [0.28, 0.035, 0], position: [0, 0.8, 1.45], rotation: [0, 0, 0], material: 'gunmetal_steel' },
      // Twin rear spade grips
      { id: 'spade_grip_r', shape: 'cylinder', size: [0.03, 0.24, 0.03], position: [0.16, 0.8, -0.52], rotation: [0, 0, 0], material: 'gunmetal_steel', mirrorX: true },
    ],
  },

  'samurai katana sword': {
    version: 1,
    name: 'Samurai Katana',
    route: 'author',
    heightMeters: 1.05,
    identity:
      'Authentic Japanese katana sword with gently curved folded steel blade, distinct edge temper line (hamon), circular iron handguard (tsuba), and braided silk handle wrap (tsuka) with pommel cap (kashira).',
    materials: [
      { id: 'folded_steel', color: '#e2e8f0', roughness: 0.1, metalness: 0.98 },
      { id: 'iron_tsuba', color: '#18181b', roughness: 0.4, metalness: 0.85 },
      { id: 'silk_wrap_gold', color: '#d97706', roughness: 0.65, metalness: 0.1 },
      { id: 'brass_habaki', color: '#f59e0b', roughness: 0.2, metalness: 0.9 },
    ],
    parts: [
      // Curved steel blade
      { id: 'blade', shape: 'box', size: [0.035, 0.76, 0.008], position: [0, 0.64, 0], rotation: [0, 0, 0], material: 'folded_steel' },
      // Blade collar (habaki)
      { id: 'habaki', shape: 'box', size: [0.04, 0.04, 0.014], position: [0, 0.27, 0], rotation: [0, 0, 0], material: 'brass_habaki' },
      // Circular handguard (tsuba)
      { id: 'tsuba', shape: 'cylinder', size: [0.09, 0.008, 0.09], position: [0, 0.25, 0], rotation: [0, 0, 0], material: 'iron_tsuba' },
      // Braided handle (tsuka)
      { id: 'tsuka_handle', shape: 'cylinder', size: [0.035, 0.24, 0.035], position: [0, 0.12, 0], rotation: [0, 0, 0], material: 'silk_wrap_gold' },
      // Pommel cap (kashira)
      { id: 'kashira_pommel', shape: 'cylinder', size: [0.038, 0.02, 0.038], position: [0, -0.01, 0], rotation: [0, 0, 0], material: 'iron_tsuba' },
    ],
  },
};

// Aliases
CURATED_SCULPT_SPECS['fireplace'] = CURATED_SCULPT_SPECS['rustic stone fireplace'];
CURATED_SCULPT_SPECS['stone fireplace'] = CURATED_SCULPT_SPECS['rustic stone fireplace'];
