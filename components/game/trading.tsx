'use client'

import { useState } from 'react'
import { Card } from '@/lib/game/deck'
import { Hand } from './hand'

interface TradingState {
  kingId: string
  queenId: string
  lowestPeasantId: string
  secondLowestId: string
  kingTraded: boolean
  queenTraded: boolean
}

interface TradingPhaseProps {
  tradingState: TradingState
  myPlayerId: string
  myHand: Card[]
  players: { id: string; name: string }[]
  twosHigh: boolean
  onTrade: (cards: Card[]) => void
  loading?: boolean
}

export function TradingPhase({
  tradingState,
  myPlayerId,
  myHand,
  players,
  twosHigh,
  onTrade,
  loading = false,
}: TradingPhaseProps) {
  const [selectedCards, setSelectedCards] = useState<Card[]>([])

  const isKing = myPlayerId === tradingState.kingId
  const isQueen = myPlayerId === tradingState.queenId
  const canTrade = (isKing && !tradingState.kingTraded) || (isQueen && !tradingState.queenTraded)
  const requiredCount = isKing ? 2 : isQueen ? 1 : 0

  const kingPlayer = players.find(p => p.id === tradingState.kingId)
  const queenPlayer = players.find(p => p.id === tradingState.queenId)
  const lowestPeasant = players.find(p => p.id === tradingState.lowestPeasantId)
  const secondLowest = players.find(p => p.id === tradingState.secondLowestId)

  function handleSwap() {
    if (selectedCards.length === requiredCount && !loading) {
      onTrade(selectedCards)
      setSelectedCards([])
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-xl p-6 max-w-2xl w-full mx-4">
        <h2 className="text-2xl font-bold text-white text-center mb-4">Card Trading</h2>

        {/* Trading status */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className={`p-3 rounded-lg ${tradingState.kingTraded ? 'bg-emerald-500/20' : 'bg-yellow-500/20'}`}>
            <div className="flex items-center gap-2">
              <span className="text-xl">👑</span>
              <span className="font-medium text-white">{kingPlayer?.name || 'King'}</span>
            </div>
            <div className="text-sm text-slate-400 mt-1">
              {tradingState.kingTraded ? '✓ Traded 2 cards' : 'Trading 2 cards with ' + (lowestPeasant?.name || 'Peasant')}
            </div>
          </div>
          <div className={`p-3 rounded-lg ${tradingState.queenTraded ? 'bg-emerald-500/20' : 'bg-yellow-500/20'}`}>
            <div className="flex items-center gap-2">
              <span className="text-xl">👸</span>
              <span className="font-medium text-white">{queenPlayer?.name || 'Queen'}</span>
            </div>
            <div className="text-sm text-slate-400 mt-1">
              {tradingState.queenTraded ? '✓ Traded 1 card' : 'Trading 1 card with ' + (secondLowest?.name || 'Noble')}
            </div>
          </div>
        </div>

        {canTrade ? (
          <>
            <p className="text-center text-white mb-4">
              Select <span className="font-bold text-yellow-400">{requiredCount}</span> card{requiredCount > 1 ? 's' : ''} to give away.
              You will receive the best card{requiredCount > 1 ? 's' : ''} from{' '}
              <span className="font-bold text-emerald-400">
                {isKing ? lowestPeasant?.name : secondLowest?.name}
              </span>.
            </p>

            <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
              <Hand
                cards={myHand}
                selectable={!loading}
                maxSelect={requiredCount}
                onSelectionChange={setSelectedCards}
                disabled={loading}
                twosHigh={twosHigh}
                freeSelect={true}
              />
            </div>

            <div className="flex justify-center">
              <button
                onClick={handleSwap}
                disabled={selectedCards.length !== requiredCount || loading}
                className="px-8 py-3 bg-emerald-600 text-white rounded-lg font-bold text-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Swapping...' : `SWAP (${selectedCards.length}/${requiredCount})`}
              </button>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            {(isKing && tradingState.kingTraded) || (isQueen && tradingState.queenTraded) ? (
              <p className="text-emerald-400 text-lg">
                ✓ You have completed your trade. Waiting for others...
              </p>
            ) : (
              <p className="text-slate-400 text-lg">
                Waiting for {!tradingState.kingTraded ? kingPlayer?.name : ''}
                {!tradingState.kingTraded && !tradingState.queenTraded ? ' and ' : ''}
                {!tradingState.queenTraded ? queenPlayer?.name : ''} to trade...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
