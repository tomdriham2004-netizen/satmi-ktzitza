// Playable characters. The visual model is built in render/characters.js from
// these descriptors; the game layer only needs names and colors.
export const ROSTER = [
  { id: 'rex',    name: 'רקס המלך',     color: '#8A63FF', accent: '#FFD24A', hat: 'crown',     bio: 'נולד עשיר. רוצה להיות עשיר יותר.' },
  { id: 'tina',   name: 'טינה טורבו',   color: '#FF4D5E', accent: '#FFFFFF', hat: 'goggles',   bio: 'אף פעם לא בולמת. גם לא בשביל שכירות.' },
  { id: 'cap',    name: 'קפטן צדפה',    color: '#2FA8FF', accent: '#FFFFFF', hat: 'sailor',    bio: 'הגיע עם המעבורת. אף פעם לא עזב.' },
  { id: 'pepper', name: 'שף פלפל',      color: '#FF9A2E', accent: '#FFFFFF', hat: 'chef',      bio: 'מבשל טאקו. וגם את הספרים.' },
  { id: 'dollar', name: 'דוקטור דולר',  color: '#22C98B', accent: '#1E2230', hat: 'tophat',    bio: 'דוקטורט בהשתלטויות עוינות.' },
  { id: 'bolt',   name: 'בולט',         color: '#FFCC1F', accent: '#3B8BFF', hat: 'propeller', bio: 'רובוט קטנטן. שאפתנות ענקית.' },
];

export const rosterById = (id) => ROSTER.find((c) => c.id === id) || ROSTER[0];
