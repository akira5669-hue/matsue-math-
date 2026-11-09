// 🐞バグ報告をClaude(や先生)がターミナルから確認・記録するためのスクリプト(2026-11-09〜)。
// 使い方(本番DBにつなぐ。終わったら .env.local を消す)：
//   vercel env pull .env.local --yes
//   node --env-file=.env.local scripts/bug-reports.js list          … まだ対応していない報告(status='new')
//   node --env-file=.env.local scripts/bug-reports.js list all      … 全部(新しい順50件)
//   node --env-file=.env.local scripts/bug-reports.js img <番号> <保存先フォルダ>   … 画面の写真をjpgで保存
//   node --env-file=.env.local scripts/bug-reports.js fix <番号> "直した内容"       … 修正済みにして、報告した生徒にお知らせ
//   node --env-file=.env.local scripts/bug-reports.js notbug <番号> "理由"          … バグではなかった(生徒へのお知らせなし)
//   rm -f .env.local
// 状態(status)：new=未対応 / fixed=修正済み / not_bug=バグではない / done=先生が対応済みにした
const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

const sql = neon(process.env.DATABASE_URL);

async function ensureCols_() {
  await sql.query('ALTER TABLE bug_reports ADD COLUMN IF NOT EXISTS fix_note TEXT, ADD COLUMN IF NOT EXISTS fixed_at TIMESTAMPTZ', []);
}

function show_(r) {
  const when = new Date(r.ts).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  console.log(`#${r.id} [${r.status}] ${when}  ${r.name}（${r.grade}・ID ${r.student_id}・Lv.${r.level}）  場所: ${r.place}${r.has_image ? '  📷写真あり' : ''}`);
  console.log(`  何が起きた: ${r.what}`);
  if (r.detail) console.log(`  くわしく: ${r.detail}`);
  if (r.fix_note) console.log(`  対応メモ: ${r.fix_note}`);
  console.log('');
}

(async () => {
  await ensureCols_();
  const [cmd, a1, a2] = process.argv.slice(2);
  if (cmd === 'list') {
    const rows = await sql.query(
      `SELECT id, ts, student_id, name, grade, level, place, what, detail, status, fix_note, image_base64 IS NOT NULL AS has_image
       FROM bug_reports ${a1 === 'all' ? '' : "WHERE status = 'new'"} ORDER BY id DESC LIMIT 50`, []);
    if (!rows.length) console.log(a1 === 'all' ? '報告はまだありません。' : '未対応の報告はありません。');
    rows.forEach(show_);
  } else if (cmd === 'img') {
    const rows = await sql.query('SELECT image_base64 FROM bug_reports WHERE id = $1', [Number(a1)]);
    if (!rows.length || !rows[0].image_base64) { console.log('写真がありません。'); return; }
    const out = path.join(a2 || '.', `bug_${Number(a1)}.jpg`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(rows[0].image_base64, 'base64'));
    console.log('保存しました: ' + out);
  } else if (cmd === 'fix' || cmd === 'notbug') {
    const note = String(a2 || '').trim();
    if (!Number(a1) || !note) { console.log('番号とメモを指定してください。'); return; }
    const st = cmd === 'fix' ? 'fixed' : 'not_bug';
    const r = await sql.query('UPDATE bug_reports SET status = $1, fix_note = $2, fixed_at = now() WHERE id = $3 RETURNING id, student_id, name', [st, note, Number(a1)]);
    if (!r.length) { console.log('その番号の報告はありません。'); return; }
    if (cmd === 'fix') {
      // 報告してくれた生徒へのお知らせ(次にアプリを開いたときに出る)。MPは先生が決めて付与する。
      const msg = `🐞 報告してくれたバグ（報告番号${r[0].id}）を直しました！教えてくれてありがとう。\n直したこと：${note}`;
      await sql.query(
        "UPDATE students SET pending_notice = CASE WHEN pending_notice IS NULL OR pending_notice = '' THEN $1 ELSE pending_notice || E'\\n\\n' || $1 END WHERE id = $2",
        [msg, r[0].student_id]);
    }
    console.log(`#${r[0].id}（${r[0].name}）を ${st} にしました。`);
  } else {
    console.log('使い方は、このファイルの先頭のコメントを見てください。');
  }
})().catch((e) => { console.error(e); process.exit(1); });
