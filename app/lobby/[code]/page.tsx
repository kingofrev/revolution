'use client'

import { useEffect, useState, use } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useGame } from '@/hooks/useGame'

interface Game {
  id: string
  code: string
  hostId: string
  status: string
  playerCount: number
  twosHigh: boolean
  tradingEnabled: boolean
  winScore: number
  players: {
    id: string
    user: { id: string; name: string; isBot?: boolean }
    seatPosition: number
  }[]
  host: { id: string; name: string }
}

export default function LobbyPage({ params }: { params: Promise<{ code: string }> }) {
  const resolvedParams = use(params)
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const { isConnected, gameState } = useGame(resolvedParams.code)

  useEffect(() => {
    if (authStatus === 'loading') return
    if (!session) {
      router.push('/login')
      return
    }

    async function fetchGame() {
      try {
        const res = await fetch(`/api/games/${resolvedParams.code}`)
        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to load game')
        }
        const gameData = await res.json()
        setGame(gameData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    }

    fetchGame()
    const interval = setInterval(fetchGame, 3000)
    return () => clearInterval(interval)
  }, [session, authStatus, router, resolvedParams.code])

  useEffect(() => {
    if (gameState?.status === 'PLAYING' || gameState?.status === 'TRADING' || gameState?.status === 'ROUND_END') {
      router.push(`/play/${resolvedParams.code}`)
    }
  }, [gameState?.status, router, resolvedParams.code])

  useEffect(() => {
    // Redirect to play page if game is in progress (any non-LOBBY status)
    if (game?.status && game.status !== 'LOBBY') {
      router.push(`/play/${resolvedParams.code}`)
    }
  }, [game?.status, router, resolvedParams.code])

  if (authStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-900 to-slate-900">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-900 to-slate-900">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-red-500 text-center">{error}</p>
            <Button onClick={() => router.push('/')} className="w-full mt-4">
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!game) return null

  const isHost = session?.user?.id === game.hostId
  const canStart = game.players.length === game.playerCount

  async function handleStartGame() {
    try {
      const res = await fetch(`/api/games/${resolvedParams.code}/start`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to start game')
        return
      }
      router.push(`/play/${resolvedParams.code}`)
    } catch {
      setError('Failed to start game')
    }
  }

  async function handleLeaveGame() {
    try {
      await fetch(`/api/games/${resolvedParams.code}`, { method: 'DELETE' })
      router.push('/')
    } catch {
      setError('Failed to leave game')
    }
  }

  async function handleAddBot() {
    try {
      const res = await fetch(`/api/games/${resolvedParams.code}/bots`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to add bot')
        return
      }
      // Refresh game data
      const gameRes = await fetch(`/api/games/${resolvedParams.code}`)
      if (gameRes.ok) {
        setGame(await gameRes.json())
      }
    } catch {
      setError('Failed to add bot')
    }
  }

  async function handleRemoveBot(odlerId: string) {
    try {
      const res = await fetch(`/api/games/${resolvedParams.code}/bots`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ odlerId }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to remove bot')
        return
      }
      // Refresh game data
      const gameRes = await fetch(`/api/games/${resolvedParams.code}`)
      if (gameRes.ok) {
        setGame(await gameRes.json())
      }
    } catch {
      setError('Failed to remove bot')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 to-slate-900 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">Game Lobby</h1>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-white/70">
              {isConnected ? 'Connected' : 'Connecting...'}
            </span>
          </div>
        </div>

        <Card className="mb-4">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Game Code</CardTitle>
                <CardDescription>Share this code with friends</CardDescription>
              </div>
              <div className="text-4xl font-mono font-bold tracking-widest text-primary">
                {game.code}
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <CardTitle>Settings</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Players:</span>
              <span className="ml-2 font-medium">{game.playerCount}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Win Score:</span>
              <span className="ml-2 font-medium">{game.winScore} pts</span>
            </div>
            <div>
              <span className="text-muted-foreground">Card Ranking:</span>
              <span className="ml-2 font-medium">{game.twosHigh ? '2s High' : 'Aces High'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Trading:</span>
              <span className="ml-2 font-medium">{game.tradingEnabled ? 'Enabled' : 'Disabled'}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-4">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>
                Players ({game.players.length}/{game.playerCount})
              </CardTitle>
              {isHost && game.players.length < game.playerCount && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddBot}
                  className="text-xs"
                >
                  + Add Bot
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {game.players.map((player) => (
                <div
                  key={player.id}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    player.user.isBot ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                      player.user.isBot
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-primary/20 text-primary'
                    }`}>
                      {player.user.isBot ? '🤖' : player.user.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium">{player.user.name}</span>
                    {player.user.isBot && (
                      <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">
                        Bot
                      </span>
                    )}
                    {player.user.id === game.hostId && (
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded">
                        Host
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      Seat {player.seatPosition + 1}
                    </span>
                    {isHost && player.user.isBot && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveBot(player.user.id)}
                        className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        ×
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {Array.from({ length: game.playerCount - game.players.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="flex items-center justify-center p-3 rounded-lg border-2 border-dashed border-muted"
                >
                  <span className="text-muted-foreground">Waiting for player...</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button variant="outline" onClick={handleLeaveGame} className="flex-1">
            Leave Game
          </Button>
          <Button
            onClick={handleStartGame}
            disabled={!canStart || !isHost}
            className="flex-1"
          >
            {!isHost
              ? 'Waiting for host...'
              : canStart
                ? 'Start Game'
                : `Need ${game.playerCount - game.players.length} more`}
          </Button>
        </div>
      </div>
    </div>
  )
}
