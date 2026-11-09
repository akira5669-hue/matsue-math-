# 松江塾理系アプリ — Claude向けメモ

## 🐞バグ報告(生徒から届く)
- 生徒(レベル500以上)がアプリの「🐞バグ報告」から送った報告は、本番DBの `bug_reports` にある。先生にもメールが届く。
- 先生が確認しなくても、Claudeが自分で確認して直してよい(先生の指示 2026-11-09)。
- 手順:
  1. `git pull` → `vercel env pull .env.local --yes`
  2. `node --env-file=.env.local scripts/bug-reports.js list` で未対応の報告を見る(写真は `img <番号> <フォルダ>`)
  3. 本当にアプリのまちがいなら、コードを直して main に push(sw.js の CACHE_NAME を上げる)
  4. 直したら `fix <番号> "直した内容"`(報告した生徒にお知らせが付く)。まちがいでなければ `notbug <番号> "理由"`
  5. `rm -f .env.local`
- MPの付与は自動ではしない(先生に何MP入れるか聞く)。
