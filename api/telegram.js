const { getDB } = require('../lib/db');

// Vietnam timezone date
function todayVN() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
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

async function getMemberPoints(db, memberId) {
  const { data } = await db.from('pairs')
    .select('p1_id, p2_id, result')
    .or(`p1_id.eq.${memberId},p2_id.eq.${memberId}`)
    .not('result', 'is', null)
    .eq('is_bye', false);
  let pts = 0;
  (data || []).forEach(p => {
    if (p.result === 'draw') pts += 1;
    else if ((p.p1_id === memberId && p.result === 'p1') ||
             (p.p2_id === memberId && p.result === 'p2')) pts += 3;
  });
  return pts;
}

async function handleWin(db, chatId, rawName, threadId) {
  const { data: members } = await db.from('members').select('id, name');
  const member = (members || []).find(
    m => m.name.toLowerCase() === rawName.toLowerCase()
  );

  if (!member) {
    return tgSend(chatId, `❌ Không tìm thấy thành viên <b>${rawName}</b>\nDùng /danhsach để xem danh sách.`, threadId);
  }

  const today = todayVN();
  const { data: round } = await db.from('rounds').select('id').eq('date', today).single();
  if (!round) {
    return tgSend(chatId, `❌ Chưa có bảng đấu hôm nay.\nVào web để tạo cặp đấu trước nhé!`, threadId);
  }

  const { data: pair } = await db.from('pairs')
    .select('id, p1_id, p2_id, result')
    .eq('round_id', round.id)
    .eq('is_bye', false)
    .or(`p1_id.eq.${member.id},p2_id.eq.${member.id}`)
    .single();

  if (!pair) {
    return tgSend(chatId, `❌ Không tìm thấy cặp đấu của <b>${member.name}</b> hôm nay.`, threadId);
  }

  if (pair.result !== null) {
    const existing = pair.result === 'draw' ? 'Hòa'
      : pair.result === 'p1' ? (pair.p1_id === member.id ? `${member.name} thắng` : 'Đối thủ thắng')
      : (pair.p2_id === member.id ? `${member.name} thắng` : 'Đối thủ thắng');
    return tgSend(chatId, `⚠️ Cặp đấu này đã có kết quả: <b>${existing}</b>\nDùng web để sửa nếu cần.`, threadId);
  }

  const result = pair.p1_id === member.id ? 'p1' : 'p2';
  const opponentId = pair.p1_id === member.id ? pair.p2_id : pair.p1_id;
  const opponent = (members || []).find(m => m.id === opponentId);

  await db.from('pairs').update({ result }).eq('id', pair.id);

  const totalPts = await getMemberPoints(db, member.id);
  return tgSend(chatId,
    `✅ Đã ghi nhận!\n\n🏆 <b>${member.name}</b> thắng vs <b>${opponent?.name || '?'}</b>\n` +
    `+3 điểm → Tổng: <b>${totalPts} điểm</b>`,
    threadId
  );
}

async function handleStandings(db, chatId, threadId) {
  const [{ data: members }, { data: pairs }] = await Promise.all([
    db.from('members').select('id, name').order('created_at'),
    db.from('pairs').select('p1_id, p2_id, result').not('result', 'is', null).eq('is_bye', false),
  ]);

  const stats = {};
  (members || []).forEach(m => { stats[m.id] = { name: m.name, pts: 0, played: 0 }; });
  (pairs || []).forEach(p => {
    const p1 = stats[p.p1_id], p2 = stats[p.p2_id];
    if (!p1 || !p2) return;
    p1.played++; p2.played++;
    if (p.result === 'draw') { p1.pts++; p2.pts++; }
    else if (p.result === 'p1') p1.pts += 3;
    else p2.pts += 3;
  });

  const sorted = Object.values(stats).sort((a, b) => b.pts - a.pts);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = sorted.map((p, i) =>
    `${medals[i] || `${i + 1}.`} <b>${p.name}</b> — ${p.pts} điểm (${p.played} trận)`
  );
  return tgSend(chatId, `🏆 <b>Bảng Xếp Hạng</b>\n\n${lines.join('\n')}`, threadId);
}

async function handlePairs(db, chatId, threadId) {
  const today = todayVN();
  const { data: round } = await db.from('rounds').select('id, date').eq('date', today).single();
  if (!round) {
    return tgSend(chatId, `📅 Chưa có bảng đấu hôm nay (${today}).\nVào web để tạo cặp đấu nhé!`, threadId);
  }

  const { data: pairs } = await db.from('pairs')
    .select('id, p1_id, p2_id, result, is_bye').eq('round_id', round.id);
  const ids = [...new Set((pairs || []).flatMap(p => [p.p1_id, p.p2_id]).filter(Boolean))];
  const { data: members } = await db.from('members').select('id, name').in('id', ids);
  const map = Object.fromEntries((members || []).map(m => [m.id, m]));

  const lines = (pairs || []).filter(p => !p.is_bye).map(p => {
    const n1 = map[p.p1_id]?.name || '?', n2 = map[p.p2_id]?.name || '?';
    const status = p.result === null ? '⏳' : p.result === 'draw' ? '🤝 Hòa'
      : p.result === 'p1' ? `🏆 ${n1} thắng` : `🏆 ${n2} thắng`;
    return `• <b>${n1}</b> vs <b>${n2}</b> ${status}`;
  });
  const bye = (pairs || []).find(p => p.is_bye);
  if (bye) lines.push(`• <b>${map[bye.p1_id]?.name}</b> — nghỉ hôm nay`);

  return tgSend(chatId, `⚔️ <b>Bảng đấu hôm nay (${today})</b>\n\n${lines.join('\n')}`, threadId);
}

async function handleMemberList(db, chatId, threadId) {
  const { data: members } = await db.from('members').select('name').order('created_at');
  if (!members?.length) return tgSend(chatId, 'Chưa có thành viên nào.', threadId);
  const list = (members || []).map((m, i) => `${i + 1}. ${m.name}`).join('\n');
  return tgSend(chatId, `👥 <b>Danh sách thành viên</b>\n\n${list}`, threadId);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const message = req.body?.message || req.body?.edited_message;
  if (!message?.text) return res.status(200).json({ ok: true });

  const chatId = process.env.TELEGRAM_CHAT_ID || message.chat.id;
  const threadId = process.env.TELEGRAM_THREAD_ID ? parseInt(process.env.TELEGRAM_THREAD_ID) : (message.message_thread_id || null);
  const text = message.text.trim();
  const db = getDB();

  // Commands
  if (/^\/bang\b/i.test(text))      { await handleStandings(db, chatId, threadId);  return res.status(200).json({ ok: true }); }
  if (/^\/capdat\b/i.test(text))    { await handlePairs(db, chatId, threadId);       return res.status(200).json({ ok: true }); }
  if (/^\/danhsach\b/i.test(text))  { await handleMemberList(db, chatId, threadId);  return res.status(200).json({ ok: true }); }
  if (/^\/help\b/i.test(text)) {
    await tgSend(chatId,
      `🎮 <b>Cờ Tỷ Phú Bot</b>\n\n` +
      `<b>Ghi kết quả:</b>\n` +
      `  <code>Linh +1</code> — Linh vừa thắng\n\n` +
      `<b>Lệnh:</b>\n` +
      `  /capdat — xem cặp đấu hôm nay\n` +
      `  /bang — bảng xếp hạng\n` +
      `  /danhsach — danh sách thành viên`,
      threadId
    );
    return res.status(200).json({ ok: true });
  }

  // Pattern: "Name +1"
  const winMatch = text.match(/^(.+?)\s*\+1\s*$/);
  if (winMatch) {
    await handleWin(db, chatId, winMatch[1].trim(), threadId);
  }

  return res.status(200).json({ ok: true });
};
