// T-INT-OFF-RACE and T-INT-OFF-RACE-02 with real concurrency (S22).
//   ANON_KEY=... SERVICE_KEY=... node scripts/verify/offer-race.mjs
// Two accepts on different offers of one listing at the same moment: exactly
// one wins (FOR UPDATE). make_offer racing mark_sold: the offer is refused or
// auto-declined, never left pending on a sold listing (FOR SHARE).
import { campusOf, check, done, listing, rpc, student } from './lib.mjs';

const stamp = Date.now();
const seller = await student(`race-seller-${stamp}@osu.edu`, 'Sam');
const b1 = await student(`race-b1-${stamp}@osu.edu`, 'Bea');
const b2 = await student(`race-b2-${stamp}@osu.edu`, 'Cal');
const campus = await campusOf(seller);

for (let round = 0; round < 5; round += 1) {
  const id = await listing(seller, campus, { title: `Race lamp ${round}` });
  const o1 = (await rpc('make_offer', { listing_id: id, amount_cents: 1500 }, b1.token)).body.id;
  const o2 = (await rpc('make_offer', { listing_id: id, amount_cents: 1600 }, b2.token)).body.id;
  const [r1, r2] = await Promise.all([
    rpc('accept_offer', { offer_id: o1 }, seller.token),
    rpc('accept_offer', { offer_id: o2 }, seller.token),
  ]);
  const wins = [r1, r2].filter((r) => r.status === 200 && r.body.chat_id).length;
  check(wins === 1, `RACE round ${round}: exactly one accept wins`, `${r1.status}/${r2.status}`);
}

for (let round = 0; round < 5; round += 1) {
  const id = await listing(seller, campus, { title: `Race desk ${round}` });
  const [offer] = await Promise.all([
    rpc('make_offer', { listing_id: id, amount_cents: 1500 }, b1.token),
    rpc('mark_sold', { id }, seller.token),
  ]);
  if (offer.status === 200) {
    const again = await rpc('get_offer', { offer_id: offer.body.id }, b1.token);
    check(again.body.status !== 'pending', `RACE-02 round ${round}: never pending on a sold listing`, again.body.status);
  } else {
    check(String(offer.body.message ?? '').startsWith('LISTING_UNAVAILABLE'), `RACE-02 round ${round}: refused`, offer.body.message);
  }
}
done();
