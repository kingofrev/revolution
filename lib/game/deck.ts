export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades'
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A'

export interface Card {
  suit: Suit
  rank: Rank
  id: string
}

// Suit ranking: clubs (lowest) < spades < diamonds < hearts (highest)
export const SUITS: Suit[] = ['clubs', 'spades', 'diamonds', 'hearts']
export const SUIT_VALUES: Record<Suit, number> = {
  'clubs': 0,
  'spades': 1,
  'diamonds': 2,
  'hearts': 3,
}

export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

export function getCardValue(rank: Rank, twosHigh: boolean): number {
  if (twosHigh && rank === '2') return 15
  const values: Record<Rank, number> = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    'J': 11,
    'Q': 12,
    'K': 13,
    'A': 14,
  }
  return values[rank]
}

// Get full card value including suit (rank * 10 + suit for comparison)
export function getFullCardValue(card: Card, twosHigh: boolean): number {
  const rankValue = getCardValue(card.rank, twosHigh)
  const suitValue = SUIT_VALUES[card.suit]
  return rankValue * 10 + suitValue
}

// Get the highest suit value from a set of cards (for comparing pairs/triples)
export function getHighestSuitInSet(cards: Card[]): number {
  return Math.max(...cards.map(c => SUIT_VALUES[c.suit]))
}

// Check if cards form a valid run (3+ consecutive ranks)
export function isValidRun(cards: Card[], twosHigh: boolean): boolean {
  if (cards.length < 3) return false

  // Get rank values and sort them
  const values = cards.map(c => getCardValue(c.rank, twosHigh)).sort((a, b) => a - b)

  // Check if consecutive
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== values[i - 1] + 1) {
      return false
    }
  }

  return true
}

// Get the highest card in a run (for comparison)
export function getRunHighCard(cards: Card[], twosHigh: boolean): { rank: number; suit: number } {
  let highestRank = 0
  let highestSuit = 0

  for (const card of cards) {
    const rankValue = getCardValue(card.rank, twosHigh)
    if (rankValue > highestRank || (rankValue === highestRank && SUIT_VALUES[card.suit] > highestSuit)) {
      highestRank = rankValue
      highestSuit = SUIT_VALUES[card.suit]
    }
  }

  return { rank: highestRank, suit: highestSuit }
}

// Check if cards form a bomb (3 consecutive pairs = 6 cards)
export function isValidBomb(cards: Card[], twosHigh: boolean): boolean {
  if (cards.length !== 6) return false

  // Group by rank
  const rankGroups: Record<string, Card[]> = {}
  for (const card of cards) {
    if (!rankGroups[card.rank]) rankGroups[card.rank] = []
    rankGroups[card.rank].push(card)
  }

  // Must have exactly 3 different ranks, each with exactly 2 cards
  const ranks = Object.keys(rankGroups)
  if (ranks.length !== 3) return false
  if (!ranks.every(r => rankGroups[r].length === 2)) return false

  // Check if the 3 ranks are consecutive
  const values = ranks.map(r => getCardValue(r as Rank, twosHigh)).sort((a, b) => a - b)
  return values[1] === values[0] + 1 && values[2] === values[1] + 1
}

// Get the highest rank in a bomb (for comparison)
export function getBombHighRank(cards: Card[], twosHigh: boolean): number {
  const values = cards.map(c => getCardValue(c.rank, twosHigh))
  return Math.max(...values)
}

export function createDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        suit,
        rank,
        id: `${rank}-${suit}`,
      })
    }
  }
  return deck
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck]
  // Do multiple shuffle passes for better randomness
  for (let pass = 0; pass < 7; pass++) {
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
  }
  return shuffled
}

export function dealCards(deck: Card[], playerCount: number): Card[][] {
  const hands: Card[][] = Array.from({ length: playerCount }, () => [])
  const cardsPerPlayer = Math.floor(52 / playerCount)
  const cardsToUse = cardsPerPlayer * playerCount

  for (let i = 0; i < cardsToUse; i++) {
    hands[i % playerCount].push(deck[i])
  }
  return hands
}

// Deal cards with extra cards going to specified players (by index)
// extraCardRecipients: array of player indices who get extra cards (worst finishers)
export function dealCardsWithExtras(
  deck: Card[],
  playerCount: number,
  extraCardRecipients: number[]
): { hands: Card[][], burnedCards: Card[] } {
  const hands: Card[][] = Array.from({ length: playerCount }, () => [])
  const cardsPerPlayer = Math.floor(52 / playerCount)
  const extraCards = 52 % playerCount
  const cardsToUse = cardsPerPlayer * playerCount

  // Deal base cards evenly
  for (let i = 0; i < cardsToUse; i++) {
    hands[i % playerCount].push(deck[i])
  }

  // Handle extra cards
  const burnedCards: Card[] = []
  if (extraCards > 0) {
    const leftoverCards = deck.slice(cardsToUse)

    if (extraCardRecipients.length > 0) {
      // Give extra cards to worst finishers
      for (let i = 0; i < leftoverCards.length && i < extraCardRecipients.length; i++) {
        const recipientIndex = extraCardRecipients[i]
        if (recipientIndex >= 0 && recipientIndex < playerCount) {
          hands[recipientIndex].push(leftoverCards[i])
        }
      }
    } else {
      // Round 1: burn the cards
      burnedCards.push(...leftoverCards)
    }
  }

  return { hands, burnedCards }
}

export function sortHand(hand: Card[], twosHigh: boolean): Card[] {
  return [...hand].sort((a, b) => {
    const valueA = getCardValue(a.rank, twosHigh)
    const valueB = getCardValue(b.rank, twosHigh)
    if (valueA !== valueB) return valueA - valueB
    // Sort by suit value (clubs lowest to hearts highest)
    return SUIT_VALUES[a.suit] - SUIT_VALUES[b.suit]
  })
}

export function getCardDisplay(card: Card): string {
  const suitSymbols: Record<Suit, string> = {
    hearts: '\u2665',
    diamonds: '\u2666',
    clubs: '\u2663',
    spades: '\u2660',
  }
  return `${card.rank}${suitSymbols[card.suit]}`
}

export function getSuitColor(suit: Suit): 'red' | 'black' {
  return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black'
}
