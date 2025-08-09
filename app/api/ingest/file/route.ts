import { NextRequest, NextResponse } from 'next/server';
import { db, init } from '@/db';
import { z } from 'zod';
init();

// app/api/ingest/file/route.ts
export const runtime = 'nodejs';


// const Row = z.object({
//     tweet_id: z.string(),
//     text: z.string().optional().default(''),
//     author: z.string().optional().default(''),
//     created: z.string().optional().default(''),
//     url: z.string().optional().default(''),
//     domain: z.string().optional().default(''),
// });

// const upsert = db.prepare(`
//   INSERT INTO bookmarks (tweet_id, text, author, created, url, domain)
//   VALUES (@tweet_id, @text, @author, @created, @url, @domain)
//   ON CONFLICT(tweet_id) DO UPDATE SET
//     text=excluded.text, author=excluded.author, created=excluded.created,
//     url=excluded.url, domain=excluded.domain
// `);

// app/api/ingest/file/route.ts


const Row = z.object({
    tweet_id: z.string(),
    tweet_url: z.string().optional().default(''),
    author_screen_name: z.string().optional().default(''),
    author_name: z.string().optional().default(''),
    author_id: z.string().optional().default(''),
    created: z.string().optional().default(''),
    lang: z.string().optional().default(''),
    conversation_id: z.string().optional().default(''),
    full_text: z.string().optional().default(''),
    // keep for backward compat:
    author: z.string().optional().default(''),
    url: z.string().optional().default(''),
    domain: z.string().optional().default(''),
    // new JSON fields (arrays/objects) — store as TEXT
    urls: z.array(z.any()).optional(),
    media: z.array(z.any()).optional(),
    quoted_status: z.any().optional(),
    in_reply_to: z.object({
        status_id: z.string().nullable().optional(),
        user_id: z.string().nullable().optional(),
        screen_name: z.string().nullable().optional(),
    }).optional(),
    self_thread_root: z.string().nullable().optional(),
}).transform(r => ({
    ...r,
    // canonical 'author' keeps your old column semantics (screen name)
    author: r.author || r.author_screen_name || '',
    urls_json: r.urls ? JSON.stringify(r.urls) : null,
    media_json: r.media ? JSON.stringify(r.media) : null,
    quoted_json: r.quoted_status ? JSON.stringify(r.quoted_status) : null,
    in_reply_to_json: r.in_reply_to ? JSON.stringify(r.in_reply_to) : null,

}));

// const upsert = db.prepare(`

//   INSERT INTO bookmarks (tweet_id, text, author, created, url, domain,
//                          tweet_url, lang, conversation_id, urls_json, media_json, quoted_json)
//   VALUES (@tweet_id, @full_text, @author, @created, @url, @domain,
//           @tweet_url, @lang, @conversation_id, @urls_json, @media_json, @quoted_json)
//   ON CONFLICT(tweet_id) DO UPDATE SET
//     text=excluded.text,
//     author=excluded.author,
//     created=excluded.created,
//     url=excluded.url,
//     domain=excluded.domain,
//     tweet_url=excluded.tweet_url,
//     lang=excluded.lang,
//     conversation_id=excluded.conversation_id,
//     urls_json=excluded.urls_json,
//     media_json=excluded.media_json,
//     quoted_json=excluded.quoted_json
// `);

const upsert = db.prepare(`
    INSERT INTO bookmarks (
      tweet_id, text, author, created, url, domain,
      tweet_url, lang, conversation_id,
      urls_json, media_json, quoted_json,
      in_reply_to_json, self_thread_root
    )
    VALUES (
      @tweet_id, @full_text, @author, @created, @url, @domain,
      @tweet_url, @lang, @conversation_id,
      @urls_json, @media_json, @quoted_json,
      @in_reply_to_json, @self_thread_root
    )
    ON CONFLICT(tweet_id) DO UPDATE SET
      text=excluded.text,
      author=excluded.author,
      created=excluded.created,
      url=excluded.url,
      domain=excluded.domain,
      tweet_url=excluded.tweet_url,
      lang=excluded.lang,
      conversation_id=excluded.conversation_id,
      urls_json=excluded.urls_json,
      media_json=excluded.media_json,
      quoted_json=excluded.quoted_json,
      in_reply_to_json=excluded.in_reply_to_json,
      self_thread_root=excluded.self_thread_root
  `);


export async function POST(req: NextRequest) {
    const contentType = req.headers.get('content-type') || '';
    const tx = db.transaction((rows: any[]) => rows.forEach(r => upsert.run(r)));

    let rows: any[] = [];
    if (contentType.includes('application/x-ndjson')) {
        const text = await req.text();
        rows = text.split('\n').filter(Boolean).map(l => Row.parse(JSON.parse(l)));
    } else {
        const json = await req.json();
        rows = Array.isArray(json) ? json.map((r: any) => Row.parse(r)) : [Row.parse(json)];
    }

    tx.immediate(rows);
    return NextResponse.json({ ingested: rows.length });
}
