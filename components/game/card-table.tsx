'use client'

import { cn } from '@/lib/utils'
import { Card } from '@/lib/game/deck'
import { PlayedCards } from '@/lib/game/rules'
import { CardStack } from './card'

interface Player {
  id: string
  name: string
  orderId: number            // Position in turn order (0 = first/King)
  handCount: number
  currentRank: string | null
  isFinished: boolean
  isCurrentTurn: boolean
  isMe: boolean              // Is this the current user?
}

interface CardTableProps {
  players: Player[]           // All players in turn order (first player at index 0)
  lastPlay: PlayedCards | null
  lastAction?: {
    type: 'play' | 'pass'
    playerId: string
    playerName: string
    playerRank: string | null
    description: string
    autoSkipped: { playerId: string; playerName: string; playerRank: string | null }[]
  } | null
  compact?: boolean
}

const rankEmojis: Record<string, string> = {
  KING: '👑',
  QUEEN: '👸',
  NOBLE: '🎩',
  PEASANT: '🧑‍🌾',
}

const rankColors: Record<string, string> = {
  KING: 'from-yellow-600 to-yellow-800',
  QUEEN: 'from-purple-600 to-purple-800',
  NOBLE: 'from-blue-600 to-blue-800',
  PEASANT: 'from-slate-600 to-slate-800',
}

function getPlayDescription(play: PlayedCards): string {
  const playType = play.playType

  if (playType === 'bomb') {
    const ranks = [...new Set(play.cards.map(c => c.rank))].sort()
    return `BOMB! (${ranks.join('-')})`
  }

  if (playType === 'run') {
    const ranks = play.cards.map(c => c.rank)
    return `Run: ${ranks.join('-')}`
  }

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

  if (play.count === 1) return `${play.rank}`
  if (play.count === 2) return `Pair of ${play.rank}s`
  if (play.count === 3) return `Triple ${play.rank}s`
  if (play.count === 4) return `Quad ${play.rank}s`
  return `${play.count} cards`
}

// Face-down cards display for a player position
function FaceDownCards({
  count,
  position,
  isCurrentTurn,
  isMe = false,
  compact = false,
}: {
  count: number
  position: 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  isCurrentTurn: boolean
  isMe?: boolean
  compact?: boolean
}) {
  const maxCards = compact ? 5 : 13
  const cards = Array.from({ length: Math.min(count, maxCards) })

  // Rotation based on position (cards face toward center)
  const rotations: Record<string, string> = {
    'top': 'rotate-180',
    'right': '-rotate-90',
    'bottom': 'rotate-0',
    'left': 'rotate-90',
    'top-left': 'rotate-[135deg]',
    'top-right': 'rotate-[-135deg]',
    'bottom-left': 'rotate-[45deg]',
    'bottom-right': 'rotate-[-45deg]',
  }

  // Card overlap direction
  const isVertical = position === 'left' || position === 'right'

  if (count === 0) {
    return <div className="text-slate-500 text-xs">Finished</div>
  }

  return (
    <div className={cn(
      "flex items-center justify-center",
      isVertical ? "flex-col" : "flex-row",
      isCurrentTurn && "scale-110"
    )}>
      {cards.map((_, index) => (
        <div
          key={index}
          className={cn(
            'rounded-md border',
            compact ? 'w-5 h-7' : 'w-8 h-11',
            'bg-gradient-to-br from-indigo-800 via-blue-700 to-indigo-900',
            'shadow-md',
            rotations[position],
            isCurrentTurn && 'ring-2 ring-yellow-400 animate-pulse',
            isMe && !isCurrentTurn && 'border-emerald-400/70',
            !isMe && !isCurrentTurn && 'border-slate-400/50'
          )}
          style={{
            marginLeft: !isVertical && index > 0 ? (compact ? '-12px' : '-20px') : 0,
            marginTop: isVertical && index > 0 ? (compact ? '-18px' : '-28px') : 0,
            zIndex: index,
          }}
        />
      ))}
    </div>
  )
}

// Player name plate
function PlayerPlate({
  player,
  position,
  compact = false,
}: {
  player: Player
  position: 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  compact?: boolean
}) {
  const rankGradient = player.currentRank ? rankColors[player.currentRank] : 'from-slate-600 to-slate-800'

  return (
    <div className={cn(
      'flex items-center gap-1.5 rounded-full bg-gradient-to-r shadow-lg',
      compact ? 'px-2 py-1' : 'px-3 py-1.5',
      rankGradient,
      player.isCurrentTurn && 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-emerald-900',
      player.isMe && !player.isCurrentTurn && 'ring-1 ring-emerald-400/50'
    )}>
      {player.currentRank && (
        <span className={compact ? 'text-xs' : 'text-sm'}>{rankEmojis[player.currentRank]}</span>
      )}
      <span className={cn(
        'font-medium text-white',
        compact ? 'text-xs' : 'text-sm',
        player.isCurrentTurn && 'text-yellow-200',
        player.isMe && '!text-emerald-300'
      )}>
        {player.name}{player.isMe && ' (You)'}
      </span>
      {!player.isFinished && (
        <span className={cn(
          'bg-black/30 px-1.5 py-0.5 rounded text-white/80',
          compact ? 'text-xs' : 'text-xs'
        )}>
          {player.handCount}
        </span>
      )}
    </div>
  )
}

export function CardTable({ players, lastPlay, lastAction, compact = false }: CardTableProps) {
  // Get fixed positions for all players based on player count
  // Always clockwise from top: top → top-right → right/bottom-right → bottom/bottom-left → left/top-left
  const getPositions = (count: number): string[] => {
    if (count === 4) return ['top', 'right', 'bottom', 'left']
    if (count === 5) return ['top', 'top-right', 'bottom-right', 'bottom-left', 'top-left']
    if (count === 6) return ['top', 'top-right', 'right', 'bottom-right', 'bottom-left', 'top-left']
    // Fallback for smaller games
    if (count === 3) return ['top', 'right', 'left']
    if (count === 2) return ['top', 'bottom']
    return ['top']
  }

  const positions = getPositions(players.length)

  // Position styles for each spot around the table
  const positionStyles: Record<string, string> = compact ? {
    'top': 'top-2 left-1/2 -translate-x-1/2 flex-col',
    'top-left': 'top-6 left-6 flex-col items-start',
    'top-right': 'top-6 right-6 flex-col items-end',
    'right': 'right-2 top-1/2 -translate-y-1/2 flex-row-reverse items-center',
    'left': 'left-2 top-1/2 -translate-y-1/2 flex-row items-center',
    'bottom': 'bottom-2 left-1/2 -translate-x-1/2 flex-col-reverse',
    'bottom-left': 'bottom-6 left-6 flex-col-reverse items-start',
    'bottom-right': 'bottom-6 right-6 flex-col-reverse items-end',
  } : {
    'top': 'top-4 left-1/2 -translate-x-1/2 flex-col',
    'top-left': 'top-12 left-12 flex-col items-start',
    'top-right': 'top-12 right-12 flex-col items-end',
    'right': 'right-4 top-1/2 -translate-y-1/2 flex-row-reverse items-center',
    'left': 'left-4 top-1/2 -translate-y-1/2 flex-row items-center',
    'bottom': 'bottom-4 left-1/2 -translate-x-1/2 flex-col-reverse',
    'bottom-left': 'bottom-12 left-12 flex-col-reverse items-start',
    'bottom-right': 'bottom-12 right-12 flex-col-reverse items-end',
  }

  return (
    <div className={cn(
      'relative w-full mx-auto',
      compact ? 'aspect-[3/4] max-w-[75%] mx-auto' : 'max-w-4xl aspect-[16/10]'
    )}>
      {/* Table surface */}
      <div className="absolute inset-0">
        {/* Outer wooden rail */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-amber-700 via-amber-800 to-amber-950 shadow-2xl" />

        {/* Inner wooden edge */}
        <div className={cn(
          'absolute rounded-full bg-gradient-to-b from-amber-600 via-amber-700 to-amber-900',
          compact ? 'inset-2' : 'inset-3'
        )} />

        {/* Padding/cushion rail */}
        <div className={cn(
          'absolute rounded-full bg-gradient-to-b from-amber-900 to-amber-950',
          compact ? 'inset-3' : 'inset-5'
        )} />

        {/* Green felt surface */}
        <div className={cn(
          'absolute rounded-full bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 shadow-inner overflow-hidden',
          compact ? 'inset-4' : 'inset-7'
        )}>
          {/* Felt texture */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,0.3) 1px, transparent 0)',
              backgroundSize: '4px 4px'
            }}
          />
          {/* Center lighting effect */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.1)_0%,_transparent_60%)]" />
        </div>
      </div>

      {/* Players around the table */}
      {players.map((player, index) => {
        const position = positions[index] || 'top'
        return (
          <div
            key={player.id}
            className={cn(
              'absolute flex gap-1.5 z-10',
              positionStyles[position]
            )}
          >
            <PlayerPlate player={player} position={position as any} compact={compact} />
            <FaceDownCards
              count={player.handCount}
              position={position as any}
              isCurrentTurn={player.isCurrentTurn}
              isMe={player.isMe}
              compact={compact}
            />
          </div>
        )
      })}

      {/* Center play area */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
        {/* Action caption */}
        {lastAction && (
          <div className="mb-2 text-center">
            <div className="bg-black/40 backdrop-blur-sm rounded-lg px-3 py-1.5 inline-block">
              <span className={cn('text-white', compact ? 'text-xs' : 'text-sm')}>
                {lastAction.playerRank && (
                  <span className="text-yellow-400">
                    {rankEmojis[lastAction.playerRank]}{' '}
                  </span>
                )}
                <span className="font-medium">{lastAction.playerName}</span>
                {lastAction.type === 'play' ? (
                  <span className="text-emerald-400"> played {lastAction.description}</span>
                ) : (
                  <span className="text-slate-300"> passed</span>
                )}
              </span>
            </div>
            {lastAction.autoSkipped && lastAction.autoSkipped.length > 0 && (
              <div className="mt-1">
                {lastAction.autoSkipped.map((skipped) => (
                  <div key={skipped.playerId} className="text-xs text-orange-400">
                    {skipped.playerRank && rankEmojis[skipped.playerRank]}{' '}
                    {skipped.playerName} auto-passed
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cards in play */}
        {lastPlay ? (
          <div className="flex flex-col items-center gap-1.5">
            <CardStack cards={lastPlay.cards} size={compact ? 'sm' : 'md'} />
            <div className={cn(
              'font-medium text-emerald-100 bg-black/30 px-2 py-0.5 rounded-full',
              compact ? 'text-xs' : 'text-sm'
            )}>
              {(() => {
                const playedBy = players.find(p => p.id === lastPlay.playerId)
                const playerName = playedBy?.name || 'Unknown'
                const rankEmoji = playedBy?.currentRank ? rankEmojis[playedBy.currentRank] + ' ' : ''
                return `${rankEmoji}${playerName}: ${getPlayDescription(lastPlay)}`
              })()}
            </div>
          </div>
        ) : (
          <div className="text-emerald-200/50 text-center">
            <div className={cn('font-medium', compact ? 'text-sm' : 'text-lg')}>Lead any cards</div>
          </div>
        )}
      </div>
    </div>
  )
}
