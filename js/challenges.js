// Famous-spot challenges, shared by the browser and the API.
// Rules: limit = seconds to find the Golden pack (0 = none), gmin/gmax = how far the Golden pack
// hides from the start (m), hint = seconds per free clue, photo/landmark = whether those clues exist.
export const BASE_RULES = {
  limit: 480, gmin: 250, gmax: 450, hint: 75, photo: true, landmark: true,
  see: 35, gsee: 20, normals: 4,
};

// Wild drops (random city or any tapped spot) are the hardest: no timer, but far and stingy.
export const WILD_RULES = { ...BASE_RULES, limit: 0, gmin: 350, gmax: 600, hint: 100 };

export const CHALLENGES = [
  { id: 'eiffel', name: 'Iron Lady', place: 'Eiffel Tower, Paris', lat: 48.8577, lng: 2.2950, stars: 1,
    blurb: 'A warm-up under the tower. 10 minutes.', rules: { limit: 600, gmin: 200, gmax: 350, hint: 60 } },
  { id: 'nyhavn', name: 'Harbour Lights', place: 'Nyhavn, Copenhagen', lat: 55.6798, lng: 12.5904, stars: 1,
    blurb: 'Colourful canal houses hide more than boats. 10 minutes.', rules: { limit: 600, gmin: 200, gmax: 350, hint: 60 } },
  { id: 'times-square', name: 'Neon Rush', place: 'Times Square, New York', lat: 40.7580, lng: -73.9855, stars: 2,
    blurb: 'Billboards everywhere. The Golden pack hides in the glow. 8 minutes.', rules: {} },
  { id: 'shibuya', name: 'Scramble', place: 'Shibuya Crossing, Tokyo', lat: 35.6595, lng: 139.7005, stars: 2,
    blurb: 'Get lost in the backstreets behind the crossing. 8 minutes.', rules: {} },
  { id: 'westminster', name: 'Big Ben Bounty', place: 'Westminster, London', lat: 51.5007, lng: -0.1246, stars: 2,
    blurb: 'Parliament, the river and a lot of tourists. 8 minutes.', rules: {} },
  { id: 'colosseum', name: 'Gladiator', place: 'Colosseum, Rome', lat: 41.8902, lng: 12.4922, stars: 2,
    blurb: 'No photo clue. Read the ruins. 9 minutes.', rules: { limit: 540, photo: false } },
  { id: 'copacabana', name: 'Beach Run', place: 'Copacabana, Rio de Janeiro', lat: -22.9711, lng: -43.1822, stars: 2,
    blurb: 'Sun, sand and one golden pack. 8 minutes.', rules: {} },
  { id: 'circular-quay', name: 'Harbour Bridge', place: 'Circular Quay, Sydney', lat: -33.8610, lng: 151.2108, stars: 2,
    blurb: 'Between the Opera House and the Rocks. 8 minutes.', rules: {} },
  { id: 'sagrada', name: 'Basilica Quest', place: 'Sagrada Família, Barcelona', lat: 41.4036, lng: 2.1744, stars: 3,
    blurb: 'Every block in the grid looks the same. Slow clues. 7 minutes.', rules: { limit: 420, gmin: 300, gmax: 500, hint: 90 } },
  { id: 'gion', name: 'Lantern Path', place: 'Gion, Kyoto', lat: 35.0037, lng: 135.7750, stars: 3,
    blurb: 'Narrow lanes and no landmark clue. 8 minutes.', rules: { gmin: 300, gmax: 500, hint: 90, landmark: false } },
  { id: 'lombard', name: 'Crooked Street', place: 'Lombard Street, San Francisco', lat: 37.8021, lng: -122.4187, stars: 3,
    blurb: 'Steep hills, long walks. 7 minutes.', rules: { limit: 420, gmin: 300, gmax: 500, hint: 90 } },
  { id: 'vegas', name: 'High Roller', place: 'Las Vegas Strip', lat: 36.1126, lng: -115.1720, stars: 3,
    blurb: 'Huge blocks and no photo clue. 8 minutes.', rules: { gmin: 400, gmax: 650, hint: 90, photo: false } },
];

export function rulesFor(id) {
  const c = CHALLENGES.find((x) => x.id === id);
  return c ? { ...BASE_RULES, ...c.rules } : null;
}
