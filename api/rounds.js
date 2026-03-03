const { getDB } = require('../lib/db');
const { enrichPairs } = require('../lib/utils');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const db = getDB();

  // GET ?date=YYYY-MM-DD  — single round for that day
  // GET ?all=true         — all rounds with pairs (for history)
  if (req.method === 'GET') {
    const { date, all } = req.query;

    if (all) {
      const { data: rounds, error } = await db.from('rounds')
        .select('id, date').order('date', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      if (!rounds?.length) return res.json([]);

      const { data: rawPairs } = await db.from('pairs')
        .select('id, round_id, p1_id, p2_id, result, is_bye')
        .in('round_id', rounds.map(r => r.id));
      const pairs = await enrichPairs(db, rawPairs || []);
      return res.json(rounds.map(r => ({
        ...r, pairs: pairs.filter(p => p.round_id === r.id)
      })));
    }

    if (date) {
      const { data: round, error } = await db.from('rounds')
        .select('id, date').eq('date', date).single();
      if (error || !round) return res.json(null);

      const { data: rawPairs } = await db.from('pairs')
        .select('id, round_id, p1_id, p2_id, result, is_bye')
        .eq('round_id', round.id);
      const pairs = await enrichPairs(db, rawPairs || []);
      return res.json({ ...round, pairs });
    }

    return res.status(400).json({ error: 'date or all param required' });
  }

  // POST — generate pairing for a date (force:true to regenerate)
  if (req.method === 'POST') {
    const { date, force } = req.body || {};
    if (!date) return res.status(400).json({ error: 'date required' });

    const { data: existing } = await db.from('rounds').select('id').eq('date', date).single();
    if (existing) {
      if (!force) return res.status(409).json({ error: 'Round already exists' });
      await db.from('rounds').delete().eq('id', existing.id); // cascades pairs
    }

    const { data: members, error: mErr } = await db.from('members')
      .select('id').order('created_at');
    if (mErr || !members || members.length < 2)
      return res.status(400).json({ error: 'Cần ít nhất 2 thành viên' });

    const { data: round, error: rErr } = await db.from('rounds')
      .insert({ date }).select().single();
    if (rErr) return res.status(500).json({ error: rErr.message });

    const shuffled = shuffle(members);
    const toInsert = [];
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      toInsert.push({ round_id: round.id, p1_id: shuffled[i].id, p2_id: shuffled[i+1].id, is_bye: false });
    }
    if (shuffled.length % 2 === 1) {
      toInsert.push({ round_id: round.id, p1_id: shuffled[shuffled.length - 1].id, p2_id: null, is_bye: true });
    }

    const { error: pErr } = await db.from('pairs').insert(toInsert);
    if (pErr) return res.status(500).json({ error: pErr.message });

    const { data: rawPairs } = await db.from('pairs')
      .select('id, round_id, p1_id, p2_id, result, is_bye').eq('round_id', round.id);
    const pairs = await enrichPairs(db, rawPairs || []);
    return res.status(201).json({ ...round, pairs });
  }

  return res.status(405).end();
};
