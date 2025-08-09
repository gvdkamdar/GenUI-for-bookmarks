// db/index.ts
import Database from 'better-sqlite3';
import fs from 'fs';

export const db = new Database('bookmarks.db');
db.pragma('journal_mode = WAL');

export const init = () => {
    // original schema
    db.exec(fs.readFileSync('db/schema.sql', 'utf8'));



    // lightweight migrations
    const maybeAdd = (sql: string) => { try { db.exec(sql); } catch { } };
    maybeAdd(`ALTER TABLE bookmarks ADD COLUMN tweet_url TEXT;`);
    maybeAdd(`ALTER TABLE bookmarks ADD COLUMN lang TEXT;`);
    maybeAdd(`ALTER TABLE bookmarks ADD COLUMN conversation_id TEXT;`);
    maybeAdd(`ALTER TABLE bookmarks ADD COLUMN urls_json TEXT;`);
    maybeAdd(`ALTER TABLE bookmarks ADD COLUMN media_json TEXT;`);
    maybeAdd(`ALTER TABLE bookmarks ADD COLUMN quoted_json TEXT;`);

    maybeAdd(`CREATE INDEX IF NOT EXISTS idx_bookmarks_conversation ON bookmarks(conversation_id);`);
    maybeAdd(`CREATE INDEX IF NOT EXISTS idx_bf_folder ON bookmark_folder(folder_id);`);
    maybeAdd(`CREATE INDEX IF NOT EXISTS idx_bf_tweet ON bookmark_folder(tweet_id);`);

    maybeAdd(`ALTER TABLE bookmarks ADD COLUMN in_reply_to_json TEXT;`);
    maybeAdd(`ALTER TABLE bookmarks ADD COLUMN self_thread_root TEXT;`);

    maybeAdd(`CREATE INDEX IF NOT EXISTS idx_bookmarks_self_thread ON bookmarks(self_thread_root);`);
};
