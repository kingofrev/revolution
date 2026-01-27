'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function HomePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [playerCount, setPlayerCount] = useState(4)
  const [twosHigh, setTwosHigh] = useState(false)
  const [tradingEnabled, setTradingEnabled] = useState(true)
  const [winScore, setWinScore] = useState(50)

  useEffect(() => {
    if (status !== 'loading' && !session) {
      router.push('/login')
    }
  }, [session, status, router])

  if (status === 'loading' || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-900 to-slate-900">
        <div className="text-white">Loading...</div>
      </div>
    )
  }

  async function handleCreateGame() {
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerCount,
          twosHigh,
          tradingEnabled,
          winScore,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create game')
      }

      const game = await res.json()
      router.push(`/lobby/${game.code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function handleJoinGame(e: React.FormEvent) {
    e.preventDefault()
    if (!joinCode.trim()) return

    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/games/${joinCode}`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to join game')
      }

      const game = await res.json()
      const code = joinCode.toUpperCase()

      // If game is in progress, redirect to play page instead of lobby
      if (game.status && game.status !== 'LOBBY') {
        router.push(`/play/${code}`)
      } else {
        router.push(`/lobby/${code}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 to-slate-900 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">Revolution</h1>
          <div className="flex items-center gap-4">
            <span className="text-emerald-300">{session.user.name}</span>
            <Button variant="outline" size="sm" onClick={() => signOut()}>
              Sign Out
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Play Revolution</CardTitle>
            <CardDescription>
              Create a new game or join an existing one
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="create">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="create">Create Game</TabsTrigger>
                <TabsTrigger value="join">Join Game</TabsTrigger>
              </TabsList>

              <TabsContent value="create" className="space-y-4">
                <div className="space-y-2">
                  <Label>Number of Players</Label>
                  <div className="flex gap-2">
                    {[4, 5, 6].map((num) => (
                      <Button
                        key={num}
                        variant={playerCount === num ? 'default' : 'outline'}
                        onClick={() => setPlayerCount(num)}
                        className="flex-1"
                      >
                        {num}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Win Score</Label>
                  <div className="flex gap-2">
                    {[50, 100].map((score) => (
                      <Button
                        key={score}
                        variant={winScore === score ? 'default' : 'outline'}
                        onClick={() => setWinScore(score)}
                        className="flex-1"
                      >
                        {score} points
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Card Ranking</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={!twosHigh ? 'default' : 'outline'}
                      onClick={() => setTwosHigh(false)}
                      className="flex-1"
                    >
                      Aces High
                    </Button>
                    <Button
                      variant={twosHigh ? 'default' : 'outline'}
                      onClick={() => setTwosHigh(true)}
                      className="flex-1"
                    >
                      2s High
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="trading"
                    checked={tradingEnabled}
                    onChange={(e) => setTradingEnabled(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="trading">Enable Card Trading</Label>
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}

                <Button
                  onClick={handleCreateGame}
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create Game'}
                </Button>
              </TabsContent>

              <TabsContent value="join">
                <form onSubmit={handleJoinGame} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="joinCode">Game Code</Label>
                    <Input
                      id="joinCode"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="Enter 6-character code"
                      maxLength={6}
                      className="text-center text-2xl tracking-widest"
                    />
                  </div>

                  {error && <p className="text-sm text-red-500">{error}</p>}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading || joinCode.length !== 6}
                  >
                    {loading ? 'Joining...' : 'Join Game'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
