'use client'

import { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Card, getCardValue, isValidRun, isValidBomb, sortHand } from '@/lib/game/deck'
import { PlayingCard } from './card'

export type SortOrder = 'low-high' | 'high-low' | 'manual'

interface HandProps {
  cards: Card[]
  selectable?: boolean
  maxSelect?: number
  onSelectionChange?: (cards: Card[]) => void
  disabled?: boolean
  twosHigh?: boolean
  freeSelect?: boolean // Allow selecting any cards without validation (for trading)
  isMyTurn?: boolean // Highlight cards when it's your turn
  sortOrder?: SortOrder
  onSortOrderChange?: (order: SortOrder) => void
  showSortControls?: boolean
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
  isMyTurn = false,
  sortOrder = 'low-high',
  onSortOrderChange,
  showSortControls = false,
}: HandProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [manualOrder, setManualOrder] = useState<string[]>([])
  const [draggedCard, setDraggedCard] = useState<string | null>(null)

  // Sort cards based on sortOrder
  const sortedCards = useMemo(() => {
    if (sortOrder === 'manual' && manualOrder.length > 0) {
      // Use manual order, but add any new cards at the end
      const orderedCards: Card[] = []
      const cardMap = new Map(cards.map(c => [c.id, c]))

      // Add cards in manual order
      for (const id of manualOrder) {
        const card = cardMap.get(id)
        if (card) {
          orderedCards.push(card)
          cardMap.delete(id)
        }
      }

      // Add any remaining cards (new cards)
      for (const card of cardMap.values()) {
        orderedCards.push(card)
      }

      return orderedCards
    }

    return sortHand(cards, twosHigh, sortOrder === 'high-low' ? 'desc' : 'asc')
  }, [cards, twosHigh, sortOrder, manualOrder])

  // Initialize manual order when switching to manual mode
  useEffect(() => {
    if (sortOrder === 'manual' && manualOrder.length === 0 && cards.length > 0) {
      setManualOrder(sortHand(cards, twosHigh, 'asc').map(c => c.id))
    }
  }, [sortOrder, cards, twosHigh, manualOrder.length])

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

  // Adjust overlap based on card count and turn state
  const baseOverlap = Math.min(40, Math.max(20, 400 / sortedCards.length))
  const overlap = isMyTurn ? baseOverlap * 0.9 : baseOverlap  // Slightly less overlap when it's your turn

  // Handle drag and drop for manual ordering
  function handleDragStart(cardId: string) {
    if (sortOrder !== 'manual') return
    setDraggedCard(cardId)
  }

  function handleDragOver(e: React.DragEvent, targetIndex: number) {
    e.preventDefault()
    if (!draggedCard || sortOrder !== 'manual') return
  }

  function handleDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault()
    if (!draggedCard || sortOrder !== 'manual') return

    const currentOrder = manualOrder.length > 0 ? [...manualOrder] : sortedCards.map(c => c.id)
    const draggedIndex = currentOrder.indexOf(draggedCard)

    if (draggedIndex === -1 || draggedIndex === targetIndex) {
      setDraggedCard(null)
      return
    }

    // Remove from current position and insert at new position
    currentOrder.splice(draggedIndex, 1)
    currentOrder.splice(targetIndex, 0, draggedCard)

    setManualOrder(currentOrder)
    setDraggedCard(null)
  }

  function handleDragEnd() {
    setDraggedCard(null)
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {showSortControls && onSortOrderChange && (
        <div className="flex gap-1 mb-1">
          <button
            onClick={() => onSortOrderChange('low-high')}
            className={cn(
              "px-2 py-1 text-xs rounded transition-colors",
              sortOrder === 'low-high'
                ? "bg-emerald-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            )}
          >
            Low→High
          </button>
          <button
            onClick={() => onSortOrderChange('high-low')}
            className={cn(
              "px-2 py-1 text-xs rounded transition-colors",
              sortOrder === 'high-low'
                ? "bg-emerald-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            )}
          >
            High→Low
          </button>
          <button
            onClick={() => {
              setManualOrder(sortedCards.map(c => c.id))
              onSortOrderChange('manual')
            }}
            className={cn(
              "px-2 py-1 text-xs rounded transition-colors",
              sortOrder === 'manual'
                ? "bg-emerald-600 text-white"
                : "bg-slate-700 text-slate-300 hover:bg-slate-600"
            )}
            title="Drag cards to reorder"
          >
            Manual
          </button>
        </div>
      )}
      <div className={cn(
        "flex justify-center transition-all duration-300",
        isMyTurn && "scale-105"  // Slightly larger hand when it's your turn
      )}>
        <div
          className="flex"
          style={{
            marginLeft: sortedCards.length > 1 ? `${overlap / 2}px` : 0,
          }}
        >
          {sortedCards.map((card, index) => {
            const isSelectable = canSelectCard(card)
            return (
              <div
                key={card.id}
                draggable={sortOrder === 'manual'}
                onDragStart={() => handleDragStart(card.id)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                style={{
                  marginLeft: index === 0 ? 0 : `-${overlap}px`,
                  zIndex: selectedIds.has(card.id) ? 100 : (draggedCard === card.id ? 200 : index),
                  transition: 'all 0.15s ease',
                  opacity: draggedCard === card.id ? 0.5 : 1,
                  cursor: sortOrder === 'manual' ? 'grab' : undefined,
                }}
              >
                <PlayingCard
                  card={card}
                  selected={selectedIds.has(card.id)}
                  disabled={!isSelectable}
                  highlighted={isMyTurn}
                  onClick={() => toggleCard(card)}
                />
              </div>
            )
          })}
        </div>
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
