const { getDB } = require('../lib/db');

const COLORS = [
  '#f0b429','#3b82f6','#2ecc71','#e74c3c','#9b59b6',
  '#1abc9c','#e67e22','#e91e63','#00bcd4','#8bc34a',
  '#ff5722','#607d8b','#795548','#673ab7','#03a9f4',
];

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const db = getDB();

  // GET — list all members
  if (req.method === 'GET') {
    const { data, error } = await db.from('members').select('*').order('created_at');
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }

  // POST — add member
  if (req.method === 'POST') {
    const name = req.body?.name?.trim();
    if (!name) return res.status(400).json({ error: 'name required' });

    const { count } = await db.from('members').select('*', { count: 'exact', head: true });
    const color = COLORS[(count || 0) % COLORS.length];

    const { data, error } = await db.from('members')
      .insert({ name, color }).select().single();
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Tên đã tồn tại!' });
      return res.status(500).json({ error: error.message });
    }
    return res.status(201).json(data);
  }

  // DELETE — remove member
  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });

    // Block if member has match history
    const { count } = await db.from('pairs')
      .select('*', { count: 'exact', head: true })
      .or(`p1_id.eq.${id},p2_id.eq.${id}`)
      .not('result', 'is', null);
    if (count > 0) {
      return res.status(409).json({ error: `Thành viên đã có ${count} trận, không thể xóa.` });
    }

    const { error } = await db.from('members').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).end();
};
