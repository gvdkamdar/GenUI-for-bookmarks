import { NextRequest, NextResponse } from 'next/server';
import { db, init } from '@/db';
import { z } from 'zod';
init();

// app/api/ingest/file/route.ts
export const runtime = 'nodejs';


const Row = z.object({
    tweet_id: z.string(),
    text: z.string().optional().default(''),
    author: z.string().optional().default(''),
    created: z.string().optional().default(''),
    url: z.string().optional().default(''),
    domain: z.string().optional().default(''),
});

const upsert = db.prepare(`
  INSERT INTO bookmarks (tweet_id, text, author, created, url, domain)
  VALUES (@tweet_id, @text, @author, @created, @url, @domain)
  ON CONFLICT(tweet_id) DO UPDATE SET
    text=excluded.text, author=excluded.author, created=excluded.created,
    url=excluded.url, domain=excluded.domain
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
