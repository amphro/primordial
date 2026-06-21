CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE games (
  code TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'lobby',
  winner_id TEXT,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  finished_at INTEGER,
  FOREIGN KEY (host_id) REFERENCES users(id)
);

CREATE TABLE game_players (
  game_code TEXT NOT NULL,
  user_id TEXT NOT NULL,
  color TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (game_code, user_id),
  FOREIGN KEY (game_code) REFERENCES games(code),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_code TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  blue_prompt TEXT,
  blue_action TEXT,
  blue_zone TEXT,
  blue_intensity TEXT,
  red_prompt TEXT,
  red_action TEXT,
  red_zone TEXT,
  red_intensity TEXT,
  blue_pct REAL,
  red_pct REAL,
  FOREIGN KEY (game_code) REFERENCES games(code)
);

CREATE INDEX idx_games_status ON games(status);
CREATE INDEX idx_game_players_user ON game_players(user_id);
CREATE INDEX idx_rounds_game ON rounds(game_code);
