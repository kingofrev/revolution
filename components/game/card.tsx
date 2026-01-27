'use client'

import { cn } from '@/lib/utils'
import { Card as CardType, getSuitColor } from '@/lib/game/deck'

interface CardProps {
  card: CardType
  selected?: boolean
  disabled?: boolean
  faceDown?: boolean
  size?: 'sm' | 'md' | 'lg'
  highlighted?: boolean  // Glow effect for your turn
  onClick?: () => void
}

const suitSymbols: Record<string, string> = {
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
  spades: '\u2660',
}

export function PlayingCard({
  card,
  selected = false,
  disabled = false,
  faceDown = false,
  size = 'md',
  highlighted = false,
  onClick,
}: CardProps) {
  const sizeClasses = {
    sm: 'w-12 h-16 text-sm',
    md: 'w-16 h-22 text-lg',
    lg: 'w-20 h-28 text-xl',
  }

  const color = getSuitColor(card.suit)

  if (faceDown) {
    return (
      <div
        className={cn(
          sizeClasses[size],
          'rounded-lg border-2 border-slate-600 bg-gradient-to-br from-blue-900 to-blue-700',
          'flex items-center justify-center',
          'shadow-md'
        )}
      >
        <div className="text-2xl text-blue-300/50">?</div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        sizeClasses[size],
        'rounded-lg border-2 bg-white',
        'flex flex-col items-center justify-between p-1',
        'shadow-md transition-all duration-150',
        selected && 'ring-2 ring-yellow-400 -translate-y-3 border-yellow-400 shadow-yellow-400/50 shadow-lg',
        !disabled && !selected && 'hover:-translate-y-1 hover:shadow-lg cursor-pointer',
        disabled && 'cursor-default',  // No opacity change - cards stay visible
        highlighted && !selected && 'shadow-emerald-400/30 shadow-lg',  // Subtle glow when it's your turn
        color === 'red' ? 'text-red-600' : 'text-slate-900'
      )}
    >
      <div className="self-start font-bold leading-none">{card.rank}</div>
      <div className="text-2xl">{suitSymbols[card.suit]}</div>
      <div className="self-end font-bold leading-none rotate-180">{card.rank}</div>
    </button>
  )
}

interface CardStackProps {
  cards: CardType[]
  size?: 'sm' | 'md' | 'lg'
}

export function CardStack({ cards, size = 'md' }: CardStackProps) {
  if (cards.length === 0) {
    return (
      <div className="w-20 h-28 rounded-lg border-2 border-dashed border-slate-600 flex items-center justify-center text-slate-500">
        Empty
      </div>
    )
  }

  return (
    <div className="relative">
      {cards.map((card, index) => (
        <div
          key={card.id}
          className="absolute"
          style={{
            left: `${index * 20}px`,
            zIndex: index,
          }}
        >
          <PlayingCard card={card} size={size} disabled />
        </div>
      ))}
      <div
        className="invisible"
        style={{ width: `${64 + (cards.length - 1) * 20}px`, height: '88px' }}
      />
    </div>
  )
}
