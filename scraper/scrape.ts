import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = path.join(process.cwd(), 'out');
const NDJSON = path.join(OUT, 'bookmarks.ndjson');

// Set to true for the first run so we capture a real payload.
// After you see out/sample.json, flip this to false (or leave true; it only dumps once).
const DUMP_FIRST_SAMPLE = true;

function safeJsonParse(t: string) {
    try { return JSON.parse(t); } catch { return null; }
}

function walk(obj: any, fn: (node: any) => void) {
    if (!obj || typeof obj !== 'object') return;
    fn(obj);
    if (Array.isArray(obj)) { for (const it of obj) walk(it, fn); }
    else { for (const k of Object.keys(obj)) walk(obj[k], fn); }
}

// function extractTweets(payload: any) {
//     type Row = {
//         tweet_id: string;
//         text: string;
//         author: string;
//         created: string;
//         url: string;
//         domain: string;
//     };
//     const rows: Row[] = [];

//     const walk = (n: any) => {
//         if (!n || typeof n !== 'object') return;

//         // Detect a tweet result in either common envelope
//         const result =
//             n?.tweet_results?.result ??
//             n?.itemContent?.tweet_results?.result;

//         const legacy = result?.legacy;
//         if (!legacy) {                   // no tweet here
//             for (const k in n) walk(n[k]); // recurse
//             return;
//         }

//         // ----- author -----
//         const userNode =
//             result.core?.user_results?.result ??
//             result.core?.user_legacy ??
//             null;

//         const screenName =
//             userNode?.legacy?.screen_name ??   // older layout
//             userNode?.core?.screen_name ??    // newer layout
//             '';

//         // ----- first outbound link -----
//         const urlsArr = legacy.entities?.urls ?? [];
//         const firstUrl = urlsArr[0]?.expanded_url ?? '';
//         let domain = '';
//         try { if (firstUrl) domain = new URL(firstUrl).hostname; } catch {/* ignore */ }

//         rows.push({
//             tweet_id: result.rest_id,
//             text: legacy.full_text,
//             author: screenName,
//             created: legacy.created_at,
//             url: firstUrl,
//             domain
//         });

//         for (const k in n) walk(n[k]); // continue recursion
//     };

//     walk(payload);
//     return rows;
// }

// scraper/extract.ts (or inline in scrape.ts)

type Media = {
    media_key?: string;
    type?: string; // photo | video | animated_gif
    media_url_https?: string; // for photos
    expanded_url?: string;
    preview_image_url?: string; // for video/gif if available
    video_variants?: { content_type?: string; bitrate?: number; url: string }[];
    sizes?: { w?: number; h?: number };
    alt_text?: string;
};

type MinimalTweet = {
    tweet_id: string;
    tweet_url: string;
    author_screen_name: string;
    author_name?: string;
    author_id?: string;
    created?: string;
    lang?: string;
    full_text: string;
    conversation_id?: string;
    urls?: { expanded_url: string; display_url?: string; domain?: string }[];
    media?: Media[];
    quoted_status?: MinimalTweet;

    in_reply_to?: {
        status_id?: string | null;
        user_id?: string | null;
        screen_name?: string | null;
    };
    self_thread_root?: string | null;
};

function pickFullText(result: any): string {
    // Long tweets sometimes use note_tweet
    const note = result?.note_tweet?.note_tweet_results?.result?.text;
    if (note) return note;
    const legacyText = result?.legacy?.full_text || '';
    return legacyText;
}

// function getUser(result: any) {
//     const userNode =
//         result?.core?.user_results?.result ?? result?.core?.user_legacy ?? null;

//     const legacy = userNode?.legacy;
//     return {
//         screen_name:
//             legacy?.screen_name ??
//             userNode?.core?.screen_name ??
//             '', // fallback empty
//         name: legacy?.name ?? '',
//         id: userNode?.rest_id ?? legacy?.id_str ?? ''
//     };
// }

function getUser(result: any) {
    const userNode = result?.core?.user_results?.result ?? result?.core?.user_legacy ?? null;
    const legacy = userNode?.legacy;
    const core = userNode?.core;
    return {
        screen_name: legacy?.screen_name ?? core?.screen_name ?? '',
        name: legacy?.name ?? core?.name ?? '',          // ← add this fallback
        id: userNode?.rest_id ?? legacy?.id_str ?? ''
    };
}


function computeTweetUrl(screenName: string, id: string) {
    return screenName
        ? `https://x.com/${screenName}/status/${id}`
        : `https://x.com/i/web/status/${id}`;
}

function extractUrls(legacy: any) {
    const urls = legacy?.entities?.urls ?? [];
    return urls.map((u: any) => {
        let domain = '';
        try { if (u?.expanded_url) domain = new URL(u.expanded_url).hostname; } catch { }
        return {
            expanded_url: u?.expanded_url || '',
            display_url: u?.display_url || '',
            domain
        };
    });
}

function extractMedia(legacy: any): Media[] {
    const out: Media[] = [];
    const media = legacy?.extended_entities?.media ?? legacy?.entities?.media ?? [];
    for (const m of media) {
        const sizes = m?.sizes?.large ?? m?.sizes?.medium ?? m?.sizes?.small ?? null;
        const base: Media = {
            media_key: m?.media_key,
            type: m?.type,
            media_url_https: m?.media_url_https,
            expanded_url: m?.expanded_url,
            preview_image_url: m?.video_info?.variants ? (m?.media_url_https ?? m?.preview_image_url) : undefined,
            sizes: sizes ? { w: sizes.w, h: sizes.h } : undefined,
            alt_text: m?.ext_alt_text || undefined,
        };
        // video/gif variants
        const variants = m?.video_info?.variants;
        if (Array.isArray(variants) && variants.length) {
            base.video_variants = variants
                .filter((v: any) => typeof v?.url === 'string')
                .map((v: any) => ({
                    content_type: v?.content_type,
                    bitrate: v?.bitrate,
                    url: v?.url
                }));
        }
        out.push(base);
    }
    return out;
}

function extractOneTweet(result: any): MinimalTweet | null {
    if (!result) return null;
    const id = result?.rest_id || result?.legacy?.id_str;
    const legacy = result?.legacy;
    if (!id || !legacy) return null;

    const user = getUser(result);
    const full_text = pickFullText(result);
    const urls = extractUrls(legacy);
    const media = extractMedia(legacy);
    const created = legacy?.created_at;
    const lang = legacy?.lang;
    const conversation_id = legacy?.conversation_id_str || result?.conversation_id_str;

    const in_reply_to = {
        status_id: legacy?.in_reply_to_status_id_str ?? null,
        user_id: legacy?.in_reply_to_user_id_str ?? null,
        screen_name: legacy?.in_reply_to_screen_name ?? null,
    };
    const self_thread_root = legacy?.self_thread?.id_str ?? null;


    // quoted tweet (one-level)
    const q = result?.quoted_status_result?.result;
    const quoted = q ? extractOneTweet(q) : null;

    return {
        tweet_id: id,
        tweet_url: computeTweetUrl(user.screen_name, id),
        author_screen_name: user.screen_name,
        author_name: user.name,
        author_id: user.id,
        created,
        lang,
        full_text,
        conversation_id,
        urls,
        media,
        quoted_status: quoted || undefined,

        in_reply_to,
        self_thread_root,


    };
}

export function extractTweets(payload: any): MinimalTweet[] {
    const rows: MinimalTweet[] = [];

    function visit(n: any) {
        if (!n || typeof n !== 'object') return;

        const result =
            n?.tweet_results?.result ??
            n?.itemContent?.tweet_results?.result ??
            null;

        if (result?.__typename === 'Tweet') {
            const t = extractOneTweet(result);
            if (t) rows.push(t);
        }

        for (const k in n) {
            const v = n[k];
            if (v && typeof v === 'object') visit(v);
        }
    }

    visit(payload);
    return rows;
}



async function main() {
    fs.mkdirSync(OUT, { recursive: true });

    const userDataDir = path.join(process.cwd(), '.pw-user');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false, // keep visible while we stabilize
    });
    let scrapedCount = 0;

    try {
        const pages = context.pages();
        const page = pages.length ? pages[0] : await context.newPage();
        await page.bringToFront();

        await page.goto('https://x.com/i/bookmarks', {
            waitUntil: 'domcontentloaded',
            timeout: 90_000
        });

        console.log('🔑  Please log in to X in the opened browser window, then press ENTER here to continue...');
        await new Promise<void>(resolve => process.stdin.once('data', () => resolve()));

        const seen = new Set<string>();
        const out = fs.createWriteStream(NDJSON, { flags: 'w' });

        let sampleDumped = false;
        page.on('response', async (resp) => {
            try {
                const url = resp.url();
                // Narrow to GraphQL fetches that likely contain bookmark timeline chunks
                if (!url.includes('/graphql')) return;
                const lower = url.toLowerCase();
                if (!lower.includes('bookmark')) return;

                // Some responses may not be pure JSON; read as text then parse
                const text = await resp.text();
                const json = safeJsonParse(text);
                if (!json) return;

                if (DUMP_FIRST_SAMPLE && !sampleDumped) {
                    fs.writeFileSync(path.join(OUT, 'sample.json'), text);
                    sampleDumped = true;
                    console.log('📦 Saved out/sample.json — open it to see the exact structure.');
                }

                const entries = extractTweets(json);
                if (!entries?.length) return;

                for (const e of entries) {
                    if (seen.has(e.tweet_id)) continue;
                    seen.add(e.tweet_id);
                    out.write(JSON.stringify(e) + '\n');
                }
                scrapedCount = seen.size;
            } catch (e) {
                console.error('resp handler error:', e);
            }
        });

        // auto-scroll until "idle" (no new tweets for ~8 seconds)
        let idle = 0;
        while (idle < 8000) {
            const before = scrapedCount;
            await page.mouse.wheel(0, 20000);
            await page.waitForTimeout(1500);
            const after = scrapedCount;
            idle = (after === before) ? idle + 1500 : 0;
        }

        out.end();
    } catch (err) {
        console.error('⚠️ scrape error', err);
    } finally {
        console.log(`✅ Done. scraped ${scrapedCount} bookmarks.`);
        // Leave the browser open for now so you can inspect; comment the next line in when stable:
        // await context.close();
    }
}

main();
