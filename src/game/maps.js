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
    id: 'boomtown', name: 'Boomtown', flag: '🎲', center: 'BOOMTOWN', tagline: 'The original island town',
    landmark: 'ferris', leaves: ['#4fb561', '#5cc36b', '#3fa35a', '#72cf6a'],
  },

  newyork: {
    id: 'newyork', name: 'New York', flag: '🗽', center: 'NEW YORK', tagline: 'From the Bronx to Park Avenue',
    landmark: 'empire', leaves: ['#4fa85a', '#5cb86b', '#3f9a50', '#6cc266'],
    districts: {
      rust: 'The Bronx', bay: 'Brooklyn', candy: 'Queens', arcade: 'Harlem',
      show: 'Theater District', sunny: 'Midtown', circuit: 'Downtown', skyline: 'Upper East Side',
    },
    tiles: {
      1: T('Arthur Avenue', 'Italian Deli', 'Pizzeria'), 3: T('Grand Concourse', 'Diner', 'Food Truck'),
      6: T('Coney Island', 'Boardwalk Fries', 'Ice Cream'), 8: T('DUMBO', 'Coffee Roaster', 'Café'), 9: T('Williamsburg', 'Record Store', 'Karaoke'),
      11: T('Astoria', 'Greek Bakery', 'Bakery'), 13: T('Flushing', 'Dumpling House', 'Dessert Bar'), 14: T('Jackson Heights', 'Spice Market', 'Market'),
      16: T('Lenox Avenue', 'Jazz Club', 'Karaoke'), 18: T('125th Street', 'Soul Food', 'Food Truck'), 19: T('Sugar Hill', 'Supper Club', 'Theatre'),
      21: T('Broadway', 'Musical Theatre', 'Theatre'), 23: T('42nd Street', 'Movie Palace', 'Cinema'), 24: T('Times Square', 'Mega Arcade', 'Arcade'),
      26: T('Rockefeller Plaza', 'Grand Hotel', 'Hotel'), 27: T('Madison Avenue', 'Ad Agency', 'Boutique'), 29: T('Bryant Park', 'Winter Market', 'Market'),
      31: T('SoHo', 'Gallery', 'Boutique'), 32: T('Tribeca', 'Film Studio', 'Cinema'), 34: T('Wall Street', 'Stock Exchange', 'Tech HQ'),
      37: T('Fifth Avenue', 'Flagship Store', 'Boutique'), 39: T('Park Avenue', 'Penthouse', 'Penthouse'),
      5: T('South Street Ferry'), 15: T('Roosevelt Tramway'), 25: T('JFK Airport'), 35: T('Grand Central'),
      12: T('Hudson Wind Farm'), 28: T('Rooftop Water Tower'),
    },
  },

  london: {
    id: 'london', name: 'London', flag: '🎡', center: 'LONDON', tagline: 'Brick Lane to Mayfair',
    landmark: 'clocktower', leaves: ['#3f8f4a', '#4a9f55', '#357f40', '#5aaa5e'],
    districts: {
      rust: 'East End', bay: 'Camden', candy: 'Notting Hill', arcade: 'Soho',
      show: 'West End', sunny: 'Kensington', circuit: 'The City', skyline: 'Mayfair',
    },
    tiles: {
      1: T('Brick Lane', 'Bagel Shop', 'Bakery'), 3: T('Whitechapel Road', 'Pie & Mash', 'Food Truck'),
      6: T('Camden Market', 'Street Food', 'Food Truck'), 8: T('Chalk Farm', 'Vinyl Shop', 'Karaoke'), 9: T('Primrose Hill', 'Tea Room', 'Café'),
      11: T('Portobello Road', 'Antiques', 'Junkyard'), 13: T('Ladbroke Grove', 'Carnival Bar', 'Dessert Bar'), 14: T('Holland Park', 'Boutique', 'Boutique'),
      16: T('Carnaby Street', 'Fashion House', 'Boutique'), 18: T('Wardour Street', 'Games Café', 'Arcade'), 19: T('Old Compton Street', 'Cabaret', 'Karaoke'),
      21: T('Leicester Square', 'Premiere Cinema', 'Cinema'), 23: T('Piccadilly Circus', 'Neon Arcade', 'Arcade'), 24: T('Covent Garden', 'Opera House', 'Theatre'),
      26: T('Knightsbridge', 'Department Store', 'Hotel'), 27: T('South Kensington', 'Museum Café', 'Café'), 29: T('Chelsea', 'Flower Market', 'Market'),
      31: T('Canary Wharf', 'Trading Floor', 'Tech HQ'), 32: T('Bank', 'Gold Vault', 'Casino'), 34: T('Threadneedle Street', 'Fintech HQ', 'Robotics'),
      37: T('Park Lane', 'Grand Hotel', 'Casino'), 39: T('Mayfair', 'Private Club', 'Penthouse'),
      5: T('Thames Clipper'), 15: T('Thames Cable Car'), 25: T('Heathrow'), 35: T('The Tube'),
      12: T('Thames Wind Farm'), 28: T('Waterworks'),
    },
  },

  paris: {
    id: 'paris', name: 'Paris', flag: '🥐', center: 'PARIS', tagline: 'Belleville to the Champs-Élysées',
    landmark: 'eiffel', leaves: ['#5aa55a', '#6ab56a', '#4a954e', '#7cbf6e'],
    districts: {
      rust: 'Belleville', bay: 'Canal Saint-Martin', candy: 'Le Marais', arcade: 'Montmartre',
      show: 'Opéra', sunny: 'Saint-Germain', circuit: 'La Défense', skyline: 'Champs-Élysées',
    },
    tiles: {
      1: T('Rue de Belleville', 'Bistro', 'Food Truck'), 3: T('Rue Oberkampf', 'Wine Bar', 'Junkyard'),
      6: T('Quai de Valmy', 'Canal Café', 'Café'), 8: T('Quai de Jemmapes', 'Gelato', 'Ice Cream'), 9: T('Rue Beaurepaire', 'Concept Store', 'Surf Shop'),
      11: T('Rue des Rosiers', 'Falafel', 'Food Truck'), 13: T('Place des Vosges', 'Pâtisserie', 'Dessert Bar'), 14: T('Rue Vieille du Temple', 'Boutique', 'Boutique'),
      16: T('Place du Tertre', 'Painters’ Studio', 'Theatre'), 18: T('Rue Lepic', 'Crêperie', 'Bakery'), 19: T('Pigalle', 'Cabaret', 'Karaoke'),
      21: T('Place de l’Opéra', 'Opera House', 'Theatre'), 23: T('Boulevard des Capucines', 'Cinéma', 'Cinema'), 24: T('Grands Boulevards', 'Comedy Club', 'Comedy Club'),
      26: T('Boulevard Saint-Germain', 'Grand Hôtel', 'Hotel'), 27: T('Rue de Buci', 'Boulangerie', 'Bakery'), 29: T('Jardin du Luxembourg', 'Marché', 'Market'),
      31: T('Esplanade de la Défense', 'Tech Campus', 'Tech HQ'), 32: T('Grande Arche', 'Aerospace HQ', 'Aerospace'), 34: T('Courbevoie', 'Robotics Lab', 'Robotics'),
      37: T('Avenue Montaigne', 'Haute Couture', 'Boutique'), 39: T('Champs-Élysées', 'Palace Hotel', 'Penthouse'),
      5: T('Bateaux-Mouches'), 15: T('Funiculaire'), 25: T('Ballon de Paris'), 35: T('Le Métro'),
      12: T('Éoliennes'), 28: T('Château d’Eau'),
    },
  },

  tokyo: {
    id: 'tokyo', name: 'Tokyo', flag: '🗼', center: 'TOKYO', tagline: 'Asakusa to Ginza',
    landmark: 'tokyotower', leaves: ['#ffb7d1', '#ffc8dc', '#f59ec0', '#9ed7a0'],
    districts: {
      rust: 'Asakusa', bay: 'Odaiba', candy: 'Harajuku', arcade: 'Akihabara',
      show: 'Shinjuku', sunny: 'Ueno', circuit: 'Shibuya', skyline: 'Ginza',
    },
    tiles: {
      1: T('Kappabashi', 'Kitchenware', 'Junkyard'), 3: T('Nakamise-dori', 'Snack Stall', 'Food Truck'),
      6: T('Odaiba Beach', 'Surf Rental', 'Surf Shop'), 8: T('Tokyo Bay', 'Soft-serve', 'Ice Cream'), 9: T('Rainbow Bridge', 'Kissaten', 'Café'),
      11: T('Takeshita Street', 'Crêpe Stand', 'Dessert Bar'), 13: T('Cat Street', 'Candy Shop', 'Sweet Shop'), 14: T('Omotesando', 'Flagship Boutique', 'Boutique'),
      16: T('Chuo-dori', 'Game Center', 'Arcade'), 18: T('Electric Town', 'Gadget Shop', 'Robotics'), 19: T('Kanda', 'Karaoke Box', 'Karaoke'),
      21: T('Kabukicho', 'Kabuki Theatre', 'Theatre'), 23: T('Golden Gai', 'Tiny Bar', 'Comedy Club'), 24: T('Shinjuku-dori', 'Cinema Tower', 'Cinema'),
      26: T('Ameyoko', 'Street Market', 'Market'), 27: T('Ueno Park', 'Tea House', 'Café'), 29: T('Yanaka', 'Bakery', 'Bakery'),
      31: T('Shibuya Crossing', 'Media Tower', 'Tech HQ'), 32: T('Dogenzaka', 'Ramen Bar', 'Food Truck'), 34: T('Center Gai', 'Robot Café', 'Robotics'),
      37: T('Roppongi Hills', 'Sky Casino', 'Casino'), 39: T('Ginza', 'Luxury Tower', 'Penthouse'),
      5: T('Water Bus'), 15: T('Ropeway'), 25: T('Haneda'), 35: T('Yamanote Line'),
      12: T('Wind Farm'), 28: T('Water Tower'),
    },
  },
};

export const MAP_LIST = Object.values(MAPS);

// Snapshot the Boomtown names so we can switch back after another map.
const BASE = {
  tiles: Object.fromEntries(TILES.map((t) => [t.index, { name: t.name, kind: t.biz, sig: t.biz }])),
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
