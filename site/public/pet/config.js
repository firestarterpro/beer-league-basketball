// Masco-Pet settings. Change the numbers here to tune the game; no other code changes needed.
// The commissioner can also override most of these live from /pet-desk (no deploy needed).
//
// New team or new pet art: save a square PNG with a see-through background as
// /pet/sprites/<abv>.png (team abbreviation in lowercase, e.g. tm7.png). A team with
// no art yet gets a basketball stand-in. Extra animation frames are optional, see `frames`.
window.PET_CONFIG = {
  // true = the pet shows on every page for everyone.
  // While it's false you can still preview it: add ?pet=on to any page URL (?pet=off to stop).
  enabled: true,

  // The four meters (names and emoji on screen). Saved under the old keys, so pets carry over.
  // Agility or Poise at 0 = Benched. Dunking never drops; filling it = max level (Super Saiyan).
  meters: {
    hunger: { icon: "⛹️", label: "Agility" },
    happy:  { icon: "🥷", label: "Poise" },
    energy: { icon: "👋", label: "Shooting" },
    power:  { icon: "🤾", label: "Dunking" },
  },

  // Meter points lost per real-world hour.
  decayPerHour: { hunger: 4, happy: 4, energy: 2 },

  // Dunking never decays. Reaching this is "max level".
  maxPower: 100,

  // 🪙 Tokens are what you spend on the Balling buttons. Refilled to `daily` each local
  // midnight (never above `max`). The free-token button in Earn-Points gives 1 every
  // `freeCooldownMin` minutes (0 = any time).
  // floor: a pet that hits 0 tokens gets this many back right away, so it can always keep playing (0 = off).
  tokens: { daily: 20, max: 30, freeCooldownMin: 0, floor: 5 },

  // The Balling buttons: what each costs in 🪙 and what it does. fx raises or lowers the meters
  // (hunger = Agility, happy = Poise, energy = Shooting, power = Dunking) and `points` = 🏀 points earned.
  // `needs` = minimum meter levels to do it. Buttons show in this order.
  actions: {
    agility:  { label: "Agility",  icon: "⛹️", cost: 1, anim: "dribble", fx: { hunger: 25, energy: -5, points: 3 } },
    poise:    { label: "Poise",    icon: "🥷", cost: 1, anim: "poise",   fx: { happy: 25, hunger: -5, points: 3 } },
    shooting: { label: "Shooting", icon: "👋", cost: 2, anim: "shoot",   fx: { energy: 25, happy: -5, points: 5 } },
    dunking:  { label: "Dunking",  icon: "🤾", cost: 3, anim: "dunk",    fx: { power: 15, hunger: -15, energy: -15, happy: -5, points: 8 }, needs: { hunger: 25 } },
    laps:     { label: "Run Laps", icon: "🤸", cost: 1, anim: "laps",    fx: { hunger: 20, energy: 10, points: 1 } },
    timeout:  { label: "Time Out", icon: "🙋", cost: 1, anim: "rest",    fx: { happy: 20, energy: 10, points: 1 } },
  },

  // Agility or Poise at 0 = Benched: the masco-pet is sent back to the egg and rehatches
  // brand new (meters and trivia level reset; a fresh daily token balance). 🏀 points are kept.

  // Animation speed, ms per frame.
  frameMs: 250,

  // Real animation frames, once the art exists. Files are /pet/sprites/<abv>_<anim>_<n>.png.
  // Example: flag: { idle: 2, dribble: 3, shoot: 3, dunk: 3, poise: 2, rest: 2, benched: 1 }
  // Anything not listed uses the main sprite with a code-made animation.
  frames: {},

  // Multiplies every Dunking gain. Raise it (e.g. 1.5) to help everyone reach max level sooner.
  powerBoost: 1,

  // Hoops Trivia: unlimited questions. Every `perLevel` right answers moves you up a level:
  // harder questions, bigger rewards. `maxMisses` wrong answers = back to level 1.
  // Past the last level, each extra 10 right adds `bonusPerExtra` to the reward.
  // Separately, `need` right answers inside `windowHours` = 🔥 On Fire for `fireHours`
  // (the streak then starts over; players can also reset their 🔥 from the trivia screen).
  trivia: {
    perLevel: 10, maxMisses: 5, need: 5, windowHours: 72, fireHours: 18,
    levels: [
      { name: "Rookie",  pool: ["e"], reward: { tokens: 1, points: 3 } },
      { name: "Starter", pool: ["m"], reward: { tokens: 2, points: 5 } },
      { name: "All-Star", pool: ["h"], reward: { tokens: 3, points: 8 } },
      { name: "MVP",     pool: ["x"], reward: { tokens: 5, points: 12 } },
      { name: "Hall of Fame", pool: ["h", "x"], reward: { tokens: 6, points: 15 } },
    ],
    bonusPerExtra: { tokens: 1, points: 3 },
  },

  // Gravity Pong. Every `pointsPerToken` points = 1 token (max `maxTokens` per game).
  // gravity = how hard the ball falls. bump = how much a tap in the air lifts it.
  pong: {
    pointsPerToken: 3, maxTokens: 10, bump: 3.4,
    balls: [
      { id: "rubber",  label: "Rubber",  icon: "🟠", gravity: 0.16, points: 1, color: "#e8742a" },
      { id: "leather", label: "Leather", icon: "🏀", gravity: 0.26, points: 2, color: "#a3521f" },
      { id: "bowling", label: "Bowling", icon: "🎳", gravity: 0.42, points: 5, color: "#2b2f36" },
    ],
  },

  // Prize wheel. cost 0 = unlimited free spins. Otherwise `freePerDay` free spins a day,
  // then each spin costs `cost` tokens.
  // weight = how likely each prize is compared to the others.
  // Prize effects: tokens, points, power, hunger, happy, energy, fireHours, superHours, spins.
  roulette: {
    freePerDay: 1, cost: 0,
    prizes: [
      { label: "Token bag",    icon: "🪙", color: "#f2b632", weight: 24, fx: { tokens: 5 } },
      { label: "Dunk contest", icon: "🤾", color: "#d23a2c", weight: 20, fx: { power: 10, points: 5 } },
      { label: "Hot hand",     icon: "👋", color: "#2f7fb8", weight: 14, fx: { energy: 100 } },
      { label: "Fresh legs",   icon: "⛹️", color: "#7fd08a", weight: 14, fx: { hunger: 100, happy: 30 } },
      { label: "Heat check",   icon: "🔥", color: "#ff7a1a", weight: 8,  fx: { fireHours: 6 } },
      { label: "Super Saiyan", icon: "🌟", color: "#ffd84a", weight: 5,  fx: { superHours: 1 } },
      { label: "Jackpot",      icon: "💰", color: "#6b3fb3", weight: 4,  fx: { tokens: 10, points: 15 } },
      { label: "Brick",        icon: "🧱", color: "#8a8f98", weight: 6,  fx: {} },
    ],
  },

  // Mystery boxes drop in at random, about every `everyMin` minutes of real time.
  drops: {
    everyMin: 90,
    prizes: [
      { label: "Pocket change", weight: 40, fx: { tokens: 2 } },
      { label: "Bonus bucket",  weight: 25, fx: { points: 5, hunger: 15 } },
      { label: "Pep talk",      weight: 25, fx: { happy: 25 } },
      { label: "Lucky ticket",  weight: 10, fx: { tokens: 5 } },
    ],
  },

  // 🏀 points: earned from the Balling buttons, trivia and prizes (`points` in each fx; no cap).
  // The Home wall shows each pet's average per week, e.g. [34🏀/w].
  // When a league week (Monday to Sunday) ends, the team with the most points that week gets
  // `top` bonus points, the fewest gets `bottom`, and the rest a straight line in between.
  // The bonus goes on the masco-pet's own points total only, never fantasy standings.
  weekly: { top: 25, bottom: 10 },

  // League save: a changed pet is saved to the database at most this often (minutes).
  // 0 = never automatically. Pressing Sync or 💾 Save always saves right away.
  online: { autoPushMin: 60 },

  // "Paste image link of your new avatar" leaves a private request on the LM desk (/lm) and the Masco-Pet desk.

  // Page parts the floating pet must not cover. When it would, it tucks into the right edge.
  avoid: "main > *, [data-pet-avoid], .banner, .hero",
};
