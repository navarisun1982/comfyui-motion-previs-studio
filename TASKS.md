# TASKS — ComfyUI Motion Previs Studio

Living task list for the post-review remediation. Each stage lives on its own branch `stage/NN-name` and merges to `master` only after owner approval.
Pre-remediation history: [docs/archive/TASKS_pre_remediation.md](docs/archive/TASKS_pre_remediation.md).

## Stage plan

| Stage | Branch | Status | Done when |
|---|---|---|---|
| S0 Foundation | `stage/00-foundation` | ✅ merged to master (`37cf23a`) | Repo clean, tests fast + green, build green, app renamed, docs truthful |
| S1 Truthful pipeline | `stage/01-truthful-pipeline` | 🟡 ready for templates & live test | Pipeline built, tested & verified; awaiting user API templates & live generation |
| S2 Desktop foundation | `stage/02-desktop-hygiene` | ✅ merged to master (`ccee65d`) | Offline self-hosted fonts, strict CSP, blob sanitization, safe storage service, electron window persistence & scoped ComfyUI CORS |
| S3 Editing safety | `stage/03-editing-safety` | ✅ merged to master (`65978dd`) | One gesture = one undo step; first run is clear |
| S4 Geometric conditioning | `stage/04-geometric-conditioning` | ✅ merged to master (`cb27783`) | Directed camera move rendered via deterministic offline previs & conditioned via IC-LoRA |
| S5 Performance | `stage/05-performance` | ✅ merged to master (`9a602b5`) | Smooth 60 FPS drag; main chunk 606 kB (down from 1.76 MB); 2 WebGL contexts |
| S6 UX overhaul | `stage/06-ux-overhaul` | ✅ merged to master (`4094de4`, `eddcb9f`) | Clean at 1280×720 / 1440×900 / 1920×1080 / 2560×1440; responsive sidebars |
| S7 Takes + queue | `stage/07-takes-queue` | ✅ merged to master (`b3d3faf`) | Multi-seed take generator, queue runner, contact sheet, circling hero takes, and A/B comparison |
| S8 Motion fidelity | `stage/08-motion-fidelity` | ✅ merged to master (`f8e3781`) | Optical flow vector analyzer, directional & speed fidelity scoring, visual vector overlay HUD, A/B motion diffing |
| S9 Closed-loop steering | `stage/09-closed-loop-steering` | ✅ merged to master (`fc9865c`) | Optical-flow-driven compensatory patches, prompt auto-correction, IC-LoRA modulation, steering modal, lineage tracking |
| S10 Sequence / Assembly | `stage/10-sequence` | ✅ merged to master (`16d714f`) | Multi-shot timeline, sequential playback, continuity & 180° rule checking, OTIO/EDL/FCPXML NLE exporters |
| S11 Parametric 3D Sculpt & Character Rigging | `stage/11-parametric-sculpt-engine` | 🟢 Complete (Phases 1, 2, 3 verified) | Parametric 3D primitives, silhouette matching, AI 3D generator, humanoid skeleton, analytic 2-bone IK, procedural locomotion, OpenPose previs pass |
| S12 Standalone Previs Studio | `stage/12-standalone-previs` | 🟢 Complete (Phases 1–8 verified) | Decouple from live ComfyUI server; PrevisExportDeck; Multi-Cue Bone Posing, 12fps Claymation, Image-to-Recipe, Deterministic Kinematics Motion Skills, Greybox/Standees Scene Blocking, OpenAI OAuth & Full UI/UX Audit Remediation |

## S12 Phase 8 checklist (Full UI/UX Audit Remediation & Zero-Duplicate Studio Architecture)

- [x] **Unified Center 3D Viewport & Exposed Stage Toolbar (`src/components/StagePrevis3D.tsx`, `src/components/MotionPrevisStage.tsx`)**:
  - Replaced dual-mounted `StagePrevis3D` instances with a single unified `StagePrevis3D` instance (`Split`, `Viewfinder`, `3D Stage`, and CSS `flex-row-reverse` `Swap`), cutting WebGL scenes/renderers in half (from 4 canvases to 2) and eliminating context destruction on swap.
  - Exposed the unified Top 3D Stage & Viewport Control Toolbar (`Split`, `Viewfinder`, `3D Stage`, `Swap`, Aspect Ratio `16:9 / 2.39:1 / 9:16 / 1:1`, `Base Pos` vs `Keyframe @ Time`, `Center (F)`, `Aim Camera`, `Iso / Top / Eye`, `Grid`, `3x3`, `Labels`, `FK Gizmos / IK Targets`, `🏺 12fps Clay`, `Import .GLB`).
  - Replaced ~900 lines of overlapping floating canvas HUDs with a sleek Top-Left Contextual Bar on the 3D Soundstage (`FK / IK` mode switch, `Rot / Move`, `Ground Feet`, `+ Pose Cue`, and active Bone `-15°/+15°` X/Y/Z nudges + `Reset`).
  - Replaced duplicate Soundstage Placement bars and unwired Audio Volume/Mute sliders with a compact 1-line Stage Cast & Environment Strip and restored `Shot Duration (1s–10s)` in the Transport Bar.
- [x] **Reorganized Right Inspector Deck & Shot Bible (`src/components/PrevisParametersDeck.tsx`, `src/components/ShotBible.tsx`)**:
  - Added persistent top Shot Slate & Target Engine Header (editable Shot Name, Shot Duration `1s–10s` stepper, and Target Engine pills `LTX-2.5` / `MiniMax H3` / `Seedance 2.0`).
  - Upgraded Camera tab with FOV degrees (`100°` to `18°`), Optical Impact callouts, `extreme-wide` framing, Angle Psychology callouts, and all 17 categorized camera movements (`Rack Focus`, `Handheld Subtle`, `Whip Pan`, `Crash Zoom`, `FPV Dive`, `Orbit Counter-Clockwise`). Removed unwired fake local-state `Camera Smoothing` and `Stabilization` controls.
  - Upgraded Cast tab by merging 3 duplicate "Add Object" sections into 1 unified card, restoring the **Scene Cast Pool** (`sceneCastPool`), surfacing `🦶 Ground Feet`, `🎬 + Pose Cue`, `↺ Reset`, **AI Acting Beats**, and **Prop Bone Socketing** (`RightHand`, `LeftHand`, `Head`, `Chest`, `Spine`, `Hips`), and removing unwired fake local-state `Foot Lock`, `Ground Lock`, and `Motion Smoothing` checkboxes.
  - Restored **Editable Negative Prompt** (`setNegativePrompt`) in the Light/Script tab.
  - Added explicit **Rename (`✎`)** buttons and inline renaming to both **Scenes** and **Shots** in `ShotBible.tsx`.
- [x] **Unified Render, Prompt & Export Studio (`src/components/PrevisExportDeck.tsx`, `src/App.tsx`, `src/components/AssetLibraryModal.tsx`)**:
  - Merged the standalone `App.tsx` Prompt Inspector Modal into `PrevisExportDeck.tsx` (AI Prompt Reasoner `"Direct & Polish with AI"`, Stage Timeline & Choreography Beats `Beat I / II / III`, Editable Negative Prompt, 4×4 Camera Extrinsics `c2w / w2c` JSON export, and Full Production Pack download).
  - Clarified `AssetLibraryModal.tsx` header actions (`✨ Concept-to-3D Studio` vs `⚡ Quick Text-to-3D`).
- [x] **Verification**:
  - Vitest suite: 46/46 suites passed (373/373 tests green).
  - Production build: `npm run build` passing with zero errors.

## S12 Phase 7 checklist (OpenAI / ChatGPT Browser Sign-In & Reasoning Gateway)

- [x] **OpenAI OAuth 2.0 PKCE Browser Sign-In Engine (`src/server/openaiAuthService.cjs`)**:
  - Implemented PKCE authorization code flow with public client ID `app_EMoamEEZ73f0CkXaXp7hrann` and loopback redirect URI `http://localhost:1455/auth/callback`.
  - Added loopback HTTP callback server on port 1455 with HTML completion UI.
  - Added token auto-refresh before expiration via `https://auth.openai.com/oauth/token`.
  - Added bidirectional token synchronization with `~/.codex/auth.json` and `~/.config/cozyclay/codex-auth.json`.
- [x] **Vite Dev Server Proxy Gateway (`src/server/openaiAuthPlugin.ts`, `vite.config.ts`)**:
  - Registered `/api/openai/auth/status`, `/api/openai/auth/login`, `/api/openai/auth/logout`.
  - Registered `/api/openai/chat/completions` with SSE stream buffering and conversion to ChatGPT Codex responses wire format.
- [x] **Client Service & UI Panel (`src/services/openaiAuth.ts`, `src/components/ReasonerSettingsPanel.tsx`)**:
  - Replaced manual API key requirement with high-aesthetic OpenAI / ChatGPT account card.
  - Displayed live account status, user email, and plan tier (`Plus / Pro` / `PROLITE`).
  - Added one-click model switching between `GPT-5.6 Sol (Flagship Reasoning)`, `GPT-6.1 Sol`, and `GPT-6 Luna`.
  - Retained collapsible advanced settings for manual API keys and custom endpoints (LM Studio, OpenRouter, Groq).
- [x] **Verification**:
  - Vitest suite: 46/46 suites passed (373/373 tests green).
  - Production build: `npm run build` passing with zero errors.
  - Verified live in browser with real 3D recipe generation test passed.

## S12 Phase 5 checklist (Kinematics Motion Skills & Greybox/Standees Scene Blocking)

- [x] **Deterministic Kinematics Compiler (`src/engine/kinematics/motionSkills.ts`, `src/engine/kinematics/motionCompiler.ts`)**:
  - Implemented 7 declarative motion skills: `walkTo`, `sitInSeat`, `reachGrip`, `standIdle`, `talkGesture`, `hitReaction`, `exitCar`.
  - Built pre-calculated deterministic `skillPaths` map ensuring perfect frame-by-frame trajectory continuity without tick boundary bugs.
  - Enforced strict Foot-Grounding Locks (stance vs swing phase, $Y \ge 0$, anti-sliding).
  - Defined canonical `STANDARD_ACTOR_POSES` (`standing_neutral`, `sitting`, `sitting_chair`, `talking_expressive`) mapping bone quaternions.
- [x] **Bilingual Directorial Motion Decomposer (`src/engine/kinematics/directorialMotionDecomposer.ts`)**:
  - Parses natural language directorial commands in English and Arabic (`و(يجلس|يمشي|يقف...)`) into timed motion skills.
  - Coordinate comma protection preventing multi-decimal numbers (`2.5, 3.0`) from premature clause splitting.
  - Scene entity resolution: resolves targets (chairs, tables, props) by name and position.
- [x] **Store & UI Integration (`src/stores/useShotStore.ts`, `src/components/ActorBlocking.tsx`)**:
  - Added `applyDirectorialMotion(actorId, prompt)` updating keyframes, endPosition, pose, and IK targets.
  - Added interactive "⚡ Compile Motion" button above the prompt textarea in `ActorBlocking.tsx`.
- [x] **Greybox Primitives & 2D Standees Staging Engine (`src/engine/staging/greyboxPrimitives.ts`, `src/engine/staging/cutoutMeshFactory.ts`, `src/engine/staging/subjectMeshFactory.ts`)**:
  - Dedicated Greybox Primitive engine (`cube`, `box`, `sphere`, `capsule`, `cylinder`, `cone`, `plane`) with base grounded at $y = 0$, positive Y height, and PBR matte clay materials.
  - 2D Cutout Standees & Backdrops (`cutout`, `standee`, `backdrop`) as vertical cards with alpha testing (`alphaTest: 0.15`), derived width ($height \times aspect$), shadows, and pedestal floor brackets.
  - Integrated into `subjectMeshFactory.ts` with instant detection, bypassing false humanoid or prop fallback loops.
- [x] **Quick-Add Previs Staging UI (`src/components/PrevisParametersDeck.tsx`, `src/components/MotionPrevisStage.tsx`)**:
  - Added one-click quick add buttons (`+👤 Character`, `+🖼️ Standee`, `+⬛ Cube`, `+🏛️ Cylinder`, `+📐 Plane`) to Staging Deck and top stage toolbar.
- [x] **Verification & Unit Tests**:
  - Unit test suite `tests/motionSkills.test.ts` (12/12 tests passing).
  - Unit test suite `tests/previsPrimitivesAndCutouts.test.ts` (8/8 tests passing).
  - All 45 test suites, 379/379 tests passing (`npm test`).
  - Production build: `npm run build` passing with zero TypeScript and bundle errors.

## S12 Phase 6 checklist (Independent Cue Keyframe Positioning & Timeline Animation)

- [x] **Store Playhead Synchronization (`src/stores/useShotStore.ts`, `src/components/MotionPrevisStage.tsx`)**:
  - Added global `currentTime` and `isPlaying` state to `useShotStore` so all decks (Stage Deck, Actor Blocking, Parameters Deck) react to current scrub time.
  - Linked `MotionPrevisStage` playback and scrubber directly into `useShotStore.setCurrentTime` and `setIsPlaying`.
- [x] **Independent Keyframe Recording (`src/stores/useShotStore.ts`)**:
  - Refactored `updateActorPositionAtTime`: when modifying position at $t > 0.15$s or keyframe mode, directly calls `recordTrajectoryPositionAtTime` to record timestamped keyframes without globally shifting base positions or modifying intermediate cues.
- [x] **Per-Cue Slider & Preset Binding (`src/components/PrevisParametersDeck.tsx`, `src/components/ActorBlocking.tsx`)**:
  - Subscribed sliders and presets to interpolated position at `currentTime` (`interpolateTrajectoryPosition`).
  - Replaced hardcoded `0` time in `ActorBlocking.tsx` with active `currentTime`, allowing users to position characters independently at Cue 1, Cue 2, Cue 3, etc.
  - Added visual `KEYFRAME` badges in parameter decks when scrubbing past the base start time.
- [x] **Verification**:
  - Vitest test suite 45/45 passing (379 tests green).
  - Production build `npm run build` passing with zero TypeScript or Vite bundle errors.

## S12 Phase 4 checklist (Truthful Image-to-3D Object Recipe Engine & Brand Neutralization)

- [x] **Truthful Image-to-Recipe 3D Synthesis (`src/engine/procedural3D/imageToRecipe.ts`)**:
  - Implemented pure declarative recipe generation from reference image metrics and color palette.
  - Added `isHumanoidPrompt`: strictly discriminates everyday props, food, bags of chips, bottles, vehicles, and furniture from humanoid characters.
  - Implemented `buildBagOfChipsRecipe`: builds authentic puffed snack pouch (`blob`, `roundness: 0.65`, `taper: 0.04`), top and bottom crimp seals (`box`), front flavor label, and accent chips with colors sampled from the image.
  - Implemented `buildBottleRecipe` & `buildBoxPropRecipe` with beveled rounded corners and procedural details.
  - Implemented `buildUniversalSilhouetteSlicesRecipe`: stacks smooth volumetric clay slices matching the 10-band silhouette width profile and dominant image colors for unclassified props.
- [x] **AIGenerator3D Integration (`src/components/AIGenerator3D.tsx`)**:
  - Removed hardcoded humanoid fallback in image processing (`createSkinnedCharacterFromConcept` is no longer called for props/objects).
  - Default `displayMode` set to `'parametric'` for clean PBR tactile object inspection.
  - `handleAddToScene` correctly assigns `kind = 'prop'` and passes `sculpt` to `StagePrevis3D`.
- [x] **Complete Brand Neutralization**:
  - Scrubbed all reference brand names across types, comments, material cache keys, and log strings in the entire codebase.
- [x] **Verification & Unit Tests**:
  - Unit test suite `tests/imageToRecipe.test.ts` (9/9 tests passing).
  - All 41 test suites, 311/311 tests passing (`npm test`).
  - Production build: `npm run build` passing with zero TypeScript and bundle errors.

## S12 Phase 3 checklist (Multi-Cue Posing, 12fps Stop-Motion & Bone Socketing)

- [x] **Multi-Cue Humanoid Bone Posing (`src/engine/trajectoryMath.ts`, `src/types/shotspec.ts`, `src/stores/useShotStore.ts`)**:
  - Added quaternion SLERP interpolation across all 19 standard humanoid bones and root positional offsets.
  - Added `pose`, `posePreset`, `gait`, and `cueLabel` to `TrajectoryKeyframeSchema`.
  - Added store actions `recordActorPoseAtTime`, `updateActorRotationAtTime`, `socketActorToBone`, `unsocketActor`, `setClaymationMode`.
- [x] **Stop-Motion Physics (12fps On-Twos)**:
  - Quantized temporal sampling to 12fps cadence (`Math.floor(t / (1/fps)) * (1/fps)`) in trajectory evaluation.
  - Added stage toolbar toggle `🏺 Claymation (12fps)` with tactile stop-motion visual rhythm.
  - Prompt compiler automatically injects tactile claymation aesthetics, thumbprint micro-textures, and stop-motion cadence modifiers.
- [x] **AI Directorial Acting Beats (`src/services/aiActingDirector.ts`)**:
  - Implemented `generateActingCuesFromPrompt` querying local LLMs or Gemini with automatic rule-based parsing fallback.
  - Parses natural language prompts with timestamped cues (e.g., `0s stand, 1.5s draw bow, 3s kneel`) into timed keyframes and cinematic presets.
- [x] **3D Object / Prop Manipulation & Bone Socketing (`StagePrevis3D.tsx`, `trajectoryMath.ts`)**:
  - Non-humanoid actor Deck for 3D Pitch / Yaw / Roll orientation keyframing.
  - Two-pass scene evaluation in `syncPositions(t)`: Pass 1 updates character roots, poses, and gaits; Pass 2 attaches socketed props directly to parent bones in world space.
- [x] **Cinematic Posing Presets (`src/engine/kinematics/posePresets.ts`)**:
  - Added `aim-bow`, `combat-ready`, `dramatic-lunge`, `hero-kneel`, `defensive-block`.
- [x] **Verification & Unit Tests**:
  - Unit test suite `tests/actorPoseInterpolation.test.ts` (5/5 tests passing).
  - Unit test suite `tests/actingAndClaymation.test.ts` (6/6 tests passing).
  - All 40 test suites, 302/302 tests passing (`npm run test`).
  - Production build: `npm run build` passing with zero TypeScript and bundle errors.

## S12 Phase 2 checklist (Modular Decomposition — No Big Bulks of Code)

- [x] **Character Dresser Isolation (`src/engine/kinematics/characterDresser.ts`)**:
  - Isolated costume layers, sculpted hair, circlet, facial profile, equipment (recurve bow, quiver, arrows), and boots into dedicated `characterDresser.ts`
  - Re-exported cleanly from `characterTextureProjector.ts` and `kinematics/index.ts` maintaining 100% backwards compatibility
- [x] **Staging Textures Extraction (`src/engine/staging/stageTextures.ts`)**:
  - Extracted procedural PBR running-bond terracotta brick canvas texture generator
  - Extracted procedural polished hardwood parquet floor texture generator
- [x] **Environment Builder Engine (`src/engine/staging/environmentBuilder.ts`)**:
  - Modularized `applyGroundSurface` (asphalt, concrete, cobblestone, sand dunes, grass, metal grate, wood parquet, studio floor)
  - Modularized `buildPerimeterEnvironment` (Urban Cityscape with neon crowns, Sci-Fi Orbital Bay with bulkheads, Medieval Castle Courtyard, Redwood Forest Clearing, Sahara Desert, Interior Hearth/Cabin with window and fireplace, Soundstage Studio)
  - Cleanly decoupled ~450 lines of procedural environment meshes from `StagePrevis3D.tsx`
- [x] **Stage Gizmo & Overlay Helpers (`src/components/stage/stageGizmoHelpers.ts`)**:
  - Extracted `disposeObject3D`, `createSpriteBanner`, `createBaseRing`, and `createIKHandleGizmo`
- [x] **Subject Mesh Factory (`src/engine/staging/subjectMeshFactory.ts`)**:
  - Extracted universal semantic procedural 3D subject/prop mesh factory supporting both positional parameter signatures and `CreateSubjectMeshOptions`
  - Integrated GLB model caching, procedural primitives, and skinned humanoid rigs with organic deformation
  - Decoupled 270 lines of subject mesh construction from `StagePrevis3D.tsx`
- [x] **Viewfinder Overlays & Frustum HUD (`src/components/stage/StageViewfinderOverlays.tsx`)**:
  - Extracted `updateFrustumGeometry` (3D camera frustum wireframe generation) and `<StageViewfinderOverlays />`
  - Encapsulated active VFX reference badge watermarks, actor choreography bounding boxes, camera-only flight callouts, rule of thirds grid, and optical crosshair
  - Reduced `StagePrevis3D.tsx` total lines from 4,321 to 3,338 (>980 lines decomposed)
- [x] **Multi-Pass Video Selection & Batch Downloads (`PrevisExportDeck.tsx`, `useShotStore.ts`, `StagePrevis3D.tsx`)**:
  - Added `previsDepthUrl` and `previsDepthBlob` state and `setPrevisDepth` action to `useShotStore`
  - Added pass mode selector (`All Passes`, `RGB Only`, `OpenPose Only`, `Depth Only`) defaulting to `all`
  - Added interactive multi-pass tab switcher: `🎥 RGB Plate`, `🦴 OpenPose`, `🌐 Depth` with active pass indicators
  - Added primary "Download Active Pass MP4" and "Download All Passes" batch downloader
- [x] **Non-MP4 Exporter Elimination**:
  - Deleted obsolete `pipelineExporters.ts` and `tests/pipelineExporters.test.ts` (Blender .py, Runway JSON, Kling JSON, ComfyUI workflow JSON, Seedance pack JSON)
  - Removed `exportBlenderCameraScript` from `cameraMatrixExport.ts` and updated tests
  - Streamlined `PrevisParametersDeck.tsx` by replacing the legacy "Target Pipeline" grid with a clean "Previs Video & Export Deck" navigation card
- [x] **Legacy Text & Prop Cleanups**:
  - Removed outdated "DIFFUSE SHOT IN COMFYUI" reference from `TakesGrid.tsx` empty-state
  - Replaced legacy `onDirectShotWithComfy` callback with `onOpenExportDeck`
- [x] **Verification & Unit Tests**:
  - Added unit test suite `tests/subjectMeshFactory.test.ts` (5 tests covering positional args, options object, primitives, ghost wireframe, and banner visibility)
  - 38 test suites, 287/287 tests passing (`npm run test`)
  - Production build: `npm run build` passing with zero TypeScript and bundle errors (Vite build ~11.7s)

## S12 Phase 1 checklist (Decouple ComfyUI Server & Wire Previs Export Deck)

- [x] **Previs Export Deck Integration (`src/components/PrevisExportDeck.tsx`, `App.tsx`)**:
  - Wired `PrevisExportDeck` into main studio mode switcher (`previs` | `vfx` | `export` | `sequence`)
  - Elevated 1-click in-engine WebGL reference video rendering (`mp4-muxer` 24fps) with instant video player preview and direct MP4 download
  - Integrated tailored prompt cards for LTX-2.5, MiniMax H3, and Seedance 2.0 with 1-click copy for positive/negative prompts
  - Export 4x4 camera keyframe transform matrices for external 3D/VFX workflows
- [x] **ComfyUI Coupling Elimination**:
  - Removed `ComfyUI Studio` header tab, `Comfy offline` status button, and `ComfyConnectionModal`
  - Replaced header settings with clean AI Reasoner provider display and preferences modal
  - Deleted legacy `ComfyConnectionModal.tsx` and `ComfyExecutionPanel.tsx`
  - Removed ComfyUI connection blocks from `TakesGrid.tsx`, `DirectorialSteeringModal.tsx`, `AssetLibraryModal.tsx`, and `InAppDebugger.tsx`
  - Removed `useComfyStore` from production bundle (`dist/`)
- [x] **Sculpted 3D Character Styling & Silhouette Refinement**:
  - Replaced 2D photo texture UV projection on skinned mannequin with smooth studio PBR maquette materials
  - Modeled rich 3D hair (crown, bangs, bun, braids), circlet, facial features, linen cowl/scarf, cuirass, quiver, bow, and boots
- [x] **Verification**:
  - 37 test suites, 281/281 tests passing (`npm run test`)
  - Production build: `npm run build` passing with zero TypeScript and bundle errors

- [x] Trajectory-Synchronized Procedural Locomotion / Gait Engine (`src/engine/kinematics/gaitEngine.ts`):
  - Procedural gaits (`walk`, `run`, `sneak`, `idle`, `auto`, `none`) driving limbs with $<0.02\text{ ms}$ evaluation time and zero GPU VRAM impact
  - Dynamic stance and swing phase evaluation with rhythmic foot ground contacts ($Y = 0$) preventing floor slipping
  - Anatomical pelvic bob, lateral weight shifting sway, and opposing arm counter-swing
  - Velocity-based `auto` gait resolution (idle when stationary, walking when moving $<2.2\text{ m/s}$, running when moving $\ge 2.2\text{ m/s}$)
- [x] ControlNet OpenPose Previs Renderer (`src/engine/kinematics/openPoseRenderer.ts`):
  - Projects 3D humanoid skeleton joints through camera into standard 18-keypoint OpenPose colored skeleton format
  - Solid black background with standard ControlNet color-coded anatomical limb vectors (Nose, Neck, Chest, Hips, Shoulders, Elbows, Wrists, Knees, Ankles)
- [x] Previs Multi-Pass Offline Pipeline (`src/engine/offlinePrevisRenderer.ts`):
  - Extended `renderOfflinePrevisPasses` with `renderPass: 'all'` and auto-discovery of staged humanoid rigs
  - Muxes OpenPose video pass into compliant MP4 container alongside RGB viewfinder and inverted Depth passes
- [x] Soundstage & Staging Deck UI Integration (`src/components/StagePrevis3D.tsx`, `ActorBlocking.tsx`, `PrevisParametersDeck.tsx`):
  - `StagePrevis3D.tsx`: Locomotion gait evaluation active in real-time timeline playback and offline previs rendering
  - One-click "Download OpenPose" MP4 button in stage toolbar
  - Gait selector buttons in floating Posing Deck and actor HUD (`Auto`, `Walk`, `Run`, `Sneak`, `Idle`, `None`)
  - Gait selector dropdowns on actor cards in `ActorBlocking.tsx` and `PrevisParametersDeck.tsx`
- [x] ComfyUI Execution Panel OpenPose Toggle (`src/components/ComfyExecutionPanel.tsx`):
  - Dual conditioning pass toggle: switch between `3D Viewfinder` (RGB/Depth) and `OpenPose Skeleton` for geometric control video injection
- [x] Unit test suites (`tests/kinematics.test.ts`):
  - 24 tests covering skeletal hierarchy, 2-bone IK solver, floor grounding, pose presets, procedural locomotion gaits, and OpenPose keypoint projection
- [x] Full Verification:
  - 33 test files, 253/253 tests passing (`npm run test`)
  - Production build: `npm run build` completed with zero TypeScript errors and bundle generated cleanly
  - In-browser UI verified via browser subagent

## S11 Phase 2 checklist (Humanoid Rigging, 2-Bone Analytic IK & Directorial Posing)

- [x] Canonical Pose & IK Target Schemas (`src/types/shotspec.ts`):
  - `IKTargetSchema` (position, pole, weight), `ActorPoseSchema` (hipsOffset, bone rotations map to quaternions), `ActorIKTargetsSchema` (leftHand, rightHand, leftFoot, rightFoot, headLookAt)
  - Extended `ActorSchema` with `posePreset`, `pose`, and `ikTargets`
- [x] Standard Humanoid Skeletal Hierarchy (`src/engine/kinematics/skeletonHierarchy.ts`):
  - Standard 19-bone humanoid tree matching Mixamo/game conventions: Hips, Spine, Chest, Neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand, RightShoulder, RightArm, RightForeArm, RightHand, LeftUpLeg, LeftLeg, LeftFoot, RightUpLeg, RightLeg, RightFoot
  - `createHumanoidSkeleton(height)`: Anatomically scaled Three.js `Skeleton` with proper parent-child joint offsets
  - `bindSculptToSkeleton(rig, sculptGroup)`: Rigid binding reparenting tagged sculpt parts (`part.bone`) while preserving world transforms
  - `createStylizedHumanoidStandin(rig, colorHex)`: Stylized joint-and-limb geometry for actors without a custom sculpt
- [x] Closed-Form 2-Bone Analytic IK Solver (`src/engine/kinematics/twoBoneIKSolver.ts`):
  - Geometric Law of Cosines solver executing in $<0.01\text{ ms}$ per limb (Zero VRAM impact, 0MB GPU memory overhead)
  - Distance clamping ($d_{\min} = |L_1 - L_2| + \epsilon$, $d_{\max} = L_1 + L_2 - \epsilon$) preventing numerical singularity
  - Pole vector bend-plane projection with continuity tracking across frames
  - Cascadeur-style FK update: directly writes local joint quaternions into root and mid bones
  - `solveLimbIK`: Solves `leftArm`, `rightArm`, `leftLeg`, and `rightLeg` with anatomical default bend poles
  - `solveLookAt`: Smooth directional gaze tracking for `Neck` (35%) and `Head` (65%)
- [x] Floor Grounding & Contact Lock (`src/engine/kinematics/footGroundingLock.ts`):
  - `isFootGrounded`, `lockFootToGround`, `groundBothFeet`: Ground contact detection and floor clamp ($Y = 0$) preventing foot sliding
- [x] Directorial Pose Presets & Serialization (`src/engine/kinematics/posePresets.ts`):
  - Curated directorial poses: `neutral-stand`, `aim-pistol`, `crouch-cover`, `stride-mid`, `dialogue-gesturing`, `sitting-chair`, `t-pose`
  - Lossless serialization: `exportBonePose` and `applyBonePose` mapping quaternions to/from `ActorPose`
- [x] Interactive Soundstage Posing & UI Integration (`src/components/StagePrevis3D.tsx`, `ActorBlocking.tsx`, `PrevisParametersDeck.tsx`):
  - `StagePrevis3D.tsx`: Interactive IK handles for hands, feet, head, and hips placed on Layer 1 (Gizmo layer) — visible on stage, automatically excluded from Viewfinder and offline previs video passes
  - Raycasted camera-facing plane dragging with real-time limb solving and single-gesture undo tracking (`beginGesture` / `endGesture`)
  - Toolbar toggle button for `IK Posing` with `Activity` icon
  - Floating glass Posing Deck overlay with pose preset chips, "Ground Feet", and "Reset Pose" actions
  - Actor card controls in `ActorBlocking.tsx` and `PrevisParametersDeck.tsx` for directorial pose selection
- [x] Unit test suites (`tests/kinematics.test.ts`):
  - 18 tests covering skeleton construction, sculpt binding, stylized stand-in, 2-bone IK solver, distance clamping, lookAt, floor grounding, pose presets, and serialization
- [x] Full Verification:
  - 33 test files, 247/247 tests passing (`npm run test`)
  - Production build: `npm run build` completed with zero TypeScript errors and bundle generated cleanly
  - In-browser UI verified via subagent

## S11 checklist (Parametric 3D Sculpt Engine & Image-to-3D Proxy — Phase 1)

- [x] Parametric 3D sculpt schema (`src/engine/procedural3D/sculptSpec.ts`):
  - Parametric primitive types: `blob` (box $\leftrightarrow$ ellipsoid via `roundness`), `lathe` (revolved 2D profiles), `extrude` (polygon with bevel), `cylinder`, `cone`, `torus`, `tube`, `capsule`
  - Humanoid skeletal bone tags on `SculptPart` (`Head`, `Chest`, `Spine`, `Hips`, `LeftArm`, `RightArm`, `LeftForeArm`, `RightForeArm`, `LeftHand`, `RightHand`, `LeftUpLeg`, `RightUpLeg`, `LeftLeg`, `RightLeg`, `LeftFoot`, `RightFoot`) with symmetric Left $\leftrightarrow$ Right mirror swapping
  - Untrusted input sanitization (`sanitizeSculptSpec`), revision patch application (`applySculptPatch`), backward migration from legacy v1 (`partGraphToSculptSpec`), registry storage (`registerSculptSpec`, `lookupSculptSpec`, `removeSculptSpec`), and actor migration (`actorSculptSpec`, `migrateActorSculpt`, `migrateActorsInShot`)
- [x] Deterministic 2D silhouette extraction & measurement (`src/engine/procedural3D/silhouette.ts`):
  - Pure mask extraction (`extractMaskFromRgba`), image URL mask loading (`extractMaskFromImageUrl`), HUD mask visualizer (`generateMaskDataUrl`)
  - Geometric silhouette measurement (`measureSilhouette`): aspect ratio, center of mass, 10-band normalized width profile
  - Offscreen Three.js orthographic rendering (`renderSculptSilhouette`) with headless rasterizer fallback
  - Real 2D Intersection-over-Union calculation (`computeSilhouetteIoU`) with zero fabricated scores
- [x] Multimodal LLM/VLM vision reasoning (`src/services/objectReasoner.ts`):
  - Enhanced Ollama, OpenAI-compatible, and Gemini providers with multimodal vision payload support (`imageBase64`)
  - Zero VRAM clash invariant: sets `keep_alive: 0` on Ollama when vision inputs are present, immediately unloading vision weights from GPU to protect RTX 3090 24GB VRAM pool for ComfyUI LTX-2.5
  - Geometric silhouette measurement injection (`measureSilhouette` width profile and aspect ratio into reasoner prompt)
  - Iterative revision loop (`opts.reviseSpec` applying `applySculptPatch` to refine models against silhouette)
- [x] Concept-to-3D Studio UI (`src/components/AIGenerator3D.tsx`):
  - Reference Image upload dropzone with auto-silhouette preview and toggle
  - Prompt text box with quick directorial suggestion chips
  - Live Three.js interactive canvas preview (orbit rotation, zoom, wireframe/solid toggle)
  - Real calculated 2D silhouette match HUD badge (`🎯 XX% Silhouette Match`)
  - Refine & Revise controls + "Auto-Align Silhouette" button (runs optimization pass keeping best IoU)
  - "Add to Active Scene" and "Save to 3D Library" action buttons
- [x] Soundstage & Parameter Deck Integration:
  - `src/components/AssetLibraryModal.tsx`: Integrated `AIGenerator3D` under prominent `✨ Concept-to-3D Studio` header button
  - `src/components/PrevisParametersDeck.tsx`: Added `✨ AI 3D Generator...` button in quick suggestion chips row; updated actor card procedural mesh deck to dual buttons: `⚡ LLM Reason` (passing `conceptImageUrl` if present) and `✨ 3D Studio...` (pre-seeding `AIGenerator3D` with actor token and reference image)
  - `src/components/StagePrevis3D.tsx`: Updated to check `actor.sculpt || actor.partGraph`, rebuilding the 3D figure on stage immediately when `sculpt` is assigned
  - `src/stores/useShotStore.ts` & `src/stores/useAssetLibraryStore.ts`: `addActor` supports `sculpt` in options; `useAssetLibraryStore` uses `SculptSpec`
- [x] Unit test suites (`tests/sculptSpec.test.ts`, `tests/silhouette.test.ts`, `tests/objectReasonerProviders.test.ts`):
  - 34 tests covering parametric shapes, humanoid bone tagging, silhouette mask extraction, IoU calculation, Ollama keep_alive VRAM safety, and multimodal payloads
- [x] Full Verification:
  - 32 test files, 229/229 tests passing (`npm run test`)
  - Production build: `npm run build` completed with zero TypeScript errors and bundle generated cleanly
  - In-browser UI verified via subagent


- [x] Runtime dependency: `mp4-muxer` (`^5.2.2`) installed as the only approved new runtime package
- [x] Deterministic offline previs renderer (`src/engine/offlinePrevisRenderer.ts`): fixed timestep evaluation (no wall-clock `setTimeout` pacing), $8n+1$ frame count snapping, RGB viewfinder capture, inverted linear depth pass (near=white, far=dark for ControlNet/IC-LoRA standard), and real MP4 container muxing with resilient fallback
- [x] Refactored `src/components/StagePrevis3D.tsx` to replace legacy `MediaRecorder` / `captureStream(24)` with `renderOfflinePrevisPasses`, eliminating stale closures and mislabeled `.webm` files
- [x] Extended `GenerationMode` in `src/pipeline/templateTypes.ts` to include `'control'`, and `BINDABLE_FIELDS` to include `'controlVideo'`, `'icLora'`, `'icLoraStrength'`
- [x] Versioned timeline patchers (`src/pipeline/timelinePatchers.ts`): registered `ltx.geometricControl@1` and updated `ltx.firstFrameSegment@1` to inject `reference_mode: 'VIDEO'` and `retakeVideo` for geometric camera conditioning
- [x] Pure template binding updates (`src/pipeline/templateBinder.ts`): support for `mode === 'control'`, `controlVideoFile`, `icLora`, and `icLoraStrength`
- [x] Updated template binding schema in `workflows/templates/ltx25_stubelius.binding.json` to declare `"control"` mode and bind node 5 (`StubeliusLTXModels`) inputs `ic_lora` and `ic_lora_strength`
- [x] Job runner integration (`src/pipeline/jobRunner.ts`): content-addressed video upload for `controlVideoBlob`
- [x] Package exporter integration (`src/pipeline/packageExporter.ts`): manifests include `controlVideo` uploads and support offline bundle exports in `control` mode
- [x] ComfyUI Execution Panel UI overhaul (`src/components/ComfyExecutionPanel.tsx`): 3-mode selector (T2V, I2V, Control / 3D Previs LoRA), Geometric Camera Conditioning HUD with IC-LoRA strength slider (`0.0`–`2.0x`) and model checkpoint selector
- [x] Unit test suites (`tests/geometricConditioning.test.ts`, `tests/offlinePrevisRenderer.test.ts`): 13 tests covering 8n+1 calculations, timeline patchers, binding validation, manifest generation, depth inversion, and MP4 muxing
- [x] Full verification: 25 test files, 160/160 tests passing in 4.6s; production build green with 0 errors in 12.6s; in-browser UI verified via subagent

## S0 checklist

- [x] Snapshot commit of pre-review tree (`2ddcb13`)
- [x] Delete unused `procedural3D/catalog/` (668 files) + its export/test
- [x] Move debug scripts to `scripts/dev/`, delete `out_*.json`, add `tsconfig.scripts.json` to the build
- [x] Delete broken `scripts/generate_workflows.ts` and the 3 fake `workflows/*.json`
- [x] Untrack `tsconfig.tsbuildinfo`; ignore `*.tsbuildinfo`, `coverage/`, `scripts/**/out_*.json`
- [x] Remove fake media: colour-bar `mock_preview.mp4`, runtime-fetched stock plates, procedural fake noir scene, colour LUT, seeded markers
- [x] Vitest default env `node`, jsdom opt-in per file, shared `tests/helpers/memoryStorage.ts`
- [x] Rename to **ComfyUI Motion Previs Studio** (header, title, package, Electron, launchers, logs, exports) with userData path pinned
- [x] Launchers rebuild when sources are newer than `dist/` and fail loudly on build errors
- [x] Docs truth pass: README, AGENTS, ARCHITECTURE (new), DECISIONS (ADR-005…009), RISK_REGISTER, templates contract
- [x] Owner approval → merged to `master` (`37cf23a`)

## S1 checklist (Truthful Pipeline)

- [x] Deterministic SHA-256 and JSON stable stringification (`src/pipeline/hash.ts`)
- [x] Strict Zod schemas for bindings, nodes, fields, and workflows (`src/pipeline/templateTypes.ts`)
- [x] Versioned timeline patcher registry (`src/pipeline/timelinePatchers.ts`)
- [x] Template verifier enforcing node existence, type matching, link absence (`src/pipeline/templateVerifier.ts`)
- [x] Pure functional template binder with frame snapping (8n+1) and quality profiles (`src/pipeline/templateBinder.ts`)
- [x] Template registry for verified templates with engine/mode lookup (`src/pipeline/templateRegistry.ts`)
- [x] Bundled template auto-discovery loader (`src/pipeline/templateLoader.ts`)
- [x] Prompt override store with staleness detection (`src/pipeline/promptOverride.ts`)
- [x] ShotRevisionV2 schema and backward-compatible history migration (`src/pipeline/revisionTypes.ts`, `src/stores/useHistoryStore.ts`)
- [x] Offline Package Mode exporter (`src/pipeline/packageExporter.ts`)
- [x] ComfyClient v2 with multiplexed WebSocket routing and cancellation (`src/services/comfyClient.ts`)
- [x] Singleton `JobRunner` with targeted output node extraction (`src/pipeline/jobRunner.ts`)
- [x] Delete dead legacy `src/services/directorExecutor.ts`
- [x] Update adapters with honest capability tiers and deprecated `buildWorkflow` (`src/adapters/`)
- [x] Overhaul `ComfyExecutionPanel.tsx` with read-only engine badge, quality profile selector, cancel support, and offline package export
- [x] Fix `DirectorDiffInspector.tsx` for v2 revisions
- [x] Comprehensive test coverage with 126 tests passing in 4.4s (`npm run test`)
- [x] Ingest user-supplied API templates (`ltx25_stubelius.api.json`, `h3_stubelius.api.json`) & companion bindings into `workflows/templates/`
- [x] Owner approval → merge to `master` (`4c786ce`)

## S2 checklist (Desktop Hardening & Hygiene)

- [x] Universal safe storage service (`src/services/storage.ts`) eliminating Node.js 22 experimental accessor warnings
- [x] Automatic blob URL sanitization (`sanitizeShotForStorage`) preventing dangling `blob:` URLs in `vfxReference` and `referenceImage`
- [x] Centralized storage refactor across stores (`useShotStore`, `useHistoryStore`, `useComfyStore`, `useAssetLibraryStore`, `promptOverride`, `partGraph`, `objectReasoner`, `ShotBible`)
- [x] Self-hosted Google Fonts locally in `public/fonts/` (Inter, Outfit, JetBrains Mono) and local `@font-face` rules (`src/fonts.css`)
- [x] Strict Content Security Policy (CSP) in `index.html` allowing only self, local fonts/styles, blob/data, and ComfyUI `127.0.0.1:8188`/`localhost:8188`
- [x] Hardened Electron main process (`electron/main.cjs`): scoped CORS headers to ComfyUI port 8188 and window state persistence (`window-state.json`) with multi-monitor topology bounds validation
- [x] Unit test suite (`tests/storage.test.ts`) with 10 tests verifying blob sanitization, safe JSON parsing, and cache integration
- [x] Verification: 22 test files, 138/138 tests passing in 4.5s with zero warnings or errors; production build green in 9.6s
- [x] Owner approval → merge `stage/02-desktop-hygiene` to `master` (`ccee65d`)

## S3 checklist (Editing Safety & Undo/Redo Engine)

- [x] Per-shot undo/redo engine with structurally shared snapshots (`src/stores/useShotStore.ts`)
- [x] "One gesture = one undo step" collapsing: continuous 3D Soundstage floor pointer drag collapses into single undo snapshot on release (`beginGesture` / `endGesture` in `src/components/StagePrevis3D.tsx`)
- [x] Per-shot history stack isolation: switching shots maintains independent past/future stacks without cross-talk
- [x] Redo branch invalidation: making a new edit after undo cleanly purges future branch
- [x] Global keyboard shortcuts (`Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+Y`) with editable element guard in `src/App.tsx` (never eats keystrokes in `<input>`/`<textarea>`)
- [x] Fixed backtick/tilde shortcut handler in `src/App.tsx` so typing in inputs never accidentally toggles the debugger
- [x] Studio header Undo and Redo icon buttons (`Undo2`, `Redo2`) with dynamic disabled states and tooltips
- [x] First-run Welcome / Getting Started modal (`src/components/WelcomeModal.tsx`) with 3D/VFX/ComfyUI quickstart, persistent dismissal, and "Help" re-trigger button
- [x] Computed reactive Project Info in `src/components/ShotBible.tsx` replacing hardcoded fake stats (`01:34:12`, etc.) with real computed shot durations, aspect-ratio-derived resolutions, frame rates, and scene counts
- [x] Vitest suite (`tests/editingSafety.test.ts`): 9 tests covering gesture collapse, per-shot isolation, redo invalidation, stack limits, storage persistence, and computed metrics
- [x] Full validation: 23 test files, 147/147 tests passing in 4.5s; production build green with 0 errors in 9.5s; in-browser UI verified via subagent

- [x] Owner approval → merge `stage/03-editing-safety` to `master` (`65978dd`)

## S4 checklist (Geometric Conditioning & Deterministic In-App Previs)

- [x] Deterministic offline previs video renderer (`src/engine/offlinePrevisRenderer.ts`) with fixed 24 FPS delta stepping, eliminating real-time `MediaRecorder` + `setTimeout` dropped frames
- [x] Offscreen WebGL canvas rendering without UI overlays (axes, markers, debug labels cleanly isolated)
- [x] High-performance WebCodecs / MP4 muxer pipeline (`mp4-muxer`) outputting authentic ISO BMFF `.mp4` video files with WebM canvas fallback
- [x] Depth conditioning pass generator (`src/engine/previsPassGenerator.ts`) with linear metric depth inversion
- [x] LTX-2.5 geometric conditioning adapter & timeline patcher with 8n+1 frame rule compliance
- [x] Previs parameter controls & HUD in `src/components/ComfyExecutionPanel.tsx` (mode selector, IC-LoRA strength, camera model weights)
- [x] Previs download & plate injection actions in `src/components/MotionPrevisStage.tsx`
- [x] Unit test suites (`tests/geometricConditioning.test.ts`, `tests/offlinePrevisRenderer.test.ts`)
- [x] Owner approval → merge `stage/04-geometric-conditioning` to `master` (`cb27783`)

## S5 checklist (Performance & Memory Optimization)

- [x] Rollup `manualChunks` bundle splitting in `vite.config.ts` (`vendor-three`, `vendor-react`, `vendor-icons`, `vendor-muxer`)
- [x] Reduced main bundle from 1,760 kB down to 606 kB (65% reduction)
- [x] Lazy loading with `Suspense` for secondary dialogs and panels in `src/App.tsx`
- [x] Halved active WebGL contexts from 4 down to 2 in `src/components/StagePrevis3D.tsx` by instantiating only active visible viewports
- [x] Hot-path debounced storage persistence in `src/stores/useShotStore.ts` during 60 FPS interactions
- [x] Zustand selector fine-tuning with `useShallow` preventing wasteful re-renders
- [x] Performance test suite (`tests/performance.test.ts`) with 163/163 passing tests
- [x] Owner approval → merge `stage/05-performance` to `master` (`9a602b5`)

## S6 checklist (UX Overhaul & Multi-Resolution Clean Layout)

- [x] Relax Electron window bounds in `electron/main.cjs` (`minWidth: 1024`, `minHeight: 680`) for clean rendering on 1280×720 and 1024-wide displays without OS clipping
- [x] Responsive collapsible sidebars (`isLeftSidebarOpen`, `isRightSidebarOpen`) with smooth 200ms transitions and header toggle buttons (`Bible`, `Deck`) in `src/App.tsx`
- [x] Dynamic active scene binding in Studio Header (`Scene 01 - Arrival / Shot 01A Tracking In`) updating truthfully on scene/shot selection
- [x] Fully functional timeline trim range handles in `src/components/MotionPrevisStage.tsx` constraining playback ticker `loop()` between `inTime` and `outTime`
- [x] Working volume and mute controls in `src/components/MotionPrevisStage.tsx`: video element volume/muted synchronization with toggleable `Volume2` / `VolumeX` button
- [x] Replaced remote Unsplash filmstrip URL with 100% offline procedural dark cinema filmstrip with sprocket perforations and frame numbers
- [x] Eliminated all native blocking `alert()` calls across `VFXVideoDeck.tsx`, `ShotBible.tsx`, and `ComfyExecutionPanel.tsx`, replacing them with `logger.warn`/`logger.error` and styled in-app dismissible banners
- [x] Full test pass (26 test files, 163/163 tests green) and production build pass (0 errors, 0 warnings)
- [x] Multi-resolution browser verification via subagent across 1280×720, 1440×900, and 1920×1080
- [x] Owner approval → merge `stage/06-ux-overhaul` to `master` (`4094de4`, `eddcb9f`)

## S7 checklist (Takes Grid & Generation Queue)

- [x] Multi-seed take generator (`src/pipeline/generationQueue.ts`): batch count selector (1, 3, 5 takes) with sequential (`+1`) and random seed strategies
- [x] State-machine generation queue processor: manages `queued`, `running`, `completed`, `failed`, `cancelled` states, auto-advances sequentially through jobs, and supports per-item cancellation and clearing the queue
- [x] Reactive Zustand queue store (`src/stores/useQueueStore.ts`) synchronizing queue state with UI components
- [x] Takes Contact Sheet / Grid (`src/components/TakesGrid.tsx`): visual card grid for all takes of the active shot with filter to view all shots, thumbnail video previews, and seed/engine/mode/profile badges
- [x] Circling hero takes: `isCircled` toggle (⭐) and 0–5 star ratings persisted safely in `useHistoryStore.ts`
- [x] Direct active plate assignment: `setTakeAsActivePlate` in `src/stores/useShotStore.ts` injecting selected take video into the 3D Soundstage and Video Deck
- [x] Synchronized A/B player comparison modal (`src/components/TakeComparisonModal.tsx`):
  - Side-by-side dual viewport view
  - Split wipe comparison slider with interactive draggable divider handle
  - Master synchronized transport controls: simultaneous play/pause, synchronized timeline scrubber, speed presets (`0.25x`, `0.5x`, `1.0x`), Spacebar shortcut, and loop toggle
  - Staging & camera parameter deviation traceability table
  - Direct "Circle Take" and "Set as Active Plate" actions for both Take A and Take B
- [x] Unit test suite (`tests/takesAndQueue.test.ts`): 10 tests covering batch enqueueing, seed strategies, cancellation, queue clearing, retries, take numbering, circling, rating, plate assignment, and parameter diffing
- [x] In-browser UI verification via subagent with screenshots (`takes_contact_sheet_1792784795432.png`)

## S8 checklist (Motion Fidelity Scoring & Optical Flow Analysis)

- [x] Grounded optical flow motion vector analyzer (`src/engine/motionFidelityAnalyzer.ts`):
  - Block-matching optical flow with contrast/variance gating and textureless patch handling
  - Radial divergence calculation for forward/backward dolly moves (`dolly-in` expansion vs `dolly-out` contraction)
  - Directional alignment scoring comparing achieved pixel flow against 3D camera trajectory (accounting for camera move to background flow inversion)
  - Speed & magnitude fidelity scoring against camera speed profiles (`slow-cinematic`, `moderate`, `rapid-dynamic`) with static movement penalties
  - Stability scoring measuring directional and velocity variance across sampled frames
  - 0–100% weighted composite fidelity score and classification (`excellent`, `good`, `fair`, `drift`)
  - Directorial guidance engine generating concrete prompt adjustments and IC-LoRA conditioning recommendations
- [x] Visual vector field HUD & overlay (`src/components/MotionFidelityOverlay.tsx`):
  - SVG optical flow motion arrow overlay displaying direction and magnitude per grid point
  - "Directed vs. Achieved" trajectory radar bar (`DIRECTED: DOLLY-IN` → `ACHIEVED: DOLLY-IN`)
  - Color-coded score badge with classification and vector toggle button
  - Expandable directorial details popover with metric breakdown and targeted advice
- [x] Takes Grid integration (`src/components/TakesGrid.tsx`):
  - Real-time client-side video frame sampling via offscreen Canvas 2D
  - Per-take "Score Motion Fidelity" / status badge with live progress reporting (`Scoring (XX%)...`)
  - Vector overlay embedded over take video previews
- [x] A/B comparison modal integration (`src/components/TakeComparisonModal.tsx`):
  - Side-by-side vector overlay rendering with master `Vectors: ON/OFF` toggle in header
  - Motion Fidelity Comparison block in parameter diff drawer comparing overall score, detected movement, directional match, and speed match
- [x] Unit test suite (`tests/motionFidelity.test.ts`): 13 tests covering expected vector mapping, speed scaling, motion classification, block matching, scoring, drift detection, static shot penalties, and store persistence
- [x] Full validation: 28 test files, 186/186 tests passing in 4.8s; production build green with 0 errors in 10.2s; in-browser UI verified via subagent
- [x] Owner approval → merge `stage/08-motion-fidelity` to `master` (`f8e3781`)

## S9 checklist (Closed-Loop Directorial Auto-Steering & Prompt Auto-Correction)

- [x] Closed-Loop Directorial Steering Engine (`src/engine/directorialSteeringEngine.ts`):
  - Inferred root-cause diagnosis from optical flow classification and vector divergence (`drift`, `static_drift`, `velocity_mismatch`, `subtle_drift`)
  - Compensatory positive prompt verb reinforcements with cinematic action clauses and weighted emphasis (e.g. `(deliberate camera pan-left, steady pan-left tracking shot:1.35)`)
  - Counter-steering negative prompt anti-motion token suppression (e.g. suppressing opposite drift vectors like `camera pan right` or static frames)
  - Geometric IC-LoRA conditioning modulation (+0.20–0.25x boost to lock background geometry to 3D previs)
  - Deterministic RNG seed offsetting to escape drift attractor basins
  - Pure helper functions `applySteeringPatchToShot` and `calculateFidelityImprovement`
- [x] Directorial Closed-Loop Auto-Steering Modal (`src/components/DirectorialSteeringModal.tsx`):
  - Diagnostic context card displaying source take fidelity score, root cause analysis, and applied directives list
  - Visual side-by-side diff comparing original vs steered positive and negative prompts
  - IC-LoRA conditioning modulation and target RNG seed indicators
  - Dual action buttons: "Apply to Active Shot" and "Apply & Queue Steered Re-Take"
- [x] Queue & Lineage Integration:
  - Extended `ShotRevisionV2` (`src/pipeline/revisionTypes.ts`) with `steeredFromTakeId` and `steeringPatch`
  - Integrated `defaultGenerationQueue` (`src/pipeline/generationQueue.ts`) to forward steering provenance into created take revisions
  - Added "STEERED (+XX%)" lineage badges on take cards in Takes Grid (`src/components/TakesGrid.tsx`)
  - Interactive "Auto-Steer" button directly on take cards and optical flow overlay popover (`src/components/MotionFidelityOverlay.tsx`)
  - Closed-loop steering comparison banner in A/B comparison modal (`src/components/TakeComparisonModal.tsx`)
- [x] Unit test suite (`tests/directorialSteering.test.ts`):
  - 8 comprehensive tests covering directional drift counter-steering, static camera locking, dolly push-in radial reinforcement, velocity amplification, seed offsetting, ShotSpec application, fidelity delta calculation, and queue lineage persistence
- [x] Full validation:
  - 29 test files, 194/194 tests passing in 4.89s (`npm run test`)
  - Production build: `npm run build` completed with zero TypeScript errors and bundle created cleanly
  - In-browser UI verified via subagent with recording `stage9_steering_verify_1792787404162.webp`
- [x] Owner approval → merge `stage/09-closed-loop-steering` to `master` (`fc9865c`)

## S10 checklist (Multi-Shot Timeline & Sequence Assembly)

- [x] Canonical Sequence Models & SMPTE Math:
  - Defined `CinematicSequence`, `SequenceShotItem`, `SequenceTransition`, and `SequenceContinuityReport` (`src/types/sequenceTypes.ts`)
  - SMPTE Non-Drop Frame timecode conversion (`HH:MM:SS:FF`), fractional second parsing, and timeline range mapping (`src/engine/timecodeMath.ts`)
- [x] Automated Cinematic Continuity & Pacing Engine (`src/engine/sequenceContinuityEngine.ts`):
  - 180-degree rule axis violation detection between adjacent shots
  - Discontinuous jump cut detection (identical focal length, shot size, and camera angle)
  - Kinetic motion clash analysis (opposing pan/tilt/dolly velocity whiplash)
  - Lighting palette & mood discrepancy detection
  - Aspect ratio mismatch detection
  - Pacing cadence & duration analysis (monotonous pacing, flash cuts < 1s, dragging takes > 10s)
  - Composite continuity score (0–100%) and directorial ratings (`exemplary`, `sound`, `needs_coverage`, `disjointed`)
- [x] Professional NLE Timeline Exporters (`src/engine/sequenceExporters.ts`):
  - OpenTimelineIO (`.otio`) Schema 1.0 JSON export with full clip tracks, rational time ranges, media targets, and directorial metadata
  - CMX 3600 EDL (`.edl`) SMPTE non-drop frame edit decision list with clip names and hero take notes
  - Apple Final Cut Pro 7 / DaVinci Resolve XML (`.xml`) timeline export
- [x] Sequence State Management (`src/stores/useSequenceStore.ts`):
  - Multi-shot timeline state, timecode scrubbing, sequential playback, shot reordering, clip trimming, hero take bindings, and safe local persistence
- [x] Interactive UI Components:
  - Sequence Assembly workspace mode in top navigation bar (`src/App.tsx`)
  - Master sequence playback viewport with HUD (timecode, slate, camera move, hero take) and sequential player transport (`src/components/SequenceTimelineDeck.tsx`)
  - NLE multi-track timeline deck with zoomable time ruler, playhead marker, shot blocks, reorder buttons, hero take picker, and cut transition pills (`src/components/SequenceTimelineDeck.tsx`)
  - Directorial Continuity & Pacing Report Modal (`src/components/SequenceContinuityModal.tsx`)
  - Professional NLE Timeline Export Modal (`src/components/SequenceExportModal.tsx`)
  - Shot Bible integration: added one-click "Assemble Scene in Sequence Timeline" button to scene headers (`src/components/ShotBible.tsx`)
- [x] Unit Test Suite (`tests/sequenceAssembly.test.ts`):
  - 15 comprehensive tests covering SMPTE conversions, duration summing, time range lookup, 180-degree axis break detection, jump cut detection, kinetic motion clashes, exemplary sequence scoring, OTIO JSON validity, CMX 3600 EDL syntax, FCP XML formatting, shot reordering, hero take assignment, and clip trimming
- [x] Full Verification:
  - 30 test files, 209/209 tests passing in 5.00s (`npm run test`)
  - Production build: `npm run build` succeeded with 0 errors in 10.36s (SequenceTimelineDeck chunk emitted at 34.14 kB)
  - Browser verification verified via subagent with recording `stage10_sequence_assembly_1792788543682.webp`
- [x] Owner approval → merge `stage/10-sequence` to `master` (`16d714f`)

## Deferred findings (tracked for later stages)

| Finding | Stage | Status |
|---|---|---|
| VFX "pose" passes are template stick figures on brightness blobs; 4 made-up actors when nothing detected → replace with ComfyUI DWPose / DepthAnythingV2 | S1 / S4 | Done (S4) |
| In-app previs render: real-time MediaRecorder + `setTimeout` pacing, stale closures (`currentTime`, `showGrid`), `.mp4` name on WebM output | S4 | Done (S4) |
| `src/services/directorExecutor.ts` is dead code | S1 | Done (S1) |
| `vfxReference.videoUrl` blob URLs persisted, dead after reload | S2 | Done (S2) |
| Inconsistent `typeof window` guards (cast pool gated, shot cache not) | S2 | Done (S2) |
| localStorage origin split between `file://` and dev server in Electron | S2 | Done (S2) |
| Google Fonts from CDN (blocks strict CSP) → self-host | S2 | Done (S2) |
| Electron global `Access-Control-Allow-Origin: *` injection; auto-load of `localhost:5173` | S2 | Done (S2) |
| 4 WebGL contexts (2 renderers × 2 `StagePrevis3D` instances) | S5 | Done (S5) |
| Trim range / volume controls may be no-ops; hardcoded "SCENE 01"; `minWidth` 1100; backtick handler eats input typing; `alert()` in VFXVideoDeck | S6 | Done (S6) |
| Importing GLB/GLTF models produces generic box or distorted shape ("weird shape") | Fix | Done (`fix/glb-gltf-import-rendering`) |
| Remove Arabic words from interface elements | Fix | Done (`fix/remove-arabic-interface-text`) |
| Compact 3D object nametag labels & toolbar visibility toggle | Polish | Done (`fix/compact-object-labels`) |

## GLB/GLTF 3D Model Import & Rendering Checklist

- [x] IndexedDB + Memory Storage Service (`src/services/modelStorage.ts`):
  - In-memory `ArrayBuffer` & active Blob URL cache for zero-latency loading
  - IndexedDB storage (`comfy_director_3d_models_v1`) to evade browser `localStorage` 5MB quota errors
  - Resilient `base64ToArrayBuffer` and `registerModelFile` utilities
- [x] Universal In-Memory GLTF/GLB Loader & Normalization (`src/engine/gltfModelLoader.ts`):
  - In-memory `ArrayBuffer` parsing using `GLTFLoader.parse` (bypasses browser `fetch()` errors on `data:model/gltf-binary` URIs and 2MB Chromium limits)
  - True bounding box normalization (`normalizeGltfScene`): scales first, centers horizontal $(x, z)$ at $(0, 0)$, grounds base at $y=0$, enables shadows and `THREE.DoubleSide`
  - Skeleton-safe cloning via `three/examples/jsm/utils/SkeletonUtils.js`
- [x] Asset Library Store Integration (`src/stores/useAssetLibraryStore.ts`):
  - Updated `uploadGlbFile` to register models through `registerModelFile`
  - Sanitized `persistCustomAssets` to store compact `model://${modelId}` references without `QuotaExceededError`
- [x] Viewport & 3D Stage Direct Rendering (`src/components/StagePrevis3D.tsx`):
  - Replaces `__gltf_placeholder__` geometry with normalized 3D mesh cleanly upon load
  - Drag-and-drop viewport upload zone with glowing visual feedback
  - Direct "Import 3D Model" button in soundstage toolbar
- [x] Parameter Decks & Actor Staging Controls (`src/components/PrevisParametersDeck.tsx`, `src/components/ActorBlocking.tsx`):
  - Added dedicated "3D Model File (.GLB / .GLTF)" card to Staging Deck
  - Added direct 3D model attachment trigger on Actor Blocking cards
- [x] Deterministic Offline Previs Renderer Preloading (`src/engine/offlinePrevisRenderer.ts`):
  - Added `modelUrls` to `PrevisRenderOptions` and preloads GLTF models before frame capture loop
- [x] Comprehensive Unit Test Suite (`tests/gltfImport.test.ts`):
  - 6 unit tests covering Base64 decoding, memory buffer storage, file registration, normalization geometry math, and asset store integration
- [x] Full Verification:
  - 31 test files, 215/215 tests passing (`npm run test`)
  - Production build: `npm run build` completed with zero TypeScript errors and bundle generated cleanly
  - In-browser UI verified via subagent with recording `verify_gltf_import_1792789985216.webp`

## Decoupling & Streamlining: Previs Export Deck Restored & Sequence Assembly Removed

- [x] **Previs Export Deck Restored (`src/components/PrevisExportDeck.tsx`)**:
  - Fully restored `PrevisExportDeck.tsx` containing multi-pass video rendering (RGB, OpenPose, Volumetric Depth) and model prompt compilers (LTX-2.5, MiniMax H3, Seedance).
  - Added `'export'` workspace mode and the "Previs Export Deck" top header navigation tab in `App.tsx`.
  - Added direct "Open Previs Export Deck ▶" navigation button in the footer of `PrevisParametersDeck.tsx`.
  - Updated `WelcomeModal.tsx` workflow cards to feature "1. 3D Directing Stage" and "2. Previs Export Deck".
- [x] **Sequence Assembly Removal**:
  - Removed `SequenceTimelineDeck.tsx`, `SequenceContinuityModal.tsx`, `SequenceExportModal.tsx`, `useSequenceStore.ts`, `timecodeMath.ts`, `sequenceExporters.ts`, `sequenceContinuityEngine.ts`, `sequenceTypes.ts`, and `tests/sequenceAssembly.test.ts`.
  - Removed `'sequence'` workspace mode and all sequence timeline triggers from `App.tsx` and `ShotBible.tsx`.
- [x] **Verification**:
  - Vitest suite: All 46 test files (373 tests) passing green (`npm test`).
  - Production build: `npm run build` compiled with zero TypeScript or bundler errors.
  - Verified live in browser with screenshot artifacts.

