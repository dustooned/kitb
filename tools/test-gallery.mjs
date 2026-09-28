// Gallery model: decks, ordering and migration of old categories. Run: npm test
const m = await import('../model.js');
const assert = (c, msg) => { if (!c) { console.log('FAIL', msg); process.exitCode = 1; } };
// old save with categories, no order
let k = m.normalizeKit({ categories: [{ id: 'cat1', name: 'Heroes' }], cards: [{ id: 'a', category: 'cat1' }, { id: 'b' }], pieces: [{ id: 'p' }] });
assert(k.order.join() === 'd:cat1,b,p', 'migrated order ' + k.order);
assert(k.categories[0].order.join() === 'a', 'deck order');
const d = m.newDeckFrom(k, ['b', 'p']);
assert(k.order.join() === `d:cat1,d:${d.id}`, 'new deck at b ' + k.order);
m.placeTop(k, 'p', 'd:cat1'); assert(k.order[0] === 'p' && m.itemById(k,'p').category === '', 'placeTop');
m.placeInDeck(k, 'a', d.id, 'b'); assert(d.order.join() === 'a,b', 'placeInDeck before');
m.dropEmptyDecks(k); assert(!m.deckById(k, 'cat1') && !k.order.includes('d:cat1'), 'empty deck dropped');
const c = m.duplicateItem(k, 'a'); assert(d.order.join() === `a,${c.id},b`, 'dup after');
m.ungroupDeck(k, d.id); assert(k.order.join() === `p,a,${c.id},b`, 'ungroup ' + k.order);
assert(m.reorderSubset(['p','x','a','y'], ['a','p']).join() === 'a,x,p,y', 'subset');
m.deleteItems(k, ['a']); assert(!m.itemById(k,'a') && !k.order.includes('a'), 'delete');
const again = m.normalizeKit(JSON.parse(JSON.stringify(k))); assert(again.order.join() === k.order.join(), 'round trip');
console.log(process.exitCode ? 'failed' : 'all gallery model checks passed');
