import { Server as SocketServer, Socket } from 'socket.io'
import { Server as HTTPServer } from 'http'
import { Card } from '@/lib/game/deck'
import {
  GameState,
  initializeRound,
  playCards,
  passPlay,
  completeTrade,
  startTrading,
} from '@/lib/game/state'
import { validatePlay, canPlay, getBestCards, getWorstCards } from '@/lib/game/rules'
import { prisma } from '@/lib/prisma'

const gameStates = new Map<string, GameState>()
const playerSockets = new Map<string, Set<string>>()

export function initializeSocketServer(httpServer: HTTPServer) {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
  })

  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id)

    socket.on('join-game', async ({ code, userId }) => {
      const roomCode = code.toUpperCase()
      socket.join(roomCode)

      if (!playerSockets.has(userId)) {
        playerSockets.set(userId, new Set())
      }
      playerSockets.get(userId)!.add(socket.id)

      socket.data.userId = userId
      socket.data.roomCode = roomCode

      const game = await prisma.game.findUnique({
        where: { code: roomCode },
        include: {
          players: {
            include: { user: { select: { id: true, name: true } } },
            orderBy: { seatPosition: 'asc' },
          },
          host: { select: { id: true, name: true } },
        },
      })

      if (game) {
        io.to(roomCode).emit('player-joined', {
          players: game.players,
        })

        const state = gameStates.get(roomCode)
        if (state) {
          const playerState = state.players.find((p) => p.odlerId === userId)
          if (playerState) {
            socket.emit('game-state', {
              ...state,
              players: state.players.map((p) => ({
                ...p,
                hand: p.odlerId === userId ? p.hand : p.hand.map(() => null),
              })),
            })
          }
        }
      }
    })

    socket.on('start-game', async ({ code }) => {
      const roomCode = code.toUpperCase()

      const game = await prisma.game.findUnique({
        where: { code: roomCode },
        include: {
          players: {
            include: { user: { select: { id: true, name: true } } },
            orderBy: { seatPosition: 'asc' },
          },
        },
      })

      if (!game || game.hostId !== socket.data.userId) {
        socket.emit('error', { message: 'Only host can start the game' })
        return
      }

      if (game.players.length < game.playerCount) {
        socket.emit('error', { message: 'Not enough players' })
        return
      }

      const initialState: GameState = {
        gameId: game.id,
        code: roomCode,
        status: 'LOBBY',
        settings: {
          playerCount: game.playerCount,
          twosHigh: game.twosHigh,
          tradingEnabled: game.tradingEnabled,
          winScore: game.winScore,
        },
        currentRound: 0,
        players: game.players.map((p, index) => ({
          id: p.id,
          odlerId: p.userId,
          name: p.user.name,
          odltPosition: index,
          hand: [],
          totalScore: p.totalScore,
          currentRank: p.currentRank as any,
          isFinished: false,
          finishPosition: null,
        })),
        currentPlayerId: null,
        lastPlay: null,
        passCount: 0,
        finishOrder: [],
        tradingState: null,
      }

      const gameState = initializeRound(initialState, initialState.players)
      gameStates.set(roomCode, gameState)

      await prisma.game.update({
        where: { id: game.id },
        data: { status: 'PLAYING', currentRound: 1 },
      })

      for (const player of gameState.players) {
        const playerSocketIds = playerSockets.get(player.odlerId)
        if (playerSocketIds) {
          const maskedState = {
            ...gameState,
            players: gameState.players.map((p) => ({
              ...p,
              hand: p.odlerId === player.odlerId ? p.hand : p.hand.map(() => null),
            })),
          }

          for (const socketId of playerSocketIds) {
            io.to(socketId).emit('game-started', maskedState)
            io.to(socketId).emit('cards-dealt', { hand: player.hand })
          }
        }
      }

      io.to(roomCode).emit('turn-changed', {
        currentPlayerId: gameState.currentPlayerId,
      })
    })

    socket.on('play-cards', ({ code, cards }: { code: string; cards: Card[] }) => {
      const roomCode = code.toUpperCase()
      const state = gameStates.get(roomCode)
      if (!state) return

      const player = state.players.find((p) => p.odlerId === socket.data.userId)
      if (!player || player.id !== state.currentPlayerId) {
        socket.emit('error', { message: 'Not your turn' })
        return
      }

      const validation = validatePlay(cards, state.lastPlay, state.settings.twosHigh)
      if (!validation.valid) {
        socket.emit('error', { message: validation.error })
        return
      }

      const hasCards = cards.every((card) =>
        player.hand.some((h) => h.id === card.id)
      )
      if (!hasCards) {
        socket.emit('error', { message: 'You do not have these cards' })
        return
      }

      const newState = playCards(state, player.id, cards)
      gameStates.set(roomCode, newState)

      io.to(roomCode).emit('cards-played', {
        playerId: player.id,
        cards,
      })

      const finishedPlayer = newState.players.find(
        (p) => p.id === player.id && p.isFinished && !state.players.find((sp) => sp.id === player.id)?.isFinished
      )
      if (finishedPlayer) {
        io.to(roomCode).emit('player-finished', {
          playerId: player.id,
          rank: finishedPlayer.currentRank,
          position: finishedPlayer.finishPosition,
        })
      }

      if (newState.status === 'ROUND_END') {
        handleRoundEnd(io, roomCode, newState)
      } else if (newState.status === 'GAME_OVER') {
        handleGameOver(io, roomCode, newState)
      } else {
        broadcastStateUpdate(io, roomCode, newState)
        io.to(roomCode).emit('turn-changed', {
          currentPlayerId: newState.currentPlayerId,
        })
      }
    })

    socket.on('pass', ({ code }) => {
      const roomCode = code.toUpperCase()
      const state = gameStates.get(roomCode)
      if (!state) return

      const player = state.players.find((p) => p.odlerId === socket.data.userId)
      if (!player || player.id !== state.currentPlayerId) {
        socket.emit('error', { message: 'Not your turn' })
        return
      }

      if (!state.lastPlay) {
        socket.emit('error', { message: 'Cannot pass when starting a new round' })
        return
      }

      const newState = passPlay(state, player.id)
      gameStates.set(roomCode, newState)

      io.to(roomCode).emit('player-passed', { playerId: player.id })

      if (!newState.lastPlay) {
        io.to(roomCode).emit('pile-cleared', {
          nextPlayerId: newState.currentPlayerId,
        })
      }

      broadcastStateUpdate(io, roomCode, newState)
      io.to(roomCode).emit('turn-changed', {
        currentPlayerId: newState.currentPlayerId,
      })
    })

    socket.on('select-trade-cards', ({ code, cards }: { code: string; cards: Card[] }) => {
      const roomCode = code.toUpperCase()
      const state = gameStates.get(roomCode)
      if (!state || state.status !== 'TRADING' || !state.tradingState) return

      const player = state.players.find((p) => p.odlerId === socket.data.userId)
      if (!player) return

      const finishPos = state.finishOrder.indexOf(player.id)
      const playerCount = state.settings.playerCount

      let targetPlayerId: string | null = null
      let expectedCount = 0

      if (state.tradingState.phase === 'peasants_give') {
        if (finishPos === playerCount - 1) {
          targetPlayerId = state.finishOrder[0]
          expectedCount = 2
        } else if (finishPos === playerCount - 2) {
          targetPlayerId = state.finishOrder[1]
          expectedCount = 1
        }
      } else if (state.tradingState.phase === 'royals_give') {
        if (finishPos === 0) {
          targetPlayerId = state.finishOrder[playerCount - 1]
          expectedCount = 2
        } else if (finishPos === 1) {
          targetPlayerId = state.finishOrder[playerCount - 2]
          expectedCount = 1
        }
      }

      if (!targetPlayerId || cards.length !== expectedCount) {
        socket.emit('error', { message: 'Invalid trade' })
        return
      }

      const newState = completeTrade(state, player.id, targetPlayerId, cards)
      gameStates.set(roomCode, newState)

      io.to(roomCode).emit('trade-made', {
        fromPlayerId: player.id,
        toPlayerId: targetPlayerId,
        cardCount: cards.length,
      })

      const pendingTrades = getPendingTrades(newState)
      if (pendingTrades.length === 0) {
        if (newState.tradingState!.phase === 'peasants_give') {
          newState.tradingState!.phase = 'royals_give'
          newState.tradingState!.completedTrades = []
          gameStates.set(roomCode, newState)
          io.to(roomCode).emit('trading-phase', { phase: 'royals_give' })
        } else {
          newState.status = 'PLAYING'
          newState.tradingState = null
          gameStates.set(roomCode, newState)
          io.to(roomCode).emit('trading-complete')
        }
      }

      broadcastStateUpdate(io, roomCode, newState)
    })

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)

      const userId = socket.data.userId
      if (userId && playerSockets.has(userId)) {
        playerSockets.get(userId)!.delete(socket.id)
        if (playerSockets.get(userId)!.size === 0) {
          playerSockets.delete(userId)
        }
      }

      if (socket.data.roomCode) {
        io.to(socket.data.roomCode).emit('player-disconnected', {
          odlerId: userId,
        })
      }
    })
  })

  return io
}

function getPendingTrades(state: GameState): string[] {
  if (!state.tradingState) return []

  const pending: string[] = []
  const playerCount = state.settings.playerCount

  if (state.tradingState.phase === 'peasants_give') {
    const lastPeasant = state.finishOrder[playerCount - 1]
    const secondLast = state.finishOrder[playerCount - 2]
    const king = state.finishOrder[0]
    const queen = state.finishOrder[1]

    if (!state.tradingState.completedTrades.includes(`${lastPeasant}-${king}`)) {
      pending.push(lastPeasant)
    }
    if (!state.tradingState.completedTrades.includes(`${secondLast}-${queen}`)) {
      pending.push(secondLast)
    }
  } else if (state.tradingState.phase === 'royals_give') {
    const lastPeasant = state.finishOrder[playerCount - 1]
    const secondLast = state.finishOrder[playerCount - 2]
    const king = state.finishOrder[0]
    const queen = state.finishOrder[1]

    if (!state.tradingState.completedTrades.includes(`${king}-${lastPeasant}`)) {
      pending.push(king)
    }
    if (!state.tradingState.completedTrades.includes(`${queen}-${secondLast}`)) {
      pending.push(queen)
    }
  }

  return pending
}

function broadcastStateUpdate(io: SocketServer, roomCode: string, state: GameState) {
  for (const player of state.players) {
    const playerSocketIds = playerSockets.get(player.odlerId)
    if (playerSocketIds) {
      const maskedState = {
        ...state,
        players: state.players.map((p) => ({
          ...p,
          hand: p.odlerId === player.odlerId ? p.hand : p.hand.map(() => null),
        })),
      }

      for (const socketId of playerSocketIds) {
        io.to(socketId).emit('game-state', maskedState)
      }
    }
  }
}

async function handleRoundEnd(io: SocketServer, roomCode: string, state: GameState) {
  const game = await prisma.game.findUnique({ where: { code: roomCode } })
  if (!game) return

  await prisma.round.create({
    data: {
      gameId: game.id,
      roundNumber: state.currentRound,
      finishOrder: state.finishOrder,
      pointsAwarded: state.players.reduce((acc, p) => {
        const pos = state.finishOrder.indexOf(p.id)
        acc[p.id] = pos >= 0 ? [6, 5, 4, 3, 2, 0].slice(0, state.settings.playerCount)[pos] : 0
        return acc
      }, {} as Record<string, number>),
    },
  })

  for (const player of state.players) {
    await prisma.gamePlayer.update({
      where: { id: player.id },
      data: {
        totalScore: player.totalScore,
        currentRank: player.currentRank as any,
      },
    })
  }

  io.to(roomCode).emit('round-ended', {
    finishOrder: state.finishOrder,
    scores: state.players.map((p) => ({
      playerId: p.id,
      score: p.totalScore,
      rank: p.currentRank,
    })),
  })

  if (state.settings.tradingEnabled) {
    const tradingState = startTrading(state)
    gameStates.set(roomCode, tradingState)
    io.to(roomCode).emit('trading-phase', { phase: 'peasants_give' })
    broadcastStateUpdate(io, roomCode, tradingState)
  }
}

async function handleGameOver(io: SocketServer, roomCode: string, state: GameState) {
  const game = await prisma.game.findUnique({ where: { code: roomCode } })
  if (!game) return

  await prisma.game.update({
    where: { id: game.id },
    data: { status: 'GAME_OVER' },
  })

  const winner = state.players.reduce((a, b) =>
    a.totalScore > b.totalScore ? a : b
  )

  await prisma.user.update({
    where: { id: winner.odlerId },
    data: { gamesWon: { increment: 1 } },
  })

  for (const player of state.players) {
    await prisma.user.update({
      where: { id: player.odlerId },
      data: { gamesPlayed: { increment: 1 } },
    })
  }

  io.to(roomCode).emit('game-over', {
    winner: {
      id: winner.id,
      name: winner.name,
      score: winner.totalScore,
    },
    finalScores: state.players.map((p) => ({
      playerId: p.id,
      name: p.name,
      score: p.totalScore,
    })),
  })

  gameStates.delete(roomCode)
}
