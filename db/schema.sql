CREATE TABLE IF NOT EXISTS bookmarks (
  tweet_id TEXT PRIMARY KEY,
  text     TEXT,
  author   TEXT,
  created  TEXT,
  url      TEXT,
  domain   TEXT
);

CREATE TABLE IF NOT EXISTS folders (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmark_folder (
  tweet_id  TEXT PRIMARY KEY,
  folder_id INTEGER NOT NULL,
  FOREIGN KEY (tweet_id) REFERENCES bookmarks(tweet_id),
  FOREIGN KEY (folder_id) REFERENCES folders(id)
);

-- db/schema.sql (append)
ALTER TABLE bookmarks ADD COLUMN tweet_url TEXT;
ALTER TABLE bookmarks ADD COLUMN lang TEXT;
ALTER TABLE bookmarks ADD COLUMN conversation_id TEXT;
ALTER TABLE bookmarks ADD COLUMN urls_json TEXT;   -- JSON string
ALTER TABLE bookmarks ADD COLUMN media_json TEXT;  -- JSON string
ALTER TABLE bookmarks ADD COLUMN quoted_json TEXT; -- JSON string

CREATE INDEX IF NOT EXISTS idx_bookmarks_conversation ON bookmarks(conversation_id);
CREATE INDEX IF NOT EXISTS idx_bf_folder ON bookmark_folder(folder_id);
CREATE INDEX IF NOT EXISTS idx_bf_tweet  ON bookmark_folder(tweet_id);
