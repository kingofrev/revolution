# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Revolution is a real-time multiplayer card game built with Next.js 16, featuring WebSocket-based gameplay via Socket.io, advanced AI bot players, and persistent game statistics. The game implements the "Revolution" (also known as "President" or "Scum") card game with custom rules including trading, bombs, and runs.

## Architecture

### Tech Stack
- **Frontend**: Next.js 16 (App Router), React 19, TailwindCSS
- **Backend**: Next.js API Routes (serverless functions)
- **Database**: PostgreSQL (Neon) via Prisma ORM
- **Real-time**: HTTP polling (2-second intervals)
- **Auth**: NextAuth.js v4

### Key Architectural Patterns

**Polling-Based Real-Time Updates**
- The app uses **HTTP polling** instead of WebSockets for real-time gameplay
- Client polls `/api/games/[code]/state` every 2 seconds (`app/play/[code]/page.tsx:127`)
- This allows deployment on serverless platforms like Netlify/Vercel
- No persistent connections required

**Game State Management**
- Game states are stored in the **database** (`Game.gameState` JSON field)
- Each game has a unique code (e.g., "ABCD")
- State persists in the database across server restarts
- All game logic executed in API routes (`app/api/games/[code]/state/route.ts`)

**Masked State Response**
- When returning game state to players, each receives a customized version
- Players see their own cards but only card counts for opponents
- Implementation: `app/api/games/[code]/state/route.ts:907` (maskState function)

**API-Driven Game Flow**
1. Player polls `GET /api/games/[code]/state` every 2 seconds
2. Player action → `POST /api/games/[code]/state` with action type (play/pass/trade/next-round/chat)
3. Server processes action, updates database, returns new state
4. Bot turns execute automatically during state fetch (recursive execution)
5. Game over → stats saved to database → history created

**Legacy Code Note**
- The `server/` directory contains legacy Socket.io code NOT used in production
- This was the original architecture but was replaced with REST polling for Netlify compatibility
- Do NOT reference `server/socket-handler.ts` or `server/index.ts` for understanding production behavior

### Database Schema

The Prisma schema uses a custom output directory: `lib/generated/prisma`

Key models:
- **User**: Players (guests, registered, bots), tracks wins/games played
- **Game**: Active game metadata, settings, current round
  - **`gameState` JSON field**: Stores the COMPLETE active game state (hands, last play, current player, etc.)
  - This is the source of truth for all active games
- **GamePlayer**: Join table linking users to games with seat position and current rank
- **Round**: Historical round data (finish order, points awarded)
- **GameHistory/GameHistoryPlayer**: Completed games for statistics

Important: The `Game.gameState` JSON field IS the source of truth for active game state.

## Development Commands

### Running the App
```bash
npm run dev              # Start Next.js dev server (standard development)
npm run build            # Build Next.js app
npm start                # Production mode (next start)
```

**Legacy commands (not used):**
```bash
npm run dev:socket       # Old Socket.io server (legacy, not used in production)
npm run start:socket     # Old Socket.io server (legacy, not used in production)
```

### Database
```bash
npm run db:push          # Push schema changes to database
npm run db:generate      # Generate Prisma client (outputs to lib/generated/prisma)
```

After schema changes, always run BOTH commands in order:
1. `npm run db:push` - updates the database
2. `npm run db:generate` - regenerates TypeScript types

### Other
```bash
npm run lint             # Run ESLint
```

## File Structure & Key Files

### Game Logic (`lib/game/`)
- **`deck.ts`**: Card definitions, deck creation, shuffling, dealing, sorting. Defines card comparison logic.
- **`rules.ts`**: Play validation, play types (single/pair/triple/quad/run/bomb), rank/suit comparison, points/ranks assignment.
- **`state.ts`**: Core game state management - `initializeRound()`, `playCards()`, `passPlay()`, `endRound()`, `startTrading()`, `completeTrade()`.
- **`bot.ts`**: Advanced AI bot logic with card counting, hand analysis, strategic leading/following. Uses sophisticated algorithms to make optimal plays.
- **`cleanup.ts`**: Game cleanup utilities for stale games.

### Server (`server/`) - **LEGACY - NOT USED**
- **`index.ts`**: Old custom Node.js server (Socket.io-based, replaced by REST polling)
- **`socket-handler.ts`**: Old Socket.io handlers (not used in production)

### Components (`components/`)
- **`game/`**: Game UI components (card-table, hand, play-area, trading-modal, scoreboard, chat)
- **`ui/`**: Shadcn UI components (button, card, dialog, input, etc.)

### App Routes (`app/`)
- **`page.tsx`**: Home page with game creation and join options
- **`lobby/[code]/page.tsx`**: Game lobby before starting
- **`play/[code]/page.tsx`**: Active game interface (connects to Socket.io)
- **`(auth)/login|register/page.tsx`**: Authentication pages
- **`api/`**: Next.js API routes for game CRUD, bot management, stats

### Client-Side Data Fetching
- **`lib/socket.ts`**: Legacy Socket.io client (not used)
- Actual implementation: Direct `fetch()` calls in `app/play/[code]/page.tsx` with 2-second polling

## Important Implementation Details

### Card Representation
Cards use a compound ID format: `{rank}-{suit}` (e.g., `"A-spades"`, `"3-clubs"`)
- Ranks: 3, 4, 5, 6, 7, 8, 9, 10, J, Q, K, A, 2
- Suits: clubs, diamonds, hearts, spades
- Suit hierarchy: clubs < diamonds < hearts < spades

### Game Settings
- **twosHigh**: If true, 2s are highest cards (above Aces); if false, 3s are highest
- **tradingEnabled**: Between rounds, King/Queen trade best cards with Peasants who give worst cards
- **playerCount**: 4-6 players
- **winScore**: First to reach this score wins (default 50)

### Play Types
1. **Single/Pair/Triple/Quad**: N cards of same rank (must beat with higher rank or higher suit if same rank)
2. **Run**: 3+ consecutive cards (e.g., 3-4-5-6)
3. **Bomb**: 3 consecutive pairs (6 cards total, e.g., 3♣3♦4♠4♥5♣5♦) - beats any non-bomb play

### Trading Phase
After each round (if enabled):
1. Peasants give their worst cards to Royals
   - Last place gives 2 cards to King (1st place)
   - 2nd-to-last gives 1 card to Queen (2nd place)
2. Royals give cards back to Peasants
   - King gives any 2 cards to last place
   - Queen gives any 1 card to 2nd-to-last

### Bot AI Strategy
Bots use sophisticated algorithms (`lib/game/bot.ts`):
- Card counting to track played cards
- Hand analysis to identify all possible plays (singles, pairs, runs, bombs)
- Strategic leading: Play from strength, save high cards
- Optimal following: Play lowest winning cards to conserve strong cards
- End-game planning: Exit with unbeatable plays
- Opponent awareness: Play aggressively if opponent is close to winning (≤2 cards)

## Common Workflows

### Adding a New Game Action
1. Add new action type to `app/api/games/[code]/state/route.ts` POST handler
2. Update `GameState` type in state file if needed
3. Add client-side handler in `app/play/[code]/page.tsx` (e.g., handlePlay, handlePass)
4. Test with multiple browser tabs to ensure state updates correctly via polling

### Modifying Game Rules
1. Update validation logic in `lib/game/rules.ts`
2. Update state management in `lib/game/state.ts` if needed
3. Update bot AI in `lib/game/bot.ts` to handle new rules
4. Test with bots to ensure AI adapts correctly

### Adding Database Fields
1. Update `prisma/schema.prisma`
2. Run `npm run db:push` to update database
3. Run `npm run db:generate` to regenerate Prisma client
4. Import from `@/lib/generated/prisma` (not `@prisma/client`)

### Testing Real-Time Gameplay
- Open multiple browser windows/tabs with **different browsers** (Chrome, Firefox, Edge)
- Do NOT use incognito/private tabs in the same browser - they share session state
- Create a game in one window, join from others
- Use bot players to test without multiple windows: POST to `/api/games/[code]/bots`
- Updates appear within 2 seconds (polling interval)

## Deployment Considerations

**Good news**: This app works on **any Next.js hosting platform** including Netlify, Vercel, etc.

The app uses HTTP polling (not WebSockets), making it compatible with serverless platforms.

**Current deployment**: Netlify (https://starlit-narwhal-510431.netlify.app)

Recommended platforms:
- **Netlify**: Currently deployed here, works great
- **Vercel**: Also compatible (Next.js native platform)
- **Railway/Render**: Also work fine
- **Any serverless platform**: No special requirements

Deployment requirements:
1. Standard Next.js build (`npm run build`)
2. PostgreSQL database (Neon already configured)
3. Environment variables from `.env` file

**Production build**:
```bash
npm run build
npm start
```

No special server setup required - standard Next.js deployment.

## Environment Variables

Required in production (see `.env`):
- `DATABASE_URL`: PostgreSQL connection string (pooled)
- `DIRECT_URL`: Direct PostgreSQL connection (for migrations)
- `NEXTAUTH_URL`: Production URL (e.g., https://revolution.example.com)
- `NEXTAUTH_SECRET`: Random secret for NextAuth.js (generate with `openssl rand -base64 32`)
- `NODE_ENV`: Set to "production"
- `PORT`: Server port (optional, defaults to 3000)
