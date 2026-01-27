'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Stats {
  gamesPlayed: number
  gamesWon: number
  winRate: string
  totalPoints: number
  avgPosition: string
  positionCounts: Record<number, number>
  memberSince: string
}

interface RecentGame {
  id: string
  code: string
  playerCount: number
  totalRounds: number
  winnerName: string
  myPosition: number
  myScore: number
  isWinner: boolean
  completedAt: string
}

interface StatsData {
  stats: Stats
  recentGames: RecentGame[]
}

export function PlayerStats() {
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/stats')
        if (res.ok) {
          const statsData = await res.json()
          setData(statsData)
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [])

  if (loading) {
    return (
      <Card className="mb-4">
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">Loading stats...</div>
        </CardContent>
      </Card>
    )
  }

  if (!data) {
    return null
  }

  const { stats, recentGames } = data

  function getPositionLabel(pos: number): string {
    switch (pos) {
      case 1: return '1st'
      case 2: return '2nd'
      case 3: return '3rd'
      default: return `${pos}th`
    }
  }

  function getPositionColor(pos: number): string {
    switch (pos) {
      case 1: return 'text-yellow-500'
      case 2: return 'text-slate-400'
      case 3: return 'text-amber-600'
      default: return 'text-muted-foreground'
    }
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-lg">Your Stats</CardTitle>
            <CardDescription>Track your Revolution journey</CardDescription>
          </div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-primary hover:underline"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold">{stats.gamesPlayed}</div>
            <div className="text-xs text-muted-foreground">Games</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-500">{stats.gamesWon}</div>
            <div className="text-xs text-muted-foreground">Wins</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.winRate}%</div>
            <div className="text-xs text-muted-foreground">Win Rate</div>
          </div>
        </div>

        {expanded && (
          <>
            <div className="border-t mt-4 pt-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Total Points:</span>
                  <span className="ml-2 font-medium">{stats.totalPoints}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Avg Position:</span>
                  <span className="ml-2 font-medium">{stats.avgPosition}</span>
                </div>
              </div>

              {Object.keys(stats.positionCounts).length > 0 && (
                <div className="mt-3">
                  <div className="text-sm text-muted-foreground mb-2">Finishes by Position:</div>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(stats.positionCounts)
                      .sort(([a], [b]) => Number(a) - Number(b))
                      .map(([pos, count]) => (
                        <div
                          key={pos}
                          className={cn(
                            "px-2 py-1 rounded text-sm font-medium",
                            Number(pos) === 1 ? "bg-yellow-500/20 text-yellow-500" :
                            Number(pos) === 2 ? "bg-slate-400/20 text-slate-400" :
                            Number(pos) === 3 ? "bg-amber-600/20 text-amber-600" :
                            "bg-muted text-muted-foreground"
                          )}
                        >
                          {getPositionLabel(Number(pos))}: {count}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {recentGames.length > 0 && (
              <div className="border-t mt-4 pt-4">
                <div className="text-sm font-medium mb-3">Recent Games</div>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {recentGames.map((game) => (
                    <div
                      key={game.id}
                      className={cn(
                        "flex justify-between items-center p-2 rounded text-sm",
                        game.isWinner ? "bg-yellow-500/10" : "bg-muted/50"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn("font-medium", getPositionColor(game.myPosition))}>
                          {getPositionLabel(game.myPosition)}
                        </span>
                        <span className="text-muted-foreground">
                          {game.myScore} pts
                        </span>
                        {game.isWinner && (
                          <span className="text-yellow-500">★</span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">
                          {game.playerCount}p / {game.totalRounds} rounds
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(game.completedAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
