-- 松江塾 計算マスター: Postgres (Neon) スキーマ
-- 現行のGoogle スプレッドシート(Students/Records/TestPhotos/WeeklyQuiz/Guardians/
-- GiftRequests/GiftCodes/ItemGrants/PointsAnomalyLog/WithdrawnStudents)を1対1で
-- 置き換える設計。student_idへの外部キーはON DELETE CASCADEにして、退会時に
-- 関連データが自動で消えるようにしている(GiftRequests/GiftCodes/PointsAnomalyLogは
-- 会計・監査記録のため、これまで通りCASCADEを付けず退会後も残す)。

CREATE TABLE students (
  id TEXT PRIMARY KEY,                    -- 5桁0埋め (例: '00001')
  name TEXT NOT NULL,
  password_hash TEXT,
  salt TEXT,
  created_at TIMESTAMPTZ,
  grade TEXT NOT NULL DEFAULT '',
  points INTEGER NOT NULL DEFAULT 0,
  guardian TEXT NOT NULL DEFAULT '',
  level INTEGER NOT NULL DEFAULT 1,
  exp INTEGER NOT NULL DEFAULT 0,
  last_login TIMESTAMPTZ,
  prefecture_count INTEGER NOT NULL DEFAULT 0,
  avatar JSONB,                            -- {hair,face,skin,hairColor,outfitColor}
  apology_bonus_granted_at TIMESTAMPTZ,
  items JSONB NOT NULL DEFAULT '[]',
  rare_collected JSONB NOT NULL DEFAULT '[]',
  rare_defeats JSONB NOT NULL DEFAULT '{}',
  thinker_milestone TEXT,
  logged_correct_count INTEGER NOT NULL DEFAULT 0,
  today_stats JSONB,                       -- {date, correct, total}
  hp INTEGER NOT NULL DEFAULT 0,
  last_ranking_test_month TEXT,            -- 'yyyy-MM'
  world_lap INTEGER NOT NULL DEFAULT 1,
  world_lap_start_level INTEGER NOT NULL DEFAULT 100,
  world_boss_defeated JSONB NOT NULL DEFAULT '{}',
  world_allies JSONB NOT NULL DEFAULT '[]',
  challenge_correct_total INTEGER NOT NULL DEFAULT 0,
  pending_notice TEXT,                     -- 次回ログイン時に1回だけ表示するお知らせ(表示後NULLに戻す)
  speed_seed_count INTEGER NOT NULL DEFAULT 0, -- なんでも屋「すばやさの種」の所持数(消費型)
  iron_wall_charges INTEGER NOT NULL DEFAULT 0, -- なんでも屋「鉄壁の盾」の残りチャージ数(0〜3、複数保有不可)
  steel_armor_charges INTEGER NOT NULL DEFAULT 0, -- なんでも屋「鋼の鎧」の残りチャージ数(0〜10、複数保有不可)
  world_country INTEGER NOT NULL DEFAULT 0 -- 世界一周の制覇済みヵ国数(サイコロ方式、クライアント管理・直接SET)
);
CREATE INDEX idx_students_points ON students (points DESC);
CREATE INDEX idx_students_hp ON students (hp DESC);
CREATE INDEX idx_students_grade ON students (grade);
CREATE INDEX idx_students_challenge_total ON students (challenge_correct_total DESC);

CREATE TABLE records (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  student_id TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  name TEXT,
  category TEXT,
  correct BOOLEAN
);
CREATE INDEX idx_records_student_id ON records (student_id);
CREATE INDEX idx_records_ts ON records (ts);

CREATE TABLE test_photos (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  student_id TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  name TEXT,
  test_type TEXT,
  score_tier TEXT,
  points_awarded INTEGER,
  drive_file_id TEXT,                      -- 当面はGoogle Driveのまま。後日Vercel Blob等へ切替検討
  expires_at TIMESTAMPTZ
);
CREATE INDEX idx_test_photos_student_id ON test_photos (student_id);

CREATE TABLE weekly_quiz_answers (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  student_id TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  name TEXT,
  grade TEXT,
  week_key TEXT NOT NULL,                  -- 月曜日キー、または 'SPECIAL:yyyy-MM-dd'
  correct BOOLEAN,
  points_delta INTEGER
);
CREATE INDEX idx_weekly_quiz_student_week ON weekly_quiz_answers (student_id, week_key);

CREATE TABLE guardians (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  guardian_name TEXT,
  child_id_1 TEXT, child_name_1 TEXT,
  child_id_2 TEXT, child_name_2 TEXT,
  child_id_3 TEXT, child_name_3 TEXT,
  child_id_4 TEXT, child_name_4 TEXT
);

-- 会計記録のため退会後も残す(CASCADEなし)
CREATE TABLE gift_requests (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  student_id TEXT,
  name TEXT,
  item TEXT,
  yen INTEGER,
  mp INTEGER,
  status TEXT,
  code TEXT
);
CREATE INDEX idx_gift_requests_student_id ON gift_requests (student_id);

CREATE TABLE gift_codes (
  id BIGSERIAL PRIMARY KEY,
  item_id TEXT,
  code TEXT UNIQUE,
  status TEXT,
  used_by TEXT,
  used_at TIMESTAMPTZ
);
CREATE INDEX idx_gift_codes_item_status ON gift_codes (item_id, status);

CREATE TABLE item_grants (
  id BIGSERIAL PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  item_ids TEXT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_item_grants_student_id ON item_grants (student_id);

-- 監査ログのため退会後も残す(CASCADEなし)
CREATE TABLE points_anomaly_log (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  student_id TEXT,
  name TEXT,
  submitted_points INTEGER,
  clamped_points INTEGER,
  submitted_exp INTEGER,
  clamped_exp INTEGER,
  submitted_level INTEGER,
  clamped_level INTEGER
);

-- 退会した生徒のバックアップ(復元用)。studentsへのFKは張らない
-- (退会と同時にstudents行自体が消えるため)。
CREATE TABLE withdrawn_students (
  id BIGSERIAL PRIMARY KEY,
  withdrawn_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  student_id TEXT NOT NULL,
  name TEXT,
  grade TEXT,
  points INTEGER,
  level INTEGER,
  raw_data JSONB NOT NULL
);
CREATE INDEX idx_withdrawn_students_student_id ON withdrawn_students (student_id);

-- GASのCacheService(ログイン失敗回数のロックアウト)の代替。Postgresには
-- スクリプト単位のキャッシュが無いため、専用テーブルで管理する。
CREATE TABLE login_attempts (
  student_id TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- チーム対抗経験値バトル(5人チームで1ヶ月の経験値上昇量を競うイベント)。
-- 経験値の上昇量はlevelの差分で測る(1勝=経験値+10=1レベルアップで固定のため、
-- levelの差分がそのまま経験値上昇量に比例する。science_expはサーバーに同期されて
-- いないため、level差分を使うのが最も確実)。
CREATE TABLE team_events (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,               -- 'YYYY-MM-DD'(JST基準)
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- active | finished
  rank_pool JSONB,                        -- {"1":10000,"2":7000,...} 順位ごとの分配MP(月によって異なるため開催ごとに保存)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE team_event_teams (
  id BIGSERIAL PRIMARY KEY,
  event_id BIGINT NOT NULL REFERENCES team_events (id) ON DELETE CASCADE,
  team_name TEXT NOT NULL
);
CREATE INDEX idx_team_event_teams_event ON team_event_teams (event_id);

CREATE TABLE team_event_members (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT NOT NULL REFERENCES team_event_teams (id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  start_level INTEGER NOT NULL DEFAULT 1, -- イベント開始時点のlevelスナップショット
  final_gain INTEGER,                     -- 集計確定後の経験値上昇量(終了時に記入)
  points_awarded INTEGER                  -- 集計確定後の分配MP(終了時に記入)
);
CREATE INDEX idx_team_event_members_team ON team_event_members (team_id);
CREATE INDEX idx_team_event_members_student ON team_event_members (student_id);
