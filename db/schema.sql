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
  science_exp INTEGER NOT NULL DEFAULT 0, -- 理科モードの経験値(以前はクライアントのみで保持しており、レベル整合性チェックが算数expだけを見ていたため同期のたびに理科分のレベルアップが巻き戻るバグがあった)
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
  last_proof_test_month TEXT,              -- 'yyyy-MM'。中2限定「証明」満点提出(2026-09-19配布分、9/26締切)の月1回制限用
  -- ログイン前チェック(文章題連続正解)成功時の+3HPボーナスの、1日1回制限用(JST,
  -- 'yyyy-MM-dd')。以前は無制限で、ログアウト→ログインを繰り返すだけでHPを
  -- 際限なく稼げてしまっていた(MPは同様の不具合が過去にあり日次上限で対策済み
  -- だったが、HPには対策が漏れていた)。
  hp_login_bonus_date TEXT,
  world_lap INTEGER NOT NULL DEFAULT 1,
  world_lap_start_level INTEGER NOT NULL DEFAULT 100,
  world_boss_defeated JSONB NOT NULL DEFAULT '{}',
  world_allies JSONB NOT NULL DEFAULT '[]',
  challenge_correct_total INTEGER NOT NULL DEFAULT 0,
  pending_notice TEXT,                     -- 次回ログイン時に1回だけ表示するお知らせ(表示後NULLに戻す)
  speed_seed_count INTEGER NOT NULL DEFAULT 0, -- なんでも屋「すばやさの種」の所持数(消費型)
  iron_wall_charges INTEGER NOT NULL DEFAULT 0, -- なんでも屋「鉄壁の盾」の残りチャージ数(0〜3、複数保有不可)
  steel_armor_charges INTEGER NOT NULL DEFAULT 0, -- なんでも屋「鋼の鎧」の残りチャージ数(0〜10、複数保有不可)
  world_country INTEGER NOT NULL DEFAULT 0, -- 世界一周の制覇済みヵ国数(2026-09-01からサイコロ方式、クライアント管理・直接SET)
  world_continent_bonus JSONB NOT NULL DEFAULT '{}', -- 大陸制覇ボーナス(500MP)を今の周で既に受け取った大陸のID一覧(重複付与防止用、周が変わるとリセット)
  treasure_items JSONB NOT NULL DEFAULT '{}', -- 宝箱・鍵・指輪(2026-08-28〜)の所持数。{chestBronze,keyBronze,ringBronze,...}のようにティア(bronze/silver/gold/rainbow)ごとに数える。鍵の購入・指輪の売却・宝箱を開ける処理はサーバー側で検証してから更新する
  spellbooks JSONB NOT NULL DEFAULT '{}', -- なんでも屋で購入する魔法の書(2周目/9月のボス戦専用消費アイテム)の所持冊数。{fire,ice,thunder,...}のように属性ごとに数える。購入はサーバー側でMP検証してから実行する
  photo_avatar_consent BOOLEAN NOT NULL DEFAULT false, -- 写真アバター機能(顔写真をアバターにする機能)の保護者同意。保護者登録フォーム(handleRegisterGuardian)で、お子様のID・パスワードを検証したうえで同意チェックが入っていれば自動的にtrueになる(先生による手動フラグ付けは不要)
  -- 1日のMP獲得上限のサーバー側管理(2026-09-07〜)。以前は端末のlocalStorageだけで
  -- 「今日の獲得済みMP」を管理していたため、同じIDを複数端末で使うと、端末ごとに
  -- 上限のカウントが0からリセットされ、端末の台数分だけ上限を超えて稼げてしまう
  -- 不具合(生徒からの実報告あり)があった。points_today_calc/word/bonusは
  -- handleSyncPointsで「サーバー保持値」と「端末申告値」のうち大きい方を採用する形で
  -- 端末をまたいでマージし、実際にpointsへ加算してよい増分(legitDelta)をこの
  -- マージ後の値の増分だけに制限することで、端末を何台使っても実際に加算される
  -- MPの合計が1日の上限(計算50+文章題50+ボーナス系)を超えないようにする。
  points_date TEXT,                        -- 上記カウンタの基準日(JST, 'yyyy-MM-dd')
  points_today_calc INTEGER NOT NULL DEFAULT 0,  -- 当日、計算問題で加算されたMP(上限50)
  points_today_word INTEGER NOT NULL DEFAULT 0,  -- 当日、文章題で加算されたMP(上限50)
  points_today_bonus INTEGER NOT NULL DEFAULT 0, -- 当日、ダブル成功・今日のミッションなど上限を経由しない加算の合計(上限なし、端末間はマージのみ)
  -- 今日のミッション(1日1回、10問正解で+20MP)も同様に端末ローカルでしか
  -- 「達成済みか」を管理しておらず、複数端末で2回達成扱いにできてしまったため、
  -- 「今日、既に達成したか」だけはサーバー側でも保持し、端末間でOR(一度でも
  -- どこかの端末で達成していれば達成済み)としてマージする。
  mission_date TEXT,                       -- ミッションの達成状況の基準日(JST, 'yyyy-MM-dd')
  mission_correct INTEGER NOT NULL DEFAULT 0,
  mission_claimed BOOLEAN NOT NULL DEFAULT false,
  -- 算数・数学の単元別「級」システム(2026-09-18〜)。各単元(CATEGORIESのid)ごとに
  -- 生涯の出題数・正答率から3級/2級/1級/黒帯を判定し、一度到達したら後で正答率が
  -- 下がっても失われない実績バッジとして扱う(クライアントが計算し、rare_defeatsと
  -- 同じ「値が大きい方を採用」パターンでマージするため、他の実績系フィールドと
  -- 同程度の信頼モデル)。{catId: 0〜4の段位レベル}
  category_ranks JSONB NOT NULL DEFAULT '{}',
  -- 学年またぎの完全制覇コンプリートボーナス(500MP、期間限定)。一度受け取ったら
  -- 二重付与されないよう学年名をキーにフラグを立てる。判定・付与はhandleSyncPoints
  -- 側でcategory_ranksマージ後にサーバー側で行う(bonus_awardedと同じ位置づけ)。
  -- {'小4': true, '小5': true, ...}
  completion_bonus JSONB NOT NULL DEFAULT '{}',
  -- 富士登山(2026年10月限定、47都道府県制覇済みなら世界一周の途中でも挑戦可)。
  -- 山頂到達は一度trueになったら戻らない実績フラグ。山頂到達時点でレベル1000
  -- 未満だと勇者の剣はもらえない(その場限りの判定で、後から再取得はできない)。
  fuji_summit_reached BOOLEAN NOT NULL DEFAULT false,
  -- 勇者の剣(山頂到達時にレベル1000以上なら入手)の、今使える所持数(0か1)。
  -- 使うと0になる(なんでも屋「刀を研ぐ」500MPで1に戻せる)。
  yusha_sword_count INTEGER NOT NULL DEFAULT 0,
  -- 勇者の剣を一度でも手に入れたことがあるかの永続フラグ。使い切って0になっても
  -- これはtrueのまま保たれ、図鑑に記念として表示し続けるために使う。
  yusha_sword_obtained BOOLEAN NOT NULL DEFAULT false,
  -- 富士登山の到達合目(0〜10)。世界一周ボス戦と違い複数日にまたがって挑戦できる
  -- よう永続化する。fuji_leg_streakは今の区間(fuji_station→fuji_station+1)の
  -- 連続正解数、fuji_time_attack_started_atは9合目(タイムアタック区間)の
  -- 開始時刻(ミリ秒epoch文字列、対象外はNULL)。
  fuji_station INTEGER NOT NULL DEFAULT 0,
  fuji_leg_streak INTEGER NOT NULL DEFAULT 0,
  fuji_time_attack_started_at TEXT,
  -- 毎日勉強時間報告(2026-09-20〜)。1日1回、報告のたびに+1MP+1HP(1日のMP上限を
  -- 経由しない直接加算)。study_report_dateで1日1回制限、study_report_totalは
  -- 通算報告回数で、小学生/中学生別の月間ランキングに使う。
  study_report_date TEXT,
  study_report_total INTEGER NOT NULL DEFAULT 0,
  -- 報告のたびに選んだ勉強時間(分、30分刻み)の累計。ランキングには使わず
  -- 記録用(将来の表示・分析用)。
  study_report_minutes_total INTEGER NOT NULL DEFAULT 0
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

-- 100マス計算チャレンジのタイム記録(2026-09-20〜)。test_photosは21日で自動削除
-- されるため、成長記録(過去のタイムの推移)を残すには使えない。そのため提出のたびに
-- ここへも記録し、週替わりランキング(week_key単位)と、生徒本人だけが見られる
-- 自分のタイムの推移(成長記録)の両方のデータ源として使う。退会後もCASCADEで消える。
CREATE TABLE hyakumasu_times (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  student_id TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  name TEXT,
  grade TEXT,
  week_key TEXT NOT NULL,                  -- 月曜日キー(週替わりランキング集計用)
  time_seconds INTEGER NOT NULL
);
CREATE INDEX idx_hyakumasu_times_student ON hyakumasu_times (student_id);
CREATE INDEX idx_hyakumasu_times_week ON hyakumasu_times (week_key);

-- 読書の秋(2026-09-20〜)。読み終わった本のタイトルと感想(50文字以上)を提出すると
-- +5MP+10HP、1日1回まで。月間の冊数(month_key単位)でランキングし、上位10人の
-- 投稿内容は他の生徒にも表示する。退会後もCASCADEで消える。
-- 毎日勉強時間報告の個別記録(2026-09-20〜)。studentsのstudy_report_totalは
-- 全期間の通算だけを見るが、本日ランキング(date_key)・今月累計ランキング
-- (month_key合計)・自分の学習カレンダー(月ごとの日別分数)にはこの行単位の
-- 記録が必要なため別テーブルにしている。退会後もCASCADEで消える。
CREATE TABLE study_reports (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  student_id TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  name TEXT,
  grade TEXT,
  date_key TEXT NOT NULL,                  -- 'yyyy-MM-dd'
  month_key TEXT NOT NULL,                 -- 'yyyy-MM'
  minutes INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_study_reports_student ON study_reports (student_id);
CREATE INDEX idx_study_reports_date ON study_reports (date_key);
CREATE INDEX idx_study_reports_month ON study_reports (month_key);

CREATE TABLE reading_log (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  student_id TEXT NOT NULL REFERENCES students (id) ON DELETE CASCADE,
  name TEXT,
  grade TEXT,
  month_key TEXT NOT NULL,                 -- 'yyyy-MM'
  title TEXT NOT NULL,
  review TEXT NOT NULL
);
CREATE INDEX idx_reading_log_student ON reading_log (student_id);
CREATE INDEX idx_reading_log_month ON reading_log (month_key);

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
