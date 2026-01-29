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
        'relative',
        'min-h-[180px] min-w-[280px]',
        className
      )}
    >
      {/* Card table - outer wooden rail */}
      <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-b from-amber-800 via-amber-900 to-amber-950 shadow-2xl" />

      {/* Inner wooden edge */}
      <div className="absolute inset-2 rounded-[1.5rem] bg-gradient-to-b from-amber-700 via-amber-800 to-amber-900" />

      {/* Green felt surface */}
      <div className="absolute inset-4 rounded-[1rem] bg-gradient-to-br from-emerald-700 via-emerald-800 to-emerald-900 shadow-inner">
        {/* Felt texture overlay */}
        <div className="absolute inset-0 rounded-[1rem] opacity-30 bg-[radial-gradient(circle_at_50%_50%,_transparent_0%,_rgba(0,0,0,0.3)_100%)]" />

        {/* Subtle pattern on felt */}
        <div className="absolute inset-0 rounded-[1rem] opacity-10"
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)',
            backgroundSize: '8px 8px'
          }}
        />
      </div>

      {/* Content on the felt */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full min-h-[180px] p-6">
        {lastPlay ? (
          <div className="flex flex-col items-center gap-3">
            <CardStack cards={lastPlay.cards} />
            <div className="text-sm font-medium text-emerald-100 bg-black/20 px-3 py-1 rounded-full">
              {getPlayDescription(lastPlay)}
            </div>
          </div>
        ) : (
          <div className="text-emerald-200/60 text-center">
            <div className="text-lg font-medium">Table</div>
            <div className="text-sm">Lead any card(s)</div>
          </div>
        )}
      </div>
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
  mustPass?: boolean  // True when player has no valid plays
}

export function ActionButtons({
  canPlay,
  canPass,
  selectedCount,
  onPlay,
  onPass,
  isMyTurn,
  mustPass = false,
}: ActionButtonsProps) {
  if (!isMyTurn) {
    return (
      <div className="text-center text-muted-foreground py-4">
        Waiting for other players...
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2 py-4">
      {/* Must pass notification */}
      {mustPass && canPass && (
        <div className="text-orange-400 text-sm font-medium animate-pulse mb-1">
          You have no valid plays - you must pass
        </div>
      )}

      <div className="flex gap-4 justify-center">
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
            canPass
              ? mustPass
                ? 'bg-orange-500 text-white hover:bg-orange-600 active:scale-95 animate-pulse ring-2 ring-orange-400 ring-offset-2 ring-offset-slate-900'
                : 'bg-slate-600 text-white hover:bg-slate-700 active:scale-95'
              : 'bg-slate-600 text-white opacity-50 cursor-not-allowed'
          )}
        >
          {mustPass ? 'Must Pass' : 'Pass'}
        </button>
      </div>
    </div>
  )
}

interface BurnedCardsProps {
  cards: Card[]
  currentRound: number
}

export function BurnedCards({ cards, currentRound }: BurnedCardsProps) {
  if (!cards || cards.length === 0 || currentRound > 1) {
    return null
  }

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-slate-800/95 rounded-xl p-4 z-40 border border-amber-500/50">
      <div className="text-amber-400 text-sm font-medium text-center mb-2">
        Burned Cards (Round 1)
      </div>
      <div className="flex gap-2 justify-center">
        <CardStack cards={cards} />
      </div>
      <div className="text-slate-400 text-xs text-center mt-2">
        These cards are out of play this round
      </div>
    </div>
  )
}
