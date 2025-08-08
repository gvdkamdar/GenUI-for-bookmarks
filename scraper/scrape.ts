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

function extractTweets(payload: any) {
    type Row = {
        tweet_id: string;
        text: string;
        author: string;
        created: string;
        url: string;
        domain: string;
    };
    const rows: Row[] = [];

    const walk = (n: any) => {
        if (!n || typeof n !== 'object') return;

        // Detect a tweet result in either common envelope
        const result =
            n?.tweet_results?.result ??
            n?.itemContent?.tweet_results?.result;

        const legacy = result?.legacy;
        if (!legacy) {                   // no tweet here
            for (const k in n) walk(n[k]); // recurse
            return;
        }

        // ----- author -----
        const userNode =
            result.core?.user_results?.result ??
            result.core?.user_legacy ??
            null;

        const screenName =
            userNode?.legacy?.screen_name ??   // older layout
            userNode?.core?.screen_name ??    // newer layout
            '';

        // ----- first outbound link -----
        const urlsArr = legacy.entities?.urls ?? [];
        const firstUrl = urlsArr[0]?.expanded_url ?? '';
        let domain = '';
        try { if (firstUrl) domain = new URL(firstUrl).hostname; } catch {/* ignore */ }

        rows.push({
            tweet_id: result.rest_id,
            text: legacy.full_text,
            author: screenName,
            created: legacy.created_at,
            url: firstUrl,
            domain
        });

        for (const k in n) walk(n[k]); // continue recursion
    };

    walk(payload);
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
