'use client'

import { cn } from '@/lib/utils'

interface PlayerScore {
  id: string
  name: string
  score: number
  rank: string | null
  isFinished: boolean
  isCurrentTurn: boolean
}

interface ScoreboardProps {
  players: PlayerScore[]
  winScore: number
  currentRound: number
}

const rankEmojis: Record<string, string> = {
  KING: '👑',
  QUEEN: '👸',
  NOBLE: '🎩',
  PEASANT: '🧑‍🌾',
}

// Rank order for sorting (lower = higher rank)
const rankOrder: Record<string, number> = {
  KING: 0,
  QUEEN: 1,
  NOBLE: 2,
  PEASANT: 3,
}

export function Scoreboard({ players, winScore, currentRound }: ScoreboardProps) {
  // Sort by rank (King first), then by score for players with same rank
  const sortedPlayers = [...players].sort((a, b) => {
    const rankA = a.rank ? rankOrder[a.rank] ?? 99 : 99
    const rankB = b.rank ? rankOrder[b.rank] ?? 99 : 99
    if (rankA !== rankB) return rankA - rankB
    // Same rank or no rank - sort by score
    return b.score - a.score
  })

  return (
    <div className="bg-slate-800/80 rounded-lg p-4 min-w-[200px]">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-white">Scoreboard</h3>
        <span className="text-xs text-slate-400">Round {currentRound}</span>
      </div>
      <div className="text-xs text-slate-400 mb-2">First to {winScore} wins</div>
      <div className="space-y-2">
        {sortedPlayers.map((player, index) => (
          <div
            key={player.id}
            className={cn(
              'flex items-center justify-between p-2 rounded',
              player.isCurrentTurn && 'bg-yellow-500/20 ring-1 ring-yellow-500',
              player.isFinished && 'opacity-60'
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-4">{index + 1}.</span>
              <span
                className={cn(
                  'font-medium truncate max-w-[100px]',
                  player.isCurrentTurn ? 'text-yellow-400' : 'text-white'
                )}
              >
                {player.name}
              </span>
              {player.rank && (
                <span className="text-sm" title={player.rank}>
                  {rankEmojis[player.rank] || ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div
                className="h-1.5 bg-slate-700 rounded-full w-16 overflow-hidden"
                title={`${player.score}/${winScore}`}
              >
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, (player.score / winScore) * 100)}%` }}
                />
              </div>
              <span className="text-sm font-mono text-slate-300 w-8 text-right">
                {player.score}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

interface RoundResultsProps {
  results: {
    playerId: string
    name: string
    position: number
    points: number
    totalScore: number
    rank: string
  }[]
  onNextRound?: () => void
  isHost?: boolean
}

export function RoundResults({ results, onNextRound, isHost }: RoundResultsProps) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold text-white text-center mb-4">Round Complete!</h2>
        <div className="space-y-3">
          {results.map((result) => (
            <div
              key={result.playerId}
              className="flex items-center justify-between p-3 bg-slate-700/50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{rankEmojis[result.rank]}</span>
                <div>
                  <div className="font-medium text-white">{result.name}</div>
                  <div className="text-sm text-slate-400">{result.rank}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-emerald-400 font-bold">+{result.points}</div>
                <div className="text-sm text-slate-400">Total: {result.totalScore}</div>
              </div>
            </div>
          ))}
        </div>
        {isHost && onNextRound && (
          <button
            onClick={onNextRound}
            className="w-full mt-4 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
          >
            Start Next Round
          </button>
        )}
      </div>
    </div>
  )
}

interface GameOverProps {
  winner: {
    name: string
    score: number
  }
  finalScores: {
    playerId: string
    name: string
    score: number
  }[]
  onPlayAgain?: () => void
  onExit?: () => void
}

export function GameOver({ winner, finalScores, onPlayAgain, onExit }: GameOverProps) {
  const sortedScores = [...finalScores].sort((a, b) => b.score - a.score)

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🏆</div>
          <h2 className="text-2xl font-bold text-white">{winner.name} Wins!</h2>
          <p className="text-emerald-400">{winner.score} points</p>
        </div>
        <div className="space-y-2 mb-6">
          {sortedScores.map((player, index) => (
            <div
              key={player.playerId}
              className={cn(
                'flex items-center justify-between p-3 rounded-lg',
                index === 0 ? 'bg-yellow-500/20' : 'bg-slate-700/50'
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                </span>
                <span className="text-white font-medium">{player.name}</span>
              </div>
              <span className="text-slate-300 font-mono">{player.score} pts</span>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onExit}
            className="flex-1 py-3 bg-slate-600 text-white rounded-lg font-medium hover:bg-slate-700"
          >
            Exit
          </button>
          {onPlayAgain && (
            <button
              onClick={onPlayAgain}
              className="flex-1 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700"
            >
              Play Again
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
