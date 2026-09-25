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

  newyork: {
    id: 'newyork', name: 'ניו יורק', flag: '🗽', center: 'ניו יורק', tagline: 'מהברונקס ועד פארק אווניו',
    landmark: 'empire', leaves: ['#4fa85a', '#5cb86b', '#3f9a50', '#6cc266'],
    districts: {
      rust: 'הברונקס', bay: 'ברוקלין', candy: 'קווינס', arcade: 'הארלם',
      show: 'רובע התיאטראות', sunny: 'מידטאון', circuit: 'דאונטאון', skyline: 'אפר איסט סייד',
    },
    tiles: {
      1: T('שדרת ארתור', 'מעדנייה איטלקית', 'Pizzeria'), 3: T('גרנד קונקורס', 'דיינר', 'Food Truck'),
      6: T('קוני איילנד', 'צ׳יפס על הטיילת', 'Ice Cream'), 8: T('דאמבו', 'בית קלייה', 'Café'), 9: T('ויליאמסבורג', 'חנות תקליטים', 'Karaoke'),
      11: T('אסטוריה', 'מאפייה יוונית', 'Bakery'), 13: T('פלאשינג', 'בית כופתאות', 'Dessert Bar'), 14: T('ג׳קסון הייטס', 'שוק תבלינים', 'Market'),
      16: T('שדרת לנוקס', 'מועדון ג׳אז', 'Karaoke'), 18: T('הרחוב ה-125', 'אוכל דרומי', 'Food Truck'), 19: T('שוגר היל', 'מועדון ערב', 'Theatre'),
      21: T('ברודווי', 'תיאטרון מחזות זמר', 'Theatre'), 23: T('הרחוב ה-42', 'היכל קולנוע', 'Cinema'), 24: T('טיימס סקוור', 'מגה ארקייד', 'Arcade'),
      26: T('רוקפלר פלאזה', 'גרנד הוטל', 'Hotel'), 27: T('מדיסון אווניו', 'משרד פרסום', 'Boutique'), 29: T('בראיינט פארק', 'שוק חורף', 'Market'),
      31: T('סוהו', 'גלריה', 'Boutique'), 32: T('טרייבקה', 'אולפן קולנוע', 'Cinema'), 34: T('וול סטריט', 'הבורסה', 'Tech HQ'),
      37: T('השדרה החמישית', 'חנות דגל', 'Boutique'), 39: T('פארק אווניו', 'פנטהאוז', 'Penthouse'),
      5: T('מעבורת סאות׳ סטריט'), 15: T('רכבל רוזוולט'), 25: T('נמל התעופה JFK'), 35: T('גרנד סנטרל'),
      12: T('חוות הרוח של ההדסון'), 28: T('מגדל המים על הגג'),
    },
  },

  london: {
    id: 'london', name: 'לונדון', flag: '🎡', center: 'לונדון', tagline: 'מבריק ליין ועד מייפייר',
    landmark: 'clocktower', leaves: ['#3f8f4a', '#4a9f55', '#357f40', '#5aaa5e'],
    districts: {
      rust: 'איסט אנד', bay: 'קמדן', candy: 'נוטינג היל', arcade: 'סוהו',
      show: 'ווסט אנד', sunny: 'קנזינגטון', circuit: 'הסיטי', skyline: 'מייפייר',
    },
    tiles: {
      1: T('בריק ליין', 'חנות בייגלס', 'Bakery'), 3: T('וייטצ׳אפל רואד', 'פאי ופירה', 'Food Truck'),
      6: T('שוק קמדן', 'אוכל רחוב', 'Food Truck'), 8: T('צ׳וק פארם', 'חנות תקליטים', 'Karaoke'), 9: T('פרימרוז היל', 'חדר תה', 'Café'),
      11: T('פורטובלו רואד', 'עתיקות', 'Junkyard'), 13: T('לדברוק גרוב', 'בר קרנבל', 'Dessert Bar'), 14: T('הולנד פארק', 'בוטיק', 'Boutique'),
      16: T('רחוב קרנבי', 'בית אופנה', 'Boutique'), 18: T('רחוב וורדור', 'קפה גיימינג', 'Arcade'), 19: T('אולד קומפטון', 'קברט', 'Karaoke'),
      21: T('לסטר סקוור', 'קולנוע בכורות', 'Cinema'), 23: T('פיקדילי סירקוס', 'ארקייד ניאון', 'Arcade'), 24: T('קובנט גארדן', 'בית אופרה', 'Theatre'),
      26: T('נייטסברידג׳', 'כלבו', 'Hotel'), 27: T('סאות׳ קנזינגטון', 'קפה המוזיאון', 'Café'), 29: T('צ׳לסי', 'שוק פרחים', 'Market'),
      31: T('קנרי וורף', 'אולם מסחר', 'Tech HQ'), 32: T('בנק', 'כספת זהב', 'Casino'), 34: T('ת׳רדנידל סטריט', 'מטה פינטק', 'Robotics'),
      37: T('פארק ליין', 'גרנד הוטל', 'Casino'), 39: T('מייפייר', 'מועדון פרטי', 'Penthouse'),
      5: T('מעבורת התמזה'), 15: T('רכבל התמזה'), 25: T('הית׳רו'), 35: T('הרכבת התחתית'),
      12: T('חוות הרוח של התמזה'), 28: T('מפעל המים'),
    },
  },

  paris: {
    id: 'paris', name: 'פריז', flag: '🥐', center: 'פריז', tagline: 'מבלוויל ועד השאנז אליזה',
    landmark: 'eiffel', leaves: ['#5aa55a', '#6ab56a', '#4a954e', '#7cbf6e'],
    districts: {
      rust: 'בלוויל', bay: 'תעלת סן מרטן', candy: 'לה מארה', arcade: 'מונמרטר',
      show: 'האופרה', sunny: 'סן ז׳רמן', circuit: 'לה דפאנס', skyline: 'שאנז אליזה',
    },
    tiles: {
      1: T('רחוב בלוויל', 'ביסטרו', 'Food Truck'), 3: T('רחוב אוברקמף', 'בר יין', 'Junkyard'),
      6: T('רציף ולמי', 'קפה התעלה', 'Café'), 8: T('רציף ז׳מאפ', 'ג׳לטו', 'Ice Cream'), 9: T('רחוב בורפר', 'חנות קונספט', 'Surf Shop'),
      11: T('רחוב הרוזייה', 'פלאפל', 'Food Truck'), 13: T('כיכר הווז׳', 'פטיסרי', 'Dessert Bar'), 14: T('רחוב דו טמפל', 'בוטיק', 'Boutique'),
      16: T('כיכר דו טרטר', 'סטודיו לציירים', 'Theatre'), 18: T('רחוב לפיק', 'קרפרי', 'Bakery'), 19: T('פיגאל', 'קברט', 'Karaoke'),
      21: T('כיכר האופרה', 'בית אופרה', 'Theatre'), 23: T('שדרות הקפוצ׳ינים', 'קולנוע', 'Cinema'), 24: T('השדרות הגדולות', 'מועדון סטנדאפ', 'Comedy Club'),
      26: T('שדרות סן ז׳רמן', 'גרנד הוטל', 'Hotel'), 27: T('רחוב ביוסי', 'בולנז׳רי', 'Bakery'), 29: T('גני לוקסמבורג', 'שוק', 'Market'),
      31: T('אספלנדת לה דפאנס', 'קמפוס הייטק', 'Tech HQ'), 32: T('הקשת הגדולה', 'מטה תעופה וחלל', 'Aerospace'), 34: T('קורבבואה', 'מעבדת רובוטיקה', 'Robotics'),
      37: T('שדרת מונטן', 'אופנה עילית', 'Boutique'), 39: T('שאנז אליזה', 'מלון ארמון', 'Penthouse'),
      5: T('ספינות הסן'), 15: T('הפוניקולר'), 25: T('הכדור הפורח של פריז'), 35: T('המטרו'),
      12: T('טורבינות הרוח'), 28: T('מגדל המים'),
    },
  },

  tokyo: {
    id: 'tokyo', name: 'טוקיו', flag: '🗼', center: 'טוקיו', tagline: 'מאסקוסה ועד גינזה',
    landmark: 'tokyotower', leaves: ['#ffb7d1', '#ffc8dc', '#f59ec0', '#9ed7a0'],
    districts: {
      rust: 'אסקוסה', bay: 'אודאיבה', candy: 'הרג׳וקו', arcade: 'אקיהברה',
      show: 'שינג׳וקו', sunny: 'אואנו', circuit: 'שיבויה', skyline: 'גינזה',
    },
    tiles: {
      1: T('קאפאבאשי', 'כלי מטבח', 'Junkyard'), 3: T('נאקאמיסה דורי', 'דוכן חטיפים', 'Food Truck'),
      6: T('חוף אודאיבה', 'השכרת גלשנים', 'Surf Shop'), 8: T('מפרץ טוקיו', 'גלידה אמריקאית', 'Ice Cream'), 9: T('גשר הקשת', 'קיסאטן', 'Café'),
      11: T('רחוב טאקשיטה', 'דוכן קרפים', 'Dessert Bar'), 13: T('רחוב החתול', 'חנות ממתקים', 'Sweet Shop'), 14: T('אומוטסנדו', 'בוטיק דגל', 'Boutique'),
      16: T('צ׳ואו דורי', 'מרכז משחקים', 'Arcade'), 18: T('עיר החשמל', 'חנות גאדג׳טים', 'Robotics'), 19: T('קנדה', 'תא קריוקי', 'Karaoke'),
      21: T('קאבוקיצ׳ו', 'תיאטרון קאבוקי', 'Theatre'), 23: T('גולדן גאי', 'בר זעיר', 'Comedy Club'), 24: T('שינג׳וקו דורי', 'מגדל קולנוע', 'Cinema'),
      26: T('אמיוקו', 'שוק רחוב', 'Market'), 27: T('פארק אואנו', 'בית תה', 'Café'), 29: T('יאנאקה', 'מאפייה', 'Bakery'),
      31: T('צומת שיבויה', 'מגדל מדיה', 'Tech HQ'), 32: T('דוגנזקה', 'בר ראמן', 'Food Truck'), 34: T('סנטר גאי', 'קפה רובוטים', 'Robotics'),
      37: T('רופונגי הילס', 'קזינו בשחקים', 'Casino'), 39: T('גינזה', 'מגדל יוקרה', 'Penthouse'),
      5: T('אוטובוס המים'), 15: T('רכבל'), 25: T('הנדה'), 35: T('קו יאמאנוטה'),
      12: T('חוות הרוח'), 28: T('מגדל המים'),
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
