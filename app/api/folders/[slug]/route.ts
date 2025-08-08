export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { db, init } from '@/db';
init();

// export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
//   const { slug } = await ctx.params; // ← await params

//   const rows = db.prepare(`
//     SELECT b.*
//     FROM folders f
//     JOIN bookmark_folder bf ON bf.folder_id = f.id
//     JOIN bookmarks b ON b.tweet_id = bf.tweet_id
//     WHERE f.slug = ?
//     ORDER BY b.created DESC
//     LIMIT 100
//   `).all(slug);

//   return NextResponse.json(rows);
// }


export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const { slug } = params;
  const rows = db.prepare(`
    SELECT b.*
    FROM folders f
    JOIN bookmark_folder bf ON bf.folder_id = f.id
    JOIN bookmarks b ON b.tweet_id = bf.tweet_id
    WHERE f.slug = ?
    ORDER BY b.created DESC
    LIMIT 100
  `).all(slug);
  return NextResponse.json(rows);
}
