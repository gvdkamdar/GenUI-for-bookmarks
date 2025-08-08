export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { db, init } from '@/db';
import slugify from 'slugify';
init();

// --- statements ---
const qUnsortedStmt = db.prepare(`
  SELECT b.tweet_id, b.text, b.url, b.domain
  FROM bookmarks b
  LEFT JOIN bookmark_folder bf ON bf.tweet_id = b.tweet_id
  WHERE bf.tweet_id IS NULL
  LIMIT ?
`);
const qFolders = db.prepare(`SELECT name, slug, id FROM folders`);
const insFolder = db.prepare(`INSERT INTO folders (name, slug) VALUES (?, ?) ON CONFLICT(name) DO NOTHING`);
const getFolderByName = db.prepare(`SELECT id, name FROM folders WHERE name=?`);
const link = db.prepare(`
  INSERT INTO bookmark_folder (tweet_id, folder_id)
  VALUES (?, ?)
  ON CONFLICT(tweet_id) DO UPDATE SET folder_id=excluded.folder_id
`);

// --- small alias map to keep names tidy ---
const ALIASES: Record<string, string> = {
    'research papers': 'Research',
    'papers': 'Research',
    'ml': 'Machine Learning',
    'ai': 'Artificial Intelligence',
    'programming & development': 'Programming',
    'dev': 'Programming',
};
function canonicalName(raw: string) {
    const key = (raw || '').trim();
    const canon = ALIASES[key.toLowerCase()];
    return canon ?? key;
}

// --- LLM call ---
async function callLLM(payload: any) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            response_format: { type: 'json_object' },
            messages: [
                {
                    role: 'system',
                    content:
                        'You assign each tweet to ONE short, Title Case folder. Prefer reusing existing_folders. Respond ONLY with JSON matching {assignments:[{tweet_id,folder}], new_folders:[string]}.'
                },
                { role: 'user', content: JSON.stringify(payload) }
            ]
        })
    });
    return await res.json();
}

export async function POST(req: NextRequest) {
    const { searchParams } = new URL(req.url!);
    const cap = Math.max(1, Math.min(100, Number(searchParams.get('limit') || 50)));

    // fetch unsorted with SQL LIMIT ?
    const items = qUnsortedStmt.all(cap);
    if (items.length === 0) {
        return NextResponse.json({ assigned: 0, created_folders: 0, note: 'no unsorted bookmarks found' });
    }

    if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({
            assigned: 0,
            created_folders: 0,
            error: 'OPENAI_API_KEY is missing. Create .env.local with OPENAI_API_KEY and restart the dev server.',
            unsorted_sample: items.map((x: any) => x.tweet_id).slice(0, 3),
        }, { status: 400 });
    }

    const existing = qFolders.all().map((f: any) => ({ name: f.name, slug: f.slug }));

    let parsed: any = {};
    try {
        const { choices, error } = await callLLM({ existing_folders: existing, items });
        if (error) return NextResponse.json({ assigned: 0, created_folders: 0, llm_error: error }, { status: 502 });
        const content = choices?.[0]?.message?.content || '{}';
        parsed = JSON.parse(content);
    } catch (e: any) {
        return NextResponse.json({ assigned: 0, created_folders: 0, llm_error: String(e) }, { status: 502 });
    }

    const newFolders: string[] = parsed.new_folders || [];
    const assignments: { tweet_id: string; folder: string }[] = parsed.assignments || [];
    if (!assignments.length) {
        return NextResponse.json({
            assigned: 0,
            created_folders: newFolders.length || 0,
            note: 'LLM returned empty assignments',
            debug: { asked_for: items.length }
        });
    }

    let createdCount = 0;
    const ensureFolder = (inputName: string) => {
        const name = canonicalName(inputName);
        const slug = slugify(name, { lower: true, strict: true }) || 'misc';
        const info = insFolder.run(name, slug);   // changes>0 => inserted
        if ((info as any).changes > 0) createdCount += 1;
        const row = getFolderByName.get(name) as any;
        return row.id as number;
    };

    const tx = db.transaction(() => {
        // create any explicitly-declared new folders first
        for (const n of newFolders) ensureFolder(n);

        // then assignments (also creates if missing)
        for (const a of assignments) {
            const folderId = ensureFolder(a.folder);
            link.run(a.tweet_id, folderId);
        }
    });
    tx();

    return NextResponse.json({ assigned: assignments.length, created_folders: createdCount });
}
