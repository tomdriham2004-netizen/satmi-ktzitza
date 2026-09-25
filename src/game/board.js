// Static board definition. Pure data — no rendering, no state.

// Districts: every property belongs to one. `shift` drives the Day & Night
// economy: day businesses charge prime rent in the Morning/Noon, night
// businesses charge prime rent at Dusk/Night.
export const DISTRICTS = {
  rust:    { id: 'rust',    name: 'Rust Row',         color: '#A8704A', shift: 'night', buildCost: 50,  blurb: 'Food trucks & junk dealers. Comes alive after dark.' },
  bay:     { id: 'bay',     name: 'Breezy Bay',       color: '#5CC8F2', shift: 'day',   buildCost: 50,  blurb: 'Beach huts, surf and soft-serve. Sunny-day money.' },
  candy:   { id: 'candy',   name: 'Candy Lane',       color: '#FF6FAE', shift: 'day',   buildCost: 100, blurb: 'Sweets and boutiques. Busiest in the daylight.' },
  arcade:  { id: 'arcade',  name: 'Arcade Alley',     color: '#FF9A3C', shift: 'night', buildCost: 100, blurb: 'Neon, pizza, karaoke. Night owls pay extra.' },
  show:    { id: 'show',    name: 'Showtime Square',  color: '#F04A5A', shift: 'night', buildCost: 150, blurb: 'Theatres and cinemas. Curtain up at dusk.' },
  sunny:   { id: 'sunny',   name: 'Sunny Plaza',      color: '#FFC93C', shift: 'day',   buildCost: 150, blurb: 'Hotels, bakeries, markets. Breakfast is big business.' },
  circuit: { id: 'circuit', name: 'Circuit Park',     color: '#2FCF85', shift: 'day',   buildCost: 200, blurb: 'Startups and labs. Strictly nine-to-five.' },
  skyline: { id: 'skyline', name: 'Skyline Heights',  color: '#5763E0', shift: 'night', buildCost: 200, blurb: 'Casino towers and penthouses. High rollers, late nights.' },
};

// rent: [kiosk, shop, store, flagship, tower, landmark]
const P = (name, district, price, rent, biz) => ({ type: 'property', name, district, price, rent, biz });

export const TILES = [
  { type: 'go', name: 'PAYDAY' },
  P('Taco Tornado', 'rust', 60, [2, 10, 30, 90, 160, 250], 'Food Truck'),
  { type: 'fortune', name: 'Fortune' },
  P('Scrap Palace', 'rust', 60, [4, 20, 60, 180, 320, 450], 'Junkyard'),
  { type: 'tax', name: 'Tax Audit', amount: 200 },
  { type: 'transit', name: 'Ferry Pier', price: 200, model: 'ferry' },
  P('Surf Shack', 'bay', 100, [6, 30, 90, 270, 400, 550], 'Surf Shop'),
  { type: 'news', name: 'Breaking News' },
  P('Scoops Ahoy', 'bay', 100, [6, 30, 90, 270, 400, 550], 'Ice Cream'),
  P('Pelican Café', 'bay', 120, [8, 40, 100, 300, 450, 600], 'Café'),
  { type: 'jail', name: 'The Slammer' },
  P('Gumdrop Gallery', 'candy', 140, [10, 50, 150, 450, 625, 750], 'Sweet Shop'),
  { type: 'utility', name: 'Wind Farm', price: 150, model: 'wind' },
  P('Mochi Mansion', 'candy', 140, [10, 50, 150, 450, 625, 750], 'Dessert Bar'),
  P('Pastel Boutique', 'candy', 160, [12, 60, 180, 500, 700, 900], 'Boutique'),
  { type: 'transit', name: 'Cable Car', price: 200, model: 'cable' },
  P('Pixel Palace', 'arcade', 180, [14, 70, 200, 550, 750, 950], 'Arcade'),
  { type: 'fortune', name: 'Fortune' },
  P('Slice Society', 'arcade', 180, [14, 70, 200, 550, 750, 950], 'Pizzeria'),
  P('Mic Drop', 'arcade', 200, [16, 80, 220, 600, 800, 1000], 'Karaoke'),
  { type: 'heist', name: 'The Heist' },
  P('Grand Marquee', 'show', 220, [18, 90, 250, 700, 875, 1050], 'Theatre'),
  { type: 'news', name: 'Breaking News' },
  P('Popcorn Palace', 'show', 220, [18, 90, 250, 700, 875, 1050], 'Cinema'),
  P('Chuckle Hut', 'show', 240, [20, 100, 300, 750, 925, 1100], 'Comedy Club'),
  { type: 'transit', name: 'Blimp Port', price: 200, model: 'blimp' },
  P('Sunrise Hotel', 'sunny', 260, [22, 110, 330, 800, 975, 1150], 'Hotel'),
  P('Golden Crust', 'sunny', 260, [22, 110, 330, 800, 975, 1150], 'Bakery'),
  { type: 'utility', name: 'Aqua Tower', price: 150, model: 'water' },
  P('Farmers Market', 'sunny', 280, [24, 120, 360, 850, 1025, 1200], 'Market'),
  { type: 'gotojail', name: 'Busted!' },
  P('Rocket Labs', 'circuit', 300, [26, 130, 390, 900, 1100, 1275], 'Aerospace'),
  P('Byte Tower', 'circuit', 300, [26, 130, 390, 900, 1100, 1275], 'Tech HQ'),
  { type: 'fortune', name: 'Fortune' },
  P('Gadget Garage', 'circuit', 320, [28, 150, 450, 1000, 1200, 1400], 'Robotics'),
  { type: 'transit', name: 'Monorail', price: 200, model: 'monorail' },
  { type: 'news', name: 'Breaking News' },
  P('Starlight Casino', 'skyline', 350, [35, 175, 500, 1100, 1300, 1500], 'Casino'),
  { type: 'tax', name: 'Luxury Tax', amount: 100 },
  P('The Penthouse', 'skyline', 400, [50, 200, 600, 1400, 1700, 2000], 'Penthouse'),
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
