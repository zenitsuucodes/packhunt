// Builds a challenge for a drop-anywhere hunt from what's actually around the drop:
// Google Places decides the theme and the landmark clue; distance decides stars and the timer.
import { dist } from '../../js/geo.js';
import { placesNearby, placeName } from './server.js';

const THEMES = [
  { name: 'Coffee Run', match: /cafe|coffee|bakery|tea_house|dessert/, blurb: (a) => `Cafés on every corner of ${a}. The Golden pack is hiding between the lattes.` },
  { name: 'Museum Mile', match: /museum|art_gallery|cultural/, blurb: (a) => `Culture everywhere in ${a}. Something golden isn't on display yet.` },
  { name: 'Park Patrol', match: /park|garden|playground|hiking/, blurb: (a) => `Green spaces all around ${a}. Look behind the trees.` },
  { name: 'Landmark Loot', match: /tourist_attraction|historical|landmark|monument|fountain|plaza|statue|memorial|bridge|church|place_of_worship|mosque|temple|castle|palace/, blurb: (a) => `Sightseers all over ${a}. One of them walked right past the Golden pack.` },
  { name: 'Night Out', match: /bar|night_club|pub|wine|brewery/, blurb: (a) => `${a} comes alive at night. The Golden pack is out partying.` },
  { name: 'Food Street Frenzy', match: /restaurant|food|pizza|ramen|sushi|meal|burger|steak|bistro|ice_cream|sandwich|deli/, blurb: (a) => `Follow your nose around ${a}. The Golden pack smells like fries.` },
  { name: 'Shop Drop', match: /store|shopping_mall|market|boutique|supermarket/, blurb: (a) => `Shop windows everywhere in ${a}. The Golden pack isn't for sale.` },
  { name: 'Rush Hour', match: /station|transit|bus|train|subway|airport/, blurb: (a) => `Commuters rushing through ${a}. Don't miss your stop.` },
  { name: 'Campus Quest', match: /university|school|library|college/, blurb: (a) => `Class is in session in ${a}. Today's lesson: finding gold.` },
];
const QUIET = { name: 'Street Sweep', blurb: (a) => `Quiet streets around ${a}. No crowds, no excuses.` };

// "Rue Lepic, Montmartre, Paris, France" -> "Montmartre, Paris"
function shortArea(label) {
  if (!label) return 'this neighbourhood';
  const parts = label.split(', ').filter((x) => !/^(Municipio|Bezirk|District|Ward|Arrondissement)/i.test(x));
  return parts.length > 2 ? parts.slice(1, 3).join(', ') : parts.slice(0, 2).join(', ');
}

export async function customChallenge(start, gold) {
  const [area, nearGold, label] = await Promise.all([
    placesNearby(start, 600, 20),
    placesNearby(gold, 150, 10),
    placeName(start),
  ]);
  const where = shortArea(label);

  // Popular places count for more than many small ones, and sights get a boost,
  // so Montmartre reads as Sacré-Cœur, not its metro stations.
  let theme = QUIET;
  let best = 3;
  for (const t of THEMES) {
    const weight = t.name === 'Landmark Loot' ? 2 : t.name === 'Rush Hour' ? 0.6 : 1;
    const score = weight * area.filter((p) => t.match.test(p.type)).reduce((s, p) => s + Math.log10(p.reviews + 10), 0);
    if (score > best) { best = score; theme = t; }
  }

  const gd = dist(start, gold);
  const stars = gd < 350 ? 1 : gd < 500 ? 2 : 3;
  const limit = Math.round((240 + gd * 0.8) / 30) * 30;

  // The most-reviewed place near the Golden pack becomes the landmark clue.
  const anchor = nearGold.sort((a, b) => b.reviews - a.reviews)[0];
  const clue = anchor
    ? { name: anchor.name, kind: anchor.kind || 'place', d: Math.max(20, Math.round(dist(anchor, gold) / 10) * 10) }
    : null;
  const famous = [...area].sort((a, b) => b.reviews - a.reviews)[0]?.name || null;

  return {
    name: theme.name, place: where, blurb: theme.blurb(where), stars, limit, clue, famous,
    google: area.length > 0,
  };
}
