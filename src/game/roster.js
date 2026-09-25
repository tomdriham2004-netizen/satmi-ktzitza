// Playable characters. The visual model is built in render/characters.js from
// these descriptors; the game layer only needs names and colors.
export const ROSTER = [
  { id: 'rex',    name: 'Rex Royale',   color: '#8A63FF', accent: '#FFD24A', hat: 'crown',     bio: 'Born rich. Wants to be richer.' },
  { id: 'tina',   name: 'Tina Turbo',   color: '#FF4D5E', accent: '#FFFFFF', hat: 'goggles',   bio: 'Never brakes. Not even for rent.' },
  { id: 'cap',    name: 'Cap\'n Clam',  color: '#2FA8FF', accent: '#FFFFFF', hat: 'sailor',    bio: 'Sailed in on a ferry. Never left.' },
  { id: 'pepper', name: 'Chef Pepper',  color: '#FF9A2E', accent: '#FFFFFF', hat: 'chef',      bio: 'Cooks the books and the tacos.' },
  { id: 'dollar', name: 'Dr. Dollar',   color: '#22C98B', accent: '#1E2230', hat: 'tophat',    bio: 'PhD in hostile takeovers.' },
  { id: 'bolt',   name: 'Bolt',         color: '#FFCC1F', accent: '#3B8BFF', hat: 'propeller', bio: 'Tiny robot. Enormous ambition.' },
];

export const rosterById = (id) => ROSTER.find((c) => c.id === id) || ROSTER[0];
