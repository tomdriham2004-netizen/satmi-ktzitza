// Static board definition. Pure data — no rendering, no state.

// Districts: every property belongs to one. `shift` drives the Day & Night
// economy: day businesses charge prime rent in the Morning/Noon, night
// businesses charge prime rent at Dusk/Night.
export const DISTRICTS = {
  rust:    { id: 'rust',    name: 'סמטת החלודה',      color: '#A8704A', shift: 'night', buildCost: 50,  blurb: 'משאיות אוכל וסוחרי גרוטאות. מתעורר אחרי החשכה.' },
  bay:     { id: 'bay',     name: 'מפרץ הבריזה',      color: '#5CC8F2', shift: 'day',   buildCost: 50,  blurb: 'בקתות חוף, גלישה וגלידה אמריקאית. כסף של ימים שמשיים.' },
  candy:   { id: 'candy',   name: 'שדרת הממתקים',     color: '#FF6FAE', shift: 'day',   buildCost: 100, blurb: 'ממתקים ובוטיקים. הכי עמוס באור יום.' },
  arcade:  { id: 'arcade',  name: 'סמטת הארקייד',     color: '#FF9A3C', shift: 'night', buildCost: 100, blurb: 'ניאון, פיצה, קריוקי. ינשופי לילה משלמים יותר.' },
  show:    { id: 'show',    name: 'כיכר ההופעות',     color: '#F04A5A', shift: 'night', buildCost: 150, blurb: 'תיאטראות ובתי קולנוע. המסך עולה בשקיעה.' },
  sunny:   { id: 'sunny',   name: 'רחבת השמש',        color: '#FFC93C', shift: 'day',   buildCost: 150, blurb: 'מלונות, מאפיות ושווקים. ארוחת בוקר זה ביזנס גדול.' },
  circuit: { id: 'circuit', name: 'פארק ההייטק',      color: '#2FCF85', shift: 'day',   buildCost: 200, blurb: 'סטארטאפים ומעבדות. רק מתשע עד חמש.' },
  skyline: { id: 'skyline', name: 'רמות הרקיע',       color: '#5763E0', shift: 'night', buildCost: 200, blurb: 'מגדלי קזינו ופנטהאוזים. הימורים גבוהים, לילות ארוכים.' },
};

// rent: [kiosk, shop, store, flagship, tower, landmark]
// biz = rooftop icon key (English, never shown); kind = business type shown on the deed card.
const P = (name, district, price, rent, biz, kind) => ({ type: 'property', name, district, price, rent, biz, kind });

export const TILES = [
  { type: 'go', name: 'יום משכורת' },
  P('טורנדו טאקו', 'rust', 60, [2, 10, 30, 90, 160, 250], 'Food Truck', 'משאית אוכל'),
  { type: 'fortune', name: 'מזל' },
  P('ארמון הגרוטאות', 'rust', 60, [4, 20, 60, 180, 320, 450], 'Junkyard', 'מגרש גרוטאות'),
  { type: 'tax', name: 'ביקורת מס', amount: 200 },
  { type: 'transit', name: 'מזח המעבורת', price: 200, model: 'ferry' },
  P('בקתת הגלישה', 'bay', 100, [6, 30, 90, 270, 400, 550], 'Surf Shop', 'חנות גלישה'),
  { type: 'news', name: 'מבזק חדשות' },
  P('גלידה על הסיפון', 'bay', 100, [6, 30, 90, 270, 400, 550], 'Ice Cream', 'גלידריה'),
  P('קפה פליקן', 'bay', 120, [8, 40, 100, 300, 450, 600], 'Café', 'בית קפה'),
  { type: 'jail', name: 'הכלא' },
  P('גלריית הסוכריות', 'candy', 140, [10, 50, 150, 450, 625, 750], 'Sweet Shop', 'חנות ממתקים'),
  { type: 'utility', name: 'חוות הרוח', price: 150, model: 'wind' },
  P('אחוזת המוצ׳י', 'candy', 140, [10, 50, 150, 450, 625, 750], 'Dessert Bar', 'בר קינוחים'),
  P('בוטיק פסטל', 'candy', 160, [12, 60, 180, 500, 700, 900], 'Boutique', 'בוטיק'),
  { type: 'transit', name: 'הרכבל', price: 200, model: 'cable' },
  P('ארמון הפיקסלים', 'arcade', 180, [14, 70, 200, 550, 750, 950], 'Arcade', 'ארקייד'),
  { type: 'fortune', name: 'מזל' },
  P('מועדון המשולש', 'arcade', 180, [14, 70, 200, 550, 750, 950], 'Pizzeria', 'פיצרייה'),
  P('המיקרופון הבוער', 'arcade', 200, [16, 80, 220, 600, 800, 1000], 'Karaoke', 'קריוקי'),
  { type: 'heist', name: 'השוד' },
  P('התיאטרון הגדול', 'show', 220, [18, 90, 250, 700, 875, 1050], 'Theatre', 'תיאטרון'),
  { type: 'news', name: 'מבזק חדשות' },
  P('ארמון הפופקורן', 'show', 220, [18, 90, 250, 700, 875, 1050], 'Cinema', 'קולנוע'),
  P('בקתת הצחוקים', 'show', 240, [20, 100, 300, 750, 925, 1100], 'Comedy Club', 'מועדון סטנדאפ'),
  { type: 'transit', name: 'נמל הצפלינים', price: 200, model: 'blimp' },
  P('מלון הזריחה', 'sunny', 260, [22, 110, 330, 800, 975, 1150], 'Hotel', 'מלון'),
  P('הקרום הזהוב', 'sunny', 260, [22, 110, 330, 800, 975, 1150], 'Bakery', 'מאפייה'),
  { type: 'utility', name: 'מגדל המים', price: 150, model: 'water' },
  P('שוק האיכרים', 'sunny', 280, [24, 120, 360, 850, 1025, 1200], 'Market', 'שוק'),
  { type: 'gotojail', name: 'נתפסת!' },
  P('מעבדות הטיל', 'circuit', 300, [26, 130, 390, 900, 1100, 1275], 'Aerospace', 'תעופה וחלל'),
  P('מגדל הבייט', 'circuit', 300, [26, 130, 390, 900, 1100, 1275], 'Tech HQ', 'מטה הייטק'),
  { type: 'fortune', name: 'מזל' },
  P('מוסך הגאדג׳טים', 'circuit', 320, [28, 150, 450, 1000, 1200, 1400], 'Robotics', 'רובוטיקה'),
  { type: 'transit', name: 'המונורייל', price: 200, model: 'monorail' },
  { type: 'news', name: 'מבזק חדשות' },
  P('קזינו אור הכוכבים', 'skyline', 350, [35, 175, 500, 1100, 1300, 1500], 'Casino', 'קזינו'),
  { type: 'tax', name: 'מס מותרות', amount: 100 },
  P('הפנטהאוז', 'skyline', 400, [50, 200, 600, 1400, 1700, 2000], 'Penthouse', 'פנטהאוז'),
];

TILES.forEach((t, i) => { t.index = i; });

export const BOARD_SIZE = TILES.length;
export const JAIL_INDEX = 10;
export const HEIST_INDEX = 20;
export const GOTOJAIL_INDEX = 30;

export const isOwnable = (t) => t.type === 'property' || t.type === 'transit' || t.type === 'utility';
export const OWNABLE_INDICES = TILES.filter(isOwnable).map((t) => t.index);
export const districtTiles = (d) => TILES.filter((t) => t.district === d).map((t) => t.index);
export const TRANSIT_INDICES = TILES.filter((t) => t.type === 'transit').map((t) => t.index);
export const UTILITY_INDICES = TILES.filter((t) => t.type === 'utility').map((t) => t.index);

export function tilePrice(t) { return t.price || 0; }
export function tileColor(t) {
  if (t.type === 'property') return DISTRICTS[t.district].color;
  if (t.type === 'transit') return '#8C93A8';
  if (t.type === 'utility') return '#63B7C9';
  return '#E9DFC9';
}
