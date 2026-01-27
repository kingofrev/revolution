'use client'

import { cn } from '@/lib/utils'
import { Card } from '@/lib/game/deck'
import { PlayedCards } from '@/lib/game/rules'
import { CardStack } from './card'

interface PlayAreaProps {
  lastPlay: PlayedCards | null
  className?: string
}

function getPlayDescription(play: PlayedCards): string {
  const playType = play.playType

  if (playType === 'bomb') {
    // Show the ranks in the bomb
    const ranks = [...new Set(play.cards.map(c => c.rank))].sort()
    return `BOMB! (${ranks.join('-')})`
  }

  if (playType === 'run') {
    // Show the run range
    const ranks = play.cards.map(c => c.rank)
    return `Run: ${ranks.join('-')}`
  }

  // For singles, pairs, triples, quads
  const typeNames: Record<string, string> = {
    'single': '',
    'pair': 'Pair of',
    'triple': 'Triple',
    'quad': 'Quad',
  }

  const prefix = playType ? typeNames[playType] || '' : ''
  if (prefix) {
    return `${prefix} ${play.rank}s`
  }

  // Fallback based on card count
  if (play.count === 1) return `${play.rank}`
  if (play.count === 2) return `Pair of ${play.rank}s`
  if (play.count === 3) return `Triple ${play.rank}s`
  if (play.count === 4) return `Quad ${play.rank}s`
  return `${play.count} cards`
}

export function PlayArea({ lastPlay, className }: PlayAreaProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center',
        'min-h-[150px] min-w-[200px]',
        'rounded-xl bg-emerald-800/50 border-2 border-emerald-600/30',
        'p-4',
        className
      )}
    >
      {lastPlay ? (
        <div className="flex flex-col items-center gap-2">
          <CardStack cards={lastPlay.cards} />
          <div className="text-sm text-emerald-200/70">
            {getPlayDescription(lastPlay)}
          </div>
        </div>
      ) : (
        <div className="text-emerald-200/50 text-center">
          <div className="text-lg">Play Area</div>
          <div className="text-sm">Lead any card(s)</div>
        </div>
      )}
    </div>
  )
}

interface ActionButtonsProps {
  canPlay: boolean
  canPass: boolean
  selectedCount: number
  onPlay: () => void
  onPass: () => void
  isMyTurn: boolean
}

export function ActionButtons({
  canPlay,
  canPass,
  selectedCount,
  onPlay,
  onPass,
  isMyTurn,
}: ActionButtonsProps) {
  if (!isMyTurn) {
    return (
      <div className="text-center text-muted-foreground py-4">
        Waiting for other players...
      </div>
    )
  }

  return (
    <div className="flex gap-4 justify-center py-4">
      <button
        onClick={onPlay}
        disabled={!canPlay || selectedCount === 0}
        className={cn(
          'px-6 py-3 rounded-lg font-medium transition-all',
          'bg-emerald-600 text-white',
          canPlay && selectedCount > 0
            ? 'hover:bg-emerald-700 active:scale-95'
            : 'opacity-50 cursor-not-allowed'
        )}
      >
        Play {selectedCount > 0 && `(${selectedCount})`}
      </button>
      <button
        onClick={onPass}
        disabled={!canPass}
        className={cn(
          'px-6 py-3 rounded-lg font-medium transition-all',
          'bg-slate-600 text-white',
          canPass
            ? 'hover:bg-slate-700 active:scale-95'
            : 'opacity-50 cursor-not-allowed'
        )}
      >
        Pass
      </button>
    </div>
  )
}
