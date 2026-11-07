import type { ObjectArchetype } from '../archetypeResolver';
import {
  createWindmillMillhouse,
  createSkyscraperTower,
  createTemplePortico,
  createMilitaryBunker,
  createAsianPagoda,
  createCoastalLighthouse,
  createCourtyardFountain,
  createTriumphalArch,
  createGranaryBarn,
  createStoneViaduct,
  createFactoryChimney,
  createBastionTower,
  createPalisadeWall,
  createCivicClockTower,
  createRoyalPavilionTent,
  createStoneFireplace,
  createDesertMosque,
  createGothicCathedral,
  createWesternSaloon,
  createWindTurbine,
  createGeodesicDome,
  createRetroGasStation,
  createWaterTower,
} from './architectureBlueprints';
import {
  createCargoTruck,
  createMotorScooter,
  createSteamLocomotive,
  createFarmTractor,
  createPoliceCar,
  createArmoredAPC,
  createSpeedboat,
  createDeliveryVan,
  createDuneBuggy,
  createResearchSubmarine,
  createHovercraft,
  createForklift,
  createBulldozer,
  createRoadBicycle,
  createSpaceRover,
  createMonorailCar,
  createAmbulance,
  createFireEngine,
  createGarbageTruck,
  createAirshipBlimp,
  createTukTuk,
} from './vehicleBlueprints';
import {
  createGoldenEagle,
  createFirePhoenix,
  createAbyssalKraken,
  createHornedMinotaur,
  createStoneGargoyle,
  createAncientMummy,
  createFeralWerewolf,
  createGreyAlien,
  createAfricanLion,
  createGrizzlyBear,
  createSabertoothTiger,
  createTimberWolf,
  createDomesticCat,
  createHoundDog,
  createPalmTree,
  createCampfireRing,
  createMountainCrag,
  createFlowerPlanter,
  createBonsaiTree,
  createGiantSequoia,
  createCoralReef,
  createThermalGeyser,
  createPolarIceberg,
  createBambooGrove,
  createVenusFlytrap,
  createImpactMeteorite,
} from './creatureAndNatureBlueprints';
import {
  createPlushArmchair,
  createLibraryBookshelf,
  createExecutiveDesk,
  createRoyalThrone,
  createWoodenWardrobe,
  createCoffeeTable,
  createStandingMirror,
  createGrandfatherClock,
  createBarStool,
  createFilingCabinet,
  createCrystalChandelier,
  createBunkBed,
  createChaiseLongue,
  createPokerTable,
  createArtistEasel,
  createIndustrialWorkbench,
  createSpeakerPodium,
  createCameraDolly,
  createTreasureChest,
  createGoldenChalice,
  createCoffeeMug,
  createPocketWatch,
  createClapperboard,
  createRotaryTelephone,
  createNauticalCompass,
  createFilmProjector,
  createCrystalDecanter,
  createBlacksmithAnvil,
  createMegaphone,
  createGramophone,
  createBrassHourglass,
  createTrafficLight,
  createParkingMeter,
  createSatelliteDish,
} from './furnitureAndPropsBlueprints';
import {
  createBattleaxe,
  createHuntingBow,
  createKatanaSword,
  createHeavyCrossbow,
  createHalberdPolearm,
  createWarhammer,
  createRevolverPistol,
  createSniperRifle,
  createPlasmaBlaster,
  createStilettoDagger,
  createSiegeBallista,
  createMorningstarFlail,
  createReaperScythe,
  createRetroRaygun,
  createFlamethrower,
  createShurikenStar,
  createGravityCentrifuge,
  createOrbitalSatellite,
  createCryoStasisPod,
  createHoloEmitter,
  createServerRack,
  createTeleportPad,
  createShieldGenerator,
  createIndustrialRobotArm,
  createTokamakReactor,
  createAirlockHatch,
  createCyberpunkVending,
  createAutomatedTurret,
  createDroneDock,
  createProstheticArm,
  createHyperspaceGate,
  createAntigravitySled,
  createQuantumComputer,
  createTerraformingSpire,
  createHoloTable,
  createWarpNacelle,
  createMatterSynthesizer,
} from './weaponsAndScifiBlueprints';

export interface CuratedArchetypeRule {
  pattern: RegExp;
  archetype: ObjectArchetype;
}

export const CURATED_ARCHETYPE_RULES: CuratedArchetypeRule[] = [
  // ================= ARCHITECTURE =================
  {
    pattern: /\b(windmill|millhouse|طاحونة هوائية|طاحونه هوائيه)\b/i,
    archetype: {
      id: 'archetype.architecture.windmill',
      name: 'Windmill Millhouse',
      domain: 'architecture',
      keywords: ['windmill', 'millhouse', 'sails', 'طاحونة هوائية'],
      targetScale: 1.9,
      build: (p) => createWindmillMillhouse(p),
    },
  },
  {
    pattern: /\b(skyscraper|high-rise|highrise|ناطحة سحاب|ناطحه سحاب)\b/i,
    archetype: {
      id: 'archetype.architecture.skyscraper',
      name: 'Modern Skyscraper Tower',
      domain: 'architecture',
      keywords: ['skyscraper', 'highrise', 'curtainwall', 'ناطحة سحاب'],
      targetScale: 1.6,
      build: (p) => createSkyscraperTower(p),
    },
  },
  {
    pattern: /\b(temple portico|classical temple|parthenon|pantheon|pediment|معبد كلاسيكي)\b/i,
    archetype: {
      id: 'archetype.architecture.temple',
      name: 'Classical Temple Portico',
      domain: 'architecture',
      keywords: ['temple', 'portico', 'colonnade', 'pediment', 'معبد'],
      targetScale: 2.0,
      build: (p) => createTemplePortico(p),
    },
  },
  {
    pattern: /\b(bunker|pillbox|casemate|مخبأ عسكري|تحصين خرساني)\b/i,
    archetype: {
      id: 'archetype.architecture.bunker',
      name: 'Reinforced Concrete Bunker',
      domain: 'architecture',
      keywords: ['bunker', 'pillbox', 'embrasure', 'مخبأ عسكري'],
      targetScale: 2.1,
      build: (p) => createMilitaryBunker(p),
    },
  },
  {
    pattern: /\b(pagoda|باغودا|معبد آسيوي)\b/i,
    archetype: {
      id: 'archetype.architecture.pagoda',
      name: 'East Asian Tiered Pagoda',
      domain: 'architecture',
      keywords: ['pagoda', 'tiered roof', 'sorin', 'باغودا'],
      targetScale: 1.85,
      build: (p) => createAsianPagoda(p),
    },
  },
  {
    pattern: /\b(lighthouse|fresnel|beacon tower|منارة ساحلية|مناره)\b/i,
    archetype: {
      id: 'archetype.architecture.lighthouse',
      name: 'Coastal Striped Lighthouse',
      domain: 'architecture',
      keywords: ['lighthouse', 'beacon', 'lantern room', 'منارة'],
      targetScale: 1.75,
      build: (p) => createCoastalLighthouse(p),
    },
  },
  {
    pattern: /\b(courtyard fountain|water fountain|tiered fountain|نافورة)\b/i,
    archetype: {
      id: 'archetype.architecture.fountain',
      name: 'Courtyard Tiered Fountain',
      domain: 'architecture',
      keywords: ['fountain', 'basin', 'courtyard fountain', 'نافورة'],
      targetScale: 2.1,
      build: (p) => createCourtyardFountain(p),
    },
  },
  {
    pattern: /\b(triumphal arch|monumental arch|archway monument|قوس النصر)\b/i,
    archetype: {
      id: 'archetype.architecture.triumphal_arch',
      name: 'Monumental Triumphal Arch',
      domain: 'architecture',
      keywords: ['triumphal', 'arch', 'monumental arch', 'قوس النصر'],
      targetScale: 1.95,
      build: (p) => createTriumphalArch(p),
    },
  },
  {
    pattern: /\b(granary barn|gambrel barn|red barn|farm barn|حظيرة|صومعة غلال)\b/i,
    archetype: {
      id: 'archetype.architecture.barn',
      name: 'Red Timber Granary Barn',
      domain: 'architecture',
      keywords: ['barn', 'granary', 'silo', 'hayloft', 'حظيرة'],
      targetScale: 1.95,
      build: (p) => createGranaryBarn(p),
    },
  },
  {
    pattern: /\b(viaduct|aqueduct|arched viaduct|جسر قناطر|قناطر)\b/i,
    archetype: {
      id: 'archetype.architecture.viaduct',
      name: 'Roman Stone Aqueduct Viaduct',
      domain: 'architecture',
      keywords: ['viaduct', 'aqueduct', 'arcade', 'قناطر'],
      targetScale: 1.85,
      build: (p) => createStoneViaduct(p),
    },
  },
  {
    pattern: /\b(factory chimney|smokestack|industrial chimney|مدخنة مصنع)\b/i,
    archetype: {
      id: 'archetype.architecture.chimney',
      name: 'Industrial Factory Smokestack',
      domain: 'architecture',
      keywords: ['chimney', 'smokestack', 'boiler house', 'مدخنة مصنع'],
      targetScale: 1.65,
      build: (p) => createFactoryChimney(p),
    },
  },
  {
    pattern: /\b(bastion tower|star-fort|star fort|bastion|حصن نجمي|معقل)\b/i,
    archetype: {
      id: 'archetype.architecture.bastion',
      name: 'Star-Fort Bastion Tower',
      domain: 'architecture',
      keywords: ['bastion', 'star-fort', 'rampart', 'معقل'],
      targetScale: 2.0,
      build: (p) => createBastionTower(p),
    },
  },
  {
    pattern: /\b(palisade wall|log palisade|timber palisade|سور أوتاد خشبية)\b/i,
    archetype: {
      id: 'archetype.architecture.palisade',
      name: 'Sharpened Log Palisade Wall',
      domain: 'architecture',
      keywords: ['palisade', 'stockade', 'log wall', 'سور أوتاد'],
      targetScale: 2.0,
      build: (p) => createPalisadeWall(p),
    },
  },
  {
    pattern: /\b(clock tower|civic clock|belfry clock|برج الساعة|برج الساعه)\b/i,
    archetype: {
      id: 'archetype.architecture.clock_tower',
      name: 'Civic 4-Dial Clock Tower',
      domain: 'architecture',
      keywords: ['clock tower', 'belfry', 'town clock', 'برج الساعة'],
      targetScale: 1.6,
      build: (p) => createCivicClockTower(p),
    },
  },
  {
    pattern: /\b(tent canopy|pavilion tent|medieval tent|royal tent|خيمة ملكية|سرادق)\b/i,
    archetype: {
      id: 'archetype.architecture.pavilion_tent',
      name: 'Royal Medieval Pavilion Tent',
      domain: 'architecture',
      keywords: ['tent', 'pavilion', 'canopy tent', 'خيمة'],
      targetScale: 2.0,
      build: (p) => createRoyalPavilionTent(p),
    },
  },
  {
    pattern: /\b(fireplace|hearth|chimney breast|مدفأة حجرية|مدفأه)\b/i,
    archetype: {
      id: 'archetype.architecture.fireplace',
      name: 'Stone Hearth Fireplace',
      domain: 'architecture',
      keywords: ['fireplace', 'hearth', 'mantel', 'مدفأة'],
      targetScale: 2.0,
      build: (p) => createStoneFireplace(p),
    },
  },
  {
    pattern: /\b(mosque|minaret|masjid|مسجد|جامع|مئذنة)\b/i,
    archetype: {
      id: 'archetype.architecture.mosque',
      name: 'Domed Desert Mosque & Minaret',
      domain: 'architecture',
      keywords: ['mosque', 'minaret', 'dome', 'masjid', 'مسجد'],
      targetScale: 1.9,
      build: (p) => createDesertMosque(p),
    },
  },
  {
    pattern: /\b(cathedral|gothic church|rose window|كاتدرائية)\b/i,
    archetype: {
      id: 'archetype.architecture.cathedral',
      name: 'Twin-Spire Gothic Cathedral',
      domain: 'architecture',
      keywords: ['cathedral', 'gothic', 'rose window', 'كاتدرائية'],
      targetScale: 1.7,
      build: (p) => createGothicCathedral(p),
    },
  },
  {
    pattern: /\b(saloon|western tavern|batwing doors|صالون الغرب الأمريكي)\b/i,
    archetype: {
      id: 'archetype.architecture.saloon',
      name: 'Frontier Western Saloon',
      domain: 'architecture',
      keywords: ['saloon', 'frontier', 'batwing', 'صالون'],
      targetScale: 2.0,
      build: (p) => createWesternSaloon(p),
    },
  },
  {
    pattern: /\b(wind turbine|wind generator|aerogenerator|توربين رياح)\b/i,
    archetype: {
      id: 'archetype.architecture.wind_turbine',
      name: '3-Blade Wind Turbine Generator',
      domain: 'architecture',
      keywords: ['wind turbine', 'nacelle', 'turbine blades', 'توربين رياح'],
      targetScale: 1.55,
      build: (p) => createWindTurbine(p),
    },
  },
  {
    pattern: /\b(geodesic dome|biosphere dome|conservatory dome|قبة جيوديسية)\b/i,
    archetype: {
      id: 'archetype.architecture.geodesic_dome',
      name: 'Faceted Geodesic Biosphere Dome',
      domain: 'architecture',
      keywords: ['geodesic', 'dome', 'biosphere', 'قبة جيوديسية'],
      targetScale: 2.0,
      build: (p) => createGeodesicDome(p),
    },
  },
  {
    pattern: /\b(gas station|petrol station|fuel pumps|service station|محطة وقود|بنزينة)\b/i,
    archetype: {
      id: 'archetype.architecture.gas_station',
      name: 'Retro Roadside Gas Station',
      domain: 'architecture',
      keywords: ['gas station', 'fuel pump', 'petrol', 'محطة وقود'],
      targetScale: 1.95,
      build: (p) => createRetroGasStation(p),
    },
  },
  {
    pattern: /\b(water tower|stilted tank|railroad tank|برج مياه)\b/i,
    archetype: {
      id: 'archetype.architecture.water_tower',
      name: 'Stilted Timber Water Tower',
      domain: 'architecture',
      keywords: ['water tower', 'stave tank', 'trestle', 'برج مياه'],
      targetScale: 1.75,
      build: (p) => createWaterTower(p),
    },
  },

  // ================= VEHICLES =================
  {
    pattern: /\b(cargo truck|semi truck|freight truck|tractor-trailer|شاحنة بضائع|تريلا)\b/i,
    archetype: {
      id: 'archetype.vehicle.cargo_truck',
      name: 'Heavy Semi Cargo Truck',
      domain: 'vehicle',
      keywords: ['cargo truck', 'semi', 'freight', 'trailer', 'شاحنة بضائع'],
      targetScale: 2.1,
      build: (p) => createCargoTruck(p),
    },
  },
  {
    pattern: /\b(scooter|vespa|moped|step-through|سكوتر|فيسبا)\b/i,
    archetype: {
      id: 'archetype.vehicle.scooter',
      name: 'Retro Step-Through Motor Scooter',
      domain: 'vehicle',
      keywords: ['scooter', 'vespa', 'moped', 'سكوتر'],
      targetScale: 2.2,
      build: (p) => createMotorScooter(p),
    },
  },
  {
    pattern: /\b(locomotive|steam train|steam engine|iron horse|قطار بخاري|قاطرة)\b/i,
    archetype: {
      id: 'archetype.vehicle.locomotive',
      name: 'Vintage Steam Train Locomotive',
      domain: 'vehicle',
      keywords: ['locomotive', 'steam train', 'boiler', 'cowcatcher', 'قطار بخاري'],
      targetScale: 2.1,
      build: (p) => createSteamLocomotive(p),
    },
  },
  {
    pattern: /\b(tractor|farm tractor|agricultural tractor|جرار زراعي)\b/i,
    archetype: {
      id: 'archetype.vehicle.tractor',
      name: 'Agricultural Farm Tractor',
      domain: 'vehicle',
      keywords: ['tractor', 'farm tractor', 'plow', 'جرار زراعي'],
      targetScale: 2.2,
      build: (p) => createFarmTractor(p),
    },
  },
  {
    pattern: /\b(police car|police cruiser|patrol car|cop car|interceptor|سيارة شرطة|دورية)\b/i,
    archetype: {
      id: 'archetype.vehicle.police_car',
      name: 'Law Enforcement Police Cruiser',
      domain: 'vehicle',
      keywords: ['police car', 'cruiser', 'siren', 'lightbar', 'سيارة شرطة'],
      targetScale: 2.3,
      build: (p) => createPoliceCar(p),
    },
  },
  {
    pattern: /\b(apc|armored personnel carrier|wheeled apc|ifv|مدرعة ناقلة جند)\b/i,
    archetype: {
      id: 'archetype.vehicle.apc',
      name: '8x8 Armored Personnel Carrier APC',
      domain: 'vehicle',
      keywords: ['apc', 'armored carrier', 'autocannon', 'مدرعة'],
      targetScale: 2.2,
      build: (p) => createArmoredAPC(p),
    },
  },
  {
    pattern: /\b(speedboat|motorboat|powerboat|luxury boat|لنش سريع|قارب سريع)\b/i,
    archetype: {
      id: 'archetype.vehicle.speedboat',
      name: 'Offshore Power Speedboat',
      domain: 'vehicle',
      keywords: ['speedboat', 'motorboat', 'powerboat', 'لنش سريع'],
      targetScale: 2.2,
      build: (p) => createSpeedboat(p),
    },
  },
  {
    pattern: /\b(delivery van|step-van|step van|courier van|box van|شاحنة توصيل|فان توصيل)\b/i,
    archetype: {
      id: 'archetype.vehicle.delivery_van',
      name: 'Commercial Step-Van Delivery Truck',
      domain: 'vehicle',
      keywords: ['delivery van', 'step van', 'courier', 'فان توصيل'],
      targetScale: 2.2,
      build: (p) => createDeliveryVan(p),
    },
  },
  {
    pattern: /\b(dune buggy|sand rail|desert buggy|off-road buggy|عربة كثبان|بيجي صحراوي)\b/i,
    archetype: {
      id: 'archetype.vehicle.dune_buggy',
      name: 'Tubular Roll-Cage Dune Buggy',
      domain: 'vehicle',
      keywords: ['dune buggy', 'roll cage', 'sand rail', 'عربة كثبان'],
      targetScale: 2.3,
      build: (p) => createDuneBuggy(p),
    },
  },
  {
    pattern: /\b(deep-sea sub|research sub|bathyscaphe|acrylic dome sub|غواصة أبحاث)\b/i,
    archetype: {
      id: 'archetype.vehicle.research_sub',
      name: 'Deep-Sea Research Submersible',
      domain: 'vehicle',
      keywords: ['submersible', 'bathyscaphe', 'research sub', 'غواصة أبحاث'],
      targetScale: 2.2,
      build: (p) => createResearchSubmarine(p),
    },
  },
  {
    pattern: /\b(hovercraft|air-cushion|amphibious hovercraft|حوامة برمائية)\b/i,
    archetype: {
      id: 'archetype.vehicle.hovercraft',
      name: 'Amphibious Cushion Hovercraft',
      domain: 'vehicle',
      keywords: ['hovercraft', 'air cushion', 'ducted fan', 'حوامة'],
      targetScale: 2.2,
      build: (p) => createHovercraft(p),
    },
  },
  {
    pattern: /\b(forklift|pallet lifter|warehouse forklift|رافعة شوكية|كلارك)\b/i,
    archetype: {
      id: 'archetype.vehicle.forklift',
      name: 'Warehouse Counterweight Forklift',
      domain: 'vehicle',
      keywords: ['forklift', 'mast', 'forks', 'رافعة شوكية'],
      targetScale: 2.2,
      build: (p) => createForklift(p),
    },
  },
  {
    pattern: /\b(bulldozer|crawler dozer|earthmover|بلدوزر|جرافة)\b/i,
    archetype: {
      id: 'archetype.vehicle.bulldozer',
      name: 'Tracked Crawler Bulldozer',
      domain: 'vehicle',
      keywords: ['bulldozer', 'dozer blade', 'earthmover', 'بلدوزر'],
      targetScale: 2.2,
      build: (p) => createBulldozer(p),
    },
  },
  {
    pattern: /\b(bicycle|road bike|racing bike|pedal bike|دراجة هوائية|بسكليت)\b/i,
    archetype: {
      id: 'archetype.vehicle.bicycle',
      name: 'Diamond-Frame Road Bicycle',
      domain: 'vehicle',
      keywords: ['bicycle', 'pedal bike', 'spoked wheels', 'دراجة هوائية'],
      targetScale: 2.2,
      build: (p) => createRoadBicycle(p),
    },
  },
  {
    pattern: /\b(space rover|planetary rover|mars rover|lunar rover|عربة فضائية|مسبار جوال)\b/i,
    archetype: {
      id: 'archetype.vehicle.space_rover',
      name: '6-Wheeled Planetary Space Rover',
      domain: 'vehicle',
      keywords: ['space rover', 'mars rover', 'rocker-bogie', 'عربة فضائية'],
      targetScale: 2.2,
      build: (p) => createSpaceRover(p),
    },
  },
  {
    pattern: /\b(monorail|maglev train|elevated train|مونوريل|قطار معلق)\b/i,
    archetype: {
      id: 'archetype.vehicle.monorail',
      name: 'Elevated Streamlined Monorail Car',
      domain: 'vehicle',
      keywords: ['monorail', 'maglev', 'guideway', 'مونوريل'],
      targetScale: 2.1,
      build: (p) => createMonorailCar(p),
    },
  },
  {
    pattern: /\b(ambulance|paramedic van|emergency ambulance|سيارة إسعاف|اسعاف)\b/i,
    archetype: {
      id: 'archetype.vehicle.ambulance',
      name: 'Emergency Paramedic Ambulance',
      domain: 'vehicle',
      keywords: ['ambulance', 'paramedic', 'emergency van', 'سيارة إسعاف'],
      targetScale: 2.2,
      build: (p) => createAmbulance(p),
    },
  },
  {
    pattern: /\b(fire engine|fire truck|ladder truck|سيارة إطفاء|عربة مطافي)\b/i,
    archetype: {
      id: 'archetype.vehicle.fire_engine',
      name: 'Aerial Ladder Fire Engine Truck',
      domain: 'vehicle',
      keywords: ['fire engine', 'fire truck', 'aerial ladder', 'سيارة إطفاء'],
      targetScale: 2.1,
      build: (p) => createFireEngine(p),
    },
  },
  {
    pattern: /\b(garbage truck|sanitation truck|refuse compactor|waste truck|شاحنة قمامة)\b/i,
    archetype: {
      id: 'archetype.vehicle.garbage_truck',
      name: 'Sanitation Compactor Garbage Truck',
      domain: 'vehicle',
      keywords: ['garbage truck', 'sanitation', 'compactor', 'شاحنة قمامة'],
      targetScale: 2.1,
      build: (p) => createGarbageTruck(p),
    },
  },
  {
    pattern: /\b(blimp|dirigible|airship|zeppelin|منطاد)\b/i,
    archetype: {
      id: 'archetype.vehicle.blimp',
      name: 'Dirigible Airship Blimp',
      domain: 'vehicle',
      keywords: ['blimp', 'dirigible', 'airship', 'zeppelin', 'منطاد'],
      targetScale: 2.1,
      build: (p) => createAirshipBlimp(p),
    },
  },
  {
    pattern: /\b(tuk-tuk|tuktuk|auto-rickshaw|rickshaw|توكتوك|توك توك)\b/i,
    archetype: {
      id: 'archetype.vehicle.tuktuk',
      name: 'Three-Wheeled Auto-Rickshaw Tuk-Tuk',
      domain: 'vehicle',
      keywords: ['tuk-tuk', 'tuktuk', 'rickshaw', 'توكتوك'],
      targetScale: 2.3,
      build: (p) => createTukTuk(p),
    },
  },

  // ================= CREATURES =================
  {
    pattern: /\b(eagle|hawk|falcon|raptor|bird of prey|نسر|صقر|عقاب)\b/i,
    archetype: {
      id: 'archetype.creature.eagle',
      name: 'Soaring Golden Eagle',
      domain: 'creature',
      keywords: ['eagle', 'falcon', 'hawk', 'raptor', 'wings', 'نسر'],
      targetScale: 2.2,
      build: (p) => createGoldenEagle(p),
    },
  },
  {
    pattern: /\b(phoenix|firebird|immortal fire phoenix|عنقاء|طائر الفينيق)\b/i,
    archetype: {
      id: 'archetype.creature.phoenix',
      name: 'Immortal Fire Phoenix',
      domain: 'creature',
      keywords: ['phoenix', 'firebird', 'flame wings', 'عنقاء'],
      targetScale: 2.2,
      build: (p) => createFirePhoenix(p),
    },
  },
  {
    pattern: /\b(kraken|octopus|giant squid|cephalopod|tentacles|كراكن|أخطبوط عملاق)\b/i,
    archetype: {
      id: 'archetype.creature.kraken',
      name: 'Abyssal Sea Kraken',
      domain: 'creature',
      keywords: ['kraken', 'cephalopod', 'octopus', 'tentacles', 'كراكن'],
      targetScale: 2.1,
      build: (p) => createAbyssalKraken(p),
    },
  },
  {
    pattern: /\b(minotaur|bull warrior|labyrinth guardian|مينوتور)\b/i,
    archetype: {
      id: 'archetype.creature.minotaur',
      name: 'Horned Labyrinth Minotaur',
      domain: 'creature',
      keywords: ['minotaur', 'labyrinth', 'bull warrior', 'مينوتور'],
      targetScale: 2.1,
      build: (p) => createHornedMinotaur(p),
    },
  },
  {
    pattern: /\b(gargoyle|grotesque statue|stone gargoyle|غرغول حجري)\b/i,
    archetype: {
      id: 'archetype.creature.gargoyle',
      name: 'Winged Gothic Stone Gargoyle',
      domain: 'creature',
      keywords: ['gargoyle', 'stone wing', 'plinth', 'غرغول'],
      targetScale: 2.2,
      build: (p) => createStoneGargoyle(p),
    },
  },
  {
    pattern: /\b(mummy|bandaged pharaoh|undead mummy|مومياء فرعونية|مومياء)\b/i,
    archetype: {
      id: 'archetype.creature.mummy',
      name: 'Ancient Bandaged Mummy',
      domain: 'creature',
      keywords: ['mummy', 'bandaged', 'pharaoh', 'مومياء'],
      targetScale: 2.2,
      build: (p) => createAncientMummy(p),
    },
  },
  {
    pattern: /\b(werewolf|lycanthrope|wolfman|مستذئب)\b/i,
    archetype: {
      id: 'archetype.creature.werewolf',
      name: 'Feral Bipedal Werewolf',
      domain: 'creature',
      keywords: ['werewolf', 'lycanthrope', 'clawed', 'مستذئب'],
      targetScale: 2.2,
      build: (p) => createFeralWerewolf(p),
    },
  },
  {
    pattern: /\b(grey alien|extraterrestrial|roswell alien|alien grey|كائن فضائي رمادي|فضائي)\b/i,
    archetype: {
      id: 'archetype.creature.grey_alien',
      name: 'Extraterrestrial Grey Alien',
      domain: 'creature',
      keywords: ['alien', 'extraterrestrial', 'grey alien', 'فضائي'],
      targetScale: 2.2,
      build: (p) => createGreyAlien(p),
    },
  },
  {
    pattern: /\b(sabertooth|smilodon|saber-toothed|نمر سيفي الأنياب)\b/i,
    archetype: {
      id: 'archetype.creature.sabertooth',
      name: 'Prehistoric Sabertooth Tiger',
      domain: 'creature',
      keywords: ['sabertooth', 'smilodon', 'canines', 'نمر سيفي'],
      targetScale: 2.2,
      build: (p) => createSabertoothTiger(p),
    },
  },
  {
    pattern: /\b(african lion|maned lion|\blion\b|أسد أفريقي|اسد)\b/i,
    archetype: {
      id: 'archetype.creature.lion',
      name: 'Maned African Lion',
      domain: 'creature',
      keywords: ['lion', 'mane', 'feline', 'أسد'],
      targetScale: 2.2,
      build: (p) => createAfricanLion(p),
    },
  },
  {
    pattern: /\b(grizzly bear|brown bear|\bbear\b|دب أشيب|دب)\b/i,
    archetype: {
      id: 'archetype.creature.bear',
      name: 'Heavy Grizzly Bear',
      domain: 'creature',
      keywords: ['bear', 'grizzly', 'ursine', 'دب'],
      targetScale: 2.2,
      build: (p) => createGrizzlyBear(p),
    },
  },
  {
    pattern: /\b(timber wolf|grey wolf|dire wolf|\bwolf\b|ذئب)\b/i,
    archetype: {
      id: 'archetype.creature.wolf',
      name: 'Timber Wolf',
      domain: 'creature',
      keywords: ['wolf', 'lupine', 'pack', 'ذئب'],
      targetScale: 2.2,
      build: (p) => createTimberWolf(p),
    },
  },
  {
    pattern: /\b(domestic cat|tabby cat|feline cat|\bcat\b|قطة|قط)\b/i,
    archetype: {
      id: 'archetype.creature.cat',
      name: 'Domestic Tabby Cat',
      domain: 'creature',
      keywords: ['cat', 'feline', 'kitten', 'قطة'],
      targetScale: 2.2,
      build: (p) => createDomesticCat(p),
    },
  },
  {
    pattern: /\b(loyal hound|shepherd dog|retriever dog|\bdog\b|كلب وفي|كلب حراسة)\b/i,
    archetype: {
      id: 'archetype.creature.dog',
      name: 'Loyal Hound Dog',
      domain: 'creature',
      keywords: ['dog', 'hound', 'canine', 'كلب'],
      targetScale: 2.2,
      build: (p) => createHoundDog(p),
    },
  },

  // ================= NATURE =================
  {
    pattern: /\b(palm tree|coconut palm|tropical palm|نخلة|شجرة نخيل)\b/i,
    archetype: {
      id: 'archetype.nature.palm_tree',
      name: 'Tropical Coconut Palm Tree',
      domain: 'nature',
      keywords: ['palm tree', 'coconut', 'fronds', 'نخلة'],
      targetScale: 1.9,
      build: (p) => createPalmTree(p),
    },
  },
  {
    pattern: /\b(campfire|bonfire|fire pit|نار مخيم|مخيم)\b/i,
    archetype: {
      id: 'archetype.nature.campfire',
      name: 'Stone-Ringed Crackling Campfire',
      domain: 'nature',
      keywords: ['campfire', 'bonfire', 'fire pit', 'نار مخيم'],
      targetScale: 2.2,
      build: (p) => createCampfireRing(p),
    },
  },
  {
    pattern: /\b(mountain crag|alpine peak|jagged peak|قمة جبلية|جبل صخري)\b/i,
    archetype: {
      id: 'archetype.nature.mountain_crag',
      name: 'Snow-Capped Alpine Mountain Crag',
      domain: 'nature',
      keywords: ['mountain crag', 'alpine peak', 'summit', 'قمة جبلية'],
      targetScale: 1.85,
      build: (p) => createMountainCrag(p),
    },
  },
  {
    pattern: /\b(flower planter|terracotta planter|window box|أصيص زهور|حوض زهور)\b/i,
    archetype: {
      id: 'archetype.nature.flower_planter',
      name: 'Terracotta Flower Planter Box',
      domain: 'nature',
      keywords: ['flower planter', 'terracotta', 'blossoms', 'أصيص زهور'],
      targetScale: 2.2,
      build: (p) => createFlowerPlanter(p),
    },
  },
  {
    pattern: /\b(bonsai|بونساي)\b/i,
    archetype: {
      id: 'archetype.nature.bonsai',
      name: 'Sculpted Bonsai Tree in Tray',
      domain: 'nature',
      keywords: ['bonsai', 'ceramic tray', 'cloud foliage', 'بونساي'],
      targetScale: 2.2,
      build: (p) => createBonsaiTree(p),
    },
  },
  {
    pattern: /\b(sequoia|redwood|giant tree|سيكويا عملاقة)\b/i,
    archetype: {
      id: 'archetype.nature.sequoia',
      name: 'Colossal Giant Sequoia Redwood',
      domain: 'nature',
      keywords: ['sequoia', 'redwood', 'giant trunk', 'سيكويا'],
      targetScale: 1.65,
      build: (p) => createGiantSequoia(p),
    },
  },
  {
    pattern: /\b(coral reef|staghorn coral|brain coral|شعاب مرجانية)\b/i,
    archetype: {
      id: 'archetype.nature.coral_reef',
      name: 'Vibrant Underwater Coral Reef',
      domain: 'nature',
      keywords: ['coral reef', 'staghorn', 'brain coral', 'شعاب مرجانية'],
      targetScale: 2.2,
      build: (p) => createCoralReef(p),
    },
  },
  {
    pattern: /\b(geyser|thermal vent|hot spring plume|نبع ماء حار|فوارة)\b/i,
    archetype: {
      id: 'archetype.nature.geyser',
      name: 'Erupting Geothermal Geyser Vent',
      domain: 'nature',
      keywords: ['geyser', 'geothermal', 'steam plume', 'نبع حار'],
      targetScale: 1.85,
      build: (p) => createThermalGeyser(p),
    },
  },
  {
    pattern: /\b(iceberg|glacial peak|polar ice|جبل جليدي)\b/i,
    archetype: {
      id: 'archetype.nature.iceberg',
      name: 'Faceted Polar Glacial Iceberg',
      domain: 'nature',
      keywords: ['iceberg', 'glacier', 'polar ice', 'جبل جليدي'],
      targetScale: 1.9,
      build: (p) => createPolarIceberg(p),
    },
  },
  {
    pattern: /\b(bamboo grove|bamboo stalks|bamboo culms|غابة خيزران|بامبو)\b/i,
    archetype: {
      id: 'archetype.nature.bamboo_grove',
      name: 'Clustered Green Bamboo Grove',
      domain: 'nature',
      keywords: ['bamboo grove', 'bamboo stalks', 'culms', 'خيزران'],
      targetScale: 1.85,
      build: (p) => createBambooGrove(p),
    },
  },
  {
    pattern: /\b(venus flytrap|carnivorous plant|flytrap|نبات آكل الحشرات|خناق الذباب)\b/i,
    archetype: {
      id: 'archetype.nature.venus_flytrap',
      name: 'Carnivorous Venus Flytrap',
      domain: 'nature',
      keywords: ['venus flytrap', 'carnivorous plant', 'jaw trap', 'آكل الحشرات'],
      targetScale: 2.2,
      build: (p) => createVenusFlytrap(p),
    },
  },
  {
    pattern: /\b(meteorite|impact crater|space rock|نيزك متوهج|فوهة نيزك)\b/i,
    archetype: {
      id: 'archetype.nature.meteorite',
      name: 'Scorched Impact Crater & Meteorite',
      domain: 'nature',
      keywords: ['meteorite', 'impact crater', 'meteor', 'نيزك'],
      targetScale: 2.1,
      build: (p) => createImpactMeteorite(p),
    },
  },

  // ================= FURNITURE =================
  {
    pattern: /\b(armchair|club chair|wingback chair|كرسي بذراعين|فوتيه)\b/i,
    archetype: {
      id: 'archetype.furniture.armchair',
      name: 'Plush Upholstered Club Armchair',
      domain: 'furniture',
      keywords: ['armchair', 'club chair', 'wingback', 'كرسي بذراعين'],
      targetScale: 2.2,
      build: (p) => createPlushArmchair(p),
    },
  },
  {
    pattern: /\b(bookshelf|bookcase|library shelf|مكتبة كتب|رفوف كتب)\b/i,
    archetype: {
      id: 'archetype.furniture.bookshelf',
      name: '5-Tier Wooden Library Bookshelf',
      domain: 'furniture',
      keywords: ['bookshelf', 'bookcase', 'books', 'مكتبة كتب'],
      targetScale: 1.95,
      build: (p) => createLibraryBookshelf(p),
    },
  },
  {
    pattern: /\b(executive desk|office desk|writing desk|mahogany desk|مكتب تنفيذي|مكتب خشبي)\b/i,
    archetype: {
      id: 'archetype.furniture.executive_desk',
      name: 'Executive Mahogany Office Desk',
      domain: 'furniture',
      keywords: ['executive desk', 'office desk', 'blotter', 'مكتب تنفيذي'],
      targetScale: 2.1,
      build: (p) => createExecutiveDesk(p),
    },
  },
  {
    pattern: /\b(throne|royal throne|sovereign seat|عرش ملكي)\b/i,
    archetype: {
      id: 'archetype.furniture.throne',
      name: 'Ornate High-Back Royal Throne',
      domain: 'furniture',
      keywords: ['throne', 'royal seat', 'velvet throne', 'عرش ملكي'],
      targetScale: 1.95,
      build: (p) => createRoyalThrone(p),
    },
  },
  {
    pattern: /\b(wardrobe|armoire|closet cabinet|دولاب ملابس|خزانة ملابس)\b/i,
    archetype: {
      id: 'archetype.furniture.wardrobe',
      name: 'Double-Door Wooden Wardrobe Armoire',
      domain: 'furniture',
      keywords: ['wardrobe', 'armoire', 'closet', 'دولاب ملابس'],
      targetScale: 1.95,
      build: (p) => createWoodenWardrobe(p),
    },
  },
  {
    pattern: /\b(coffee table|low table|glass table|طاولة قهوة|ترابيزة انتريه)\b/i,
    archetype: {
      id: 'archetype.furniture.coffee_table',
      name: 'Glass & Walnut Coffee Table',
      domain: 'furniture',
      keywords: ['coffee table', 'low table', 'magazine shelf', 'طاولة قهوة'],
      targetScale: 2.2,
      build: (p) => createCoffeeTable(p),
    },
  },
  {
    pattern: /\b(standing mirror|cheval mirror|floor mirror|mirror stand|مرآة قائمة|مرايا طويلة)\b/i,
    archetype: {
      id: 'archetype.furniture.standing_mirror',
      name: 'Full-Length Oval Cheval Standing Mirror',
      domain: 'furniture',
      keywords: ['standing mirror', 'cheval mirror', 'floor mirror', 'مرآة قائمة'],
      targetScale: 2.1,
      build: (p) => createStandingMirror(p),
    },
  },
  {
    pattern: /\b(grandfather clock|longcase clock|pendulum clock|ساعة بندول|ساعة جد كبيرة)\b/i,
    archetype: {
      id: 'archetype.furniture.grandfather_clock',
      name: 'Tall Longcase Grandfather Clock',
      domain: 'furniture',
      keywords: ['grandfather clock', 'longcase clock', 'pendulum', 'ساعة بندول'],
      targetScale: 1.95,
      build: (p) => createGrandfatherClock(p),
    },
  },
  {
    pattern: /\b(bar stool|swivel stool|counter stool|كرسي بار مرتفع)\b/i,
    archetype: {
      id: 'archetype.furniture.bar_stool',
      name: 'Chrome Pedestal Swivel Bar Stool',
      domain: 'furniture',
      keywords: ['bar stool', 'swivel stool', 'footrest ring', 'كرسي بار'],
      targetScale: 2.2,
      build: (p) => createBarStool(p),
    },
  },
  {
    pattern: /\b(filing cabinet|file drawers|office drawers|خزانة ملفات)\b/i,
    archetype: {
      id: 'archetype.furniture.filing_cabinet',
      name: '4-Drawer Vertical Steel Filing Cabinet',
      domain: 'furniture',
      keywords: ['filing cabinet', 'file cabinet', 'drawers', 'خزانة ملفات'],
      targetScale: 2.1,
      build: (p) => createFilingCabinet(p),
    },
  },
  {
    pattern: /\b(chandelier|candelabra chandelier|crystal chandelier|ثريا كريستال|نجفة)\b/i,
    archetype: {
      id: 'archetype.furniture.chandelier',
      name: 'Tiered Crystal & Brass Chandelier',
      domain: 'furniture',
      keywords: ['chandelier', 'candelabra', 'crystal light', 'ثريا'],
      targetScale: 2.0,
      build: (p) => createCrystalChandelier(p),
    },
  },
  {
    pattern: /\b(bunk bed|double bunk|dorm bed|سرير بطابقين)\b/i,
    archetype: {
      id: 'archetype.furniture.bunk_bed',
      name: 'Double-Deck Timber Bunk Bed',
      domain: 'furniture',
      keywords: ['bunk bed', 'double deck bed', 'ladder bed', 'سرير بطابقين'],
      targetScale: 1.95,
      build: (p) => createBunkBed(p),
    },
  },
  {
    pattern: /\b(chaise longue|fainting couch|daybed|شيزلونج)\b/i,
    archetype: {
      id: 'archetype.furniture.chaise_longue',
      name: 'Curved Velvet Chaise Longue',
      domain: 'furniture',
      keywords: ['chaise longue', 'daybed', 'fainting couch', 'شيزلونج'],
      targetScale: 2.1,
      build: (p) => createChaiseLongue(p),
    },
  },
  {
    pattern: /\b(poker table|casino table|card table|طاولة بوكر|طاولة كازينو)\b/i,
    archetype: {
      id: 'archetype.furniture.poker_table',
      name: 'Octagonal Green-Felt Poker Table',
      domain: 'furniture',
      keywords: ['poker table', 'casino', 'green felt', 'طاولة بوكر'],
      targetScale: 2.1,
      build: (p) => createPokerTable(p),
    },
  },
  {
    pattern: /\b(art easel|artist easel|painting easel|حامل لوحات فنية)\b/i,
    archetype: {
      id: 'archetype.furniture.art_easel',
      name: 'A-Frame Studio Artist Easel',
      domain: 'furniture',
      keywords: ['easel', 'art easel', 'canvas stand', 'حامل لوحات'],
      targetScale: 2.0,
      build: (p) => createArtistEasel(p),
    },
  },
  {
    pattern: /\b(workbench|garage bench|tool bench|طاولة ورشة عمل)\b/i,
    archetype: {
      id: 'archetype.furniture.workbench',
      name: 'Industrial Garage Workbench with Vise',
      domain: 'furniture',
      keywords: ['workbench', 'vise', 'pegboard', 'طاولة ورشة'],
      targetScale: 2.1,
      build: (p) => createIndustrialWorkbench(p),
    },
  },
  {
    pattern: /\b(podium|lectern|rostrum|منصة خطابة|منبر)\b/i,
    archetype: {
      id: 'archetype.furniture.podium',
      name: 'Conference Speaker Podium Lectern',
      domain: 'furniture',
      keywords: ['podium', 'lectern', 'rostrum', 'منصة خطابة'],
      targetScale: 2.2,
      build: (p) => createSpeakerPodium(p),
    },
  },

  // ================= PROPS =================
  {
    pattern: /\b(camera dolly|track dolly|dolly rig|عربة كاميرا سينمائية|دوللي)\b/i,
    archetype: {
      id: 'archetype.prop.camera_dolly',
      name: 'Cinema Camera on Track Dolly',
      domain: 'prop',
      keywords: ['camera dolly', 'track dolly', 'cinema rig', 'عربة كاميرا'],
      targetScale: 2.1,
      build: (p) => createCameraDolly(p),
    },
  },
  {
    pattern: /\b(treasure chest|pirate chest|iron-bound chest|صندوق كنز)\b/i,
    archetype: {
      id: 'archetype.prop.treasure_chest',
      name: 'Domed Pirate Treasure Chest',
      domain: 'prop',
      keywords: ['treasure chest', 'pirate chest', 'coffer', 'صندوق كنز'],
      targetScale: 2.2,
      build: (p) => createTreasureChest(p),
    },
  },
  {
    pattern: /\b(chalice|royal goblet|golden goblet|كأس ملكي مذهب)\b/i,
    archetype: {
      id: 'archetype.prop.chalice',
      name: 'Jeweled Golden Royal Chalice',
      domain: 'prop',
      keywords: ['chalice', 'goblet', 'grail', 'كأس ملكي'],
      targetScale: 2.2,
      build: (p) => createGoldenChalice(p),
    },
  },
  {
    pattern: /\b(coffee mug|ceramic mug|tea mug|مج قهوة|كوب سيراميك)\b/i,
    archetype: {
      id: 'archetype.prop.coffee_mug',
      name: 'Glazed Ceramic Coffee Mug',
      domain: 'prop',
      keywords: ['coffee mug', 'mug', 'ceramic cup', 'مج قهوة'],
      targetScale: 2.2,
      build: (p) => createCoffeeMug(p),
    },
  },
  {
    pattern: /\b(pocket watch|fob watch|chronometer watch|ساعة جيب ذهبية)\b/i,
    archetype: {
      id: 'archetype.prop.pocket_watch',
      name: 'Vintage Gold Pocket Watch',
      domain: 'prop',
      keywords: ['pocket watch', 'fob watch', 'gold watch', 'ساعة جيب'],
      targetScale: 2.2,
      build: (p) => createPocketWatch(p),
    },
  },
  {
    pattern: /\b(clapperboard|clapboard|film slate|movie slate|كلاكيت سينمائي)\b/i,
    archetype: {
      id: 'archetype.prop.clapperboard',
      name: 'Director Cinema Slate Clapperboard',
      domain: 'prop',
      keywords: ['clapperboard', 'clapboard', 'film slate', 'كلاكيت'],
      targetScale: 2.2,
      build: (p) => createClapperboard(p),
    },
  },
  {
    pattern: /\b(rotary telephone|vintage telephone|desk phone|هاتف قرصي قديم|تليفون أرضي)\b/i,
    archetype: {
      id: 'archetype.prop.telephone',
      name: 'Vintage Black Rotary Telephone',
      domain: 'prop',
      keywords: ['telephone', 'rotary phone', 'handset', 'هاتف قرصي'],
      targetScale: 2.2,
      build: (p) => createRotaryTelephone(p),
    },
  },
  {
    pattern: /\b(compass|nautical compass|magnetic compass|بوصلة ملاحية)\b/i,
    archetype: {
      id: 'archetype.prop.compass',
      name: 'Brass Nautical Magnetic Compass',
      domain: 'prop',
      keywords: ['compass', 'nautical compass', 'cardinal rose', 'بوصلة'],
      targetScale: 2.2,
      build: (p) => createNauticalCompass(p),
    },
  },
  {
    pattern: /\b(film projector|cinema projector|reel projector|جهاز عرض سينمائي|بروجيكتور)\b/i,
    archetype: {
      id: 'archetype.prop.film_projector',
      name: 'Twin-Reel 35mm Cinema Film Projector',
      domain: 'prop',
      keywords: ['film projector', 'cinema projector', '35mm reel', 'جهاز عرض'],
      targetScale: 2.1,
      build: (p) => createFilmProjector(p),
    },
  },
  {
    pattern: /\b(decanter|crystal carafe|potion bottle|إبريق كريستال|دورق)\b/i,
    archetype: {
      id: 'archetype.prop.decanter',
      name: 'Cut-Crystal Carafe Decanter',
      domain: 'prop',
      keywords: ['decanter', 'carafe', 'crystal stopper', 'إبريق كريستال'],
      targetScale: 2.2,
      build: (p) => createCrystalDecanter(p),
    },
  },
  {
    pattern: /\b(anvil|blacksmith anvil|forged anvil|سندان حداد)\b/i,
    archetype: {
      id: 'archetype.prop.anvil',
      name: 'Forged Iron Blacksmith Anvil',
      domain: 'prop',
      keywords: ['anvil', 'blacksmith', 'forge horn', 'سندان'],
      targetScale: 2.2,
      build: (p) => createBlacksmithAnvil(p),
    },
  },
  {
    pattern: /\b(megaphone|bullhorn|loudhailer|مكبر صوت يدوي|ميجافون)\b/i,
    archetype: {
      id: 'archetype.prop.megaphone',
      name: 'Handheld Bullhorn Megaphone',
      domain: 'prop',
      keywords: ['megaphone', 'bullhorn', 'loudhailer', 'ميجافون'],
      targetScale: 2.2,
      build: (p) => createMegaphone(p),
    },
  },
  {
    pattern: /\b(gramophone|phonograph|record player|جرامافون|فونوغراف)\b/i,
    archetype: {
      id: 'archetype.prop.gramophone',
      name: 'Vintage Brass-Horn Gramophone',
      domain: 'prop',
      keywords: ['gramophone', 'phonograph', 'brass horn', 'جرامافون'],
      targetScale: 2.1,
      build: (p) => createGramophone(p),
    },
  },
  {
    pattern: /\b(hourglass|sand timer|sandglass|ساعة رملية)\b/i,
    archetype: {
      id: 'archetype.prop.hourglass',
      name: 'Three-Pillar Brass Hourglass',
      domain: 'prop',
      keywords: ['hourglass', 'sand timer', 'sandglass', 'ساعة رملية'],
      targetScale: 2.2,
      build: (p) => createBrassHourglass(p),
    },
  },
  {
    pattern: /\b(traffic light|traffic signal|stoplight|إشارة مرور)\b/i,
    archetype: {
      id: 'archetype.prop.traffic_light',
      name: '3-Aspect Street Traffic Signal Light',
      domain: 'prop',
      keywords: ['traffic light', 'traffic signal', 'stoplight', 'إشارة مرور'],
      targetScale: 1.85,
      build: (p) => createTrafficLight(p),
    },
  },
  {
    pattern: /\b(parking meter|coin meter|عداد انتظار سيارات)\b/i,
    archetype: {
      id: 'archetype.prop.parking_meter',
      name: 'Roadside Cast-Iron Parking Meter',
      domain: 'prop',
      keywords: ['parking meter', 'coin meter', 'expired flag', 'عداد انتظار'],
      targetScale: 2.1,
      build: (p) => createParkingMeter(p),
    },
  },
  {
    pattern: /\b(satellite dish|parabolic dish|dish antenna|طبق قمر صناعي|دش)\b/i,
    archetype: {
      id: 'archetype.prop.satellite_dish',
      name: 'Parabolic Rooftop Satellite Dish',
      domain: 'prop',
      keywords: ['satellite dish', 'parabolic antenna', 'feedhorn', 'طبق قمر صناعي'],
      targetScale: 2.1,
      build: (p) => createSatelliteDish(p),
    },
  },

  // ================= WEAPONS =================
  {
    pattern: /\b(battleaxe|double axe|bearded axe|greataxe|فأس حرب مزدوج|بلطة)\b/i,
    archetype: {
      id: 'archetype.weapon.battleaxe',
      name: 'Double-Bitted Bearded Battleaxe',
      domain: 'weapons',
      keywords: ['battleaxe', 'greataxe', 'double axe', 'فأس حرب'],
      targetScale: 2.1,
      build: (p) => createBattleaxe(p),
    },
  },
  {
    pattern: /\b(hunting bow|recurve bow|longbow|قوس صيد)\b/i,
    archetype: {
      id: 'archetype.weapon.hunting_bow',
      name: 'Recurve Hunting Bow & Arrow',
      domain: 'weapons',
      keywords: ['hunting bow', 'recurve bow', 'longbow', 'قوس صيد'],
      targetScale: 2.1,
      build: (p) => createHuntingBow(p),
    },
  },
  {
    pattern: /\b(katana|samurai sword|wakizashi|tachi|سيف كاتانا|سيف ساموراي)\b/i,
    archetype: {
      id: 'archetype.weapon.katana',
      name: 'Japanese Samurai Katana & Saya',
      domain: 'weapons',
      keywords: ['katana', 'samurai sword', 'tsuba', 'saya', 'كاتانا'],
      targetScale: 2.1,
      build: (p) => createKatanaSword(p),
    },
  },
  {
    pattern: /\b(crossbow|arbalest|قوس مستعرض|نشاب)\b/i,
    archetype: {
      id: 'archetype.weapon.crossbow',
      name: 'Heavy Tactical Crossbow',
      domain: 'weapons',
      keywords: ['crossbow', 'arbalest', 'quarrel', 'نشاب'],
      targetScale: 2.2,
      build: (p) => createHeavyCrossbow(p),
    },
  },
  {
    pattern: /\b(halberd|polearm|glaive|pike|رمح مطرد|هلبر)\b/i,
    archetype: {
      id: 'archetype.weapon.halberd',
      name: 'Medieval Infantry Polearm Halberd',
      domain: 'weapons',
      keywords: ['halberd', 'polearm', 'glaive', 'رمح مطرد'],
      targetScale: 1.9,
      build: (p) => createHalberdPolearm(p),
    },
  },
  {
    pattern: /\b(warhammer|maul|mace hammer|مطرقة حرب)\b/i,
    archetype: {
      id: 'archetype.weapon.warhammer',
      name: 'Heavy Flanged Knightly Warhammer',
      domain: 'weapons',
      keywords: ['warhammer', 'maul', 'flanged hammer', 'مطرقة حرب'],
      targetScale: 2.1,
      build: (p) => createWarhammer(p),
    },
  },
  {
    pattern: /\b(revolver|six-shooter|magnum revolver|مسدس ساقية|ريفولفر)\b/i,
    archetype: {
      id: 'archetype.weapon.revolver',
      name: 'Six-Shot Heavy Revolver Handgun',
      domain: 'weapons',
      keywords: ['revolver', 'six-shooter', 'magnum', 'ريفولفر'],
      targetScale: 2.2,
      build: (p) => createRevolverPistol(p),
    },
  },
  {
    pattern: /\b(sniper rifle|marksman rifle|scoped rifle|assault rifle|\brifle\b|بندقية قنص|قناصة)\b/i,
    archetype: {
      id: 'archetype.weapon.sniper_rifle',
      name: 'Marksman Sniper Rifle with Scope & Bipod',
      domain: 'weapons',
      keywords: ['sniper rifle', 'rifle', 'bipod', 'scope', 'بندقية قنص'],
      targetScale: 2.1,
      build: (p) => createSniperRifle(p),
    },
  },
  {
    pattern: /\b(plasma blaster|laser blaster|pulse pistol|مسدس بلازما)\b/i,
    archetype: {
      id: 'archetype.weapon.plasma_blaster',
      name: 'Sci-Fi Plasma Blaster Pistol',
      domain: 'weapons',
      keywords: ['plasma blaster', 'blaster', 'energy pistol', 'مسدس بلازما'],
      targetScale: 2.2,
      build: (p) => createPlasmaBlaster(p),
    },
  },
  {
    pattern: /\b(dagger|stiletto|dirk|poniard|خنجر)\b/i,
    archetype: {
      id: 'archetype.weapon.dagger',
      name: 'Ornate Stiletto Assassin Dagger',
      domain: 'weapons',
      keywords: ['dagger', 'stiletto', 'dirk', 'خنجر'],
      targetScale: 2.2,
      build: (p) => createStilettoDagger(p),
    },
  },
  {
    pattern: /\b(ballista|siege crossbow|scorpion catapult|منجنيق سهام|باليستا)\b/i,
    archetype: {
      id: 'archetype.weapon.ballista',
      name: 'Heavy Timber Siege Ballista',
      domain: 'weapons',
      keywords: ['ballista', 'siege engine', 'torsion', 'باليستا'],
      targetScale: 2.0,
      build: (p) => createSiegeBallista(p),
    },
  },
  {
    pattern: /\b(morningstar|spiked flail|mace flail|صولجان شائك)\b/i,
    archetype: {
      id: 'archetype.weapon.morningstar',
      name: 'Spiked Iron Morningstar Flail',
      domain: 'weapons',
      keywords: ['morningstar', 'flail', 'spiked ball', 'صولجان شائك'],
      targetScale: 2.1,
      build: (p) => createMorningstarFlail(p),
    },
  },
  {
    pattern: /\b(scythe|reaper blade|harvest scythe|منجل حصاد كبير)\b/i,
    archetype: {
      id: 'archetype.weapon.scythe',
      name: 'Curved Blade Reaper Scythe',
      domain: 'weapons',
      keywords: ['scythe', 'reaper', 'snath', 'منجل'],
      targetScale: 1.95,
      build: (p) => createReaperScythe(p),
    },
  },
  {
    pattern: /\b(raygun|atomic blaster|retro raygun|مسدس أشعة ذري)\b/i,
    archetype: {
      id: 'archetype.weapon.raygun',
      name: 'Retro-Futuristic Finned Atomic Raygun',
      domain: 'weapons',
      keywords: ['raygun', 'atomic gun', 'retro blaster', 'مسدس أشعة'],
      targetScale: 2.2,
      build: (p) => createRetroRaygun(p),
    },
  },
  {
    pattern: /\b(flamethrower|flame projector|قاذف لهب)\b/i,
    archetype: {
      id: 'archetype.weapon.flamethrower',
      name: 'Twin-Tank Backpack Flamethrower',
      domain: 'weapons',
      keywords: ['flamethrower', 'fuel tanks', 'igniter wand', 'قاذف لهب'],
      targetScale: 2.1,
      build: (p) => createFlamethrower(p),
    },
  },
  {
    pattern: /\b(shuriken|throwing star|ninja star|نجمة نينجا|شوريكين)\b/i,
    archetype: {
      id: 'archetype.weapon.shuriken',
      name: 'Four-Pointed Steel Ninja Shuriken',
      domain: 'weapons',
      keywords: ['shuriken', 'throwing star', 'ninja star', 'شوريكين'],
      targetScale: 2.2,
      build: (p) => createShurikenStar(p),
    },
  },

  // ================= SCI-FI =================
  {
    pattern: /\b(gravity centrifuge|orbital centrifuge|centrifuge ring|جهاز طرد مركزي مداري)\b/i,
    archetype: {
      id: 'archetype.scifi.centrifuge',
      name: 'Orbital Gravity Centrifuge Ring',
      domain: 'scifi',
      keywords: ['centrifuge', 'gravity ring', 'habitat ring', 'طرد مركزي'],
      targetScale: 1.95,
      build: (p) => createGravityCentrifuge(p),
    },
  },
  {
    pattern: /\b(orbital satellite|communications satellite|space satellite|\bsatellite\b|قمر صناعي مداري)\b/i,
    archetype: {
      id: 'archetype.scifi.satellite',
      name: 'Orbital Communications Satellite',
      domain: 'scifi',
      keywords: ['satellite', 'solar wings', 'orbital relay', 'قمر صناعي'],
      targetScale: 1.9,
      build: (p) => createOrbitalSatellite(p),
    },
  },
  {
    pattern: /\b(cryo-stasis|cryo pod|stasis pod|sleep pod|كبسولة سبات فائق)\b/i,
    archetype: {
      id: 'archetype.scifi.cryo_pod',
      name: 'Vertical Cryo-Stasis Chamber Pod',
      domain: 'scifi',
      keywords: ['cryo pod', 'stasis pod', 'cryogenic', 'كبسولة سبات'],
      targetScale: 1.95,
      build: (p) => createCryoStasisPod(p),
    },
  },
  {
    pattern: /\b(holo-emitter|holo emitter|hologram projector|باعث هولوغرام)\b/i,
    archetype: {
      id: 'archetype.scifi.holo_emitter',
      name: 'Circular Holographic Emitter Pedestal',
      domain: 'scifi',
      keywords: ['holo emitter', 'hologram', 'projector pedestal', 'هولوغرام'],
      targetScale: 2.1,
      build: (p) => createHoloEmitter(p),
    },
  },
  {
    pattern: /\b(server rack|blade server|mainframe rack|خزانة خوادم|سيرفر)\b/i,
    archetype: {
      id: 'archetype.scifi.server_rack',
      name: 'Mainframe Blade Server Rack Cabinet',
      domain: 'scifi',
      keywords: ['server rack', 'mainframe', 'blade server', 'خوادم'],
      targetScale: 1.95,
      build: (p) => createServerRack(p),
    },
  },
  {
    pattern: /\b(teleport pad|teleportation pad|warp pad|transporter pad|منصة انتقال آني)\b/i,
    archetype: {
      id: 'archetype.scifi.teleport_pad',
      name: 'Quantum Teleportation Pad',
      domain: 'scifi',
      keywords: ['teleport pad', 'transporter', 'warp pad', 'انتقال آني'],
      targetScale: 1.95,
      build: (p) => createTeleportPad(p),
    },
  },
  {
    pattern: /\b(shield generator|forcefield emitter|energy shield pylon|مولد درع طاقة)\b/i,
    archetype: {
      id: 'archetype.scifi.shield_generator',
      name: 'Tri-Prong Forcefield Shield Generator',
      domain: 'scifi',
      keywords: ['shield generator', 'forcefield emitter', 'energy dome', 'درع طاقة'],
      targetScale: 1.95,
      build: (p) => createShieldGenerator(p),
    },
  },
  {
    pattern: /\b(robot arm|industrial manipulator|assembly arm|ذراع روبوت صناعي)\b/i,
    archetype: {
      id: 'archetype.scifi.robot_arm',
      name: '6-Axis Articulated Industrial Robot Arm',
      domain: 'scifi',
      keywords: ['robot arm', 'manipulator', 'gripper claw', 'ذراع روبوت'],
      targetScale: 2.0,
      build: (p) => createIndustrialRobotArm(p),
    },
  },
  {
    pattern: /\b(tokamak|fusion reactor|magnetic torus|quantum reactor|مفاعل اندماج توكاماك)\b/i,
    archetype: {
      id: 'archetype.scifi.tokamak',
      name: 'Toroidal Tokamak Fusion Reactor',
      domain: 'scifi',
      keywords: ['tokamak', 'fusion reactor', 'plasma torus', 'توكاماك'],
      targetScale: 1.95,
      build: (p) => createTokamakReactor(p),
    },
  },
  {
    pattern: /\b(airlock hatch|bulkhead door|blast door|بوابة غرفة معادلة الضغط)\b/i,
    archetype: {
      id: 'archetype.scifi.airlock_hatch',
      name: 'Octagonal Bulkhead Airlock Hatch',
      domain: 'scifi',
      keywords: ['airlock', 'bulkhead hatch', 'blast door', 'غرفة ضغط'],
      targetScale: 1.85,
      build: (p) => createAirlockHatch(p),
    },
  },
  {
    pattern: /\b(vending machine|cyberpunk vending|neon dispenser|ماكينة بيع ذاتي نيون)\b/i,
    archetype: {
      id: 'archetype.scifi.vending_machine',
      name: 'Cyberpunk Neon Vending Machine',
      domain: 'scifi',
      keywords: ['vending machine', 'neon dispenser', 'cyberpunk kiosk', 'ماكينة بيع'],
      targetScale: 1.95,
      build: (p) => createCyberpunkVending(p),
    },
  },
  {
    pattern: /\b(automated turret|defense turret|plasma turret|sentry gun|برج دفاع آلي)\b/i,
    archetype: {
      id: 'archetype.scifi.turret',
      name: 'Automated Twin-Barrel Plasma Turret',
      domain: 'scifi',
      keywords: ['turret', 'sentry gun', 'point defense', 'برج دفاع آلي'],
      targetScale: 2.0,
      build: (p) => createAutomatedTurret(p),
    },
  },
  {
    pattern: /\b(drone dock|charging pad|helipad dock|منصة شحن درون)\b/i,
    archetype: {
      id: 'archetype.scifi.drone_dock',
      name: 'Hexagonal Autonomous Drone Dock',
      domain: 'scifi',
      keywords: ['drone dock', 'charging pad', 'landing pad', 'منصة درون'],
      targetScale: 2.0,
      build: (p) => createDroneDock(p),
    },
  },
  {
    pattern: /\b(prosthetic arm|bionic arm|cybernetic arm|ذراع إلكترونية تعويضية)\b/i,
    archetype: {
      id: 'archetype.scifi.prosthetic_arm',
      name: 'Bionic Cybernetic Prosthetic Arm',
      domain: 'scifi',
      keywords: ['prosthetic arm', 'bionic arm', 'cyberarm', 'ذراع إلكترونية'],
      targetScale: 2.1,
      build: (p) => createProstheticArm(p),
    },
  },
  {
    pattern: /\b(hyperspace gate|jump gate|stargate|portal ring|بوابة الفضاء الفائق)\b/i,
    archetype: {
      id: 'archetype.scifi.hyperspace_gate',
      name: 'Orbital Hyperspace Jump Gate Ring',
      domain: 'scifi',
      keywords: ['hyperspace gate', 'jump gate', 'stargate', 'بوابة فضاء'],
      targetScale: 1.85,
      build: (p) => createHyperspaceGate(p),
    },
  },
  {
    pattern: /\b(antigravity sled|hover sled|repulsor sled|cargo sled|زلاجة مضادة للجاذبية)\b/i,
    archetype: {
      id: 'archetype.scifi.antigravity_sled',
      name: 'Repulsorlift Anti-Gravity Cargo Sled',
      domain: 'scifi',
      keywords: ['antigravity sled', 'hover sled', 'repulsor', 'زلاجة طائرة'],
      targetScale: 2.1,
      build: (p) => createAntigravitySled(p),
    },
  },
  {
    pattern: /\b(quantum computer|dilution refrigerator|qubit chandelier|حاسوب كمي فائق)\b/i,
    archetype: {
      id: 'archetype.scifi.quantum_computer',
      name: 'Cryogenic Quantum Computer Chandelier',
      domain: 'scifi',
      keywords: ['quantum computer', 'dilution refrigerator', 'qubit', 'حاسوب كمي'],
      targetScale: 1.95,
      build: (p) => createQuantumComputer(p),
    },
  },
  {
    pattern: /\b(terraforming spire|atmospheric processor|weather tower|برج تأهيل الكواكب)\b/i,
    archetype: {
      id: 'archetype.scifi.terraforming_spire',
      name: 'Atmospheric Terraforming Spire',
      domain: 'scifi',
      keywords: ['terraforming spire', 'atmospheric processor', 'ion spire', 'برج تأهيل'],
      targetScale: 1.55,
      build: (p) => createTerraformingSpire(p),
    },
  },
  {
    pattern: /\b(holo-table|holo table|tactical table|command table|طاولة قيادة هولوغرافية)\b/i,
    archetype: {
      id: 'archetype.scifi.holo_table',
      name: 'Hexagonal Tactical Command Holo-Table',
      domain: 'scifi',
      keywords: ['holo table', 'tactical table', 'command holo', 'طاولة هولوغرافية'],
      targetScale: 2.0,
      build: (p) => createHoloTable(p),
    },
  },
  {
    pattern: /\b(warp nacelle|starship nacelle|bussard collector|محرك طي الفضاء)\b/i,
    archetype: {
      id: 'archetype.scifi.warp_nacelle',
      name: 'Streamlined Starship Warp Nacelle Pod',
      domain: 'scifi',
      keywords: ['warp nacelle', 'bussard collector', 'warp coil', 'محرك فضاء'],
      targetScale: 2.0,
      build: (p) => createWarpNacelle(p),
    },
  },
  {
    pattern: /\b(matter synthesizer|food replicator|molecular synthesizer|مصنع المادة الجزيئي)\b/i,
    archetype: {
      id: 'archetype.scifi.matter_synthesizer',
      name: 'Molecular Matter Synthesizer Unit',
      domain: 'scifi',
      keywords: ['matter synthesizer', 'replicator', 'synthesizer alcove', 'مصنع المادة'],
      targetScale: 2.0,
      build: (p) => createMatterSynthesizer(p),
    },
  },
];

export const CURATED_OBJECT_ARCHETYPES: ObjectArchetype[] = CURATED_ARCHETYPE_RULES.map((r) => r.archetype);

const PRIMARY_BASE_ARCHETYPE_NOUN_RE =
  /\b(helicopter|chopper|copter|airplane|aeroplane|plane|aircraft|jet|biplane|glider|fighter|starfighter|spaceship|starship|spacecraft|drone|ufo|car|automobile|sedan|sportscar|supercar|suv|tank|submarine|motorcycle|motocycle|motorbike|boat|zodiac|yacht|ship|dragon|wyvern|drake|dog|hound|wolf|cat|lion|tiger|horse|stag|deer|bear|tree|pine|oak|chair|table|desk|bed|sofa|couch|lamp|clock|door|gate|bridge|tower|castle|cottage|house|well|barrel|crate|cart|fence|sword|shield|bow|gun|pistol|rifle|flute|guitar|piano|drum|microphone|speaker|camera|microscope|telescope|laptop|television|tv)\b|(هليكوبتر|مروحية|طوافة|طائرة|طيارة|سيارة|دبابة|غواصة|موتوسيكل|قارب|سفينة|تنين|كلب|ذئب|قط|أسد|نمر|حصان|غزال|دب|شجرة|كرسي|طاولة|مكتب|سرير|مصباح|ساعة|باب|بوابة|جسر|برج|قلعة|منزل|بيت|بئر|برميل|صندوق|عربة|سور|سيف|درع|قوس|بندقية|مسدس|كاميرا|لابتوب|تلفاز)/i;

/**
 * Deterministic high-precision matcher for curated catalog assets & compound nouns.
 * Checks the head phrase (before prepositions/participles like "with", "in", "over", "flying") first
 * so modifier or background words in long tokenPrompts never hijack the primary subject identity.
 */
export function matchSpecificCuratedArchetype(query: string, _category?: string): ObjectArchetype | null {
  if (!query) return null;
  const headClause =
    query.split(
      /\b(?:with|featuring|wearing|holding|mounted|resting|standing|surrounded|inside|under|over|above|across|through|near|beside|behind|around|between|against|flying|hovering|driving|running|walking|swimming|sailing|parked|floating|sitting|lying|in\s+the|on\s+the|in\s+a|on\s+a|at\s+the)\b/i
    )[0] || query;

  // 1. First pass: check head clause (highest specificity — the actual subject name/noun)
  for (const rule of CURATED_ARCHETYPE_RULES) {
    if (rule.pattern.test(headClause)) {
      return rule.archetype;
    }
  }

  // If the head clause already names a core base archetype (e.g. "helicopter", "airplane", "car", "tree"),
  // NEVER allow secondary background words after prepositions (e.g. "over a forest", "near a lighthouse")
  // to hijack the object in the second pass!
  if (PRIMARY_BASE_ARCHETYPE_NOUN_RE.test(headClause)) {
    return null;
  }

  // 2. Second pass: check full query string
  for (const rule of CURATED_ARCHETYPE_RULES) {
    if (rule.pattern.test(query)) {
      return rule.archetype;
    }
  }
  return null;
}

