# Twitter Bookmarks Scraper & Viewer

A comprehensive tool to scrape your Twitter/X bookmarks and view them in a clean, searchable web interface.

## Features

- **Automated Scraping**: Uses Playwright to automatically scroll through and extract your Twitter bookmarks
- **Clean Web Interface**: Built with Next.js to browse and search your saved bookmarks
- **Local Database**: Stores bookmarks in SQLite for fast searching and persistence
- **Rich Data Extraction**: Captures tweet text, author, creation date, and linked URLs
- **Domain Categorization**: Automatically extracts and categorizes links by domain

## Project Structure

- `scraper/` - Playwright-based Twitter scraper
- `app/` - Next.js web interface for viewing bookmarks
- `db/` - Database schema and connection logic
- `out/` - Scraper output (NDJSON format)

## Prerequisites

- Node.js 18+ 
- pnpm (recommended) or npm
- A Twitter/X account with bookmarks

## Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd twitter-bookmarks-backend
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up the database**
   ```bash
   # The database will be automatically created when you first run the scraper
   ```

## Usage

### Step 1: Scrape Your Bookmarks

```bash
# Run the scraper
npx tsx scraper/scrape.ts
```

**Important**: 
- The scraper will open a browser window
- You'll need to manually log into Twitter/X when prompted
- Press ENTER in the terminal after logging in
- The scraper will automatically scroll and collect bookmarks
- It stops when no new bookmarks are found for 8 seconds

### Step 2: View Your Bookmarks

```bash
# Start the web interface
pnpm dev
```

Then open [http://localhost:3000](http://localhost:3000) to browse your bookmarks.

## How It Works

1. **Scraping**: The scraper uses Playwright to:
   - Open Twitter's bookmarks page
   - Intercept GraphQL API responses containing bookmark data
   - Extract tweet information (ID, text, author, date, links)
   - Save everything to `out/bookmarks.ndjson`

2. **Storage**: Bookmark data is stored in a local SQLite database for:
   - Fast searching and filtering
   - Persistence across sessions
   - Structured queries

3. **Web Interface**: The Next.js app provides:
   - Clean, responsive UI for browsing bookmarks
   - Search functionality
   - Domain-based filtering
   - Export capabilities

## Development

```bash
# Run in development mode
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start

# Lint code
pnpm lint
```

## Data Format

Bookmarks are stored with the following structure:
```typescript
{
  tweet_id: string;
  text: string;
  author: string;
  created: string;
  url: string;      // First link in the tweet
  domain: string;   // Domain of the first link
}
```

## Privacy & Security

- All data is stored locally on your machine
- Your Twitter login credentials are managed by Playwright's browser context
- No data is sent to external services
- Browser session data is stored in `.pw-user/` (excluded from git)

## Troubleshooting

- **Login Issues**: Make sure you're logged into Twitter in the browser window that opens
- **No Bookmarks Found**: Ensure you have bookmarks saved in your Twitter account
- **Browser Crashes**: Try running with `headless: false` in the scraper for debugging

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
