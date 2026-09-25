// Registry of duel minigame ids known to the rules layer. The presentation
// layer maps each id to an implementation (src/minigames/*). Adding a new
// minigame = add its id here + register its class in src/minigames/index.js.
export const DUEL_MINIGAMES = ['quickdraw', 'tug', 'sumo', 'stack'];
