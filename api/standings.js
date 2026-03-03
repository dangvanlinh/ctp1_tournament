const { getDB } = require('../lib/db');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    const db = getDB();
    const [{ data: members }, { data: pairs }, { count: totalRounds }] = await Promise.all([
      db.from('members').select('id, name, color').order('created_at'),
      db.from('pairs').select('p1_id, p2_id, result').not('result', 'is', null).eq('is_bye', false),
      db.from('rounds').select('*', { count: 'exact', head: true }),
    ]);

    const stats = {};
    (members || []).forEach(m => {
      stats[m.id] = { ...m, played: 0, wins: 0, draws: 0, losses: 0, points: 0 };
    });
    (pairs || []).forEach(p => {
      const p1 = stats[p.p1_id], p2 = stats[p.p2_id];
      if (!p1 || !p2) return;
      p1.played++; p2.played++;
      if (p.result === 'draw')     { p1.draws++; p1.points++; p2.draws++; p2.points++; }
      else if (p.result === 'p1')  { p1.wins++; p1.points += 3; p2.losses++; }
      else                         { p2.wins++; p2.points += 3; p1.losses++; }
    });

    const standings = Object.values(stats)
      .sort((a, b) => b.points - a.points || b.wins - a.wins || a.losses - b.losses);

    return res.json({
      standings,
      totalRounds: totalRounds || 0,
      totalMatches: (pairs || []).length,
    });
  }

  return res.status(405).end();
};
