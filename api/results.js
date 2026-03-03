const { getDB } = require('../lib/db');
const { enrichPairs } = require('../lib/utils');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'PUT') {
    const { pair_id, result } = req.body || {};
    if (!pair_id) return res.status(400).json({ error: 'pair_id required' });
    if (!['p1', 'p2', 'draw', null].includes(result))
      return res.status(400).json({ error: 'invalid result' });

    const db = getDB();
    const { data, error } = await db.from('pairs')
      .update({ result: result ?? null })
      .eq('id', pair_id)
      .select('id, round_id, p1_id, p2_id, result, is_bye')
      .single();
    if (error) return res.status(500).json({ error: error.message });

    const [enriched] = await enrichPairs(db, [data]);
    return res.json(enriched);
  }

  return res.status(405).end();
};
