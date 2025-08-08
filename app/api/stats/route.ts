export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { db, init } from '@/db';
init();

export async function GET() {
    const total = (db.prepare('SELECT COUNT(*) as c FROM bookmarks').get() as any).c as number;
    const assigned = (db.prepare('SELECT COUNT(*) as c FROM bookmark_folder').get() as any).c as number;
    const folders = (db.prepare('SELECT COUNT(*) as c FROM folders').get() as any).c as number;
    return NextResponse.json({
        total_bookmarks: total,
        assigned_bookmarks: assigned,
        unassigned_bookmarks: total - assigned,
        folders
    });
}
