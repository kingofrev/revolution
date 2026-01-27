import { Card, getCardValue, isValidRun, getRunHighCard, getHighestSuitInSet, SUIT_VALUES, isValidBomb, getBombHighRank } from './deck'

export type PlayType = 'single' | 'pair' | 'triple' | 'quad' | 'run' | 'bomb'

export interface PlayedCards {
  playerId: string
  cards: Card[]
  rank: string
  count: number
  playType?: PlayType
  highSuit?: number  // Highest suit value in the play
  runHighCard?: { rank: number; suit: number }  // For runs
  bombHighRank?: number  // For bombs
}

// Determine what type of play this is
export function getPlayType(cards: Card[], twosHigh: boolean): PlayType | null {
  if (cards.length === 0) return null

  // Check for bomb first (3 consecutive pairs = 6 cards)
  if (cards.length === 6 && isValidBomb(cards, twosHigh)) {
    return 'bomb'
  }

  // Check if all same rank (single, pair, triple, quad)
  const firstRank = cards[0].rank
  const allSameRank = cards.every((card) => card.rank === firstRank)

  if (allSameRank) {
    if (cards.length === 1) return 'single'
    if (cards.length === 2) return 'pair'
    if (cards.length === 3) return 'triple'
    if (cards.length === 4) return 'quad'
    return null  // Can't have more than 4 of same rank
  }

  // Check if it's a valid run (3+ consecutive)
  if (cards.length >= 3 && isValidRun(cards, twosHigh)) {
    return 'run'
  }

  return null
}

export function validatePlay(
  cards: Card[],
  lastPlay: PlayedCards | null,
  twosHigh: boolean
): { valid: boolean; error?: string; playType?: PlayType } {
  if (cards.length === 0) {
    return { valid: false, error: 'Must play at least one card' }
  }

  const playType = getPlayType(cards, twosHigh)

  if (!playType) {
    return { valid: false, error: 'Invalid combination. Play same rank cards, a run (3+ consecutive), or a bomb (3 consecutive pairs).' }
  }

  // First play of the round - anything valid goes
  if (!lastPlay) {
    return { valid: true, playType }
  }

  // BOMB LOGIC: Bombs can be played on anything except a higher bomb
  if (playType === 'bomb') {
    // If last play was also a bomb, must beat it
    if (lastPlay.playType === 'bomb') {
      const myBombHigh = getBombHighRank(cards, twosHigh)
      const theirBombHigh = lastPlay.bombHighRank ?? 0
      if (myBombHigh > theirBombHigh) {
        return { valid: true, playType }
      }
      return { valid: false, error: 'Must play a higher bomb' }
    }
    // Bomb beats anything else
    return { valid: true, playType }
  }

  // If last play was a bomb, only a higher bomb can beat it
  if (lastPlay.playType === 'bomb') {
    return { valid: false, error: 'Only a bomb can beat a bomb' }
  }

  // Must match the play type and count for non-bombs
  if (playType !== lastPlay.playType) {
    return { valid: false, error: `Must play a ${lastPlay.playType}` }
  }

  if (cards.length !== lastPlay.count) {
    return { valid: false, error: `Must play ${lastPlay.count} card(s)` }
  }

  // Compare based on play type
  if (playType === 'run') {
    const myHighCard = getRunHighCard(cards, twosHigh)
    const theirHighCard = lastPlay.runHighCard!

    // Compare highest card in run (rank first, then suit)
    if (myHighCard.rank > theirHighCard.rank) {
      return { valid: true, playType }
    }
    if (myHighCard.rank === theirHighCard.rank && myHighCard.suit > theirHighCard.suit) {
      return { valid: true, playType }
    }
    return { valid: false, error: 'Must play a higher run' }
  } else {
    // Single, pair, triple, quad - compare by rank, then by highest suit
    const myRankValue = getCardValue(cards[0].rank, twosHigh)
    const theirRankValue = getCardValue(lastPlay.rank as Card['rank'], twosHigh)

    if (myRankValue > theirRankValue) {
      return { valid: true, playType }
    }

    if (myRankValue === theirRankValue) {
      // Same rank - compare by highest suit in the set
      const myHighSuit = getHighestSuitInSet(cards)
      const theirHighSuit = lastPlay.highSuit ?? 0

      if (myHighSuit > theirHighSuit) {
        return { valid: true, playType }
      }
    }

    return { valid: false, error: 'Must play higher cards' }
  }
}

export function canPlay(
  hand: Card[],
  lastPlay: PlayedCards | null,
  twosHigh: boolean
): boolean {
  if (!lastPlay) return true

  const requiredCount = lastPlay.count

  if (lastPlay.playType === 'run') {
    // Need to find a higher run of the same length
    // This is complex - for simplicity, just check if we have enough cards
    // The actual validation will happen when they try to play
    return hand.length >= requiredCount
  }

  // For singles, pairs, triples, quads
  const lastRankValue = getCardValue(lastPlay.rank as Card['rank'], twosHigh)
  const lastHighSuit = lastPlay.highSuit ?? 0

  // Group cards by rank
  const cardsByRank: Record<string, Card[]> = {}
  for (const card of hand) {
    if (!cardsByRank[card.rank]) {
      cardsByRank[card.rank] = []
    }
    cardsByRank[card.rank].push(card)
  }

  for (const [rank, cards] of Object.entries(cardsByRank)) {
    if (cards.length >= requiredCount) {
      const rankValue = getCardValue(rank as Card['rank'], twosHigh)

      // Higher rank always wins
      if (rankValue > lastRankValue) {
        return true
      }

      // Same rank - check if we have higher suit
      if (rankValue === lastRankValue) {
        const highestSuit = getHighestSuitInSet(cards)
        if (highestSuit > lastHighSuit) {
          return true
        }
      }
    }
  }

  return false
}

export function getPoints(playerCount: number): number[] {
  switch (playerCount) {
    case 4:
      return [4, 3, 2, 0]
    case 5:
      return [5, 4, 3, 2, 0]
    case 6:
      return [6, 5, 4, 3, 2, 0]
    default:
      return [4, 3, 2, 0]
  }
}

export type PlayerRank = 'KING' | 'QUEEN' | 'NOBLE' | 'PEASANT'

export function getRank(position: number, playerCount: number): PlayerRank {
  if (position === 0) return 'KING'
  if (position === 1) return 'QUEEN'
  if (position === 2 && playerCount > 4) return 'NOBLE'
  if (position === 2 && playerCount === 4) return 'PEASANT'
  return 'PEASANT'
}

export function getTradingPairs(
  finishOrder: string[],
  playerCount: number
): { giver: string; receiver: string; cardCount: number }[] {
  const pairs: { giver: string; receiver: string; cardCount: number }[] = []

  const king = finishOrder[0]
  const queen = finishOrder[1]
  const lastPeasant = finishOrder[playerCount - 1]
  const secondLastPeasant = finishOrder[playerCount - 2]

  pairs.push({ giver: lastPeasant, receiver: king, cardCount: 2 })
  pairs.push({ giver: king, receiver: lastPeasant, cardCount: 2 })

  pairs.push({ giver: secondLastPeasant, receiver: queen, cardCount: 1 })
  pairs.push({ giver: queen, receiver: secondLastPeasant, cardCount: 1 })

  return pairs
}

export function getBestCards(hand: Card[], count: number, twosHigh: boolean): Card[] {
  const sorted = [...hand].sort((a, b) => {
    return getCardValue(b.rank, twosHigh) - getCardValue(a.rank, twosHigh)
  })
  return sorted.slice(0, count)
}

export function getWorstCards(hand: Card[], count: number, twosHigh: boolean): Card[] {
  const sorted = [...hand].sort((a, b) => {
    return getCardValue(a.rank, twosHigh) - getCardValue(b.rank, twosHigh)
  })
  return sorted.slice(0, count)
}
