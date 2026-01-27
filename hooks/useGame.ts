'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Socket } from 'socket.io-client'
import { connectSocket, disconnectSocket } from '@/lib/socket'
import { Card } from '@/lib/game/deck'
import { GameState } from '@/lib/game/state'

interface UseGameReturn {
  gameState: GameState | null
  hand: Card[]
  isConnected: boolean
  isMyTurn: boolean
  error: string | null
  joinGame: (code: string) => void
  startGame: () => void
  playCards: (cards: Card[]) => void
  pass: () => void
  selectTradeCards: (cards: Card[]) => void
}

export function useGame(code: string): UseGameReturn {
  const { data: session } = useSession()
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [hand, setHand] = useState<Card[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)

  const userId = session?.user?.id

  const isMyTurn = Boolean(
    gameState &&
      userId &&
      gameState.players.find((p) => p.odlerId === userId)?.id === gameState.currentPlayerId
  )

  useEffect(() => {
    if (!userId || !code) return

    const socket = connectSocket()
    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
      socket.emit('join-game', { code, userId })
    })

    socket.on('disconnect', () => {
      setIsConnected(false)
    })

    socket.on('error', (data: { message: string }) => {
      setError(data.message)
      setTimeout(() => setError(null), 3000)
    })

    socket.on('game-state', (state: GameState) => {
      setGameState(state)
      const myPlayer = state.players.find((p) => p.odlerId === userId)
      if (myPlayer) {
        setHand(myPlayer.hand as Card[])
      }
    })

    socket.on('game-started', (state: GameState) => {
      setGameState(state)
    })

    socket.on('cards-dealt', (data: { hand: Card[] }) => {
      setHand(data.hand)
    })

    socket.on('turn-changed', (data: { currentPlayerId: string }) => {
      setGameState((prev) =>
        prev ? { ...prev, currentPlayerId: data.currentPlayerId } : null
      )
    })

    socket.on('cards-played', (data: { playerId: string; cards: Card[] }) => {
      setGameState((prev) => {
        if (!prev) return null
        return {
          ...prev,
          lastPlay: {
            playerId: data.playerId,
            cards: data.cards,
            rank: data.cards[0].rank,
            count: data.cards.length,
          },
        }
      })
    })

    socket.on('player-passed', () => {
    })

    socket.on('pile-cleared', () => {
      setGameState((prev) => (prev ? { ...prev, lastPlay: null } : null))
    })

    socket.on('player-finished', () => {
    })

    socket.on('round-ended', () => {
    })

    socket.on('trading-phase', () => {
    })

    socket.on('trading-complete', () => {
    })

    socket.on('game-over', () => {
    })

    return () => {
      socket.off('connect')
      socket.off('disconnect')
      socket.off('error')
      socket.off('game-state')
      socket.off('game-started')
      socket.off('cards-dealt')
      socket.off('turn-changed')
      socket.off('cards-played')
      socket.off('player-passed')
      socket.off('pile-cleared')
      socket.off('player-finished')
      socket.off('round-ended')
      socket.off('trading-phase')
      socket.off('trading-complete')
      socket.off('game-over')
      disconnectSocket()
    }
  }, [userId, code])

  const joinGame = useCallback((gameCode: string) => {
    if (socketRef.current && userId) {
      socketRef.current.emit('join-game', { code: gameCode, userId })
    }
  }, [userId])

  const startGame = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('start-game', { code })
    }
  }, [code])

  const playCards = useCallback((cards: Card[]) => {
    if (socketRef.current) {
      socketRef.current.emit('play-cards', { code, cards })

      setHand((prev) =>
        prev.filter((card) => !cards.some((c) => c.id === card.id))
      )
    }
  }, [code])

  const pass = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit('pass', { code })
    }
  }, [code])

  const selectTradeCards = useCallback((cards: Card[]) => {
    if (socketRef.current) {
      socketRef.current.emit('select-trade-cards', { code, cards })
    }
  }, [code])

  return {
    gameState,
    hand,
    isConnected,
    isMyTurn,
    error,
    joinGame,
    startGame,
    playCards,
    pass,
    selectTradeCards,
  }
}
