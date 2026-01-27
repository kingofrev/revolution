'use client'

import { useState, useEffect, use, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Card } from '@/lib/game/deck'
import { validatePlay } from '@/lib/game/rules'
import { Hand, OpponentHand } from '@/components/game/hand'
import { PlayArea, ActionButtons } from '@/components/game/play-area'
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
  const otherPlayers = gameState.players.filter((p) => p.odlerId !== session?.user?.id)
  const hand = gameState.myHand || []

  const isMyTurn = myPlayer?.id === gameState.currentPlayerId

  const canPlayCards =
    isMyTurn &&
    selectedCards.length > 0 &&
    validatePlay(selectedCards, gameState.lastPlay, gameState.settings.twosHigh).valid

  const canPassTurn = isMyTurn && gameState.lastPlay !== null

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 to-slate-900 p-4 flex flex-col">
      {error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg z-50">
          {error}
          <button onClick={() => setError(null)} className="ml-2 font-bold">×</button>
        </div>
      )}

      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-sm text-white/70">Game: {resolvedParams.code}</span>
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

      <div className="flex-1 flex flex-col justify-center">
        <div className="flex justify-center mb-4">
          {otherPlayers.slice(0, 2).map((player) => (
            <div key={player.id} className="mx-4">
              <OpponentHand
                cardCount={player.handCount || 0}
                position="top"
                playerName={player.name}
                isCurrentTurn={player.id === gameState.currentPlayerId}
                isFinished={player.isFinished}
                rank={player.currentRank}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center">
          <div className="w-48">
            {otherPlayers[2] && (
              <OpponentHand
                cardCount={otherPlayers[2].handCount || 0}
                position="left"
                playerName={otherPlayers[2].name}
                isCurrentTurn={otherPlayers[2].id === gameState.currentPlayerId}
                isFinished={otherPlayers[2].isFinished}
                rank={otherPlayers[2].currentRank}
              />
            )}
          </div>

          <PlayArea lastPlay={gameState.lastPlay} className="flex-1 max-w-md mx-4" />

          <div className="w-48">
            {otherPlayers[3] && (
              <OpponentHand
                cardCount={otherPlayers[3].handCount || 0}
                position="right"
                playerName={otherPlayers[3].name}
                isCurrentTurn={otherPlayers[3].id === gameState.currentPlayerId}
                isFinished={otherPlayers[3].isFinished}
                rank={otherPlayers[3].currentRank}
              />
            )}
          </div>
        </div>

        <div className="flex justify-center mt-4">
          {otherPlayers.slice(4).map((player) => (
            <div key={player.id} className="mx-4">
              <OpponentHand
                cardCount={player.handCount || 0}
                position="top"
                playerName={player.name}
                isCurrentTurn={player.id === gameState.currentPlayerId}
                isFinished={player.isFinished}
                rank={player.currentRank}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-auto">
        <div className="text-center mb-2">
          <span className="text-white font-medium">{myPlayer?.name}</span>
          {myPlayer?.isFinished && (
            <span className="ml-2 text-emerald-400">({myPlayer.currentRank})</span>
          )}
          {isMyTurn && <span className="ml-2 text-yellow-400">Your turn!</span>}
        </div>

        {!myPlayer?.isFinished && (
          <>
            <Hand
              cards={hand}
              selectable={isMyTurn && !actionLoading}
              onSelectionChange={setSelectedCards}
              disabled={!isMyTurn || actionLoading}
              twosHigh={gameState.settings.twosHigh}
            />

            <ActionButtons
              canPlay={canPlayCards && !actionLoading}
              canPass={canPassTurn && !actionLoading}
              selectedCount={selectedCards.length}
              onPlay={handlePlay}
              onPass={handlePass}
              isMyTurn={isMyTurn}
            />
          </>
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
