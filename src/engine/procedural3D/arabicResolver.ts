/**
 * Multilingual & Arabic Semantic Normalizer for Director Prompts.
 * Grounded in the 3Dviz Pro Max semantic routing specification.
 * Fully supports Arabic colloquial and classical dialects without ASCII regex boundary flaws.
 */

export interface SemanticDictionaryEntry {
  category: string;
  keywords: string[];
  tags: string;
}

export function cleanArabicText(str: string): string {
  return str
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // remove tashkeel & tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .trim();
}

export const ARABIC_DIRECTOR_DICTIONARY: SemanticDictionaryEntry[] = [
  // 1. Audio & Acoustic Gear: Microphones
  {
    category: 'microphone',
    keywords: [
      'مايك', 'المايك', 'ميكروفون', 'الميكروفون', 'ميكرفون', 'ميك', 'لاقط صوت',
      'microphone', 'mic', 'condenser mic', 'studio mic',
    ],
    tags: 'microphone mic audio sound recording condenser',
  },

  // 2. Audio Loudspeakers & Studio Monitors
  {
    category: 'speaker',
    keywords: [
      'مكبر صوت', 'مكبرات', 'سماعه كبيره', 'صب', 'صب ووفر',
      'speaker', 'subwoofer', 'soundbar', 'loudspeaker', 'boombox',
    ],
    tags: 'speaker subwoofer soundbar loudspeaker boombox audio acoustic',
  },

  // 3. Hollow Vessels & Containers (Cup, Mug, Glass, Bottle, Bowl, Jug, Teapot)
  {
    category: 'cup',
    keywords: [
      'كبايه', 'الكبايه', 'كوبايه', 'الكوبايه', 'كوب', 'الكوب', 'اكواب', 'فنجان', 'الفنجان',
      'فناجين', 'كاس', 'كأس', 'الكاس', 'الكأس', 'كؤوس', 'قدح', 'القدح', 'مج', 'المج',
      'شوب', 'زجاجه', 'ازازه', 'الازازه', 'قاروره', 'ابريق', 'براد شاي', 'وعاء', 'سلطانيه',
      'صحن', 'طاسه', 'حله', 'اناء', 'كاسه',
      'cup', 'mug', 'glass', 'bottle', 'bowl', 'vase', 'flask', 'teapot', 'jug', 'pitcher',
    ],
    tags: 'cup mug hollow vessel glass drink beverage bottle bowl jug teapot container flask',
  },

  // 4. Food & Culinary Layered Assemblies (Burger, Sandwich, Pizza, Patty, Bread)
  {
    category: 'burger',
    keywords: [
      'برجر', 'البرجر', 'همبرجر', 'الهمبرجر', 'برغر', 'ساندوتش', 'الساندوتش', 'سندوتش',
      'سندوتشات', 'وجبه', 'الوجبه', 'طعام', 'اكل', 'بيتزا', 'شريحه لحم', 'فطيره', 'كيكه',
      'تورتة', 'خبز', 'عيش', 'وجبه سريعه', 'ماكولات', 'شاورما',
      'burger', 'hamburger', 'cheeseburger', 'sandwich', 'patty', 'pizza', 'meal', 'food',
    ],
    tags: 'burger sandwich food meal bread patty hamburger culinary layered pizza',
  },

  // 5. Technology, Computers & Displays (Laptop, Computer, PC, Screen, Monitor)
  {
    category: 'laptop',
    keywords: [
      'لابتوب', 'اللابتوب', 'حاسوب', 'الحاسوب', 'حواسيب', 'كمبيوتر', 'الكمبيوتر',
      'شاشه', 'الشاشه', 'شاشات', 'تلفزيون', 'التلفزيون', 'تلفاز', 'مونيتور', 'ماك بوك',
      'نوت بوك', 'تابلت', 'ايباد', 'موبايل', 'تليفون', 'هاتف', 'جوال',
      'laptop', 'notebook', 'macbook', 'computer', 'screen', 'monitor', 'pc',
    ],
    tags: 'laptop computer screen monitor pc display notebook electronics hardware',
  },

  // 6. Keyboard Instruments (Piano, Organ, Synthesizer)
  {
    category: 'piano',
    keywords: [
      'بيانو', 'البيانو', 'اورج', 'الاورج', 'كيبورد موسيقي', 'سنثسايزر',
      'piano', 'keyboard', 'grandpiano', 'pianoforte', 'organ', 'synthesizer', 'keybed',
    ],
    tags: 'piano keyboard organ synthesizer pianoforte keybed music instrument',
  },

  // 7. String Musical Instruments (Guitar, Oud, Violin, Strings)
  {
    category: 'guitar',
    keywords: [
      'جيتار', 'الجيتار', 'قيثاره', 'القيثاره', 'عود', 'العود', 'كمان', 'الكمان', 'كمنجه',
      'قانون', 'ناي', 'مزمار', 'اله موسيقيه', 'الات موسيقيه', 'موسيقي',
      'guitar', 'strings', 'oud', 'violin', 'cello', 'acoustic guitar',
    ],
    tags: 'guitar music instrument strings acoustic soundbox fretboard peghead oud violin',
  },

  // 8. Percussion Instruments (Drums, Snare, Timpani)
  {
    category: 'drum',
    keywords: [
      'درامز', 'طبله', 'الطبله', 'طبل', 'دف', 'بونجز',
      'drum', 'drums', 'snare', 'timpani', 'conga', 'bongo', 'percussion',
    ],
    tags: 'drum drums snare timpani conga bongo percussion music',
  },

  // 9. Scientific Optical Instruments (Microscope)
  {
    category: 'microscope',
    keywords: [
      'ميكروسكوب', 'الميكروسكوب', 'مجهر', 'المجهر', 'مجهري',
      'microscope', 'labscope', 'laboratory microscope',
    ],
    tags: 'microscope labscope optics scientific laboratory lenses',
  },

  // 10. Astronomy & Spotting Instruments (Telescope)
  {
    category: 'telescope',
    keywords: [
      'تلسكوب', 'التلسكوب', 'مرصد', 'المرصد', 'منظار فلكي',
      'telescope', 'spyglass', 'monocular', 'stargazer',
    ],
    tags: 'telescope spyglass monocular stargazer astronomy optics',
  },

  // 11. Lighting & Interior Lamps (Table Lamp, Lantern, Streetlamp, Torch, Bulbs)
  {
    category: 'lamp',
    keywords: [
      'اباجوره', 'الاباجوره', 'مصباح', 'المصباح', 'مصباح طاولة', 'لمبه', 'اللمبه', 'لمبادير',
      'نجفه', 'النجفه', 'ثريا', 'كشاف', 'فانوس', 'الفانوس', 'عمود اناره', 'شعله', 'قنديل',
      'اناره', 'اضاءه',
      'lamp', 'lantern', 'lampshade', 'chandelier', 'lightpost', 'torch',
    ],
    tags: 'lamp lighting lampshade light lightpost lantern torch illumination fixture chandelier',
  },

  // 12. Fans & Mechanical Air Circulation
  {
    category: 'fan',
    keywords: [
      'مروحه', 'المروحه', 'مراوح', 'مروحة سقف', 'مروحة مكتب',
      'fan', 'ventilator', 'blower', 'turbine', 'propeller fan',
    ],
    tags: 'fan ventilator blower turbine propeller oscillation',
  },

  // 13. Timepieces & Dials (Clock, Watch)
  {
    category: 'clock',
    keywords: [
      'ساعه', 'الساعه', 'ساعات', 'ساعه حائط', 'ساعه يد', 'منبه',
      'clock', 'timepiece', 'wristwatch', 'watch', 'stopwatch', 'chronometer',
    ],
    tags: 'clock timepiece wristwatch watch stopwatch chronometer',
  },

  // 14. Household Appliances (Refrigerator, Fridge, Oven)
  {
    category: 'appliance',
    keywords: [
      'ثلاجه', 'الثلاجه', 'براد', 'غساله', 'الغساله', 'فرن', 'الفرن', 'بوتجاز', 'ديب فريزر',
      'refrigerator', 'fridge', 'freezer', 'oven', 'stove', 'microwave', 'dishwasher', 'appliance',
    ],
    tags: 'refrigerator fridge freezer oven stove dishwasher appliance cabinet',
  },

  // 15. Resting Furniture (Bed, Mattress)
  {
    category: 'bed',
    keywords: [
      'سرير', 'السرير', 'اسره', 'مرتبه', 'المرتبه',
      'bed', 'mattress', 'bunkbed', 'cot', 'crib',
    ],
    tags: 'bed mattress bunkbed cot crib furniture',
  },

  // 16. Defensive Armor (Shield)
  {
    category: 'shield',
    keywords: [
      'درع', 'الدرع', 'دروع',
      'shield', 'buckler', 'aegis', 'pavis',
    ],
    tags: 'shield buckler aegis pavis defense armor',
  },

  // 17. Architectural Portals (Door, Gate)
  {
    category: 'door',
    keywords: [
      'باب', 'الباب', 'ابواب', 'بوابه', 'البوابه', 'بوابات', 'مدخل',
      'door', 'gate', 'portal', 'entrance', 'doorway',
    ],
    tags: 'door gate portal entrance doorway architecture',
  },

  // 18. Aviation & Fixed-Wing Aircraft (Airplane, Plane, Jet)
  {
    category: 'airplane',
    keywords: [
      'طياره', 'الطياره', 'طائره', 'الطائره', 'طائرات', 'طائره ركاب', 'طائره حربيه', 'نفاثه',
      'airplane', 'plane', 'aeroplane', 'jet', 'aviation', 'biplane', 'glider',
    ],
    tags: 'airplane plane aeroplane jet aircraft aviation biplane glider',
  },

  // 18. Woodwind Musical Instruments (Flute, Nay, Recorder, Clarinet, Oboe)
  {
    category: 'flute',
    keywords: [
      'ناي', 'الناي', 'فلوت', 'الفلوت', 'مزمار', 'المزمار', 'كوالا', 'يرغول', 'صفارة',
      'flute', 'recorder', 'piccolo', 'clarinet', 'oboe', 'woodwind',
    ],
    tags: 'flute recorder piccolo clarinet oboe woodwind musical instrument aerophone',
  },

  // 19. Two-Wheeled Ground Locomotion (Motorcycle, Bike)
  {
    category: 'motorcycle',
    keywords: [
      'موتوسيكل', 'الموتوسيكل', 'موتسيكل', 'الموتسيكل', 'موتوسكل', 'دراجه ناريه', 'دباب', 'الدباب', 'سكوتر', 'السكوتر', 'بسكلته', 'عجله', 'دراجه', 'موتور',
      'motorcycle', 'motocycle', 'motorbike', 'motobike', 'moto', 'bike', 'bicycle', 'scooter', 'dirtbike', 'moped', 'vespa',
    ],
    tags: 'motorcycle motorbike bike bicycle scooter dirtbike moped',
  },

  // 20. Marine & Watercraft (Zodiac, Boat, Ship, Yacht, Raft)
  {
    category: 'boat',
    keywords: [
      'زودياك', 'الزودياك', 'قارب', 'القارب', 'قوارب', 'زورق', 'الزورق', 'زوارق',
      'مركب', 'المركب', 'مراكب', 'سفينه', 'السفينه', 'سفن', 'باخره', 'الباخره', 'يخت',
      'اليخت', 'يخوت', 'لنش', 'طراد', 'فلوكه', 'عوامه', 'طوافه', 'غواصه', 'مركب مطاطي',
      'zodiac', 'boat', 'rib', 'inflatable', 'watercraft', 'vessel', 'ship', 'yacht', 'raft',
    ],
    tags: 'zodiac boat rib inflatable watercraft vessel ship yacht raft dinghy speedboat',
  },

  // 21. Ground Vehicles (Car, Automobile, Truck, SUV)
  {
    category: 'car',
    keywords: [
      'سياره', 'السياره', 'سيارات', 'عربيه', 'العربيه', 'عربيات', 'مركبه', 'المركبه',
      'شاحنه', 'الشاحنه', 'عربه', 'تاكسي', 'التاكسي', 'باص', 'اتوبيس', 'حافله', 'ميكروباص',
      'قطار', 'ترام', 'عربانه',
      'car', 'automobile', 'vehicle', 'truck', 'sedan', 'suv', 'taxi', 'van',
    ],
    tags: 'car automobile vehicle truck sedan suv taxi van',
  },

  // 22. Rotary Wing Aircraft (Helicopter)
  {
    category: 'helicopter',
    keywords: [
      'مروحيه', 'المروحيه', 'هليكوبتر', 'هيلكوبتر', 'طياره هليكوبتر',
      'helicopter', 'chopper', 'heli',
    ],
    tags: 'helicopter chopper heli rotary aircraft',
  },

  // 23. Robots, Mechs & Automatons
  {
    category: 'robot',
    keywords: [
      'روبوت', 'الروبوت', 'انسان الي', 'الانسان الالي', 'الي', 'روبوت مقاتل',
      'robot', 'mech', 'mecha', 'android', 'cyborg', 'automaton',
    ],
    tags: 'robot mech mecha android cyborg automaton',
  },

  // 24. Characters & Human Mannequins (Person, Actor, Man, Woman, Soldier, Hero)
  {
    category: 'human',
    keywords: [
      'شخص', 'شخصيه', 'رجل', 'الرجل', 'راجل', 'امراه', 'المراه', 'ست', 'سيده', 'فتاه', 'الفتاه',
      'بنت', 'البنت', 'ولد', 'الولد', 'طفل', 'ممثل', 'الممثل', 'ممثله', 'مخرج', 'جندي', 'الجندي',
      'عسكري', 'ضابط', 'شرطي', 'طبيب', 'دكتور', 'ممرض', 'بطل', 'البطل', 'فارس', 'محارب', 'ملك',
      'person', 'actor', 'man', 'woman', 'girl', 'soldier', 'character', 'hero',
    ],
    tags: 'human actor person man woman soldier character figure walker biped',
  },

  // 25. Quadruped Animals & Creatures (Horse, Dog, Cat, Wolf, Lion, Bear, Stag)
  {
    category: 'creature',
    keywords: [
      'حصان', 'الحصان', 'خيل', 'فرس', 'مهر', 'كلب', 'الكلب', 'كلاب', 'قطه', 'القطه', 'قط',
      'ذئب', 'الذئب', 'اسد', 'الاسد', 'نمر', 'النمر', 'فهد', 'دب', 'الدب', 'حيوان', 'الحيوان',
      'حيوانات', 'وحش', 'الوحش', 'كائن', 'غزال', 'الغزال', 'وعل', 'الوعل', 'ثعلب', 'جمل', 'فيل',
      'horse', 'dog', 'wolf', 'lion', 'tiger', 'bear', 'creature', 'animal', 'stag', 'beast',
    ],
    tags: 'creature animal quadruped horse hound dog wolf lion stag beast',
  },

  // 26. Architecture & Buildings (House, Cottage, Tower, Castle, Bridge, Mill)
  {
    category: 'building',
    keywords: [
      'مبني', 'المبني', 'مباني', 'بيت', 'البيت', 'بيوت', 'منزل', 'المنزل', 'منازل', 'عماره',
      'فيلا', 'قصر', 'القصر', 'قلعه', 'القلعه', 'حصن', 'برج', 'البرج', 'ابراج', 'ناطحه سحاب',
      'كوخ', 'الكوخ', 'اكواخ', 'شاليه', 'طاحونه', 'الطاحونه', 'جسر', 'الجسر', 'كوبري', 'سوق',
      'دكان', 'كشك', 'محل', 'سور', 'جدار',
      'house', 'cottage', 'tower', 'castle', 'building', 'bridge', 'watermill', 'mill',
    ],
    tags: 'building house cottage tower castle architecture bridge watermill stall market',
  },

  // 27. Nature, Foliage & Terrain (Tree, Pine, Forest, Mountain, Rock)
  {
    category: 'nature',
    keywords: [
      'شجره', 'الشجره', 'شجر', 'اشجار', 'نخله', 'النخله', 'نخل', 'صنوبر', 'شجره صنوبر',
      'غابه', 'الغابه', 'نبات', 'نباتات', 'زرع', 'ورده', 'زهره', 'حديقه', 'جبل', 'الجبل',
      'جبال', 'تله', 'صخره', 'الصخره', 'صخور', 'حجر', 'احجار', 'رمال', 'بحر', 'نهر',
      'tree', 'pine', 'plant', 'forest', 'nature',
    ],
    tags: 'tree foliage plant nature pine conifer mountain rock cliff boulder',
  },

  // 28. Furniture & Interior (Table, Chair, Sofa, Desk, Shelf)
  {
    category: 'furniture',
    keywords: [
      'طاوله', 'الطاوله', 'ترابيزه', 'الترابيزه', 'منضده', 'مكتب', 'المكتب', 'كرسي', 'الكرسي',
      'كراسي', 'مقعد', 'عرش', 'كنبه', 'الكنبه', 'اريكه', 'الاريكه', 'صوفا', 'انتريه', 'صالون',
      'دولاب', 'خزانه', 'رف', 'ارفف',
      'table', 'desk', 'chair', 'seat', 'sofa', 'couch', 'bench',
    ],
    tags: 'furniture table desk counter chair seat sofa couch lounge',
  },

  // 29. Weapons & Tactical Gear (Sword, Gun, Rifle, Dagger, Blaster)
  {
    category: 'weapon',
    keywords: [
      'سيف', 'السيف', 'سيوف', 'خنجر', 'سكين', 'سكينه', 'رمح', 'سهم', 'قوس',
      'سلاح', 'السلاح', 'اسلحه', 'بندقيه', 'البندقيه', 'مسدس', 'المسدس', 'رشاش', 'مدفع',
      'sword', 'blade', 'dagger', 'gun', 'rifle', 'pistol', 'blaster',
    ],
    tags: 'weapon sword blade gun rifle pistol blaster dagger firearm',
  },

  // 30. Cinematography Gear (Camera, Lens, Dolly, Rig, Tripod)
  {
    category: 'camera',
    keywords: [
      'كاميرا', 'الكاميرا', 'كاميرات', 'شاريو', 'ترايبود', 'حامل كاميرا', 'عدسه', 'عدسات',
      'معدات تصوير', 'تصوير سينمائي', 'رافعه كاميرا', 'كرين',
      'camera', 'cine camera', 'lens', 'dolly', 'camera rig',
    ],
    tags: 'camera lens cine dolly rig tripod film cinema optics',
  },

  // 31. Props & Set Dressing (Barrel, Crate, Well, Box, Chest)
  {
    category: 'prop',
    keywords: [
      'صندوق', 'الصندوق', 'صناديق', 'كرتونه', 'برميل', 'البرميل', 'براميل', 'بئر', 'البئر',
      'نافوره', 'حقيبه', 'شنطه', 'كتاب', 'قلم',
      'barrel', 'crate', 'well', 'chest', 'cargo',
    ],
    tags: 'prop barrel crate well stone cargo chest container',
  },
];

/**
 * Normalizes user queries in Arabic or English by expanding Arabic roots
 * into rich semantic tokens recognized by the 3Dviz Pro Max procedural mesh engine.
 * Immune to ASCII word boundary limitations.
 */
export function normalizeDirectorPrompt(input: string = ''): string {
  if (!input) return '';
  const raw = input.trim();
  const cleaned = cleanArabicText(raw);
  let normalized = raw.toLowerCase();

  for (const entry of ARABIC_DIRECTOR_DICTIONARY) {
    const isMatched = entry.keywords.some((kw) => {
      const cleanKw = cleanArabicText(kw);
      return cleaned.includes(cleanKw) || raw.includes(kw);
    });

    if (isMatched) {
      normalized += ` ${entry.tags}`;
    }
  }

  // Sub-word and root expansion for high-frequency vehicle patterns
  if (normalized.includes('moto') && !normalized.includes('motorcycle')) {
    normalized += ' motorcycle motorbike bike';
  }

  return normalized;
}
