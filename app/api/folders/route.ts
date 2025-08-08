import { NextResponse } from 'next/server';
import { db, init } from '@/db';
init();

// app/api/ingest/file/route.ts
export const runtime = 'nodejs';

export async function GET() {
  const rows = db.prepare(`
    SELECT f.name, f.slug, COUNT(bf.tweet_id) as count
    FROM folders f
    LEFT JOIN bookmark_folder bf ON bf.folder_id = f.id
    GROUP BY f.id ORDER BY count DESC, f.name ASC
  `).all();
  return NextResponse.json(rows);
}
