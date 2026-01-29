'use client'

import { useState, useEffect, use, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card } from '@/lib/game/deck'
import { validatePlay } from '@/lib/game/rules'
import { Hand, SortOrder } from '@/components/game/hand'
import { ActionButtons, BurnedCards } from '@/components/game/play-area'
import { CardTable } from '@/components/game/card-table'
import { Scoreboard, RoundResults, GameOver } from '@/components/game/scoreboard'
import { Chat } from '@/components/game/chat'
import { TradingPhase } from '@/components/game/trading'

interface ChatMessage {
  id: string
  playerId: string
  playerName: string
  message: string
  timestamp: number
}

interface TradingState {
  kingId: string
  queenId: string
  lowestPeasantId: string
  secondLowestId: string
  kingTraded: boolean
  queenTraded: boolean
}

interface LastAction {
  type: 'play' | 'pass'
  playerId: string
  playerName: string
  playerRank: string | null
  description: string
  autoSkipped: {
    playerId: string
    playerName: string
    playerRank: string | null
  }[]
}

interface GameState {
  gameId: string
  code: string
  status: string
  settings: {
    playerCount: number
    twosHigh: boolean
    tradingEnabled: boolean
    winScore: number
  }
  currentRound: number
  players: any[]
  currentPlayerId: string | null
  lastPlay: any
  passCount: number
  finishOrder: string[]
  myHand: Card[]
  messages?: ChatMessage[]
  tradingState?: TradingState | null
  burnedCards?: Card[]
  lastAction?: LastAction | null
}

export default function PlayPage({ params }: { params: Promise<{ code: string }> }) {
  const resolvedParams = use(params)
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [selectedCards, setSelectedCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [sortOrder, setSortOrder] = useState<SortOrder>('low-high')

  // Load sort preference from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('revolution-card-sort')
    if (saved === 'low-high' || saved === 'high-low' || saved === 'manual') {
      setSortOrder(saved)
    }
  }, [])

  // Save sort preference to localStorage
  function handleSortOrderChange(order: SortOrder) {
    setSortOrder(order)
    localStorage.setItem('revolution-card-sort', order)
  }

  const fetchGameState = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/${resolvedParams.code}/state`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to load game')
      }
      const state = await res.json()
      if (state.status === 'LOBBY') {
        router.push(`/lobby/${resolvedParams.code}`)
        return
      }
      setGameState(state)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [resolvedParams.code, router])

  useEffect(() => {
    if (authStatus === 'loading') return
    if (!session) {
      // Give a brief delay before redirecting - session might still be loading
      const timeout = setTimeout(() => {
        if (!session) {
          router.push('/login')
        }
      }, 1000)
      return () => clearTimeout(timeout)
    }

    fetchGameState()
    const interval = setInterval(fetchGameState, 2000)
    return () => clearInterval(interval)
  }, [session, authStatus, router, fetchGameState])

  async function handlePlay() {
    if (!gameState || selectedCards.length === 0 || actionLoading) return

    setActionLoading(true)
    try {
      const res = await fetch(`/api/games/${resolvedParams.code}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'play', cards: selectedCards }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to play cards')
        return
      }

      const { state } = await res.json()
      setGameState(state)
      setSelectedCards([])
    } catch (err) {
      setError('Failed to play cards')
    } finally {
      setActionLoading(false)
    }
  }

  async function handlePass() {
    if (!gameState || actionLoading) return

    setActionLoading(true)
    try {
      const res = await fetch(`/api/games/${resolvedParams.code}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pass' }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to pass')
        return
      }

      const { state } = await res.json()
      setGameState(state)
      setSelectedCards([])
    } catch (err) {
      setError('Failed to pass')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleNextRound() {
    if (!gameState || actionLoading) return

    setActionLoading(true)
    try {
      const res = await fetch(`/api/games/${resolvedParams.code}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'next-round' }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to start next round')
        return
      }

      const { state } = await res.json()
      setGameState(state)
      setSelectedCards([])
    } catch (err) {
      setError('Failed to start next round')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleSendMessage(message: string) {
    if (!gameState) return

    try {
      const res = await fetch(`/api/games/${resolvedParams.code}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'chat', message }),
      })

      if (res.ok) {
        const { state } = await res.json()
        setGameState(state)
      }
    } catch (err) {
      // Silently fail for chat messages
    }
  }

  async function handleTrade(cards: Card[]) {
    if (!gameState || actionLoading) return

    setActionLoading(true)
    try {
      const res = await fetch(`/api/games/${resolvedParams.code}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trade', cards }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to trade')
        return
      }

      const { state } = await res.json()
      setGameState(state)
    } catch (err) {
      setError('Failed to trade')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleAbandonGame() {
    if (!confirm('Are you sure you want to leave this game? This cannot be undone.')) {
      return
    }

    try {
      const res = await fetch(`/api/games/${resolvedParams.code}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to leave game')
        return
      }

      router.push('/')
    } catch (err) {
      setError('Failed to leave game')
    }
  }

  if (authStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-900 to-slate-900">
        <div className="text-white">Loading game...</div>
      </div>
    )
  }

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-900 to-slate-900">
        <div className="text-white">{error || 'Game not found'}</div>
      </div>
    )
  }

  const myPlayer = gameState.players.find((p) => p.odlerId === session?.user?.id)
  const hand = gameState.myHand || []

  // Rank order for sorting (King first)
  const rankOrder: Record<string, number> = {
    KING: 0,
    QUEEN: 1,
    NOBLE: 2,
    PEASANT: 3,
  }

  // Sort ALL players in turn order for the card table
  // 1st player (King or seat 0 in round 1) at top, then counter-clockwise
  const allPlayersInTurnOrder = [...gameState.players]
    .sort((a, b) => {
      const rankA = a.currentRank ? rankOrder[a.currentRank] ?? 99 : 99
      const rankB = b.currentRank ? rankOrder[b.currentRank] ?? 99 : 99
      if (rankA !== rankB) return rankA - rankB
      // Same rank - maintain seat position order
      return a.seatPosition - b.seatPosition
    })

  const isMyTurn = myPlayer?.id === gameState.currentPlayerId

  const canPlayCards =
    isMyTurn &&
    selectedCards.length > 0 &&
    validatePlay(selectedCards, gameState.lastPlay, gameState.settings.twosHigh).valid

  const canPassTurn = isMyTurn && gameState.lastPlay !== null

  // Check if player has ANY valid plays available
  const hasAnyValidPlay = (() => {
    if (!isMyTurn || !gameState.lastPlay) return true // Leading - can always play something

    const lastPlayCount = gameState.lastPlay.count
    const lastPlayType = gameState.lastPlay.playType
    const twosHigh = gameState.settings.twosHigh

    // Helper to get card value
    const getCardValue = (rank: string): number => {
      if (twosHigh && rank === '2') return 15
      const values: Record<string, number> = {
        '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
        '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
      }
      return values[rank] || 0
    }

    const suitValues: Record<string, number> = {
      'clubs': 0, 'spades': 1, 'diamonds': 2, 'hearts': 3
    }

    // If player doesn't have enough cards, they can't play
    if (hand.length < lastPlayCount) return false

    // Group cards by rank
    const rankCounts: Record<string, Card[]> = {}
    for (const card of hand) {
      if (!rankCounts[card.rank]) rankCounts[card.rank] = []
      rankCounts[card.rank].push(card)
    }

    // Check for bombs first (can beat anything)
    const ranksWithPairs = Object.entries(rankCounts)
      .filter(([_, cards]) => cards.length >= 2)
      .map(([rank, cards]) => ({ rank, value: getCardValue(rank), cards }))
      .sort((a, b) => a.value - b.value)

    // Check for 3 consecutive pairs (bomb)
    for (let i = 0; i <= ranksWithPairs.length - 3; i++) {
      if (ranksWithPairs[i + 1].value === ranksWithPairs[i].value + 1 &&
          ranksWithPairs[i + 2].value === ranksWithPairs[i + 1].value + 1) {
        // Found a potential bomb - if beating a bomb, check if it's higher
        if (lastPlayType === 'bomb' && gameState.lastPlay.bombHighRank) {
          if (ranksWithPairs[i + 2].value > gameState.lastPlay.bombHighRank) {
            return true
          }
        } else {
          // Bomb beats non-bombs
          return true
        }
      }
    }

    if (lastPlayType === 'bomb') {
      // Can only beat with higher bomb (checked above)
      return false
    }

    if (lastPlayType === 'run') {
      // Need a run of same length with higher high card
      const lastRunHigh = gameState.lastPlay.runHighCard
      if (!lastRunHigh) return true // Safety fallback

      // Find all possible runs of the required length
      const cardsByValue = hand.map(c => ({
        card: c,
        value: getCardValue(c.rank),
        suitValue: suitValues[c.suit] || 0
      })).sort((a, b) => a.value - b.value)

      // Group by value
      const valueGroups: Record<number, typeof cardsByValue> = {}
      for (const c of cardsByValue) {
        if (!valueGroups[c.value]) valueGroups[c.value] = []
        valueGroups[c.value].push(c)
      }

      const uniqueValues = Object.keys(valueGroups).map(Number).sort((a, b) => a - b)

      // Find consecutive sequences
      for (let i = 0; i <= uniqueValues.length - lastPlayCount; i++) {
        let isConsecutive = true
        for (let j = 1; j < lastPlayCount; j++) {
          if (uniqueValues[i + j] !== uniqueValues[i] + j) {
            isConsecutive = false
            break
          }
        }
        if (isConsecutive) {
          // Found a run - check if it beats the last play
          const highValue = uniqueValues[i + lastPlayCount - 1]
          const highCards = valueGroups[highValue]
          const bestSuit = Math.max(...highCards.map(c => c.suitValue))

          // Compare: higher rank wins, or same rank with higher suit
          if (highValue > lastRunHigh.rank) return true
          if (highValue === lastRunHigh.rank && bestSuit > lastRunHigh.suit) return true
        }
      }
      return false
    }

    // For singles, pairs, triples, quads
    const lastRank = getCardValue(gameState.lastPlay.rank)
    const lastHighSuit = gameState.lastPlay.highSuit ?? 0

    for (const [rank, cards] of Object.entries(rankCounts)) {
      if (cards.length >= lastPlayCount) {
        const rankValue = getCardValue(rank)
        // Higher rank always wins
        if (rankValue > lastRank) return true
        // Same rank - check suit (get best suits from available cards)
        if (rankValue === lastRank) {
          const sortedBySuit = cards.sort((a, b) => suitValues[b.suit] - suitValues[a.suit])
          const bestSuit = suitValues[sortedBySuit[0].suit]
          if (bestSuit > lastHighSuit) return true
        }
      }
    }

    return false
  })()

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 to-slate-900 p-4 flex flex-col">
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg z-50">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-bold">×</button>
        </div>
      )}

      {gameState.burnedCards && gameState.burnedCards.length > 0 && (
        <BurnedCards cards={gameState.burnedCards} currentRound={gameState.currentRound} />
      )}

      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm text-white/70">Game: {resolvedParams.code}</span>
          </div>
          <button
            onClick={handleAbandonGame}
            className="text-xs text-red-400 hover:text-red-300 hover:underline"
          >
            Leave Game
          </button>
        </div>
        <Scoreboard
          players={gameState.players.map((p) => ({
            id: p.id,
            name: p.name,
            score: p.totalScore,
            rank: p.currentRank,
            isFinished: p.isFinished,
            isCurrentTurn: p.id === gameState.currentPlayerId,
          }))}
          winScore={gameState.settings.winScore}
          currentRound={gameState.currentRound}
        />
      </div>

      {/* Card Table with all players */}
      <div className="flex-1 flex items-start justify-center pt-2">
        <CardTable
          players={allPlayersInTurnOrder.map((p, index) => ({
            id: p.id,
            name: p.name,
            orderId: index,
            handCount: p.handCount || 0,
            currentRank: p.currentRank,
            isFinished: p.isFinished,
            isCurrentTurn: p.id === gameState.currentPlayerId,
            isMe: p.odlerId === session?.user?.id,
          }))}
          lastPlay={gameState.lastPlay}
          lastAction={gameState.lastAction}
        />
      </div>

      <div className={`mt-auto transition-all duration-300 ${isMyTurn ? 'pb-2' : ''}`}>
        <div className="text-center mb-3">
          <span className={`font-medium transition-all duration-300 ${isMyTurn ? 'text-yellow-300 text-lg' : 'text-white'}`}>
            {myPlayer?.name}
          </span>
          {myPlayer?.isFinished && (
            <span className="ml-2 text-emerald-400">({myPlayer.currentRank})</span>
          )}
          {isMyTurn && (
            <span className="ml-2 text-yellow-400 animate-pulse font-bold">
              ★ Your turn! ★
            </span>
          )}
        </div>

        {!myPlayer?.isFinished && (
          <div className={`rounded-xl p-4 transition-all duration-300 ${
            isMyTurn
              ? 'bg-yellow-500/10 border-2 border-yellow-500/30 shadow-lg shadow-yellow-500/20'
              : 'bg-slate-800/30'
          }`}>
            <Hand
              cards={hand}
              selectable={isMyTurn && !actionLoading}
              onSelectionChange={setSelectedCards}
              disabled={!isMyTurn || actionLoading}
              twosHigh={gameState.settings.twosHigh}
              isMyTurn={isMyTurn}
              sortOrder={sortOrder}
              onSortOrderChange={handleSortOrderChange}
              showSortControls={true}
            />

            <ActionButtons
              canPlay={canPlayCards && !actionLoading}
              canPass={canPassTurn && !actionLoading}
              selectedCount={selectedCards.length}
              onPlay={handlePlay}
              onPass={handlePass}
              isMyTurn={isMyTurn}
              mustPass={canPassTurn && !hasAnyValidPlay}
            />
          </div>
        )}

        {myPlayer?.isFinished && (
          <div className="text-center text-emerald-400 py-8">
            You finished! Watching the rest of the round...
          </div>
        )}
      </div>

      {gameState.status === 'ROUND_END' && (
        <RoundResults
          results={gameState.finishOrder.map((playerId, index) => {
            const player = gameState.players.find((p) => p.id === playerId)!
            // Points based on player count: 4 players = [4,3,2,0], 5 = [5,4,3,2,0], 6 = [6,5,4,3,2,0]
            const pointsMap: Record<number, number[]> = {
              4: [4, 3, 2, 0],
              5: [5, 4, 3, 2, 0],
              6: [6, 5, 4, 3, 2, 0],
            }
            const points = (pointsMap[gameState.settings.playerCount] || [4, 3, 2, 0])[index]
            return {
              playerId,
              name: player.name,
              position: index,
              points,
              totalScore: player.totalScore,
              rank: player.currentRank || 'PEASANT',
            }
          })}
          isHost={session?.user?.id === gameState.players[0]?.odlerId}
          onNextRound={handleNextRound}
        />
      )}

      {gameState.status === 'TRADING' && gameState.tradingState && (
        <TradingPhase
          tradingState={gameState.tradingState}
          myPlayerId={myPlayer?.id || ''}
          myHand={hand}
          players={gameState.players.map((p) => ({ id: p.id, name: p.name }))}
          twosHigh={gameState.settings.twosHigh}
          onTrade={handleTrade}
          loading={actionLoading}
        />
      )}

      {gameState.status === 'GAME_OVER' && (
        <GameOver
          winner={{
            name: gameState.players.reduce((a, b) => (a.totalScore > b.totalScore ? a : b)).name,
            score: Math.max(...gameState.players.map((p) => p.totalScore)),
          }}
          finalScores={gameState.players.map((p) => ({
            playerId: p.id,
            name: p.name,
            score: p.totalScore,
          }))}
          onExit={() => router.push('/')}
        />
      )}

      {/* Chat */}
      <Chat
        messages={gameState.messages || []}
        onSendMessage={handleSendMessage}
        currentPlayerId={myPlayer?.id || ''}
      />
    </div>
  )
}
