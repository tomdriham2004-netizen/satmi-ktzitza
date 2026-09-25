// City maps. Every map uses the same board layout, prices and rules — only
// the names change (districts, streets, transit, utilities) plus a few visual
// touches (the felt in the dice bowl, a city landmark, tree colours).
//
// Tile fields per map: name, kind (the business shown on the deed card) and
// sig (which rooftop icon the building gets — any key used by signature() in
// render/buildings.js). Omitted fields keep the Boomtown default.
import { TILES, DISTRICTS } from "./board.js";

const T = (name, kind, sig) => ({ name, kind, sig });

export const MAPS = {
  boomtown: {
    id: 'boomtown', name: 'בומטאון', flag: '🎲', center: 'בומטאון', tagline: 'העיירה המקורית על האי',
    landmark: 'ferris', leaves: ['#4fb561', '#5cc36b', '#3fa35a', '#72cf6a'],
  },

  israel: {
    id: 'israel', name: 'ישראל', flag: '🗺️', center: 'ישראל', tagline: 'מאילת ועד נהריה',
    landmark: 'israelflag', leaves: ['#4fa85a', '#5cb86b', '#3f9a50', '#6cc266'],
    districts: {
      rust: 'הנגב', bay: 'חוף הדרום', candy: 'הגליל', arcade: 'הצפון',
      show: 'השרון', sunny: 'השפלה', circuit: 'גוש דן', skyline: 'הערים הגדולות',
    },
    tiles: {
      1: T('באר שבע', 'שוק הבדואים', 'Food Truck'), 3: T('אילת', 'חנות פטורה ממע״מ', 'Junkyard'),
      6: T('אשקלון', 'בר חוף', 'Surf Shop'), 8: T('אשדוד', 'גלידריה על החוף', 'Ice Cream'), 9: T('יבנה', 'בית קפה', 'Café'),
      11: T('צפת', 'גלריה ובית ממתקים', 'Sweet Shop'), 13: T('נצרת', 'קונדיטוריה', 'Dessert Bar'), 14: T('טבריה', 'בוטיק על הטיילת', 'Boutique'),
      16: T('עכו', 'ארקייד בעיר העתיקה', 'Arcade'), 18: T('נהריה', 'פיצרייה', 'Pizzeria'), 19: T('חיפה', 'בר קריוקי', 'Karaoke'),
      21: T('נתניה', 'תיאטרון', 'Theatre'), 23: T('כפר סבא', 'קולנוע', 'Cinema'), 24: T('רעננה', 'מועדון סטנדאפ', 'Comedy Club'),
      26: T('ראשון לציון', 'מלון', 'Hotel'), 27: T('רחובות', 'מאפייה', 'Bakery'), 29: T('מודיעין', 'שוק איכרים', 'Market'),
      31: T('הרצליה', 'מטה הייטק', 'Tech HQ'), 32: T('פתח תקווה', 'חברת רובוטיקה', 'Robotics'), 34: T('רמת גן', 'חברת חלל', 'Aerospace'),
      37: T('ירושלים', 'מלון יוקרה', 'Casino'), 39: T('תל אביב', 'פנטהאוז', 'Penthouse'),
      5: T('נמל אשדוד'), 15: T('הרכבל במצדה'), 25: T('נתב״ג'), 35: T('רכבת ישראל'),
      12: T('טורבינות הרוח בגולן'), 28: T('הכנרת'),
    },
  },

  telaviv: {
    id: 'telaviv', name: 'תל אביב', flag: '🏖️', center: 'תל אביב', tagline: 'מהתחנה המרכזית ועד מגדלי עזריאלי',
    landmark: 'azrieli', leaves: ['#4fa85a', '#5cb86b', '#3f9a50', '#6cc266'],
    districts: {
      rust: 'דרום העיר', bay: 'החופים', candy: 'נווה צדק', arcade: 'פלורנטין',
      show: 'לב העיר', sunny: 'יפו', circuit: 'מגדלי העסקים', skyline: 'צפון העיר',
    },
    tiles: {
      1: T('התחנה המרכזית', 'דוכן פלאפל', 'Food Truck'), 3: T('שוק הפשפשים', 'חנות וינטג׳', 'Junkyard'),
      6: T('חוף גורדון', 'בר חוף', 'Surf Shop'), 8: T('חוף פרישמן', 'גלידריה', 'Ice Cream'), 9: T('חוף הילטון', 'בית קפה', 'Café'),
      11: T('מתחם התחנה', 'חנות ממתקים', 'Sweet Shop'), 13: T('רחוב שבזי', 'קונדיטוריה', 'Dessert Bar'), 14: T('רחוב שינקין', 'בוטיק', 'Boutique'),
      16: T('רחוב פלורנטין', 'ארקייד', 'Arcade'), 18: T('שוק לוינסקי', 'פיצרייה', 'Pizzeria'), 19: T('רחוב אלנבי', 'בר קריוקי', 'Karaoke'),
      21: T('הבימה', 'תיאטרון', 'Theatre'), 23: T('דיזנגוף סנטר', 'קולנוע', 'Cinema'), 24: T('כיכר רבין', 'מועדון סטנדאפ', 'Comedy Club'),
      26: T('נמל יפו', 'מלון בוטיק', 'Hotel'), 27: T('אבולעפיה', 'מאפייה', 'Bakery'), 29: T('שוק הכרמל', 'שוק', 'Market'),
      31: T('שרונה מרקט', 'מטה הייטק', 'Tech HQ'), 32: T('מגדל שלום', 'סטארטאפ', 'Robotics'), 34: T('מגדלי עזריאלי', 'חברת חלל', 'Aerospace'),
      37: T('שדרות רוטשילד', 'מועדון יוקרה', 'Casino'), 39: T('מגדלי אקירוב', 'פנטהאוז', 'Penthouse'),
      5: T('נמל תל אביב'), 15: T('הרכבת הקלה'), 25: T('נתב״ג'), 35: T('תחנת השלום'),
      12: T('תחנת הכוח רדינג'), 28: T('מגדל המים'),
    },
  },

  jerusalem: {
    id: 'jerusalem', name: 'ירושלים', flag: '🕎', center: 'ירושלים', tagline: 'ממחנה יהודה ועד גשר המיתרים',
    landmark: 'davidtower', leaves: ['#6b8e4e', '#7a9c5a', '#5d7f44', '#8aa866'],
    districts: {
      rust: 'מחנה יהודה', bay: 'עין כרם', candy: 'נחלאות', arcade: 'מרכז העיר',
      show: 'המושבה הגרמנית', sunny: 'רחביה', circuit: 'הר חוצבים', skyline: 'ממילא',
    },
    tiles: {
      1: T('שוק מחנה יהודה', 'דוכן פלאפל', 'Food Truck'), 3: T('רחוב אגריפס', 'חנות יד שנייה', 'Junkyard'),
      6: T('מעיין עין כרם', 'בית קפה', 'Café'), 8: T('גן החיות התנ״כי', 'גלידריה', 'Ice Cream'), 9: T('גן סאקר', 'דוכן מנגל', 'Food Truck'),
      11: T('סמטאות נחלאות', 'חנות ממתקים', 'Sweet Shop'), 13: T('רחוב בצלאל', 'מאפה רוגלך', 'Dessert Bar'), 14: T('שוק האמנים', 'בוטיק', 'Boutique'),
      16: T('רחוב יפו', 'ארקייד', 'Arcade'), 18: T('כיכר ציון', 'פיצרייה', 'Pizzeria'), 19: T('מדרחוב בן יהודה', 'בר קריוקי', 'Karaoke'),
      21: T('תיאטרון ירושלים', 'תיאטרון', 'Theatre'), 23: T('סינמטק ירושלים', 'קולנוע', 'Cinema'), 24: T('התחנה הראשונה', 'מועדון סטנדאפ', 'Comedy Club'),
      26: T('מלון המלך דוד', 'מלון יוקרה', 'Hotel'), 27: T('מוזיאון ישראל', 'בית קפה', 'Café'), 29: T('קניון מלחה', 'קניון', 'Market'),
      31: T('הר חוצבים', 'מטה הייטק', 'Tech HQ'), 32: T('האוניברסיטה העברית', 'מעבדת רובוטיקה', 'Robotics'), 34: T('גבעת רם', 'מכון מחקר', 'Aerospace'),
      37: T('ממילא', 'בוטיק יוקרה', 'Boutique'), 39: T('גשר המיתרים', 'פנטהאוז', 'Penthouse'),
      5: T('תחנת יצחק נבון'), 15: T('הרכבל'), 25: T('הכדור הפורח'), 35: T('הרכבת הקלה'),
      12: T('חוות הרוח'), 28: T('מגדל המים'),
    },
  },

  haifa: {
    id: 'haifa', name: 'חיפה', flag: '⚓', center: 'חיפה', tagline: 'מהנמל ועד גני הבהאים',
    landmark: 'bahai', leaves: ['#3f8f4a', '#4a9f55', '#357f40', '#5aaa5e'],
    districts: {
      rust: 'העיר התחתית', bay: 'בת גלים', candy: 'המושבה הגרמנית', arcade: 'רחוב מסדה',
      show: 'הדר', sunny: 'מרכז הכרמל', circuit: 'מת״ם', skyline: 'דניה',
    },
    tiles: {
      1: T('שוק תלפיות', 'דוכן חומוס', 'Food Truck'), 3: T('רחוב הנמל', 'מחסן גרוטאות', 'Junkyard'),
      6: T('חוף בת גלים', 'בית ספר לגלישה', 'Surf Shop'), 8: T('חוף דדו', 'גלידריה', 'Ice Cream'), 9: T('חוף השקט', 'בית קפה', 'Café'),
      11: T('המושבה הגרמנית', 'חנות ממתקים', 'Sweet Shop'), 13: T('שדרות בן גוריון', 'בר קינוחים', 'Dessert Bar'), 14: T('גרנד קניון', 'בוטיק', 'Boutique'),
      16: T('רחוב מסדה', 'בר משחקים', 'Arcade'), 18: T('ואדי ניסנאס', 'מסעדה', 'Pizzeria'), 19: T('רחוב הנביאים', 'בר קריוקי', 'Karaoke'),
      21: T('תיאטרון חיפה', 'תיאטרון', 'Theatre'), 23: T('סינמטק חיפה', 'קולנוע', 'Cinema'), 24: T('רחוב הרצל', 'מועדון סטנדאפ', 'Comedy Club'),
      26: T('מרכז הכרמל', 'מלון נוף', 'Hotel'), 27: T('שדרות מוריה', 'מאפייה', 'Bakery'), 29: T('קניון חורב', 'קניון', 'Market'),
      31: T('פארק מת״ם', 'מטה הייטק', 'Tech HQ'), 32: T('הטכניון', 'מעבדת רובוטיקה', 'Robotics'), 34: T('מגדל אשכול', 'מכון מחקר', 'Aerospace'),
      37: T('דניה', 'מועדון יוקרה', 'Casino'), 39: T('גני הבהאים', 'פנטהאוז עם נוף', 'Penthouse'),
      5: T('נמל חיפה'), 15: T('הרכבל לסטלה מאריס'), 25: T('שדה התעופה חיפה'), 35: T('הכרמלית'),
      12: T('תחנת הכוח חיפה'), 28: T('מגדל המים'),
    },
  },

  eilat: {
    id: 'eilat', name: 'אילת', flag: '🐬', center: 'אילת', tagline: 'מהמרינה ועד חוף האלמוגים',
    landmark: 'observatory', leaves: ['#8fbf4a', '#9ccc5a', '#7aa83f', '#b0d66a'],
    districts: {
      rust: 'אזור התעשייה', bay: 'חוף האלמוגים', candy: 'הטיילת', arcade: 'המרינה',
      show: 'מרכז העיר', sunny: 'החוף הצפוני', circuit: 'עיר הכוכבים', skyline: 'הלגונה',
    },
    tiles: {
      1: T('התחנה המרכזית', 'דוכן שווארמה', 'Food Truck'), 3: T('אזור התעשייה', 'מגרש גרוטאות', 'Junkyard'),
      6: T('חוף האלמוגים', 'מרכז צלילה', 'Surf Shop'), 8: T('ריף הדולפינים', 'גלידריה', 'Ice Cream'), 9: T('חוף מגדלור', 'בר חוף', 'Café'),
      11: T('הטיילת', 'חנות ממתקים', 'Sweet Shop'), 13: T('גשר המרינה', 'בר קינוחים', 'Dessert Bar'), 14: T('קניון מול הים', 'בוטיק', 'Boutique'),
      16: T('המרינה', 'ארקייד', 'Arcade'), 18: T('שדרות התמרים', 'פיצרייה', 'Pizzeria'), 19: T('רחוב התמרים', 'בר קריוקי', 'Karaoke'),
      21: T('היכל התרבות', 'תיאטרון', 'Theatre'), 23: T('אייס מול', 'קולנוע', 'Cinema'), 24: T('מרכז העיר', 'מועדון סטנדאפ', 'Comedy Club'),
      26: T('החוף הצפוני', 'מלון על הים', 'Hotel'), 27: T('קינג סיטי', 'פארק שעשועים', 'Arcade'), 29: T('שוק האיכרים', 'שוק', 'Market'),
      31: T('הקמפוס', 'מטה הייטק', 'Tech HQ'), 32: T('המצפה התת-ימי', 'מרכז מדע', 'Robotics'), 34: T('פארק תמנע', 'מרכז חלל', 'Aerospace'),
      37: T('הלגונה', 'מועדון יוקרה', 'Casino'), 39: T('מלון מלכת שבא', 'פנטהאוז', 'Penthouse'),
      5: T('נמל אילת'), 15: T('הרכבל של הרי אילת'), 25: T('נמל התעופה רמון'), 35: T('הרכבת לאילת'),
      12: T('חוות הרוח של הערבה'), 28: T('מתקן ההתפלה'),
    },
  },
};

export const MAP_LIST = Object.values(MAPS);

// Snapshot the Boomtown names so we can switch back after another map.
const BASE = {
  tiles: Object.fromEntries(TILES.map((t) => [t.index, { name: t.name, kind: t.kind || t.biz, sig: t.biz }])),
  districts: Object.fromEntries(Object.values(DISTRICTS).map((d) => [d.id, d.name])),
};

let current = 'boomtown';
export const currentMap = () => MAPS[current];

/** Rename the board in place for a map. Rules and prices never change. */
export function applyMap(id) {
  const map = MAPS[id] || MAPS.boomtown;
  current = map.id;
  for (const t of TILES) {
    const base = BASE.tiles[t.index];
    const o = map.tiles?.[t.index] || {};
    t.name = o.name || base.name;
    t.kind = o.kind || base.kind;
    t.sig = o.sig || base.sig;
  }
  for (const d of Object.values(DISTRICTS)) d.name = map.districts?.[d.id] || BASE.districts[d.id];
  return map;
}
