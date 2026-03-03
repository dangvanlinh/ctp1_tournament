async function enrichPairs(db, pairs) {
  const ids = [...new Set(pairs.flatMap(p => [p.p1_id, p.p2_id]).filter(Boolean))];
  if (!ids.length) return pairs;
  const { data: members } = await db.from('members').select('id, name, color').in('id', ids);
  const map = Object.fromEntries((members || []).map(m => [m.id, m]));
  return pairs.map(p => ({ ...p, p1: map[p.p1_id] || null, p2: map[p.p2_id] || null }));
}

module.exports = { enrichPairs };
