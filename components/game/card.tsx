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
  const sizeConfig = {
    sm: { card: 'w-10 h-14', rank: 'text-xs', suit: 'text-base', padding: 'p-0.5' },
    md: { card: 'w-14 h-20', rank: 'text-sm', suit: 'text-xl', padding: 'p-1' },
    lg: { card: 'w-18 h-26', rank: 'text-base', suit: 'text-2xl', padding: 'p-1.5' },
  }

  const config = sizeConfig[size]
  const color = getSuitColor(card.suit)

  if (faceDown) {
    return (
      <div
        className={cn(
          config.card,
          'rounded-lg border border-slate-500',
          'bg-gradient-to-br from-indigo-900 via-blue-800 to-indigo-900',
          'flex items-center justify-center',
          'shadow-lg',
          'relative overflow-hidden'
        )}
      >
        {/* Card back pattern */}
        <div className="absolute inset-1 rounded border border-blue-400/30 bg-[radial-gradient(circle_at_center,_transparent_0%,_rgba(59,130,246,0.1)_50%,_transparent_100%)]" />
        <div className="absolute inset-2 rounded border border-blue-300/20" />
        <div className="text-blue-400/40 text-lg font-serif">R</div>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        config.card,
        config.padding,
        'rounded-lg border bg-gradient-to-br from-white to-slate-50',
        'flex flex-col justify-between',
        'shadow-lg transition-all duration-150',
        'relative overflow-hidden',
        // Default border
        !selected && 'border-slate-300',
        // Selected state
        selected && 'ring-2 ring-yellow-400 -translate-y-4 border-yellow-400 shadow-yellow-400/50 shadow-xl scale-105',
        // Hover state (when not disabled and not selected)
        !disabled && !selected && 'hover:-translate-y-2 hover:shadow-xl hover:border-slate-400 cursor-pointer',
        // Disabled state
        disabled && 'cursor-default',
        // Highlighted state (your turn)
        highlighted && !selected && 'shadow-emerald-400/40 shadow-xl border-emerald-400/50',
        // Text color based on suit
        color === 'red' ? 'text-red-500' : 'text-slate-800'
      )}
    >
      {/* Top-left corner */}
      <div className="flex flex-col items-center self-start leading-none">
        <span className={cn(config.rank, 'font-bold')}>{card.rank}</span>
        <span className={cn(config.rank)}>{suitSymbols[card.suit]}</span>
      </div>

      {/* Center suit */}
      <div className={cn(config.suit, 'self-center -my-1')}>
        {suitSymbols[card.suit]}
      </div>

      {/* Bottom-right corner (rotated) */}
      <div className="flex flex-col items-center self-end leading-none rotate-180">
        <span className={cn(config.rank, 'font-bold')}>{card.rank}</span>
        <span className={cn(config.rank)}>{suitSymbols[card.suit]}</span>
      </div>

      {/* Subtle inner shadow for depth */}
      <div className="absolute inset-0 rounded-lg shadow-inner pointer-events-none" />
    </button>
  )
}

interface CardStackProps {
  cards: CardType[]
  size?: 'sm' | 'md' | 'lg'
}

export function CardStack({ cards, size = 'md' }: CardStackProps) {
  const sizeWidths = { sm: 40, md: 56, lg: 72 }
  const sizeHeights = { sm: 56, md: 80, lg: 104 }
  const overlap = size === 'sm' ? 15 : size === 'md' ? 18 : 22

  if (cards.length === 0) {
    return (
      <div
        className="rounded-lg border-2 border-dashed border-slate-600/50 flex items-center justify-center text-slate-500 text-sm"
        style={{ width: sizeWidths[size], height: sizeHeights[size] }}
      >
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
            left: `${index * overlap}px`,
            zIndex: index,
          }}
        >
          <PlayingCard card={card} size={size} disabled />
        </div>
      ))}
      <div
        className="invisible"
        style={{
          width: `${sizeWidths[size] + (cards.length - 1) * overlap}px`,
          height: `${sizeHeights[size]}px`
        }}
      />
    </div>
  )
}
