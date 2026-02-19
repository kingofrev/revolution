/**
 * Advanced Bot AI for Revolution Card Game
 *
 * Strategy:
 * - Card counting to track what's been played
 * - Hand analysis to identify all possible plays
 * - Strategic leading (play from strength, save high cards)
 * - Optimal following (play lowest winning cards, save bombs)
 * - End-game planning (exit with unbeatable plays)
 * - Opponent awareness (block players close to winning)
 */

import { Card, getCardValue, SUIT_VALUES, isValidRun, isValidBomb, getRunHighCard, getBombHighRank, getHighestSuitInSet } from './deck'
import { PlayedCards, validatePlay, PlayType } from './rules'

interface BotGameState {
  hand: Card[]
  lastPlay: PlayedCards | null
  twosHigh: boolean
  playedCards: Card[]  // All cards that have been played this round
  opponents: {
    id: string
    cardCount: number
    isFinished: boolean
  }[]
  isLeading: boolean
}

interface PossiblePlay {
  cards: Card[]
  type: PlayType
  strength: number  // Higher = stronger play
  preservesCombo: boolean  // True if this play doesn't break up a combo
}

// Bot names for personality
export const BOT_NAMES = [
  'CardShark', 'AceBot', 'RoyalFlush', 'DeckMaster',
  'CardWizard', 'PokerFace', 'WildCard', 'JackpotJoe'
]

export function getBotName(index: number): string {
  return BOT_NAMES[index % BOT_NAMES.length]
}

/**
 * Main bot decision function
 * Returns the cards to play, or null to pass
 */
export function getBotPlay(state: BotGameState): Card[] | null {
  const { hand, lastPlay, twosHigh, opponents, isLeading } = state

  // Analyze the hand
  const analysis = analyzeHand(hand, twosHigh)

  // Check if any opponent is close to winning (2 or fewer cards)
  const dangerousOpponent = opponents.find(o => !o.isFinished && o.cardCount <= 2)

  if (isLeading) {
    return selectLeadPlay(hand, analysis, twosHigh, dangerousOpponent !== undefined)
  } else {
    return selectFollowPlay(hand, lastPlay!, analysis, twosHigh, dangerousOpponent !== undefined)
  }
}

/**
 * Analyze the hand to find all possible plays and combos
 */
function analyzeHand(hand: Card[], twosHigh: boolean): {
  singles: Card[][]
  pairs: Card[][]
  triples: Card[][]
  quads: Card[][]
  runs: Card[][]
  bombs: Card[][]
  highCards: Card[]  // Aces and 2s (if twosHigh)
} {
  // Group cards by rank
  const byRank: Record<string, Card[]> = {}
  for (const card of hand) {
    if (!byRank[card.rank]) byRank[card.rank] = []
    byRank[card.rank].push(card)
  }

  // Sort each group by suit (lowest first for optimal play selection)
  for (const rank in byRank) {
    byRank[rank].sort((a, b) => SUIT_VALUES[a.suit] - SUIT_VALUES[b.suit])
  }

  const singles: Card[][] = []
  const pairs: Card[][] = []
  const triples: Card[][] = []
  const quads: Card[][] = []

  for (const [rank, cards] of Object.entries(byRank)) {
    // Add all possible combinations
    if (cards.length >= 1) singles.push([cards[0]])
    if (cards.length >= 2) pairs.push([cards[0], cards[1]])
    if (cards.length >= 3) triples.push([cards[0], cards[1], cards[2]])
    if (cards.length >= 4) quads.push(cards.slice(0, 4))
  }

  // Sort by rank value (lowest first for strategic play)
  const sortByRank = (a: Card[], b: Card[]) =>
    getCardValue(a[0].rank, twosHigh) - getCardValue(b[0].rank, twosHigh)

  singles.sort(sortByRank)
  pairs.sort(sortByRank)
  triples.sort(sortByRank)
  quads.sort(sortByRank)

  // Find all possible runs (3+ consecutive cards)
  const runs = findAllRuns(hand, twosHigh)

  // Find all possible bombs (3 consecutive pairs)
  const bombs = findAllBombs(hand, twosHigh)

  // Identify high cards (Aces and 2s if twosHigh)
  const highCards = hand.filter(c => {
    const value = getCardValue(c.rank, twosHigh)
    return value >= 14 || (twosHigh && c.rank === '2')
  })

  return { singles, pairs, triples, quads, runs, bombs, highCards }
}

/**
 * Find all possible runs in the hand
 */
function findAllRuns(hand: Card[], twosHigh: boolean): Card[][] {
  const runs: Card[][] = []

  // Group cards by value
  const byValue: Record<number, Card[]> = {}
  for (const card of hand) {
    const value = getCardValue(card.rank, twosHigh)
    if (!byValue[value]) byValue[value] = []
    byValue[value].push(card)
  }

  // Sort cards in each value group by suit (prefer lower suits)
  for (const value in byValue) {
    byValue[value].sort((a, b) => SUIT_VALUES[a.suit] - SUIT_VALUES[b.suit])
  }

  const values = Object.keys(byValue).map(Number).sort((a, b) => a - b)

  // Find consecutive sequences
  for (let startIdx = 0; startIdx < values.length; startIdx++) {
    for (let length = 3; length <= values.length - startIdx; length++) {
      // Check if consecutive
      let isConsecutive = true
      for (let i = 1; i < length; i++) {
        if (values[startIdx + i] !== values[startIdx] + i) {
          isConsecutive = false
          break
        }
      }

      if (isConsecutive) {
        // Build the run using lowest suit cards
        const run: Card[] = []
        for (let i = 0; i < length; i++) {
          run.push(byValue[values[startIdx + i]][0])
        }
        runs.push(run)
      }
    }
  }

  // Sort runs by high card value (lowest first)
  runs.sort((a, b) => {
    const aHigh = getRunHighCard(a, twosHigh)
    const bHigh = getRunHighCard(b, twosHigh)
    return aHigh.rank - bHigh.rank
  })

  return runs
}

/**
 * Find all possible bombs in the hand
 */
function findAllBombs(hand: Card[], twosHigh: boolean): Card[][] {
  const bombs: Card[][] = []

  // Group cards by rank
  const byRank: Record<string, Card[]> = {}
  for (const card of hand) {
    if (!byRank[card.rank]) byRank[card.rank] = []
    byRank[card.rank].push(card)
  }

  // Find ranks with at least 2 cards
  const ranksWithPairs = Object.entries(byRank)
    .filter(([_, cards]) => cards.length >= 2)
    .map(([rank, cards]) => ({
      rank,
      value: getCardValue(rank as Card['rank'], twosHigh),
      cards: cards.slice(0, 2)  // Take only 2 cards
    }))
    .sort((a, b) => a.value - b.value)

  // Find 3 consecutive pairs
  for (let i = 0; i <= ranksWithPairs.length - 3; i++) {
    if (ranksWithPairs[i + 1].value === ranksWithPairs[i].value + 1 &&
        ranksWithPairs[i + 2].value === ranksWithPairs[i + 1].value + 1) {
      const bomb = [
        ...ranksWithPairs[i].cards,
        ...ranksWithPairs[i + 1].cards,
        ...ranksWithPairs[i + 2].cards
      ]
      bombs.push(bomb)
    }
  }

  return bombs
}

/**
 * Select the best play when leading
 *
 * Strategy: dump isolated junk first, save combos (pairs/runs/triples/quads) for later.
 * When an opponent is dangerous, switch to aggressive mode to maintain control.
 */
function selectLeadPlay(
  hand: Card[],
  analysis: ReturnType<typeof analyzeHand>,
  twosHigh: boolean,
  opponentDangerous: boolean
): Card[] {
  const { singles, pairs, triples, quads, runs } = analysis

  // If we only have a few cards left, plan the exit
  if (hand.length <= 4) {
    return planExitPlay(hand, analysis, twosHigh)
  }

  // Count how many of each rank we have (for detecting isolated singles)
  const rankCounts: Record<string, number> = {}
  for (const card of hand) {
    rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1
  }

  // Identify which ranks are part of a run
  const runRanks = new Set<string>()
  for (const run of runs) {
    for (const card of run) runRanks.add(card.rank)
  }

  // AGGRESSIVE MODE: opponent is about to win — play best combos to maintain control
  if (opponentDangerous) {
    if (quads.length > 0) return quads[quads.length - 1]   // Highest quad
    if (triples.length > 0) return triples[triples.length - 1]  // Highest triple
    if (runs.length > 0) return runs[runs.length - 1]       // Highest run
    if (pairs.length > 0) return pairs[pairs.length - 1]    // Highest pair
    return singles[singles.length - 1] || [hand[hand.length - 1]]  // Highest single
  }

  // NORMAL MODE: dump junk first, save combos

  // 1. Play lowest isolated single (not part of any pair, triple, quad, or run)
  for (const single of singles) {
    const rank = single[0].rank
    if (rankCounts[rank] === 1 && !runRanks.has(rank)) {
      return single
    }
  }

  // 2. Play lowest true pair (rank appears exactly twice, not part of a run)
  for (const pair of pairs) {
    const rank = pair[0].rank
    if (rankCounts[rank] === 2 && !runRanks.has(rank)) {
      return pair
    }
  }

  // 3. Play shortest run (fewest cards, lowest high card)
  if (runs.length > 0) {
    const shortestLength = Math.min(...runs.map(r => r.length))
    const shortestRuns = runs.filter(r => r.length === shortestLength)
    return shortestRuns[0]
  }

  // 4. Play lowest triple that isn't part of something bigger
  for (const triple of triples) {
    const rank = triple[0].rank
    if (rankCounts[rank] === 3) {
      return triple
    }
  }

  // 5. Play lowest quad
  if (quads.length > 0) return quads[0]

  // Fallback: play lowest single
  return singles[0] || [hand[0]]
}

/**
 * Select the best play when following
 */
function selectFollowPlay(
  hand: Card[],
  lastPlay: PlayedCards,
  analysis: ReturnType<typeof analyzeHand>,
  twosHigh: boolean,
  opponentDangerous: boolean
): Card[] | null {
  const { singles, pairs, triples, quads, runs, bombs } = analysis

  // If someone played a bomb, we need a higher bomb or pass
  if (lastPlay.playType === 'bomb') {
    const validBombs = bombs.filter(b => {
      const myHigh = getBombHighRank(b, twosHigh)
      return myHigh > (lastPlay.bombHighRank || 0)
    })
    if (validBombs.length > 0) {
      return validBombs[0]  // Play lowest valid bomb
    }
    return null  // Pass
  }

  // Try to find a valid play of the same type
  let candidates: Card[][] = []

  switch (lastPlay.playType) {
    case 'single':
      candidates = singles
      break
    case 'pair':
      candidates = pairs
      break
    case 'triple':
      candidates = triples
      break
    case 'quad':
      candidates = quads
      break
    case 'run':
      candidates = runs.filter(r => r.length === lastPlay.count)
      break
  }

  // Filter to only valid plays (that beat the last play)
  const validPlays = candidates.filter(cards => {
    const result = validatePlay(cards, lastPlay, twosHigh)
    return result.valid
  })

  if (validPlays.length > 0) {
    // Strategy: Play the lowest valid option to conserve strong cards
    // Unless opponent is dangerous, then play stronger to maintain control
    if (opponentDangerous && validPlays.length > 1) {
      // Play something in the middle - not weakest, not strongest
      const midIndex = Math.floor(validPlays.length / 2)
      return validPlays[midIndex]
    }
    return validPlays[0]  // Lowest valid play
  }

  // No valid plays of the same type - consider using a bomb
  if (bombs.length > 0) {
    // Only use bomb if:
    // 1. Opponent is dangerous (close to winning)
    // 2. We have few cards left and want to take control
    // 3. We have multiple bombs
    const shouldBomb = opponentDangerous ||
                       hand.length <= 6 ||
                       bombs.length >= 2

    if (shouldBomb) {
      return bombs[0]  // Use lowest bomb
    }
  }

  // Pass
  return null
}

/**
 * Plan the final plays to exit the game
 */
function planExitPlay(
  hand: Card[],
  analysis: ReturnType<typeof analyzeHand>,
  twosHigh: boolean
): Card[] {
  const { singles, pairs, triples, quads, runs, bombs } = analysis

  // If we have a bomb and 0 other cards, play the bomb
  if (bombs.length > 0 && hand.length === 6) {
    return bombs[0]
  }

  // If we have exactly a quad, play it
  if (quads.length > 0 && hand.length === 4) {
    return quads[0]
  }

  // If we have exactly a triple, play it
  if (triples.length > 0 && hand.length === 3) {
    return triples[0]
  }

  // If we have exactly a pair, play it
  if (pairs.length > 0 && hand.length === 2) {
    return pairs[0]
  }

  // If we have one card, play it
  if (hand.length === 1) {
    return hand
  }

  // Check if we can go out in 2 plays
  // e.g., pair + single, or triple + single
  if (hand.length === 3 && pairs.length > 0) {
    // We have a pair and a single - lead with the single if it's high
    const pairCards = pairs[0]
    const single = hand.find(c => !pairCards.includes(c))
    if (single) {
      const singleValue = getCardValue(single.rank, twosHigh)
      const pairValue = getCardValue(pairCards[0].rank, twosHigh)
      // Lead with whichever is higher
      if (singleValue >= pairValue) {
        return [single]
      }
    }
    return pairCards
  }

  // Default: play highest cards to try to maintain control
  // Sort hand by value descending
  const sorted = [...hand].sort((a, b) =>
    getCardValue(b.rank, twosHigh) - getCardValue(a.rank, twosHigh)
  )

  // Play highest single
  return [sorted[0]]
}

/**
 * Bot trading logic - select cards to give away
 * For King/Queen: select worst cards to give to peasants
 */
/**
 * Bot opening play - must include a specific card (the lowest card dealt)
 * Tries to include it in the largest/best play possible: run > quad > triple > pair > single
 */
export function getBotOpeningPlay(hand: Card[], mustPlayCardId: string, twosHigh: boolean): Card[] {
  const mustCard = hand.find(c => c.id === mustPlayCardId)
  if (!mustCard) return [hand[0]]

  // Try runs that include this card (gets rid of most cards efficiently)
  const runs = findAllRuns(hand, twosHigh).filter(run => run.some(c => c.id === mustPlayCardId))
  if (runs.length > 0) {
    runs.sort((a, b) => b.length - a.length)
    return runs[0]
  }

  // Try the largest same-rank group
  const sameRank = hand.filter(c => c.rank === mustCard.rank)
  if (sameRank.length >= 4) return sameRank.slice(0, 4)
  if (sameRank.length >= 3) return sameRank.slice(0, 3)
  if (sameRank.length >= 2) return sameRank.slice(0, 2)

  return [mustCard]
}

export function getBotTradeCards(
  hand: Card[],
  count: number,
  twosHigh: boolean
): Card[] {
  // Give away the worst cards (lowest rank + lowest suit for tie-break)
  const sorted = [...hand].sort((a, b) => {
    const aFull = getCardValue(a.rank, twosHigh) * 10 + SUIT_VALUES[a.suit]
    const bFull = getCardValue(b.rank, twosHigh) * 10 + SUIT_VALUES[b.suit]
    return aFull - bFull
  })
  return sorted.slice(0, count)
}
