import { Card, createDeck, shuffleDeck, dealCards, sortHand } from './deck'
import { PlayedCards, getPoints, getRank, PlayerRank } from './rules'

export interface PlayerState {
  id: string
  odlerId: string
  name: string
  odltPosition: number
  hand: Card[]
  totalScore: number
  currentRank: PlayerRank | null
  isFinished: boolean
  finishPosition: number | null
}

export interface GameState {
  gameId: string
  code: string
  status: 'LOBBY' | 'TRADING' | 'PLAYING' | 'ROUND_END' | 'GAME_OVER'
  settings: {
    playerCount: number
    twosHigh: boolean
    tradingEnabled: boolean
    winScore: number
  }
  currentRound: number
  players: PlayerState[]
  currentPlayerId: string | null
  lastPlay: PlayedCards | null
  passCount: number
  finishOrder: string[]
  tradingState: TradingState | null
}

export interface TradingState {
  phase: 'peasants_give' | 'royals_give' | 'complete'
  pendingTrades: {
    from: string
    to: string
    cards: Card[]
    count: number
  }[]
  completedTrades: string[]
}

export function initializeRound(
  gameState: GameState,
  players: { id: string; odlerId: string; name: string; totalScore: number; currentRank: PlayerRank | null }[]
): GameState {
  const deck = shuffleDeck(createDeck())
  const hands = dealCards(deck, players.length)

  const sortedHands = hands.map((hand) =>
    sortHand(hand, gameState.settings.twosHigh)
  )

  const newPlayers: PlayerState[] = players.map((player, index) => ({
    ...player,
    hand: sortedHands[index],
    isFinished: false,
    finishPosition: null,
    odltPosition: index,
  }))

  const startingPlayerId = findStartingPlayer(newPlayers, gameState.settings.twosHigh)

  return {
    ...gameState,
    status: 'PLAYING',
    currentRound: gameState.currentRound + 1,
    players: newPlayers,
    currentPlayerId: startingPlayerId,
    lastPlay: null,
    passCount: 0,
    finishOrder: [],
    tradingState: null,
  }
}

function findStartingPlayer(players: PlayerState[], twosHigh: boolean): string {
  const targetCard = twosHigh ? '3-clubs' : '3-clubs'

  for (const player of players) {
    if (player.hand.some((card) => card.id === targetCard)) {
      return player.id
    }
  }

  return players[0].id
}

export function playCards(
  gameState: GameState,
  playerId: string,
  cards: Card[]
): GameState {
  const playerIndex = gameState.players.findIndex((p) => p.id === playerId)
  if (playerIndex === -1) return gameState

  const player = gameState.players[playerIndex]
  const newHand = player.hand.filter(
    (card) => !cards.some((c) => c.id === card.id)
  )

  const newPlayers = [...gameState.players]
  newPlayers[playerIndex] = {
    ...player,
    hand: newHand,
  }

  let status = gameState.status
  let finishOrder = [...gameState.finishOrder]
  let currentPlayerId = gameState.currentPlayerId

  if (newHand.length === 0) {
    newPlayers[playerIndex].isFinished = true
    newPlayers[playerIndex].finishPosition = finishOrder.length
    finishOrder.push(playerId)

    const activePlayers = newPlayers.filter((p) => !p.isFinished)
    if (activePlayers.length <= 1) {
      if (activePlayers.length === 1) {
        const lastPlayer = activePlayers[0]
        const lastPlayerIdx = newPlayers.findIndex((p) => p.id === lastPlayer.id)
        newPlayers[lastPlayerIdx].isFinished = true
        newPlayers[lastPlayerIdx].finishPosition = finishOrder.length
        finishOrder.push(lastPlayer.id)
      }

      return endRound({ ...gameState, players: newPlayers, finishOrder })
    }
  }

  currentPlayerId = getNextPlayer(
    newPlayers,
    playerIndex,
    gameState.settings.playerCount
  )

  return {
    ...gameState,
    status,
    players: newPlayers,
    currentPlayerId,
    lastPlay: {
      playerId,
      cards,
      rank: cards[0].rank,
      count: cards.length,
    },
    passCount: 0,
    finishOrder,
  }
}

export function passPlay(gameState: GameState, playerId: string): GameState {
  const playerIndex = gameState.players.findIndex((p) => p.id === playerId)
  if (playerIndex === -1) return gameState

  const activePlayers = gameState.players.filter((p) => !p.isFinished)
  const newPassCount = gameState.passCount + 1

  if (newPassCount >= activePlayers.length - 1) {
    const currentPlayerIndex = gameState.players.findIndex(
      (p) => p.id === gameState.currentPlayerId
    )
    const nextPlayerId = getNextPlayer(
      gameState.players,
      currentPlayerIndex,
      gameState.settings.playerCount
    )

    return {
      ...gameState,
      currentPlayerId: nextPlayerId,
      lastPlay: null,
      passCount: 0,
    }
  }

  const nextPlayerId = getNextPlayer(
    gameState.players,
    playerIndex,
    gameState.settings.playerCount
  )

  return {
    ...gameState,
    currentPlayerId: nextPlayerId,
    passCount: newPassCount,
  }
}

function getNextPlayer(
  players: PlayerState[],
  currentIndex: number,
  playerCount: number
): string {
  let nextIndex = (currentIndex + 1) % playerCount
  let attempts = 0

  while (players[nextIndex].isFinished && attempts < playerCount) {
    nextIndex = (nextIndex + 1) % playerCount
    attempts++
  }

  return players[nextIndex].id
}

function endRound(gameState: GameState): GameState {
  const points = getPoints(gameState.settings.playerCount)
  const newPlayers = gameState.players.map((player) => {
    const finishPos = gameState.finishOrder.indexOf(player.id)
    const earnedPoints = finishPos >= 0 ? points[finishPos] : 0
    const rank = getRank(finishPos, gameState.settings.playerCount)

    return {
      ...player,
      totalScore: player.totalScore + earnedPoints,
      currentRank: rank,
    }
  })

  const winner = newPlayers.find(
    (p) => p.totalScore >= gameState.settings.winScore
  )

  return {
    ...gameState,
    status: winner ? 'GAME_OVER' : 'ROUND_END',
    players: newPlayers,
    currentPlayerId: null,
  }
}

export function startTrading(gameState: GameState): GameState {
  if (!gameState.settings.tradingEnabled) {
    return gameState
  }

  return {
    ...gameState,
    status: 'TRADING',
    tradingState: {
      phase: 'peasants_give',
      pendingTrades: [],
      completedTrades: [],
    },
  }
}

export function completeTrade(
  gameState: GameState,
  fromPlayerId: string,
  toPlayerId: string,
  cards: Card[]
): GameState {
  if (!gameState.tradingState) return gameState

  const fromIndex = gameState.players.findIndex((p) => p.id === fromPlayerId)
  const toIndex = gameState.players.findIndex((p) => p.id === toPlayerId)

  if (fromIndex === -1 || toIndex === -1) return gameState

  const newPlayers = [...gameState.players]
  newPlayers[fromIndex] = {
    ...newPlayers[fromIndex],
    hand: newPlayers[fromIndex].hand.filter(
      (c) => !cards.some((tc) => tc.id === c.id)
    ),
  }
  newPlayers[toIndex] = {
    ...newPlayers[toIndex],
    hand: sortHand(
      [...newPlayers[toIndex].hand, ...cards],
      gameState.settings.twosHigh
    ),
  }

  const tradingState = { ...gameState.tradingState }
  tradingState.completedTrades = [
    ...tradingState.completedTrades,
    `${fromPlayerId}-${toPlayerId}`,
  ]

  return {
    ...gameState,
    players: newPlayers,
    tradingState,
  }
}
