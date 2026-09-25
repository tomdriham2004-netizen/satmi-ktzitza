// Minigame registry: id → class. Add new duels here (and to src/game/minigames.js).
import { QuickDraw } from "./quickdraw.js";
import { Tug } from "./tug.js";
import { Sumo } from "./sumo.js";
import { Stack } from "./stack.js";

export const MINIGAMES = Object.fromEntries([QuickDraw, Tug, Sumo, Stack].map((G) => [G.meta.id, G]));
