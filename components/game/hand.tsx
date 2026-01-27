'use client'

import { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Card, getCardValue, isValidRun, isValidBomb } from '@/lib/game/deck'
import { PlayingCard } from './card'

interface HandProps {
  cards: Card[]
  selectable?: boolean
  maxSelect?: number
  onSelectionChange?: (cards: Card[]) => void
  disabled?: boolean
  twosHigh?: boolean
  freeSelect?: boolean // Allow selecting any cards without validation (for trading)
}

// Check if cards could be building toward a bomb
function couldBeBomb(selectedCards: Card[], twosHigh: boolean): boolean {
  if (selectedCards.length === 0 || selectedCards.length > 6) return false

  // Group by rank
  const rankGroups: Record<string, number> = {}
  for (const card of selectedCards) {
    rankGroups[card.rank] = (rankGroups[card.rank] || 0) + 1
  }

  // Each rank should have at most 2 cards
  const ranks = Object.keys(rankGroups)
  if (!ranks.every(r => rankGroups[r] <= 2)) return false

  // Should have at most 3 different ranks
  if (ranks.length > 3) return false

  // Check if ranks are consecutive
  if (ranks.length > 1) {
    const values = ranks.map(r => getCardValue(r as Card['rank'], twosHigh)).sort((a, b) => a - b)
    for (let i = 1; i < values.length; i++) {
      if (values[i] !== values[i - 1] + 1) return false
    }
  }

  return true
}

export function Hand({
  cards,
  selectable = true,
  maxSelect,
  onSelectionChange,
  disabled = false,
  twosHigh = false,
  freeSelect = false,
}: HandProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Only clear selection when actual card IDs change (not just array reference)
  const cardIds = cards.map(c => c.id).join(',')
  useEffect(() => {
    // Remove any selected cards that are no longer in hand
    setSelectedIds(prev => {
      const cardIdSet = new Set(cards.map(c => c.id))
      const newSelected = new Set<string>()
      prev.forEach(id => {
        if (cardIdSet.has(id)) {
          newSelected.add(id)
        }
      })
      // Only update if something changed
      if (newSelected.size !== prev.size) {
        return newSelected
      }
      return prev
    })
  }, [cardIds, cards])

  // Get selected cards
  const selectedCards = useMemo(() =>
    cards.filter((c) => selectedIds.has(c.id)),
    [cards, selectedIds]
  )

  // Determine current selection type
  const selectionType = useMemo(() => {
    if (selectedCards.length === 0) return 'none'
    if (selectedCards.length === 1) return 'any' // Could become pair, run, or bomb

    // Check if it's a valid bomb (6 cards, 3 consecutive pairs)
    if (selectedCards.length === 6 && isValidBomb(selectedCards, twosHigh)) return 'bomb'

    // Check if building toward a bomb
    if (couldBeBomb(selectedCards, twosHigh)) return 'partial-bomb'

    // Check if all same rank
    const firstRank = selectedCards[0].rank
    const allSameRank = selectedCards.every(c => c.rank === firstRank)
    if (allSameRank) return 'same-rank'

    // Check if it's a valid run
    if (isValidRun(selectedCards, twosHigh)) return 'run'

    // Check if it could become a run (consecutive singles)
    const values = selectedCards.map(c => getCardValue(c.rank, twosHigh)).sort((a, b) => a - b)
    const uniqueValues = [...new Set(values)]
    if (uniqueValues.length === selectedCards.length) {
      // All unique ranks - check if consecutive
      let isConsecutive = true
      for (let i = 1; i < uniqueValues.length; i++) {
        if (uniqueValues[i] !== uniqueValues[i - 1] + 1) {
          isConsecutive = false
          break
        }
      }
      if (isConsecutive) return 'partial-run'
    }

    return 'invalid'
  }, [selectedCards, twosHigh])

  function toggleCard(card: Card) {
    if (disabled || !selectable) return

    const newSelected = new Set(selectedIds)

    if (newSelected.has(card.id)) {
      newSelected.delete(card.id)
    } else {
      if (maxSelect && newSelected.size >= maxSelect) {
        return
      }
      newSelected.add(card.id)
    }

    setSelectedIds(newSelected)
    onSelectionChange?.(cards.filter((c) => newSelected.has(c.id)))
  }

  // Check if a card can be selected - more permissive to allow flexible selection
  function canSelectCard(card: Card): boolean {
    if (disabled || !selectable) return false
    if (selectedIds.has(card.id)) return true // Can always deselect
    if (freeSelect) {
      // For trading, allow any cards up to maxSelect
      return !maxSelect || selectedCards.length < maxSelect
    }
    if (selectedCards.length === 0) return true // First card, anything goes

    // Check if adding this card could form a valid play
    const testCards = [...selectedCards, card]

    // Could be building a pair/triple/quad (same rank)
    const allSameRank = testCards.every(c => c.rank === testCards[0].rank)
    if (allSameRank && testCards.length <= 4) return true

    // Could be building a bomb (consecutive pairs)
    if (couldBeBomb(testCards, twosHigh)) return true

    // Could be building a run (consecutive singles)
    const values = testCards.map(c => getCardValue(c.rank, twosHigh))
    const uniqueValues = [...new Set(values)].sort((a, b) => a - b)

    // All unique ranks and consecutive = potential run
    if (uniqueValues.length === testCards.length) {
      let isConsecutive = true
      for (let i = 1; i < uniqueValues.length; i++) {
        if (uniqueValues[i] !== uniqueValues[i - 1] + 1) {
          isConsecutive = false
          break
        }
      }
      if (isConsecutive) return true
    }

    return false
  }

  const overlap = Math.min(40, Math.max(20, 400 / cards.length))

  return (
    <div className="flex justify-center">
      <div
        className="flex"
        style={{
          marginLeft: cards.length > 1 ? `${overlap / 2}px` : 0,
        }}
      >
        {cards.map((card, index) => {
          const isSelectable = canSelectCard(card)
          return (
            <div
              key={card.id}
              style={{
                marginLeft: index === 0 ? 0 : `-${overlap}px`,
                zIndex: selectedIds.has(card.id) ? 100 : index,
                opacity: !isSelectable && !selectedIds.has(card.id) ? 0.5 : 1,
                transition: 'opacity 0.15s ease',
              }}
            >
              <PlayingCard
                card={card}
                selected={selectedIds.has(card.id)}
                disabled={!isSelectable}
                onClick={() => toggleCard(card)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface OpponentHandProps {
  cardCount: number
  position: 'top' | 'left' | 'right'
  playerName: string
  isCurrentTurn?: boolean
  isFinished?: boolean
  rank?: string | null
}

export function OpponentHand({
  cardCount,
  position,
  playerName,
  isCurrentTurn = false,
  isFinished = false,
  rank,
}: OpponentHandProps) {
  const positionClasses = {
    top: 'flex-row',
    left: 'flex-col',
    right: 'flex-col',
  }

  const cards = Array.from({ length: Math.min(cardCount, 13) })

  return (
    <div
      className={cn(
        'flex items-center gap-2',
        positionClasses[position],
        isCurrentTurn && 'animate-pulse'
      )}
    >
      <div className="flex items-center gap-1">
        {cards.map((_, index) => (
          <div
            key={index}
            className="w-8 h-12 rounded bg-gradient-to-br from-blue-900 to-blue-700 border border-slate-600"
            style={{
              marginLeft: index === 0 ? 0 : '-20px',
              zIndex: index,
            }}
          />
        ))}
      </div>
      <div className="text-center">
        <div className={cn('text-sm font-medium', isCurrentTurn && 'text-yellow-400')}>
          {playerName}
        </div>
        <div className="text-xs text-muted-foreground">
          {isFinished ? (
            <span className="text-emerald-400">{rank || 'Finished'}</span>
          ) : (
            `${cardCount} cards`
          )}
        </div>
      </div>
    </div>
  )
}
