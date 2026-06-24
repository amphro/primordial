ALTER TABLE rounds ADD COLUMN blue_delta INTEGER;
ALTER TABLE rounds ADD COLUMN red_delta INTEGER;
ALTER TABLE rounds ADD COLUMN latency_blue_ms INTEGER;
ALTER TABLE rounds ADD COLUMN latency_red_ms INTEGER;
ALTER TABLE rounds ADD COLUMN counters TEXT DEFAULT '[]';

CREATE TABLE game_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_code TEXT NOT NULL,
  error_type TEXT NOT NULL,
  round INTEGER,
  message TEXT NOT NULL,
  ts INTEGER NOT NULL
);

CREATE INDEX idx_game_errors_code ON game_errors(game_code);
