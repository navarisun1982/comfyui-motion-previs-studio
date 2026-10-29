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

  'thatched timber cottage': {
    version: 1,
    name: 'Thatched Timber Cottage',
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
    heightMeters: 6.5,
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

  'hexagonal magnetic reactor': {
    version: 1,
    name: 'Hexagonal Magnetic Reactor',
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

  // ================= 8. CHARACTERS & CREATURES =================
  'tribal archer female': {
    version: 1,
    name: 'Tribal Archer Female',
    route: 'author',
    rig: 'humanoid',
    heightMeters: 1.75,
    identity:
      'Desert scout archer in layered cream linen tunic, weathered leather chest harness, brass buckles, back quiver with arrows, and recurve hunting bow.',
    materials: [
      { id: 'linen_cream', color: '#ded8c8', roughness: 0.82, metalness: 0.02 },
      { id: 'leather_brown', color: '#5a3825', roughness: 0.55, metalness: 0.05 },
      { id: 'skin_fair', color: '#e6ba95', roughness: 0.62, metalness: 0.0 },
      { id: 'hair_silver', color: '#ece8e2', roughness: 0.85, metalness: 0.0 },
      { id: 'wood_bow', color: '#4a2c16', roughness: 0.45, metalness: 0.0 },
      { id: 'brass_buckles', color: '#c59b27', roughness: 0.25, metalness: 0.85 },
      { id: 'boot_leather', color: '#3b2314', roughness: 0.65, metalness: 0.05 },
      { id: 'feather_fletch', color: '#f3f4f6', roughness: 0.7, metalness: 0.0 },
    ],
    parts: [
      // Pelvis & hips
      { id: 'pelvis', shape: 'blob', size: [0.28, 0.16, 0.22], position: [0, 0.95, 0], rotation: [0, 0, 0], material: 'linen_cream', roundness: 0.22, bone: 'Hips' },
      // Layered tunic skirt
      { id: 'tunic_skirt', parent: 'pelvis', shape: 'blob', size: [0.36, 0.35, 0.3], position: [0, 0.85, 0], rotation: [0, 0, 0], material: 'linen_cream', roundness: 0.25, taper: -0.2 },
      // Leather waist belt
      { id: 'belt', parent: 'pelvis', shape: 'torus', size: [0.34, 0.28, 0.05], position: [0, 0.97, 0], rotation: [90, 0, 0], material: 'leather_brown' },
      { id: 'belt_buckle', parent: 'belt', shape: 'box', size: [0.06, 0.06, 0.02], position: [0, 0.14, 0.97], rotation: [0, 0, 0], material: 'brass_buckles' },
      { id: 'side_pouch', parent: 'belt', shape: 'box', size: [0.08, 0.11, 0.06], position: [0.15, 0.11, 0.94], rotation: [0, 15, 0], material: 'leather_brown' },
      // Spine & chest
      { id: 'spine', parent: 'pelvis', shape: 'blob', size: [0.26, 0.22, 0.2], position: [0, 1.1, 0], rotation: [0, 0, 0], material: 'linen_cream', roundness: 0.2, bone: 'Spine' },
      { id: 'chest', parent: 'spine', shape: 'blob', size: [0.32, 0.28, 0.24], position: [0, 1.3, 0], rotation: [0, 0, 0], material: 'linen_cream', roundness: 0.22, bone: 'Chest' },
      { id: 'leather_harness', parent: 'chest', shape: 'box', size: [0.33, 0.2, 0.25], position: [0, 1.32, 0], rotation: [0, 0, 0], material: 'leather_brown' },
      { id: 'chest_strap', parent: 'chest', shape: 'box', size: [0.06, 0.3, 0.26], position: [0.04, 1.32, 0], rotation: [0, 0, -25], material: 'leather_brown' },
      // Neck, head & silver braided hair
      { id: 'neck', parent: 'chest', shape: 'cylinder', size: [0.1, 0.1, 0.1], position: [0, 1.48, 0], rotation: [0, 0, 0], material: 'skin_fair', bone: 'Neck' },
      { id: 'head', parent: 'neck', shape: 'blob', size: [0.18, 0.22, 0.2], position: [0, 1.62, 0.02], rotation: [0, 0, 0], material: 'skin_fair', roundness: 0.22, bone: 'Head' },
      { id: 'hair_hood', parent: 'head', shape: 'blob', size: [0.22, 0.24, 0.23], position: [0, 1.64, -0.02], rotation: [0, 0, 0], material: 'hair_silver', roundness: 0.35 },
      { id: 'hood_cowl', parent: 'neck', shape: 'torus', size: [0.3, 0.28, 0.08], position: [0, 1.47, 0], rotation: [90, 0, 0], material: 'linen_cream' },
      // Shoulders, arms, leather bracers, and hands (bilateral mirror across x=0)
      { id: 'shoulder_l', parent: 'chest', shape: 'blob', size: [0.12, 0.12, 0.12], position: [0.2, 1.38, 0], rotation: [0, 0, 0], material: 'linen_cream', mirrorX: true, bone: 'LeftShoulder' },
      { id: 'upper_arm_l', parent: 'shoulder_l', shape: 'cylinder', size: [0.09, 0.28, 0.09], position: [0.24, 1.24, 0], rotation: [0, 0, -10], material: 'linen_cream', taper: 0.1, mirrorX: true, bone: 'LeftArm' },
      { id: 'forearm_l', parent: 'upper_arm_l', shape: 'cylinder', size: [0.08, 0.26, 0.08], position: [0.27, 0.98, 0.02], rotation: [0, 0, -8], material: 'leather_brown', taper: 0.15, mirrorX: true, bone: 'LeftForeArm' },
      { id: 'hand_l', parent: 'forearm_l', shape: 'blob', size: [0.07, 0.1, 0.04], position: [0.28, 0.81, 0.04], rotation: [0, 0, 0], material: 'skin_fair', roundness: 0.25, mirrorX: true, bone: 'LeftHand' },
      // Legs, knees, calves, and wrapped boots (bilateral mirror across x=0)
      { id: 'thigh_l', parent: 'pelvis', shape: 'blob', size: [0.15, 0.42, 0.16], position: [0.12, 0.72, 0], rotation: [0, 0, 0], material: 'linen_cream', roundness: 0.2, mirrorX: true, bone: 'LeftUpLeg' },
      { id: 'shin_l', parent: 'thigh_l', shape: 'cylinder', size: [0.12, 0.4, 0.12], position: [0.12, 0.34, 0], rotation: [0, 0, 0], material: 'linen_cream', taper: 0.12, mirrorX: true, bone: 'LeftLeg' },
      { id: 'boot_l', parent: 'shin_l', shape: 'blob', size: [0.11, 0.16, 0.22], position: [0.12, 0.08, 0.04], rotation: [0, 0, 0], material: 'boot_leather', roundness: 0.28, mirrorX: true, bone: 'LeftFoot' },
      // Back quiver with hunting arrows
      { id: 'quiver', parent: 'chest', shape: 'cylinder', size: [0.1, 0.65, 0.1], position: [-0.1, 1.35, -0.16], rotation: [15, 0, -25], material: 'leather_brown', taper: -0.2 },
      { id: 'arrow_shafts', parent: 'quiver', shape: 'cylinder', size: [0.06, 0.25, 0.06], position: [-0.14, 1.72, -0.18], rotation: [15, 0, -25], material: 'wood_bow' },
      { id: 'arrow_fletchings', parent: 'arrow_shafts', shape: 'box', size: [0.08, 0.12, 0.08], position: [-0.15, 1.82, -0.19], rotation: [15, 0, -25], material: 'feather_fletch' },
      // Recurve hunting bow in hand
      { id: 'recurve_bow', parent: 'hand_l', shape: 'cylinder', size: [0.04, 1.15, 0.04], position: [0.32, 0.85, 0.1], rotation: [12, 10, 6], material: 'wood_bow' },
      { id: 'bow_string', parent: 'recurve_bow', shape: 'cylinder', size: [0.006, 1.1, 0.006], position: [0.32, 0.85, 0.03], rotation: [12, 10, 6], material: 'feather_fletch' },
    ],
  },

  // ================= 9. JEWELRY & RINGS (HOLLOW PROCEDURAL TORUS) =================
  'coiled snake ring': {
    version: 1,
    name: 'Coiled Snake Ring',
    route: 'author',
    heightMeters: 0.035,
    identity:
      'Hollow coiled serpent band ring crafted in mirror-polished gold with diamond pave encrusted scales, tapered coiled tail, and brilliant cut emerald eyes.',
    materials: [
      { id: 'polished_gold', color: '#eab308', roughness: 0.18, metalness: 0.95 },
      { id: 'emerald_eye', color: '#10b981', roughness: 0.1, metalness: 0.1, emissive: true },
      { id: 'diamond_pave', color: '#f8fafc', roughness: 0.05, metalness: 0.95 },
      { id: 'dark_gold_shadow', color: '#a16207', roughness: 0.3, metalness: 0.9 },
    ],
    parts: [
      // Primary hollow finger ring band (Torus with open inner void)
      { id: 'ring_band_torus', shape: 'torus', size: [0.022, 0.003, 0], position: [0, 0.015, 0], rotation: [90, 0, 0], material: 'polished_gold' },
      // Helical overlapping coil loops
      { id: 'coiled_body_upper', shape: 'torus', size: [0.023, 0.0035, 0], position: [0, 0.020, 0.002], rotation: [82, 8, 0], material: 'polished_gold' },
      { id: 'coiled_body_lower', shape: 'torus', size: [0.021, 0.003, 0], position: [0, 0.010, -0.002], rotation: [98, -8, 0], material: 'polished_gold' },
      // Sculpted serpent head
      { id: 'snake_head', shape: 'blob', size: [0.008, 0.005, 0.012], position: [0, 0.024, 0.012], rotation: [-15, 0, 0], material: 'polished_gold', roundness: 0.35 },
      // Diamond pave crest along forehead
      { id: 'pave_crest', shape: 'box', size: [0.005, 0.002, 0.008], position: [0, 0.026, 0.012], rotation: [-15, 0, 0], material: 'diamond_pave' },
      // Faceted emerald eyes (bilateral mirror across X=0)
      { id: 'eye_l', shape: 'blob', size: [0.0015, 0.0015, 0.002], position: [-0.003, 0.024, 0.014], rotation: [0, 0, 0], material: 'emerald_eye', mirrorX: true },
      // Serpent snout & jaw
      { id: 'snout_tip', shape: 'blob', size: [0.005, 0.003, 0.005], position: [0, 0.022, 0.018], rotation: [0, 0, 0], material: 'polished_gold', roundness: 0.4 },
      // Tapered winding tail
      { id: 'snake_tail_taper', shape: 'cylinder', size: [0.0025, 0.015, 0.0025], position: [0.008, 0.008, -0.01], rotation: [45, 30, -20], material: 'polished_gold', taper: 0.7 },
    ],
  },

  // ================= 10. MODERN VEHICLES & AUTOMOBILES =================
  'sports car': {
    version: 1,
    name: 'Sports Car',
    route: 'author',
    heightMeters: 1.25,
    identity:
      'High-performance aerodynamic supercar with sculpted rosso chassis, carbon fiber ground effects, aerodynamic cockpit canopy, 4 alloy wheels with disc brakes, and active LED lights.',
    materials: [
      { id: 'automotive_rosso', color: '#dc2626', roughness: 0.2, metalness: 0.85 },
      { id: 'carbon_trim', color: '#18181b', roughness: 0.45, metalness: 0.7 },
      { id: 'tinted_canopy', color: '#0f172a', roughness: 0.1, metalness: 0.3, opacity: 0.8 },
      { id: 'alloy_rims', color: '#e2e8f0', roughness: 0.15, metalness: 0.95 },
      { id: 'rubber_tire', color: '#27272a', roughness: 0.85, metalness: 0.02 },
      { id: 'led_headlight', color: '#f8fafc', roughness: 0.05, metalness: 0.2, emissive: true },
      { id: 'taillight_strip', color: '#ef4444', roughness: 0.1, metalness: 0.1, emissive: true },
    ],
    parts: [
      // Chassis foundational belly pan
      { id: 'chassis_belly', shape: 'box', size: [1.9, 0.22, 4.3], position: [0, 0.28, 0], rotation: [0, 0, 0], material: 'carbon_trim' },
      // Main sculpted aerodynamic hood
      { id: 'body_main_hood', shape: 'box', size: [1.85, 0.35, 2.0], position: [0, 0.52, 1.1], rotation: [-4, 0, 0], material: 'automotive_rosso', taper: 0.15 },
      // Front air splitter
      { id: 'front_splitter', shape: 'box', size: [1.95, 0.08, 0.5], position: [0, 0.18, 2.25], rotation: [0, 0, 0], material: 'carbon_trim' },
      // Greenhouse cabin & glass canopy
      { id: 'greenhouse_cabin', shape: 'blob', size: [1.4, 0.58, 1.9], position: [0, 0.88, -0.2], rotation: [-8, 0, 0], material: 'tinted_canopy', roundness: 0.55 },
      // Muscular rear haunches
      { id: 'rear_haunches', shape: 'box', size: [1.92, 0.45, 1.6], position: [0, 0.60, -1.3], rotation: [4, 0, 0], material: 'automotive_rosso' },
      // Rear aerodynamic spoiler wing
      { id: 'rear_wing_spoiler', shape: 'box', size: [1.75, 0.06, 0.35], position: [0, 0.98, -2.1], rotation: [-6, 0, 0], material: 'carbon_trim' },
      // Front wheels & alloy rims (bilateral mirror across X=0)
      { id: 'wheel_front_l', shape: 'cylinder', size: [0.68, 0.32, 0.68], position: [-0.92, 0.34, 1.35], rotation: [0, 0, 90], material: 'rubber_tire', mirrorX: true },
      { id: 'rim_front_l', shape: 'cylinder', size: [0.48, 0.33, 0.48], position: [-0.93, 0.34, 1.35], rotation: [0, 0, 90], material: 'alloy_rims', mirrorX: true },
      // Rear wheels & wider alloy rims (bilateral mirror across X=0)
      { id: 'wheel_rear_l', shape: 'cylinder', size: [0.72, 0.36, 0.72], position: [-0.92, 0.36, -1.35], rotation: [0, 0, 90], material: 'rubber_tire', mirrorX: true },
      { id: 'rim_rear_l', shape: 'cylinder', size: [0.52, 0.37, 0.52], position: [-0.93, 0.36, -1.35], rotation: [0, 0, 90], material: 'alloy_rims', mirrorX: true },
      // LED Headlights (bilateral mirror across X=0)
      { id: 'headlight_l', shape: 'box', size: [0.35, 0.08, 0.15], position: [-0.65, 0.52, 2.12], rotation: [-5, -15, 0], material: 'led_headlight', mirrorX: true },
      // Full-width rear LED taillight bar
      { id: 'rear_taillight_bar', shape: 'box', size: [1.7, 0.06, 0.06], position: [0, 0.65, -2.18], rotation: [0, 0, 0], material: 'taillight_strip' },
    ],
  },

  // ================= 11. MODERN ERGONOMIC FURNITURE =================
  'office chair': {
    version: 1,
    name: 'Office Chair',
    route: 'author',
    heightMeters: 1.15,
    identity:
      'Ergonomic executive desk chair featuring a five-star polished aluminum caster base, vertical gas lift piston, contoured foam seat pan, breathable mesh backrest with lumbar support, headrest, and 3D adjustable armrests.',
    materials: [
      { id: 'polished_aluminum', color: '#e2e8f0', roughness: 0.15, metalness: 0.9 },
      { id: 'breathable_mesh', color: '#1e293b', roughness: 0.8, metalness: 0.05 },
      { id: 'cushion_foam', color: '#0f172a', roughness: 0.75, metalness: 0.02 },
      { id: 'black_nylon', color: '#18181b', roughness: 0.45, metalness: 0.15 },
    ],
    parts: [
      // 5-Star star caster base hub
      { id: 'caster_star_base', shape: 'cylinder', size: [0.65, 0.08, 0.65], position: [0, 0.08, 0], rotation: [0, 0, 0], material: 'polished_aluminum' },
      // Radiating base spokes
      { id: 'caster_spoke_1', shape: 'box', size: [0.04, 0.04, 0.32], position: [0, 0.08, 0.16], rotation: [0, 0, 0], material: 'polished_aluminum' },
      { id: 'caster_spoke_2', shape: 'box', size: [0.04, 0.04, 0.32], position: [0.15, 0.08, -0.1], rotation: [0, 72, 0], material: 'polished_aluminum' },
      { id: 'caster_spoke_3', shape: 'box', size: [0.04, 0.04, 0.32], position: [-0.15, 0.08, -0.1], rotation: [0, -72, 0], material: 'polished_aluminum' },
      // Vertical hydraulic gas lift cylinder
      { id: 'gas_lift_cylinder', shape: 'cylinder', size: [0.07, 0.38, 0.07], position: [0, 0.28, 0], rotation: [0, 0, 0], material: 'polished_aluminum' },
      // Under-seat tilt mechanism box
      { id: 'seat_mechanism_box', shape: 'box', size: [0.26, 0.08, 0.26], position: [0, 0.44, 0], rotation: [0, 0, 0], material: 'black_nylon' },
      // Ergonomically waterfall-contoured seat cushion
      { id: 'seat_cushion', shape: 'blob', size: [0.52, 0.10, 0.50], position: [0, 0.50, 0.02], rotation: [-2, 0, 0], material: 'cushion_foam', roundness: 0.45 },
      // Breathable mesh ergonomic backrest
      { id: 'lumbar_backrest', shape: 'blob', size: [0.46, 0.52, 0.08], position: [0, 0.82, -0.22], rotation: [8, 0, 0], material: 'breathable_mesh', roundness: 0.3 },
      // Ergonomic headrest
      { id: 'headrest', shape: 'blob', size: [0.28, 0.14, 0.06], position: [0, 1.12, -0.25], rotation: [12, 0, 0], material: 'cushion_foam', roundness: 0.5 },
      // Adjustable armrest stalks and pads (bilateral mirror across X=0)
      { id: 'armrest_stalk_l', shape: 'cylinder', size: [0.04, 0.22, 0.04], position: [-0.27, 0.58, 0], rotation: [0, 0, 0], material: 'black_nylon', mirrorX: true },
      { id: 'armrest_pad_l', shape: 'box', size: [0.08, 0.03, 0.24], position: [-0.27, 0.69, 0.02], rotation: [0, 0, 0], material: 'black_nylon', mirrorX: true },
    ],
  },

  // ================= 12. WEAPONS: FORGED LONGSWORD =================
  'forged longsword': {
    version: 1,
    name: 'Forged Longsword',
    route: 'author',
    heightMeters: 1.18,
    identity:
      'Double-edged high-carbon forged steel longsword with tapered blade, central blood fuller, arched brass crossguard with quillon finials, ribbed leather grip, and wheel pommel inset with a faceted ruby.',
    materials: [
      { id: 'forged_steel', color: '#e2e8f0', roughness: 0.12, metalness: 0.98 },
      { id: 'steel_fuller', color: '#94a3b8', roughness: 0.2, metalness: 0.95 },
      { id: 'brass_crossguard', color: '#eab308', roughness: 0.22, metalness: 0.88 },
      { id: 'wrapped_leather', color: '#3e2723', roughness: 0.68, metalness: 0.05 },
      { id: 'ruby_pommel_gem', color: '#dc2626', roughness: 0.08, metalness: 0.2, emissive: true },
    ],
    parts: [
      // Tapered double-edged blade
      { id: 'blade_upper', shape: 'box', size: [0.042, 0.82, 0.008], position: [0, 0.70, 0], rotation: [0, 0, 0], material: 'forged_steel', taper: 0.45 },
      // Central fuller groove
      { id: 'blade_fuller_groove', shape: 'box', size: [0.012, 0.65, 0.009], position: [0, 0.64, 0], rotation: [0, 0, 0], material: 'steel_fuller' },
      // Distal piercing point tip
      { id: 'blade_tip', shape: 'cone', size: [0.036, 0.12, 0.008], position: [0, 1.15, 0], rotation: [0, 0, 0], material: 'forged_steel' },
      // Central crossguard block
      { id: 'crossguard_center', shape: 'box', size: [0.05, 0.03, 0.03], position: [0, 0.28, 0], rotation: [0, 0, 0], material: 'brass_crossguard' },
      // Flared quillons (bilateral mirror across X=0)
      { id: 'crossguard_quillon_l', shape: 'cylinder', size: [0.018, 0.14, 0.018], position: [-0.10, 0.28, 0], rotation: [0, 0, 85], material: 'brass_crossguard', mirrorX: true },
      { id: 'quillon_finial_l', shape: 'blob', size: [0.022, 0.022, 0.022], position: [-0.18, 0.29, 0], rotation: [0, 0, 0], material: 'brass_crossguard', mirrorX: true },
      // Leather-wrapped contoured two-handed hilt grip
      { id: 'grip_handle', shape: 'cylinder', size: [0.028, 0.22, 0.024], position: [0, 0.16, 0], rotation: [0, 0, 0], material: 'wrapped_leather', taper: 0.05 },
      // Heavy counterbalance wheel pommel
      { id: 'wheel_pommel', shape: 'cylinder', size: [0.055, 0.024, 0.055], position: [0, 0.04, 0], rotation: [90, 0, 0], material: 'brass_crossguard' },
      // Faceted ruby gem inset in pommel core
      { id: 'pommel_gem', shape: 'blob', size: [0.018, 0.018, 0.026], position: [0, 0.04, 0], rotation: [0, 0, 0], material: 'ruby_pommel_gem' },
    ],
  },

  // ================= 13. VESSELS & CONTAINERS: GLASS WINE BOTTLE =================
  'glass wine bottle': {
    version: 1,
    name: 'Glass Wine Bottle',
    route: 'author',
    heightMeters: 0.32,
    identity:
      'Translucent antique green glass Bordeaux wine bottle with punt base, cylindrical body, tapered curved shoulder, slender neck, gold foil capsule, cork stopper, and vintage paper label.',
    materials: [
      { id: 'antique_green_glass', color: '#15803d', roughness: 0.08, metalness: 0.12, opacity: 0.75 },
      { id: 'gold_foil', color: '#ca8a04', roughness: 0.25, metalness: 0.88 },
      { id: 'cork_stopper', color: '#b45309', roughness: 0.85, metalness: 0.0 },
      { id: 'parchment_label', color: '#fef3c7', roughness: 0.85, metalness: 0.02 },
    ],
    parts: [
      // Indented punt base
      { id: 'punt_base', shape: 'cylinder', size: [0.078, 0.02, 0.078], position: [0, 0.01, 0], rotation: [0, 0, 0], material: 'antique_green_glass', taper: -0.2 },
      // Main cylindrical bottle body
      { id: 'bottle_body', shape: 'cylinder', size: [0.078, 0.17, 0.078], position: [0, 0.10, 0], rotation: [0, 0, 0], material: 'antique_green_glass' },
      // Front parchment wine label
      { id: 'paper_label', shape: 'box', size: [0.065, 0.10, 0.080], position: [0, 0.10, 0], rotation: [0, 0, 0], material: 'parchment_label' },
      // Tapered graceful shoulder
      { id: 'tapered_shoulder', shape: 'cylinder', size: [0.078, 0.05, 0.078], position: [0, 0.20, 0], rotation: [0, 0, 0], material: 'antique_green_glass', taper: 0.65 },
      // Slender cylindrical neck
      { id: 'slender_neck', shape: 'cylinder', size: [0.028, 0.07, 0.028], position: [0, 0.25, 0], rotation: [0, 0, 0], material: 'antique_green_glass' },
      // Metallic gold neck capsule
      { id: 'foil_capsule', shape: 'cylinder', size: [0.029, 0.045, 0.029], position: [0, 0.28, 0], rotation: [0, 0, 0], material: 'gold_foil' },
      // Toroidal mouth rim collar
      { id: 'collar_lip', shape: 'torus', size: [0.030, 0.004, 0], position: [0, 0.30, 0], rotation: [90, 0, 0], material: 'antique_green_glass' },
      // Natural cork stopper inside neck
      { id: 'cork', shape: 'cylinder', size: [0.022, 0.018, 0.022], position: [0, 0.31, 0], rotation: [0, 0, 0], material: 'cork_stopper' },
    ],
  },

  // ================= 14. FLAGSHIP CHARACTERS =================
  'nerd turtle': {
    version: 1,
    name: 'Nerd Turtle',
    route: 'author',
    heightMeters: 0.95,
    identity:
      'Charming clay nerd turtle character with articulated limbs, patterned carapace shell, rounded plastron belly, expressive eyes with catchlights, oversized horn-rimmed glasses, and prominent buck teeth.',
    materials: [
      { id: 'turtle_skin', color: '#4a8e9c', roughness: 0.82, metalness: 0.02 },
      { id: 'plastron_belly', color: '#a89a7c', roughness: 0.85, metalness: 0.02 },
      { id: 'carapace_shell', color: '#d58e6e', roughness: 0.8, metalness: 0.04 },
      { id: 'sclera_white', color: '#ece8ec', roughness: 0.3, metalness: 0.0 },
      { id: 'pupil_black', color: '#0e0c10', roughness: 0.1, metalness: 0.1 },
      { id: 'glasses_frame', color: '#240405', roughness: 0.4, metalness: 0.1 },
      { id: 'teeth_white', color: '#ffffff', roughness: 0.25, metalness: 0.0 },
    ],
    parts: [
      { id: 'trunk', shape: 'blob', size: [0.612, 0.468, 0.432], position: [0, 0.351, 0], color: '#4a8e9c', material: 'turtle_skin', roundness: 0.08, taper: 0.3 },
      { id: 'leg', parent: 'trunk', shape: 'blob', size: [0.234, 0.234, 0.225], position: [0.162, 0.126, 0.009], color: '#4a8e9c', material: 'turtle_skin', roundness: 0.13, mirrorX: true },
      { id: 'foot', parent: 'trunk', shape: 'blob', size: [0.261, 0.09, 0.279], position: [0.171, 0.045, 0.045], color: '#4a8e9c', material: 'turtle_skin', roundness: 0.1, mirrorX: true },
      { id: 'plastron', parent: 'trunk', shape: 'blob', size: [0.45, 0.36, 0.09], position: [0, 0.36, 0.162], rotation: [-8, 0, 0], color: '#a89a7c', material: 'plastron_belly', roundness: 0.3 },
      { id: 'carapace', parent: 'trunk', shape: 'blob', size: [0.612, 0.504, 0.27], position: [0, 0.378, -0.099], color: '#d58e6e', material: 'carapace_shell', roundness: 0.1 },
      { id: 'arm', parent: 'trunk', shape: 'blob', size: [0.153, 0.279, 0.162], position: [0.315, 0.351, 0.045], rotation: [0, 0, 8], color: '#4a8e9c', material: 'turtle_skin', roundness: 0.05, mirrorX: true },
      { id: 'tail', parent: 'trunk', shape: 'blob', size: [0.252, 0.261, 0.252], position: [0.225, 0.189, -0.18], color: '#4a8e9c', material: 'turtle_skin', roundness: 0 },
      { id: 'head', parent: 'trunk', shape: 'blob', size: [0.684, 0.378, 0.504], position: [0, 0.697, 0.014], rotation: [0, 20, -6], color: '#4a8e9c', material: 'turtle_skin', roundness: 0.2 },
      { id: 'eye', parent: 'head', shape: 'blob', size: [0.198, 0.162, 0.135], position: [0.171, 0.045, 0.216], color: '#ece8ec', material: 'sclera_white', roundness: 0, mirrorX: true },
      { id: 'pupil', parent: 'eye', shape: 'blob', size: [0.067, 0.076, 0.027], position: [0.031, 0.022, 0.058], color: '#0e0c10', material: 'pupil_black', roundness: 0 },
      { id: 'catchlight', parent: 'pupil', shape: 'blob', size: [0.02, 0.02, 0.009], position: [0.016, 0.02, 0.013], color: '#ffffff', material: 'teeth_white', roundness: 0 },
      { id: 'rim', parent: 'head', shape: 'torus', size: [0.342, 0.04, 0], position: [0.185, 0.045, 0.306], color: '#240405', material: 'glasses_frame', mirrorX: true },
      { id: 'bridge', parent: 'head', shape: 'box', size: [0.054, 0.031, 0.027], position: [0, 0.063, 0.315], color: '#240405', material: 'glasses_frame', roundness: 0 },
      { id: 'temple', parent: 'head', shape: 'box', size: [0.027, 0.027, 0.27], position: [0.346, 0.09, 0.171], rotation: [0, -10, 0], color: '#240405', material: 'glasses_frame', mirrorX: true },
      { id: 'teeth', parent: 'head', shape: 'box', size: [0.108, 0.063, 0.027], position: [0, -0.099, 0.234], color: '#ffffff', material: 'teeth_white', roundness: 0 },
    ],
  },

  'snorlax': {
    version: 1,
    name: 'Snorlax',
    route: 'author',
    heightMeters: 2.2,
    identity:
      'Massive rotund sleeping clay creature with dark teal fur, cream belly and face patch, pointed ears, thick arms with claws, huge paw feet with claws and brown sole pads, and sleepy closed eye slits.',
    materials: [
      { id: 'snorlax_teal', color: '#3f5f5a', roughness: 0.85, metalness: 0.02 },
      { id: 'snorlax_cream', color: '#e8d7b0', roughness: 0.82, metalness: 0.02 },
      { id: 'claw_white', color: '#f4f4f4', roughness: 0.4, metalness: 0.1 },
      { id: 'sole_brown', color: '#b48a68', roughness: 0.8, metalness: 0.02 },
      { id: 'mouth_red', color: '#79332f', roughness: 0.6, metalness: 0.0 },
      { id: 'tongue_pink', color: '#e89a9d', roughness: 0.5, metalness: 0.0 },
    ],
    parts: [
      { id: 'body', shape: 'blob', size: [1.39, 1.39, 0.95], position: [0.05, 0.89, 0], rotation: [0, 0, -8], color: '#3f5f5a', material: 'snorlax_teal', roundness: 0.12 },
      { id: 'belly', shape: 'blob', size: [1.08, 0.97, 0.24], position: [0.012, 1.11, 0.46], rotation: [0, 0, -12], color: '#e8d7b0', material: 'snorlax_cream', roundness: 0.06 },
      { id: 'head', shape: 'blob', size: [0.79, 0.67, 0.7], position: [-0.20, 1.65, -0.02], rotation: [0, 0, 15], color: '#3f5f5a', material: 'snorlax_teal', roundness: 0.08 },
      { id: 'face', parent: 'head', shape: 'blob', size: [0.70, 0.61, 0.18], position: [0.005, 0, 0.36], rotation: [0, 0, 0], color: '#e8d7b0', material: 'snorlax_cream', roundness: 0.15 },
      { id: 'ear_r', parent: 'head', shape: 'cylinder', size: [0.22, 0.28, 0.19], position: [-0.33, 0.07, -0.01], rotation: [0, 0, 24], color: '#3f5f5a', material: 'snorlax_teal', taper: 1 },
      { id: 'ear_l', parent: 'head', shape: 'cylinder', size: [0.22, 0.27, 0.19], position: [0.23, 0.24, -0.01], rotation: [0, 0, -34], color: '#3f5f5a', material: 'snorlax_teal', taper: 1 },
      { id: 'eye_r', parent: 'face', shape: 'blob', size: [0.107, 0.011, 0.021], position: [-0.235, 0.136, 0.08], rotation: [0, 0, 14], color: '#3f5f5a', material: 'snorlax_teal' },
      { id: 'eye_l', parent: 'face', shape: 'blob', size: [0.108, 0.011, 0.021], position: [0.072, 0.242, 0.07], rotation: [0, 0, -3], color: '#3f5f5a', material: 'snorlax_teal' },
      { id: 'mouth', parent: 'face', shape: 'blob', size: [0.46, 0.30, 0.045], position: [-0.034, -0.003, 0.10], rotation: [0, 0, 2], color: '#79332f', material: 'mouth_red', roundness: 0.13 },
      { id: 'tongue', parent: 'mouth', shape: 'blob', size: [0.35, 0.18, 0.036], position: [0.057, -0.068, 0.03], rotation: [0, 0, 0], color: '#e89a9d', material: 'tongue_pink', roundness: 0.08 },
      { id: 'arm_r', shape: 'blob', size: [0.40, 0.90, 0.39], position: [-0.70, 1.36, -0.06], rotation: [0, 0, 35], color: '#3f5f5a', material: 'snorlax_teal', roundness: 0.10 },
      { id: 'arm_l', shape: 'blob', size: [0.37, 0.87, 0.38], position: [0.40, 1.69, -0.06], rotation: [0, 0, -11], color: '#3f5f5a', material: 'snorlax_teal', roundness: 0.17 },
      { id: 'claw_arm_r1', parent: 'arm_r', shape: 'cylinder', size: [0.067, 0.119, 0.065], position: [-0.117, 0.396, 0.18], rotation: [0, 0, -16], color: '#f4f4f4', material: 'claw_white', taper: 1 },
      { id: 'claw_arm_r2', parent: 'arm_r', shape: 'cylinder', size: [0.064, 0.105, 0.064], position: [-0.241, 0.36, 0.06], rotation: [0, 0, 6], color: '#f4f4f4', material: 'claw_white', taper: 1 },
      { id: 'claw_arm_r3', parent: 'arm_r', shape: 'cylinder', size: [0.062, 0.098, 0.063], position: [-0.285, 0.30, 0.06], rotation: [0, 0, 33], color: '#f4f4f4', material: 'claw_white', taper: 1 },
      { id: 'claw_arm_l1', parent: 'arm_l', shape: 'cylinder', size: [0.059, 0.10, 0.063], position: [0.081, 0.46, 0.06], rotation: [0, 0, 7], color: '#f4f4f4', material: 'claw_white', taper: 1 },
      { id: 'claw_arm_l2', parent: 'arm_l', shape: 'cylinder', size: [0.055, 0.11, 0.06], position: [0.148, 0.41, 0.06], rotation: [0, 0, -20], color: '#f4f4f4', material: 'claw_white', taper: 1 },
      { id: 'foot_floor', shape: 'blob', size: [0.60, 0.30, 0.44], position: [-0.065, 0.149, 0.10], rotation: [0, 0, 7], color: '#e8d7b0', material: 'snorlax_cream', roundness: 0.25 },
      { id: 'claw_foot_a', parent: 'foot_floor', shape: 'cylinder', size: [0.14, 0.13, 0.13], position: [-0.245, -0.064, 0.21], rotation: [0, 0, 5], color: '#f4f4f4', material: 'claw_white', taper: 1 },
      { id: 'claw_foot_b', parent: 'foot_floor', shape: 'cylinder', size: [0.16, 0.12, 0.13], position: [-0.105, -0.088, 0.24], rotation: [0, 0, -12], color: '#f4f4f4', material: 'claw_white', taper: 1 },
      { id: 'claw_foot_c', parent: 'foot_floor', shape: 'cylinder', size: [0.17, 0.13, 0.13], position: [0.073, -0.082, 0.24], rotation: [0, 0, -22], color: '#f4f4f4', material: 'claw_white', taper: 1 },
      { id: 'foot_raised', shape: 'blob', size: [0.435, 0.56, 0.40], position: [0.722, 0.675, 0.29], rotation: [0, 0, -24], color: '#e8d7b0', material: 'snorlax_cream', roundness: 0.10 },
      { id: 'sole_raised', parent: 'foot_raised', shape: 'blob', size: [0.194, 0.259, 0.075], position: [-0.003, -0.075, 0.215], rotation: [0, 0, 5], color: '#b48a68', material: 'sole_brown', roundness: 0.06 },
      { id: 'claw_raised_a', parent: 'foot_raised', shape: 'cylinder', size: [0.104, 0.151, 0.104], position: [-0.062, 0.264, 0.07], rotation: [0, 0, 42], color: '#f4f4f4', material: 'claw_white', taper: 1 },
      { id: 'claw_raised_b', parent: 'foot_raised', shape: 'cylinder', size: [0.121, 0.159, 0.108], position: [0.112, 0.288, 0.07], rotation: [0, 0, 1], color: '#f4f4f4', material: 'claw_white', taper: 1 },
      { id: 'claw_raised_c', parent: 'foot_raised', shape: 'cylinder', size: [0.111, 0.174, 0.105], position: [0.240, 0.146, 0.04], rotation: [0, 0, -19], color: '#f4f4f4', material: 'claw_white', taper: 1 },
    ],
  },

  // ================= 15. OPTICS & PHOTOGRAPHY =================
  'professional dslr camera': {
    version: 1,
    name: 'Professional DSLR Camera',
    route: 'author',
    heightMeters: 0.12,
    identity:
      'High-end professional digital SLR camera featuring magnesium alloy body chassis, textured ergonomic rubber handgrip with signature red accent stripe, top pentaprism viewfinder hump with flash hotshoe, knurled mode and control dials, metal shutter release button, multi-tier zoom lens barrel with ribbed focus rings and emerald anti-reflective coated optical glass, rear high-resolution LCD preview screen, optical viewfinder eyepiece, and side strap lugs.',
    materials: [
      { id: 'magnesium_body', color: '#18181b', roughness: 0.42, metalness: 0.55 },
      { id: 'rubber_grip', color: '#09090b', roughness: 0.88, metalness: 0.05 },
      { id: 'nikon_red', color: '#dc2626', roughness: 0.35, metalness: 0.1 },
      { id: 'lens_metal', color: '#27272a', roughness: 0.32, metalness: 0.72 },
      { id: 'lens_rubber', color: '#0f172a', roughness: 0.9, metalness: 0.04 },
      { id: 'lens_glass', color: '#064e3b', roughness: 0.05, metalness: 0.9, emissive: true },
      { id: 'knurled_metal', color: '#52525b', roughness: 0.28, metalness: 0.88 },
      { id: 'lcd_glass', color: '#020617', roughness: 0.12, metalness: 0.2 },
      { id: 'eyepiece_rubber', color: '#18181b', roughness: 0.85, metalness: 0.05 },
    ],
    parts: [
      // 1. Main camera chassis
      { id: 'camera_chassis', shape: 'box', size: [0.15, 0.10, 0.07], position: [0, 0.05, 0], rotation: [0, 0, 0], material: 'magnesium_body', roundness: 0.15 },
      // 2. Right-hand ergonomic textured grip
      { id: 'hand_grip', shape: 'box', size: [0.038, 0.096, 0.046], position: [0.062, 0.05, 0.042], rotation: [0, 0, 0], material: 'rubber_grip', roundness: 0.3 },
      // 3. Nikon red signature accent swoosh on grip
      { id: 'red_accent_swoosh', shape: 'box', size: [0.008, 0.034, 0.005], position: [0.048, 0.07, 0.064], rotation: [0, 0, 0], material: 'nikon_red' },
      // 4. Center pentaprism / viewfinder hump
      { id: 'pentaprism_hump', shape: 'box', size: [0.056, 0.032, 0.066], position: [-0.015, 0.114, 0], rotation: [0, 0, 0], material: 'magnesium_body', taper: 0.82 },
      // 5. Metal flash hotshoe on top of pentaprism
      { id: 'flash_hotshoe', shape: 'box', size: [0.022, 0.006, 0.024], position: [-0.015, 0.132, 0], rotation: [0, 0, 0], material: 'knurled_metal' },
      // 6. Top left mode dial
      { id: 'mode_dial_top', shape: 'cylinder', size: [0.025, 0.012, 0.025], position: [-0.058, 0.106, 0], rotation: [0, 0, 0], material: 'knurled_metal' },
      // 7. Right command dial
      { id: 'command_dial', shape: 'cylinder', size: [0.020, 0.010, 0.020], position: [0.065, 0.102, 0.036], rotation: [0, 0, 0], material: 'knurled_metal' },
      // 8. Angled shutter release button on top of grip
      { id: 'shutter_button', shape: 'cylinder', size: [0.014, 0.008, 0.014], position: [0.065, 0.106, 0.056], rotation: [0, 0, 0], material: 'knurled_metal' },
      // 9. Chrome/metal lens mount flange
      { id: 'lens_mount_flange', shape: 'cylinder', size: [0.072, 0.012, 0.072], position: [-0.015, 0.05, 0.040], rotation: [90, 0, 0], material: 'knurled_metal' },
      // 10. Lens barrel primary cylinder
      { id: 'lens_barrel_base', shape: 'cylinder', size: [0.070, 0.045, 0.070], position: [-0.015, 0.05, 0.068], rotation: [90, 0, 0], material: 'lens_metal' },
      // 11. Ribbed zoom ring
      { id: 'lens_zoom_ring', shape: 'cylinder', size: [0.073, 0.025, 0.073], position: [-0.015, 0.05, 0.088], rotation: [90, 0, 0], material: 'lens_rubber' },
      // 12. Outer lens barrel (wide front)
      { id: 'lens_barrel_front', shape: 'cylinder', size: [0.076, 0.050, 0.076], position: [-0.015, 0.05, 0.125], rotation: [90, 0, 0], material: 'lens_metal', taper: 1.08 },
      // 13. Ribbed focus ring
      { id: 'lens_focus_ring', shape: 'cylinder', size: [0.078, 0.022, 0.078], position: [-0.015, 0.05, 0.138], rotation: [90, 0, 0], material: 'lens_rubber' },
      // 14. Coated front curved optical lens glass
      { id: 'front_lens_element', shape: 'sphere', size: [0.068, 0.015, 0.068], position: [-0.015, 0.05, 0.152], rotation: [90, 0, 0], material: 'lens_glass' },
      // 15. Rear large LCD preview monitor screen
      { id: 'rear_lcd_screen', shape: 'box', size: [0.086, 0.062, 0.004], position: [-0.025, 0.048, -0.036], rotation: [0, 0, 0], material: 'lcd_glass' },
      // 16. Optical viewfinder eyepiece on back
      { id: 'viewfinder_eyepiece', shape: 'box', size: [0.028, 0.020, 0.012], position: [-0.015, 0.110, -0.038], rotation: [0, 0, 0], material: 'eyepiece_rubber' },
      // 17. Strap eyelet lugs (left and right)
      { id: 'strap_lug_l', shape: 'cylinder', size: [0.008, 0.014, 0.008], position: [-0.078, 0.075, 0], rotation: [0, 0, 90], material: 'knurled_metal' },
      { id: 'strap_lug_r', shape: 'cylinder', size: [0.008, 0.014, 0.008], position: [0.078, 0.075, 0], rotation: [0, 0, 90], material: 'knurled_metal' },
    ],
  },

  // ================= 16. PROPS & VESSELS =================
  'treasure chest': {
    version: 1,
    name: 'Treasure Chest',
    route: 'author',
    heightMeters: 0.85,
    identity:
      'Sturdy heavy-timber pirate treasure chest with arched barrel lid, wrought iron reinforcing bands, corner brackets, antique brass lock hasp, keyhole, and side rope handles.',
    materials: [
      { id: 'oak_timber', color: '#6d4c41', roughness: 0.72, metalness: 0.0 },
      { id: 'wrought_iron', color: '#1e293b', roughness: 0.45, metalness: 0.85 },
      { id: 'antique_brass', color: '#f59e0b', roughness: 0.28, metalness: 0.9 },
      { id: 'gold_coins', color: '#fbbf24', roughness: 0.2, metalness: 0.95, emissive: true },
    ],
    parts: [
      { id: 'chest_body', shape: 'box', size: [1.1, 0.48, 0.72], position: [0, 0.24, 0], color: '#6d4c41', material: 'oak_timber', roundness: 0.04 },
      { id: 'chest_lid', shape: 'blob', size: [1.12, 0.28, 0.74], position: [0, 0.58, 0], color: '#6d4c41', material: 'oak_timber', roundness: 0.4 },
      { id: 'iron_band_l', shape: 'box', size: [0.08, 0.52, 0.74], position: [-0.32, 0.24, 0], color: '#1e293b', material: 'wrought_iron', mirrorX: true },
      { id: 'iron_band_lid_l', shape: 'blob', size: [0.08, 0.30, 0.76], position: [-0.32, 0.58, 0], color: '#1e293b', material: 'wrought_iron', roundness: 0.4, mirrorX: true },
      { id: 'corner_bracket_fl', shape: 'box', size: [0.06, 0.48, 0.06], position: [-0.52, 0.24, 0.33], color: '#1e293b', material: 'wrought_iron', mirrorX: true },
      { id: 'corner_bracket_bl', shape: 'box', size: [0.06, 0.48, 0.06], position: [-0.52, 0.24, -0.33], color: '#1e293b', material: 'wrought_iron', mirrorX: true },
      { id: 'lock_plate', shape: 'box', size: [0.14, 0.18, 0.03], position: [0, 0.44, 0.37], color: '#f59e0b', material: 'antique_brass' },
      { id: 'lock_keyhole', shape: 'cylinder', size: [0.03, 0.04, 0.03], position: [0, 0.42, 0.38], rotation: [90, 0, 0], color: '#1e293b', material: 'wrought_iron' },
      { id: 'handle_drop_r', shape: 'torus', size: [0.12, 0.018, 0], position: [0.56, 0.28, 0], rotation: [0, 90, 0], color: '#1e293b', material: 'wrought_iron', mirrorX: true },
    ],
  },

  'perfume bottle': {
    version: 1,
    name: 'Perfume Bottle',
    route: 'author',
    heightMeters: 0.26,
    identity:
      'Luxurious fluted crystal glass perfume bottle with multifaceted body, glowing amber fragrance liquid inside, gold atomizer collar, delicate pump nozzle, and an emerald gem-cut crystal cap.',
    materials: [
      { id: 'crystal_glass', color: '#f8fafc', roughness: 0.04, metalness: 0.08, physical: { transmission: 0.95, ior: 1.52 } },
      { id: 'amber_fragrance', color: '#f59e0b', roughness: 0.15, metalness: 0.1, physical: { transmission: 0.75, ior: 1.35 } },
      { id: 'mirror_gold', color: '#eab308', roughness: 0.18, metalness: 0.95 },
      { id: 'emerald_cap', color: '#10b981', roughness: 0.05, metalness: 0.1, physical: { transmission: 0.9, ior: 1.58 } },
    ],
    parts: [
      { id: 'crystal_base', shape: 'cylinder', size: [0.11, 0.025, 0.11], position: [0, 0.012, 0], material: 'crystal_glass' },
      { id: 'bottle_body', shape: 'blob', size: [0.12, 0.12, 0.12], position: [0, 0.08, 0], material: 'crystal_glass', roundness: 0.65 },
      { id: 'liquid_core', shape: 'blob', size: [0.09, 0.09, 0.09], position: [0, 0.075, 0], material: 'amber_fragrance', roundness: 0.5 },
      { id: 'atomizer_collar', shape: 'cylinder', size: [0.042, 0.028, 0.042], position: [0, 0.155, 0], material: 'mirror_gold' },
      { id: 'spray_nozzle', shape: 'cylinder', size: [0.016, 0.024, 0.016], position: [0, 0.178, 0], material: 'mirror_gold' },
      { id: 'nozzle_tip', shape: 'cylinder', size: [0.008, 0.015, 0.008], position: [0, 0.184, 0.012], rotation: [90, 0, 0], material: 'mirror_gold' },
      { id: 'gem_cap', shape: 'blob', size: [0.055, 0.06, 0.055], position: [0, 0.22, 0], material: 'emerald_cap', roundness: 0.7 },
    ],
  },

  'espresso bag': {
    version: 1,
    name: 'Espresso Bag',
    route: 'author',
    heightMeters: 0.28,
    identity:
      'Artisanal stand-up roasted espresso coffee bean foil pouch with pinched side gussets, top heat-crimp seal, embossed sealing ridges, circular degassing aroma valve, and glossy paper front label.',
    materials: [
      { id: 'matte_pouch_foil', color: '#1e293b', roughness: 0.55, metalness: 0.25 },
      { id: 'gold_crimp', color: '#d97706', roughness: 0.35, metalness: 0.8 },
      { id: 'degassing_valve', color: '#475569', roughness: 0.4, metalness: 0.6 },
      { id: 'coffee_label', color: '#fef3c7', roughness: 0.65, metalness: 0.02 },
      { id: 'copper_accent', color: '#b45309', roughness: 0.3, metalness: 0.85 },
    ],
    parts: [
      { id: 'pouch_body', shape: 'blob', size: [0.17, 0.24, 0.085], position: [0, 0.13, 0], material: 'matte_pouch_foil', roundness: 0.42, taper: 0.08 },
      { id: 'crimp_seal_top', shape: 'box', size: [0.165, 0.028, 0.016], position: [0, 0.255, 0], material: 'gold_crimp', roundness: 0.04 },
      { id: 'crimp_ridge', shape: 'box', size: [0.155, 0.006, 0.020], position: [0, 0.248, 0], material: 'copper_accent' },
      { id: 'degassing_valve', shape: 'blob', size: [0.026, 0.026, 0.012], position: [0, 0.19, 0.044], material: 'degassing_valve', roundness: 0.6 },
      { id: 'front_brand_label', shape: 'box', size: [0.12, 0.12, 0.006], position: [0, 0.11, 0.044], material: 'coffee_label' },
      { id: 'bottom_gusset', shape: 'blob', size: [0.15, 0.04, 0.07], position: [0, 0.02, 0], material: 'matte_pouch_foil', roundness: 0.5 },
    ],
  },

  'yatai stall': {
    version: 1,
    name: 'Yatai Food Stall',
    route: 'author',
    heightMeters: 2.3,
    identity:
      'Traditional Japanese wooden yatai street food cart with spoke wheels, scarlet red service body, food prep counter, roof with thatch, hanging paper lanterns, ceramic jars, and fabric banner.',
    materials: [
      { id: 'dark_timber', color: '#5a4030', roughness: 0.72, metalness: 0.0 },
      { id: 'stall_vermilion', color: '#c4503c', roughness: 0.65, metalness: 0.0 },
      { id: 'straw_thatch', color: '#d2b98c', roughness: 0.88, metalness: 0.0 },
      { id: 'paper_lantern', color: '#e3d8bd', roughness: 0.75, metalness: 0.0, emissive: true },
      { id: 'glazed_ceramic', color: '#4f7fa8', roughness: 0.2, metalness: 0.1 },
      { id: 'fabric_banner', color: '#efe8cf', roughness: 0.9, metalness: 0.0 },
      { id: 'iron_fittings', color: '#2e2620', roughness: 0.4, metalness: 0.85 },
    ],
    parts: [
      { id: 'chassis', shape: 'box', size: [1.5, 0.06, 0.72], position: [0, 0.22, 0], material: 'dark_timber' },
      { id: 'wheel_front', shape: 'cylinder', size: [0.36, 0.07, 0.36], position: [0.5, 0.18, 0.36], rotation: [90, 0, 0], material: 'dark_timber', mirrorX: true },
      { id: 'hub_front', shape: 'cylinder', size: [0.08, 0.1, 0.08], position: [0.5, 0.18, 0.36], rotation: [90, 0, 0], material: 'iron_fittings', mirrorX: true },
      { id: 'wheel_back', shape: 'cylinder', size: [0.36, 0.07, 0.36], position: [0.5, 0.18, -0.36], rotation: [90, 0, 0], material: 'dark_timber', mirrorX: true },
      { id: 'body', shape: 'box', size: [1.52, 0.6, 0.85], position: [0, 0.58, 0], material: 'stall_vermilion', roundness: 0.08 },
      { id: 'counter', shape: 'box', size: [1.75, 0.05, 1.0], position: [0, 0.975, 0.02], material: 'dark_timber' },
      { id: 'post_f', shape: 'box', size: [0.08, 1.95, 0.08], position: [0.8, 0.995, 0.42], material: 'dark_timber', mirrorX: true },
      { id: 'post_b', shape: 'box', size: [0.08, 1.95, 0.08], position: [0.8, 0.995, -0.42], material: 'dark_timber', mirrorX: true },
      { id: 'beam_f', shape: 'box', size: [2.2, 0.09, 0.09], position: [-0.1, 1.99, 0.42], material: 'dark_timber' },
      { id: 'roof_thatch', shape: 'box', size: [2.42, 0.14, 1.4], position: [-0.08, 2.15, 0], rotation: [5, 0, 0], material: 'straw_thatch', roundness: 0.06 },
      { id: 'lantern_1', shape: 'cylinder', size: [0.13, 0.25, 0.13], position: [-0.42, 1.73, 0.36], material: 'paper_lantern' },
      { id: 'lantern_2', shape: 'cylinder', size: [0.12, 0.24, 0.12], position: [-0.05, 1.72, 0.36], material: 'paper_lantern' },
      { id: 'lantern_3', shape: 'cylinder', size: [0.12, 0.26, 0.12], position: [0.35, 1.73, 0.36], material: 'paper_lantern' },
      { id: 'pot_a', shape: 'cylinder', size: [0.19, 0.16, 0.19], position: [-0.2, 1.08, 0.08], material: 'glazed_ceramic', taper: 0.2 },
      { id: 'bowl_b', shape: 'cylinder', size: [0.22, 0.08, 0.22], position: [0.15, 1.04, 0.1], material: 'glazed_ceramic', taper: -0.3 },
      { id: 'side_banner', shape: 'box', size: [0.48, 1.18, 0.015], position: [1.26, 1.33, 0.47], material: 'fabric_banner' },
    ],
  },

  'ancient stone obelisk': {
    version: 1,
    name: 'Ancient Stone Obelisk',
    route: 'author',
    heightMeters: 6.2,
    identity:
      'Monumental ancient granite obelisk with stepped tiered pedestal, four-sided tapered monolithic pillar shaft, engraved hieroglyphic band, and polished electrum pyramidion capstone.',
    materials: [
      { id: 'granite_grey', color: '#64748b', roughness: 0.9, metalness: 0.05 },
      { id: 'carved_inscriptions', color: '#475569', roughness: 0.85, metalness: 0.08 },
      { id: 'gold_pyramidion', color: '#f59e0b', roughness: 0.2, metalness: 0.92, emissive: true },
    ],
    parts: [
      { id: 'plinth_lower', shape: 'box', size: [2.4, 0.4, 2.4], position: [0, 0.2, 0], material: 'granite_grey', roundness: 0.05 },
      { id: 'plinth_upper', shape: 'box', size: [1.8, 0.45, 1.8], position: [0, 0.62, 0], material: 'granite_grey', roundness: 0.04 },
      { id: 'shaft_base_collar', shape: 'box', size: [1.3, 0.2, 1.3], position: [0, 0.95, 0], material: 'granite_grey' },
      { id: 'obelisk_shaft', shape: 'box', size: [1.1, 4.4, 1.1], position: [0, 3.25, 0], material: 'granite_grey', taper: 0.45 },
      { id: 'hieroglyph_band', parent: 'obelisk_shaft', shape: 'box', size: [0.92, 0.8, 0.92], position: [0, 2.5, 0], material: 'carved_inscriptions' },
      { id: 'pyramidion_cap', shape: 'cone', size: [0.65, 0.9, 0.65], position: [0, 5.85, 0], material: 'gold_pyramidion' },
    ],
  },

  'ceramic bowl': {
    version: 1,
    name: 'Ceramic Glazed Bowl',
    route: 'author',
    heightMeters: 0.16,
    identity:
      'Artisanal hand-thrown ceramic serving bowl with raised foot ring, smooth curved basin, deep glazed indigo interior, and fine polished brass rim trim.',
    materials: [
      { id: 'stoneware_exterior', color: '#78716c', roughness: 0.82, metalness: 0.02 },
      { id: 'indigo_glaze', color: '#1e3a8a', roughness: 0.18, metalness: 0.15, physical: { clearcoat: 0.9, clearcoatRoughness: 0.08 } },
      { id: 'brass_rim', color: '#d97706', roughness: 0.25, metalness: 0.88 },
    ],
    parts: [
      { id: 'foot_ring', shape: 'cylinder', size: [0.18, 0.025, 0.18], position: [0, 0.012, 0], material: 'stoneware_exterior' },
      { id: 'bowl_basin', shape: 'cylinder', size: [0.36, 0.13, 0.36], position: [0, 0.09, 0], material: 'stoneware_exterior', taper: -0.5 },
      { id: 'glazed_interior', shape: 'cylinder', size: [0.33, 0.11, 0.33], position: [0, 0.098, 0], material: 'indigo_glaze', taper: -0.48 },
      { id: 'rim_collar', shape: 'torus', size: [0.36, 0.012, 0], position: [0, 0.155, 0], rotation: [90, 0, 0], material: 'brass_rim' },
    ],
  },

  'luggage trunk': {
    version: 1,
    name: 'Luggage Trunk',
    route: 'author',
    heightMeters: 0.55,
    identity:
      'Vintage steamer luggage trunk with reinforced leather exterior, riveted dark walnut wood slats, polished brass corner caps, heavy leather side carry handles, and center brass tumbler latch.',
    materials: [
      { id: 'trunk_leather', color: '#451a03', roughness: 0.65, metalness: 0.05 },
      { id: 'walnut_slats', color: '#78350f', roughness: 0.7, metalness: 0.0 },
      { id: 'brass_caps', color: '#f59e0b', roughness: 0.25, metalness: 0.92 },
      { id: 'iron_hasp', color: '#1e293b', roughness: 0.4, metalness: 0.85 },
    ],
    parts: [
      { id: 'trunk_case', shape: 'box', size: [0.85, 0.48, 0.52], position: [0, 0.26, 0], material: 'trunk_leather', roundness: 0.06 },
      { id: 'wood_slat_t1', shape: 'box', size: [0.86, 0.03, 0.06], position: [0, 0.51, 0.14], material: 'walnut_slats' },
      { id: 'wood_slat_t2', shape: 'box', size: [0.86, 0.03, 0.06], position: [0, 0.51, -0.14], material: 'walnut_slats' },
      { id: 'corner_fl', shape: 'box', size: [0.06, 0.49, 0.06], position: [-0.41, 0.26, 0.24], material: 'brass_caps', mirrorX: true },
      { id: 'corner_bl', shape: 'box', size: [0.06, 0.49, 0.06], position: [-0.41, 0.26, -0.24], material: 'brass_caps', mirrorX: true },
      { id: 'center_latch', shape: 'box', size: [0.09, 0.12, 0.03], position: [0, 0.28, 0.27], material: 'brass_caps' },
      { id: 'handle_r', shape: 'torus', size: [0.12, 0.02, 0], position: [0.435, 0.26, 0], rotation: [0, 90, 0], material: 'trunk_leather', mirrorX: true },
    ],
  },

  'industrial canister': {
    version: 1,
    name: 'Industrial Canister',
    route: 'author',
    heightMeters: 0.68,
    identity:
      'Heavy-duty industrial alloy containment canister with flanged base ring, ribbed cylindrical pressure body, high-contrast hazard stripe band, threaded twist cap, and analog pressure gauge dial.',
    materials: [
      { id: 'canister_alloy', color: '#0d9488', roughness: 0.35, metalness: 0.8 },
      { id: 'flange_dark', color: '#134e4a', roughness: 0.5, metalness: 0.85 },
      { id: 'hazard_yellow', color: '#eab308', roughness: 0.4, metalness: 0.1 },
      { id: 'gauge_dial', color: '#f8fafc', roughness: 0.15, metalness: 0.2 },
    ],
    parts: [
      { id: 'flanged_base', shape: 'cylinder', size: [0.38, 0.05, 0.38], position: [0, 0.025, 0], material: 'flange_dark' },
      { id: 'canister_body', shape: 'cylinder', size: [0.34, 0.46, 0.34], position: [0, 0.28, 0], material: 'canister_alloy' },
      { id: 'rib_ring_1', shape: 'torus', size: [0.35, 0.015, 0], position: [0, 0.18, 0], rotation: [90, 0, 0], material: 'flange_dark' },
      { id: 'rib_ring_2', shape: 'torus', size: [0.35, 0.015, 0], position: [0, 0.38, 0], rotation: [90, 0, 0], material: 'flange_dark' },
      { id: 'hazard_band', shape: 'cylinder', size: [0.344, 0.1, 0.344], position: [0, 0.28, 0], material: 'hazard_yellow' },
      { id: 'top_flange', shape: 'cylinder', size: [0.36, 0.04, 0.36], position: [0, 0.53, 0], material: 'flange_dark' },
      { id: 'twist_cap', shape: 'cylinder', size: [0.22, 0.08, 0.22], position: [0, 0.59, 0], material: 'canister_alloy' },
      { id: 'pressure_gauge', shape: 'cylinder', size: [0.08, 0.03, 0.08], position: [0, 0.42, 0.18], rotation: [90, 0, 0], material: 'gauge_dial' },
    ],
  },

  'tactical hover drone': {
    version: 1,
    name: 'Tactical Recon Drone',
    route: 'author',
    heightMeters: 0.45,
    identity:
      'Compact military quadcopter surveillance drone with central aerodynamic fuselage pod, four carbon-fiber motor boom arms, ducted rotor blade guards with spinning rotors, and forward sensor turret.',
    materials: [
      { id: 'carbon_stealth', color: '#1e293b', roughness: 0.4, metalness: 0.7 },
      { id: 'rotor_dark', color: '#0f172a', roughness: 0.3, metalness: 0.9 },
      { id: 'sensor_red', color: '#ef4444', roughness: 0.1, metalness: 0.2, emissive: true },
      { id: 'led_cyan', color: '#06b6d4', roughness: 0.1, metalness: 0.1, emissive: true },
    ],
    parts: [
      { id: 'fuselage_pod', shape: 'blob', size: [0.28, 0.12, 0.42], position: [0, 0.22, 0], material: 'carbon_stealth', roundness: 0.45 },
      { id: 'camera_turret', shape: 'blob', size: [0.1, 0.1, 0.1], position: [0, 0.16, 0.21], material: 'sensor_red', roundness: 0.6 },
      { id: 'arm_fl', shape: 'box', size: [0.03, 0.02, 0.32], position: [0.18, 0.22, 0.18], rotation: [0, -45, 0], material: 'carbon_stealth', mirrorX: true },
      { id: 'arm_bl', shape: 'box', size: [0.03, 0.02, 0.32], position: [0.18, 0.22, -0.18], rotation: [0, 45, 0], material: 'carbon_stealth', mirrorX: true },
      { id: 'rotor_guard_fl', shape: 'torus', size: [0.22, 0.015, 0], position: [0.29, 0.24, 0.29], rotation: [90, 0, 0], material: 'carbon_stealth', mirrorX: true },
      { id: 'rotor_guard_bl', shape: 'torus', size: [0.22, 0.015, 0], position: [0.29, 0.24, -0.29], rotation: [90, 0, 0], material: 'carbon_stealth', mirrorX: true },
      { id: 'rotor_fl', shape: 'cylinder', size: [0.18, 0.01, 0.18], position: [0.29, 0.24, 0.29], material: 'rotor_dark', mirrorX: true, motion: { type: 'spin', axis: 'y', speed: 28, amplitude: 0 } },
      { id: 'rotor_bl', shape: 'cylinder', size: [0.18, 0.01, 0.18], position: [0.29, 0.24, -0.29], material: 'rotor_dark', mirrorX: true, motion: { type: 'spin', axis: 'y', speed: -28, amplitude: 0 } },
      { id: 'nav_light_l', shape: 'blob', size: [0.02, 0.02, 0.02], position: [0.14, 0.24, 0], material: 'led_cyan', mirrorX: true },
    ],
  },

  'knight shield': {
    version: 1,
    name: 'Knight Heater Shield',
    route: 'author',
    heightMeters: 0.95,
    identity:
      'Curved medieval heater shield with dark steel reinforcing perimeter rim, deep royal blue enameled face, embossed golden heraldic cross crest, polished brass boss rivet studs, and rear leather arm straps.',
    materials: [
      { id: 'shield_steel', color: '#94a3b8', roughness: 0.3, metalness: 0.9 },
      { id: 'heraldic_blue', color: '#1e3a8a', roughness: 0.45, metalness: 0.15 },
      { id: 'gold_crest', color: '#f59e0b', roughness: 0.22, metalness: 0.92 },
      { id: 'leather_straps', color: '#451a03', roughness: 0.75, metalness: 0.0 },
    ],
    parts: [
      { id: 'shield_face', shape: 'box', size: [0.65, 0.88, 0.04], position: [0, 0.52, 0], material: 'heraldic_blue', taper: 0.55 },
      { id: 'steel_rim', shape: 'box', size: [0.68, 0.91, 0.03], position: [0, 0.52, -0.005], material: 'shield_steel', taper: 0.55 },
      { id: 'cross_vertical', shape: 'box', size: [0.12, 0.78, 0.015], position: [0, 0.52, 0.025], material: 'gold_crest' },
      { id: 'cross_horizontal', shape: 'box', size: [0.55, 0.12, 0.015], position: [0, 0.62, 0.025], material: 'gold_crest' },
      { id: 'shield_boss', shape: 'blob', size: [0.12, 0.12, 0.05], position: [0, 0.62, 0.035], material: 'shield_steel', roundness: 0.6 },
      { id: 'rear_strap_upper', shape: 'box', size: [0.24, 0.06, 0.04], position: [0, 0.62, -0.03], material: 'leather_straps' },
      { id: 'rear_strap_lower', shape: 'box', size: [0.24, 0.06, 0.04], position: [0, 0.42, -0.03], material: 'leather_straps' },
    ],
  },
};

// Aliases
CURATED_SCULPT_SPECS['fireplace'] = CURATED_SCULPT_SPECS['rustic stone fireplace'];
CURATED_SCULPT_SPECS['stone fireplace'] = CURATED_SCULPT_SPECS['rustic stone fireplace'];
CURATED_SCULPT_SPECS['hearth'] = CURATED_SCULPT_SPECS['rustic stone fireplace'];
CURATED_SCULPT_SPECS['مدفأة'] = CURATED_SCULPT_SPECS['rustic stone fireplace'];
CURATED_SCULPT_SPECS['موقد'] = CURATED_SCULPT_SPECS['rustic stone fireplace'];
CURATED_SCULPT_SPECS['مدفأة حجرية ريفية'] = CURATED_SCULPT_SPECS['rustic stone fireplace'];

CURATED_SCULPT_SPECS['tribal archer'] = CURATED_SCULPT_SPECS['tribal archer female'];
CURATED_SCULPT_SPECS['tribal_archer_female'] = CURATED_SCULPT_SPECS['tribal archer female'];
CURATED_SCULPT_SPECS['archer'] = CURATED_SCULPT_SPECS['tribal archer female'];
CURATED_SCULPT_SPECS['scout archer'] = CURATED_SCULPT_SPECS['tribal archer female'];
CURATED_SCULPT_SPECS['رامي سهام'] = CURATED_SCULPT_SPECS['tribal archer female'];

// Coiled Snake Ring & Jewelry Aliases
CURATED_SCULPT_SPECS['snake ring'] = CURATED_SCULPT_SPECS['coiled snake ring'];
CURATED_SCULPT_SPECS['gold ring'] = CURATED_SCULPT_SPECS['coiled snake ring'];
CURATED_SCULPT_SPECS['diamond ring'] = CURATED_SCULPT_SPECS['coiled snake ring'];
CURATED_SCULPT_SPECS['ring'] = CURATED_SCULPT_SPECS['coiled snake ring'];
CURATED_SCULPT_SPECS['jewelry'] = CURATED_SCULPT_SPECS['coiled snake ring'];
CURATED_SCULPT_SPECS['jewellery'] = CURATED_SCULPT_SPECS['coiled snake ring'];
CURATED_SCULPT_SPECS['خاتم'] = CURATED_SCULPT_SPECS['coiled snake ring'];
CURATED_SCULPT_SPECS['خاتم ذهبي'] = CURATED_SCULPT_SPECS['coiled snake ring'];
CURATED_SCULPT_SPECS['خاتم ثعبان'] = CURATED_SCULPT_SPECS['coiled snake ring'];
CURATED_SCULPT_SPECS['خاتم مفرغ'] = CURATED_SCULPT_SPECS['coiled snake ring'];
CURATED_SCULPT_SPECS['مجوهرات'] = CURATED_SCULPT_SPECS['coiled snake ring'];
CURATED_SCULPT_SPECS['دبلة'] = CURATED_SCULPT_SPECS['coiled snake ring'];
CURATED_SCULPT_SPECS['محبس'] = CURATED_SCULPT_SPECS['coiled snake ring'];
CURATED_SCULPT_SPECS['محبس إصبع'] = CURATED_SCULPT_SPECS['coiled snake ring'];

// Sports Car & Vehicle Aliases
CURATED_SCULPT_SPECS['supercar'] = CURATED_SCULPT_SPECS['sports car'];
CURATED_SCULPT_SPECS['racecar'] = CURATED_SCULPT_SPECS['sports car'];
CURATED_SCULPT_SPECS['hypercar'] = CURATED_SCULPT_SPECS['sports car'];
CURATED_SCULPT_SPECS['vintage sports car'] = CURATED_SCULPT_SPECS['sports car'];
CURATED_SCULPT_SPECS['vintage car'] = CURATED_SCULPT_SPECS['sports car'];
CURATED_SCULPT_SPECS['سيارة رياضية'] = CURATED_SCULPT_SPECS['sports car'];
CURATED_SCULPT_SPECS['سيارة سباق'] = CURATED_SCULPT_SPECS['sports car'];
CURATED_SCULPT_SPECS['سيارة رياضية كلاسيكية'] = CURATED_SCULPT_SPECS['sports car'];

// Office Chair & Furniture Aliases
CURATED_SCULPT_SPECS['desk chair'] = CURATED_SCULPT_SPECS['office chair'];
CURATED_SCULPT_SPECS['ergonomic chair'] = CURATED_SCULPT_SPECS['office chair'];
CURATED_SCULPT_SPECS['executive chair'] = CURATED_SCULPT_SPECS['office chair'];
CURATED_SCULPT_SPECS['swivel chair'] = CURATED_SCULPT_SPECS['office chair'];
CURATED_SCULPT_SPECS['كرسي مكتب'] = CURATED_SCULPT_SPECS['office chair'];
CURATED_SCULPT_SPECS['كرسي مريح'] = CURATED_SCULPT_SPECS['office chair'];
CURATED_SCULPT_SPECS['كرسي مكتب مريح'] = CURATED_SCULPT_SPECS['office chair'];

// Forged Longsword & Weapon Aliases
CURATED_SCULPT_SPECS['longsword'] = CURATED_SCULPT_SPECS['forged longsword'];
CURATED_SCULPT_SPECS['broadsword'] = CURATED_SCULPT_SPECS['forged longsword'];
CURATED_SCULPT_SPECS['steel sword'] = CURATED_SCULPT_SPECS['forged longsword'];
CURATED_SCULPT_SPECS['forged sword'] = CURATED_SCULPT_SPECS['forged longsword'];
CURATED_SCULPT_SPECS['medieval sword'] = CURATED_SCULPT_SPECS['forged longsword'];
CURATED_SCULPT_SPECS['سيف طويل'] = CURATED_SCULPT_SPECS['forged longsword'];
CURATED_SCULPT_SPECS['سيف مطروق'] = CURATED_SCULPT_SPECS['forged longsword'];
CURATED_SCULPT_SPECS['سيف فولاذي'] = CURATED_SCULPT_SPECS['forged longsword'];
CURATED_SCULPT_SPECS['سيف فولاذي مطروق'] = CURATED_SCULPT_SPECS['forged longsword'];

// Glass Wine Bottle & Vessel Aliases
CURATED_SCULPT_SPECS['wine bottle'] = CURATED_SCULPT_SPECS['glass wine bottle'];
CURATED_SCULPT_SPECS['potion flask'] = CURATED_SCULPT_SPECS['glass wine bottle'];
CURATED_SCULPT_SPECS['potion bottle'] = CURATED_SCULPT_SPECS['glass wine bottle'];
CURATED_SCULPT_SPECS['flask'] = CURATED_SCULPT_SPECS['glass wine bottle'];
CURATED_SCULPT_SPECS['glass bottle'] = CURATED_SCULPT_SPECS['glass wine bottle'];
CURATED_SCULPT_SPECS['bottle'] = CURATED_SCULPT_SPECS['glass wine bottle'];
CURATED_SCULPT_SPECS['زجاجة نبيذ'] = CURATED_SCULPT_SPECS['glass wine bottle'];
CURATED_SCULPT_SPECS['قارورة'] = CURATED_SCULPT_SPECS['glass wine bottle'];
CURATED_SCULPT_SPECS['قنينة'] = CURATED_SCULPT_SPECS['glass wine bottle'];
CURATED_SCULPT_SPECS['زجاجة مشروب'] = CURATED_SCULPT_SPECS['glass wine bottle'];

// Architecture Aliases
CURATED_SCULPT_SPECS['watchtower'] = CURATED_SCULPT_SPECS['medieval round watchtower'];
CURATED_SCULPT_SPECS['round tower'] = CURATED_SCULPT_SPECS['medieval round watchtower'];
CURATED_SCULPT_SPECS['برج'] = CURATED_SCULPT_SPECS['medieval round watchtower'];
CURATED_SCULPT_SPECS['برج مراقبة'] = CURATED_SCULPT_SPECS['medieval round watchtower'];
CURATED_SCULPT_SPECS['برج مراقبة حجري'] = CURATED_SCULPT_SPECS['medieval round watchtower'];
CURATED_SCULPT_SPECS['برج مراقبة حجري أسطواني'] = CURATED_SCULPT_SPECS['medieval round watchtower'];
CURATED_SCULPT_SPECS['برج مراقبة حجري أسطواني عتيق'] = CURATED_SCULPT_SPECS['medieval round watchtower'];

CURATED_SCULPT_SPECS['cottage'] = CURATED_SCULPT_SPECS['timber cottage'];
CURATED_SCULPT_SPECS['timber house'] = CURATED_SCULPT_SPECS['timber cottage'];
CURATED_SCULPT_SPECS['كوخ'] = CURATED_SCULPT_SPECS['timber cottage'];
CURATED_SCULPT_SPECS['كوخ خشبي'] = CURATED_SCULPT_SPECS['timber cottage'];
CURATED_SCULPT_SPECS['كوخ قروي خشبي'] = CURATED_SCULPT_SPECS['timber cottage'];

CURATED_SCULPT_SPECS['lighthouse'] = CURATED_SCULPT_SPECS['coastal lighthouse'];
CURATED_SCULPT_SPECS['منارة'] = CURATED_SCULPT_SPECS['coastal lighthouse'];
CURATED_SCULPT_SPECS['منارة ساحلية'] = CURATED_SCULPT_SPECS['coastal lighthouse'];

CURATED_SCULPT_SPECS['windmill'] = CURATED_SCULPT_SPECS['windmill millhouse'];
CURATED_SCULPT_SPECS['طاحونة'] = CURATED_SCULPT_SPECS['windmill millhouse'];
CURATED_SCULPT_SPECS['طاحونة هواء'] = CURATED_SCULPT_SPECS['windmill millhouse'];

// Characters Aliases
CURATED_SCULPT_SPECS['turtle'] = CURATED_SCULPT_SPECS['nerd turtle'];
CURATED_SCULPT_SPECS['tortoise'] = CURATED_SCULPT_SPECS['nerd turtle'];
CURATED_SCULPT_SPECS['سلحفاة'] = CURATED_SCULPT_SPECS['nerd turtle'];
CURATED_SCULPT_SPECS['سلحفاة صلصالية'] = CURATED_SCULPT_SPECS['nerd turtle'];
CURATED_SCULPT_SPECS['سلحفاة صلصالية ذكية'] = CURATED_SCULPT_SPECS['nerd turtle'];

CURATED_SCULPT_SPECS['sleeping monster'] = CURATED_SCULPT_SPECS['snorlax'];
CURATED_SCULPT_SPECS['وحش نائم'] = CURATED_SCULPT_SPECS['snorlax'];
CURATED_SCULPT_SPECS['وحش نائم ضخم'] = CURATED_SCULPT_SPECS['snorlax'];
CURATED_SCULPT_SPECS['وحش صلصال'] = CURATED_SCULPT_SPECS['snorlax'];

// New Props & Vessels Aliases
CURATED_SCULPT_SPECS['chest'] = CURATED_SCULPT_SPECS['treasure chest'];
CURATED_SCULPT_SPECS['صندوق كنز'] = CURATED_SCULPT_SPECS['treasure chest'];
CURATED_SCULPT_SPECS['صندوق كنز خشبي'] = CURATED_SCULPT_SPECS['treasure chest'];
CURATED_SCULPT_SPECS['صندوق كنز خشبي مع أقفال حديدية'] = CURATED_SCULPT_SPECS['treasure chest'];
CURATED_SCULPT_SPECS['صندوق كنز خشبي عتيق مزخرف بالحديد والذهب'] = CURATED_SCULPT_SPECS['treasure chest'];

CURATED_SCULPT_SPECS['perfume'] = CURATED_SCULPT_SPECS['perfume bottle'];
CURATED_SCULPT_SPECS['عطر'] = CURATED_SCULPT_SPECS['perfume bottle'];
CURATED_SCULPT_SPECS['قارورة عطر'] = CURATED_SCULPT_SPECS['perfume bottle'];
CURATED_SCULPT_SPECS['قارورة عطر زجاجية'] = CURATED_SCULPT_SPECS['perfume bottle'];
CURATED_SCULPT_SPECS['قارورة عطر زجاجية فاخرة'] = CURATED_SCULPT_SPECS['perfume bottle'];
CURATED_SCULPT_SPECS['قارورة عطر زجاجية شفافة مع غطاء ذهبي'] = CURATED_SCULPT_SPECS['perfume bottle'];

CURATED_SCULPT_SPECS['coffee bag'] = CURATED_SCULPT_SPECS['espresso bag'];
CURATED_SCULPT_SPECS['coffee pouch'] = CURATED_SCULPT_SPECS['espresso bag'];
CURATED_SCULPT_SPECS['stand-up pouch'] = CURATED_SCULPT_SPECS['espresso bag'];
CURATED_SCULPT_SPECS['كيس قهوة'] = CURATED_SCULPT_SPECS['espresso bag'];
CURATED_SCULPT_SPECS['كيس بن'] = CURATED_SCULPT_SPECS['espresso bag'];
CURATED_SCULPT_SPECS['كيس قهوة اسبريسو'] = CURATED_SCULPT_SPECS['espresso bag'];
CURATED_SCULPT_SPECS['كيس قهوة اسبريسو فاخر'] = CURATED_SCULPT_SPECS['espresso bag'];
CURATED_SCULPT_SPECS['كيس قهوة اسبريسو فاخر مع صمام تفريغ الهواء'] = CURATED_SCULPT_SPECS['espresso bag'];
CURATED_SCULPT_SPECS['كيس وقوف مرن'] = CURATED_SCULPT_SPECS['espresso bag'];

CURATED_SCULPT_SPECS['stall'] = CURATED_SCULPT_SPECS['yatai stall'];
CURATED_SCULPT_SPECS['market stall'] = CURATED_SCULPT_SPECS['yatai stall'];
CURATED_SCULPT_SPECS['food stall'] = CURATED_SCULPT_SPECS['yatai stall'];
CURATED_SCULPT_SPECS['كشك'] = CURATED_SCULPT_SPECS['yatai stall'];
CURATED_SCULPT_SPECS['كشك ياباني'] = CURATED_SCULPT_SPECS['yatai stall'];
CURATED_SCULPT_SPECS['محطة طعام'] = CURATED_SCULPT_SPECS['yatai stall'];
CURATED_SCULPT_SPECS['محطة طعام خشبية'] = CURATED_SCULPT_SPECS['yatai stall'];

CURATED_SCULPT_SPECS['obelisk'] = CURATED_SCULPT_SPECS['ancient stone obelisk'];
CURATED_SCULPT_SPECS['monolith'] = CURATED_SCULPT_SPECS['ancient stone obelisk'];
CURATED_SCULPT_SPECS['مسلة'] = CURATED_SCULPT_SPECS['ancient stone obelisk'];
CURATED_SCULPT_SPECS['مسلة حجرية'] = CURATED_SCULPT_SPECS['ancient stone obelisk'];

CURATED_SCULPT_SPECS['bowl'] = CURATED_SCULPT_SPECS['ceramic bowl'];
CURATED_SCULPT_SPECS['وعاء'] = CURATED_SCULPT_SPECS['ceramic bowl'];
CURATED_SCULPT_SPECS['وعاء خزفي'] = CURATED_SCULPT_SPECS['ceramic bowl'];

CURATED_SCULPT_SPECS['trunk'] = CURATED_SCULPT_SPECS['luggage trunk'];
CURATED_SCULPT_SPECS['صندوق أمتعة'] = CURATED_SCULPT_SPECS['luggage trunk'];
CURATED_SCULPT_SPECS['حقيبة سفر'] = CURATED_SCULPT_SPECS['luggage trunk'];

CURATED_SCULPT_SPECS['canister'] = CURATED_SCULPT_SPECS['industrial canister'];
CURATED_SCULPT_SPECS['علبة'] = CURATED_SCULPT_SPECS['industrial canister'];
CURATED_SCULPT_SPECS['علبة أسطوانية'] = CURATED_SCULPT_SPECS['industrial canister'];

CURATED_SCULPT_SPECS['drone'] = CURATED_SCULPT_SPECS['tactical hover drone'];
CURATED_SCULPT_SPECS['quadcopter'] = CURATED_SCULPT_SPECS['tactical hover drone'];
CURATED_SCULPT_SPECS['درون'] = CURATED_SCULPT_SPECS['tactical hover drone'];
CURATED_SCULPT_SPECS['طائرة استطلاع بدون طيار'] = CURATED_SCULPT_SPECS['tactical hover drone'];

CURATED_SCULPT_SPECS['shield'] = CURATED_SCULPT_SPECS['knight shield'];
CURATED_SCULPT_SPECS['heater shield'] = CURATED_SCULPT_SPECS['knight shield'];
CURATED_SCULPT_SPECS['درع'] = CURATED_SCULPT_SPECS['knight shield'];
CURATED_SCULPT_SPECS['درع فارس'] = CURATED_SCULPT_SPECS['knight shield'];
CURATED_SCULPT_SPECS['درع فارس فولاذي'] = CURATED_SCULPT_SPECS['knight shield'];

CURATED_SCULPT_SPECS['camera'] = CURATED_SCULPT_SPECS['professional dslr camera'];
CURATED_SCULPT_SPECS['digital camera'] = CURATED_SCULPT_SPECS['professional dslr camera'];
CURATED_SCULPT_SPECS['dslr camera'] = CURATED_SCULPT_SPECS['professional dslr camera'];
CURATED_SCULPT_SPECS['dslr'] = CURATED_SCULPT_SPECS['professional dslr camera'];
CURATED_SCULPT_SPECS['nikon camera'] = CURATED_SCULPT_SPECS['professional dslr camera'];
CURATED_SCULPT_SPECS['nikon'] = CURATED_SCULPT_SPECS['professional dslr camera'];
CURATED_SCULPT_SPECS['a nikon camera'] = CURATED_SCULPT_SPECS['professional dslr camera'];
CURATED_SCULPT_SPECS['a digital camera'] = CURATED_SCULPT_SPECS['professional dslr camera'];
CURATED_SCULPT_SPECS['canon camera'] = CURATED_SCULPT_SPECS['professional dslr camera'];
CURATED_SCULPT_SPECS['sony camera'] = CURATED_SCULPT_SPECS['professional dslr camera'];
CURATED_SCULPT_SPECS['vintage camera'] = CURATED_SCULPT_SPECS['professional dslr camera'];
CURATED_SCULPT_SPECS['كاميرا'] = CURATED_SCULPT_SPECS['professional dslr camera'];
CURATED_SCULPT_SPECS['كاميرا رقمية'] = CURATED_SCULPT_SPECS['professional dslr camera'];
CURATED_SCULPT_SPECS['آلة تصوير'] = CURATED_SCULPT_SPECS['professional dslr camera'];
CURATED_SCULPT_SPECS['كاميرا نيكون'] = CURATED_SCULPT_SPECS['professional dslr camera'];
CURATED_SCULPT_SPECS['كاميرا كانون'] = CURATED_SCULPT_SPECS['professional dslr camera'];



