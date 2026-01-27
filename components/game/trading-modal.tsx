'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/lib/game/deck'
import { PlayingCard } from './card'

interface TradingModalProps {
  isOpen: boolean
  phase: 'peasants_give' | 'royals_give' | 'complete'
  myRank: string | null
  myFinishPosition: number
  playerCount: number
  hand: Card[]
  cardsToGive: number
  receiverName: string
  onSubmit: (cards: Card[]) => void
}

export function TradingModal({
  isOpen,
  phase,
  myRank,
  myFinishPosition,
  playerCount,
  hand,
  cardsToGive,
  receiverName,
  onSubmit,
}: TradingModalProps) {
  const [selectedCards, setSelectedCards] = useState<Card[]>([])

  useEffect(() => {
    setSelectedCards([])
  }, [phase, isOpen])

  if (!isOpen) return null

  const isPeasant = myFinishPosition >= playerCount - 2
  const isRoyal = myFinishPosition <= 1

  const shouldGive =
    (phase === 'peasants_give' && isPeasant) ||
    (phase === 'royals_give' && isRoyal)

  if (!shouldGive) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full mx-4 text-center">
          <h2 className="text-xl font-bold text-white mb-2">Trading Phase</h2>
          <p className="text-slate-400">
            {phase === 'peasants_give'
              ? 'Waiting for peasants to give their best cards...'
              : 'Waiting for royals to give cards back...'}
          </p>
          <div className="mt-4 animate-pulse text-emerald-400">
            Please wait...
          </div>
        </div>
      </div>
    )
  }

  function toggleCard(card: Card) {
    if (selectedCards.some((c) => c.id === card.id)) {
      setSelectedCards(selectedCards.filter((c) => c.id !== card.id))
    } else if (selectedCards.length < cardsToGive) {
      setSelectedCards([...selectedCards, card])
    }
  }

  function handleSubmit() {
    if (selectedCards.length === cardsToGive) {
      onSubmit(selectedCards)
    }
  }

  const instruction =
    phase === 'peasants_give'
      ? `Select your ${cardsToGive} best card${cardsToGive > 1 ? 's' : ''} to give to ${receiverName}`
      : `Select ${cardsToGive} card${cardsToGive > 1 ? 's' : ''} to give back to ${receiverName}`

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-6 max-w-2xl w-full mx-4">
        <h2 className="text-xl font-bold text-white text-center mb-2">
          {phase === 'peasants_give' ? 'Trading: Give Best Cards' : 'Trading: Give Cards Back'}
        </h2>
        <p className="text-slate-400 text-center mb-4">{instruction}</p>

        <div className="mb-4 p-4 bg-slate-700/50 rounded-lg">
          <div className="text-sm text-slate-400 mb-2">Your hand:</div>
          <div className="flex flex-wrap gap-2 justify-center">
            {hand.map((card) => (
              <PlayingCard
                key={card.id}
                card={card}
                selected={selectedCards.some((c) => c.id === card.id)}
                onClick={() => toggleCard(card)}
                size="sm"
              />
            ))}
          </div>
        </div>

        <div className="mb-4">
          <div className="text-sm text-slate-400 mb-2">
            Selected ({selectedCards.length}/{cardsToGive}):
          </div>
          <div className="flex gap-2 justify-center min-h-[60px] items-center">
            {selectedCards.length === 0 ? (
              <span className="text-slate-500">Select cards above</span>
            ) : (
              selectedCards.map((card) => (
                <PlayingCard
                  key={card.id}
                  card={card}
                  onClick={() => toggleCard(card)}
                  size="sm"
                />
              ))
            )}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={selectedCards.length !== cardsToGive}
          className={cn(
            'w-full py-3 rounded-lg font-medium transition-all',
            selectedCards.length === cardsToGive
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-slate-600 text-slate-400 cursor-not-allowed'
          )}
        >
          {selectedCards.length === cardsToGive
            ? `Give ${cardsToGive} Card${cardsToGive > 1 ? 's' : ''}`
            : `Select ${cardsToGive - selectedCards.length} more`}
        </button>
      </div>
    </div>
  )
}
