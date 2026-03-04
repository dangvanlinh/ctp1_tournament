const { getDB } = require('../lib/db');

function todayVN() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function isWeekdayVN() {
  // 0=Sun, 1=Mon, ..., 6=Sat
  const day = new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'short' });
  return !['Sat', 'Sun'].includes(day);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function tgSend(chatId, text, threadId = null) {
  const payload = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (threadId) payload.message_thread_id = threadId;
  await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

module.exports = async (req, res) => {
  // Only allow GET (Vercel cron) or POST with secret
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Skip weekends (safety check, cron schedule already limits to Mon-Fri)
  if (!isWeekdayVN()) {
    return res.status(200).json({ skipped: 'weekend' });
  }

  const today = todayVN();
  const db = getDB();

  // Skip if round already exists for today
  const { data: existing } = await db.from('rounds').select('id').eq('date', today).single();
  if (existing) {
    return res.status(200).json({ skipped: 'round already exists', date: today });
  }

  // Get members
  const { data: members, error: mErr } = await db.from('members').select('id, name').order('created_at');
  if (mErr || !members || members.length < 2) {
    return res.status(400).json({ error: 'Cần ít nhất 2 thành viên' });
  }

  // Create round
  const { data: round, error: rErr } = await db.from('rounds').insert({ date: today }).select().single();
  if (rErr) return res.status(500).json({ error: rErr.message });

  // Generate pairs
  const shuffled = shuffle(members);
  const toInsert = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    toInsert.push({ round_id: round.id, p1_id: shuffled[i].id, p2_id: shuffled[i + 1].id, is_bye: false });
  }
  if (shuffled.length % 2 === 1) {
    toInsert.push({ round_id: round.id, p1_id: shuffled[shuffled.length - 1].id, p2_id: null, is_bye: true });
  }

  const { error: pErr } = await db.from('pairs').insert(toInsert);
  if (pErr) return res.status(500).json({ error: pErr.message });

  // Send Telegram notification
  const chatId = process.env.TELEGRAM_CHAT_ID || '-1003642678430';
  const threadId = process.env.TELEGRAM_THREAD_ID ? parseInt(process.env.TELEGRAM_THREAD_ID) : 2;
  const memberMap = Object.fromEntries(members.map(m => [m.id, m]));

  const activePairs = toInsert.filter(p => !p.is_bye);
  const byePair = toInsert.find(p => p.is_bye);
  const lines = activePairs.map(p =>
    `• <b>${memberMap[p.p1_id]?.name}</b> vs <b>${memberMap[p.p2_id]?.name}</b>`
  );
  if (byePair) lines.push(`• <b>${memberMap[byePair.p1_id]?.name}</b> — nghỉ hôm nay`);

  await tgSend(chatId,
    `⚔️ <b>Bảng đấu hôm nay (${today})</b>\n\n${lines.join('\n')}\n\n` +
    `Ai thắng nhắn: <code>Tên +1</code>`,
    threadId
  );

  return res.status(200).json({ ok: true, date: today, pairs: activePairs.length });
};
