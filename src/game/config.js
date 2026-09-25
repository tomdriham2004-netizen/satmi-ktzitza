// Every tunable number in one place. Change the feel of the game from here.
export const CONFIG = {
  startingCash: 1500,
  salary: 200,
  exactPaydayBonus: 200,     // landing exactly on PAYDAY pays a second salary
  jailBail: 50,
  maxJailTurns: 3,

  // Twist: Double-or-Nothing rent duels
  duelLossMultiplier: 2,

  // Twist: Hostile Takeover (force-buy a rival lot)
  takeoverMultiplier: 2,

  // Twist: Day & Night economy
  primeTimeMultiplier: 1.5,
  offHoursMultiplier: 0.75,

  // Twist: Bounty on the runaway leader
  bountyMinRound: 3,
  bountyLeadRatio: 1.25,     // leader must be 25% ahead of 2nd place (net worth)
  bountyStart: 150,
  bountyGrowth: 75,
  bountyMax: 750,

  // Twist: The Vault jackpot
  vaultSeed: 100,

  // Building
  maxLevel: 5,               // 5 = Landmark
  levelsWithoutSet: 3,       // levels 4-5 need the whole district
  setRentMultiplier: 1.5,
  sellRatio: 0.5,
  mortgageRatio: 0.5,
  unmortgageRatio: 0.55,

  // Hype (News cards)
  hypeRounds: 3,
};

export const TIME_PHASES = [
  { id: 'morning', name: 'Morning', icon: '☀', short: 'AM' },
  { id: 'noon', name: 'High Noon', icon: '☀', short: 'NOON' },
  { id: 'dusk', name: 'Dusk', icon: '☾', short: 'DUSK' },
  { id: 'night', name: 'Night', icon: '☾', short: 'NIGHT' },
];

export const LEVEL_NAMES = ['Kiosk', 'Shop', 'Store', 'Flagship', 'Tower', 'Landmark'];
