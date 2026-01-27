import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createDeck, shuffleDeck, dealCards, sortHand, getHighestSuitInSet, getRunHighCard, getCardValue, getBombHighRank } from '@/lib/game/deck'
import { validatePlay, getPlayType, getBestCards, getWorstCards } from '@/lib/game/rules'

// Helper to load game state from database
async function loadGameState(code: string) {
  const game = await prisma.game.findUnique({
    where: { code },
    include: {
      players: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { seatPosition: 'asc' },
      },
    },
  })

  if (!game) return null

  return {
    game,
    state: game.gameState as any,
  }
}

// Helper to save game state to database
async function saveGameState(code: string, state: any) {
  await prisma.game.update({
    where: { code },
    data: { gameState: state },
  })
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { code } = await params
    const upperCode = code.toUpperCase()

    const result = await loadGameState(upperCode)

    if (!result) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const { game, state } = result

    // Check if player is in this game
    const myDbPlayer = game.players.find(p => p.userId === session.user.id)
    if (!myDbPlayer) {
      return NextResponse.json({ error: 'Not in this game' }, { status: 403 })
    }

    // If game is in lobby, no state yet
    if (game.status === 'LOBBY') {
      return NextResponse.json({ status: 'LOBBY' })
    }

    // Get or initialize game state
    let currentState = state

    if (!currentState && game.status === 'PLAYING') {
      // Initialize game state with dealt cards
      const deck = shuffleDeck(createDeck())
      const hands = dealCards(deck, game.players.length)

      const players = game.players.map((p, index) => ({
        id: p.id,
        odlerId: p.userId,
        name: p.user.name,
        seatPosition: p.seatPosition,
        hand: sortHand(hands[index], game.twosHigh),
        totalScore: p.totalScore,
        currentRank: p.currentRank,
        isFinished: false,
        finishPosition: null,
      }))

      // Find player with 3 of clubs to start
      const startingPlayer = players.find(p =>
        p.hand.some(c => c.id === '3-clubs')
      ) || players[0]

      // For round 1, turn order is based on seat position
      const turnOrder = players.map(p => p.id)

      currentState = {
        gameId: game.id,
        code: upperCode,
        status: 'PLAYING',
        settings: {
          playerCount: game.playerCount,
          twosHigh: game.twosHigh,
          tradingEnabled: game.tradingEnabled,
          winScore: game.winScore,
        },
        currentRound: game.currentRound,
        players,
        currentPlayerId: startingPlayer.id,
        lastPlay: null,
        passCount: 0,
        finishOrder: [],
        turnOrder,
        tradingState: null,
        messages: [],
      }

      // Save to database
      await saveGameState(upperCode, currentState)
    }

    if (!currentState) {
      return NextResponse.json({ error: 'Game state not found' }, { status: 404 })
    }

    // Return state with only this player's hand visible
    const maskedState = {
      ...currentState,
      players: currentState.players.map((p: any) => ({
        ...p,
        hand: p.odlerId === session.user.id ? p.hand : p.hand.map(() => ({ hidden: true })),
        handCount: p.hand.length,
      })),
      myHand: currentState.players.find((p: any) => p.odlerId === session.user.id)?.hand || [],
    }

    return NextResponse.json(maskedState)
  } catch (error) {
    console.error('Get game state error:', error)
    return NextResponse.json({ error: 'Failed to get game state' }, { status: 500 })
  }
}

// Handle playing cards
export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { code } = await params
    const upperCode = code.toUpperCase()
    const { action, cards, message } = await req.json()

    const result = await loadGameState(upperCode)
    if (!result || !result.state) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const state = result.state

    const myPlayer = state.players.find((p: any) => p.odlerId === session.user.id)
    if (!myPlayer) {
      return NextResponse.json({ error: 'Not in game' }, { status: 403 })
    }

    // Check turn only for play/pass actions, not for next-round, chat, or trade
    if (action !== 'next-round' && action !== 'chat' && action !== 'trade' && myPlayer.id !== state.currentPlayerId) {
      return NextResponse.json({ error: 'Not your turn' }, { status: 400 })
    }

    if (action === 'play') {
      if (!cards || cards.length === 0) {
        return NextResponse.json({ error: 'No cards selected' }, { status: 400 })
      }

      // Use the new validation that supports runs and suit rankings
      const validation = validatePlay(cards, state.lastPlay, state.settings.twosHigh)
      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 })
      }

      // Remove cards from hand
      const cardIds = cards.map((c: any) => c.id)
      myPlayer.hand = myPlayer.hand.filter((c: any) => !cardIds.includes(c.id))

      // Update last play with play type and suit info
      const playType = validation.playType!
      state.lastPlay = {
        playerId: myPlayer.id,
        cards,
        rank: cards[0].rank,
        count: cards.length,
        playType,
        highSuit: playType !== 'run' && playType !== 'bomb' ? getHighestSuitInSet(cards) : undefined,
        runHighCard: playType === 'run' ? getRunHighCard(cards, state.settings.twosHigh) : undefined,
        bombHighRank: playType === 'bomb' ? getBombHighRank(cards, state.settings.twosHigh) : undefined,
      }
      state.passCount = 0

      // Check if player finished
      if (myPlayer.hand.length === 0) {
        myPlayer.isFinished = true
        myPlayer.finishPosition = state.finishOrder.length
        state.finishOrder.push(myPlayer.id)

        // Check if round is over
        const activePlayers = state.players.filter((p: any) => !p.isFinished)
        if (activePlayers.length <= 1) {
          if (activePlayers.length === 1) {
            const lastPlayer = activePlayers[0]
            lastPlayer.isFinished = true
            lastPlayer.finishPosition = state.finishOrder.length
            state.finishOrder.push(lastPlayer.id)
          }

          // End round - award points
          const points = getPoints(state.settings.playerCount)
          state.players.forEach((p: any) => {
            const pos = state.finishOrder.indexOf(p.id)
            if (pos >= 0) {
              p.totalScore += points[pos]
              p.currentRank = getRank(pos, state.settings.playerCount)
            }
          })

          // Check for winner
          const winner = state.players.find((p: any) => p.totalScore >= state.settings.winScore)
          state.status = winner ? 'GAME_OVER' : 'ROUND_END'
          state.currentPlayerId = null

          await saveGameState(upperCode, state)
          return NextResponse.json({ success: true, state: maskState(state, session.user.id) })
        }
      }

      // Next player
      state.currentPlayerId = getNextPlayer(state.players, myPlayer.id, state.turnOrder)

    } else if (action === 'next-round') {
      // Start next round
      if (state.status !== 'ROUND_END') {
        return NextResponse.json({ error: 'Round is not over' }, { status: 400 })
      }

      // Deal new cards
      const deck = shuffleDeck(createDeck())
      const hands = dealCards(deck, state.players.length)

      // Store previous finish order for trading
      const prevFinishOrder = [...state.finishOrder]

      // Reset player states and deal new hands
      state.players.forEach((p: any, index: number) => {
        p.hand = sortHand(hands[index], state.settings.twosHigh)
        p.isFinished = false
        p.finishPosition = null
      })

      state.currentRound++
      state.lastPlay = null
      state.passCount = 0

      // Check if trading phase is needed
      if (prevFinishOrder.length >= 2 && state.settings.tradingEnabled) {
        const playerCount = state.settings.playerCount
        const kingId = prevFinishOrder[0]
        const queenId = prevFinishOrder[1]
        const lowestPeasantId = prevFinishOrder[playerCount - 1]
        const secondLowestId = prevFinishOrder[playerCount - 2]

        // Set up trading state
        state.status = 'TRADING'
        state.currentPlayerId = null
        state.tradingState = {
          kingId,
          queenId,
          lowestPeasantId,
          secondLowestId,
          kingTraded: false,
          queenTraded: queenId === secondLowestId, // Skip if same player
          prevFinishOrder,
        }

        await saveGameState(upperCode, state)
        return NextResponse.json({ success: true, state: maskState(state, session.user.id) })
      }

      // No trading - start playing immediately
      // King starts the next round, turn order follows previous finish order
      const kingId = prevFinishOrder[0]
      const startingPlayer = state.players.find((p: any) => p.id === kingId) || state.players[0]

      state.status = 'PLAYING'
      state.currentPlayerId = startingPlayer.id
      state.finishOrder = []
      state.turnOrder = prevFinishOrder // Turn order follows previous round's finish order
      state.tradingState = null

      await saveGameState(upperCode, state)
      return NextResponse.json({ success: true, state: maskState(state, session.user.id) })

    } else if (action === 'trade') {
      // Handle King/Queen trading cards
      if (state.status !== 'TRADING' || !state.tradingState) {
        return NextResponse.json({ error: 'Not in trading phase' }, { status: 400 })
      }

      if (!cards || cards.length === 0) {
        return NextResponse.json({ error: 'No cards selected' }, { status: 400 })
      }

      const { kingId, queenId, lowestPeasantId, secondLowestId, prevFinishOrder } = state.tradingState
      const playerCount = state.settings.playerCount

      // Check if this player is King or Queen and hasn't traded yet
      const isKing = myPlayer.id === kingId && !state.tradingState.kingTraded
      const isQueen = myPlayer.id === queenId && !state.tradingState.queenTraded

      if (!isKing && !isQueen) {
        return NextResponse.json({ error: 'You cannot trade' }, { status: 400 })
      }

      const expectedCount = isKing ? 2 : 1
      if (cards.length !== expectedCount) {
        return NextResponse.json({ error: `Must select ${expectedCount} card(s) to trade` }, { status: 400 })
      }

      // Verify player has these cards
      const cardIds = cards.map((c: any) => c.id)
      const hasCards = cardIds.every((id: string) =>
        myPlayer.hand.some((c: any) => c.id === id)
      )
      if (!hasCards) {
        return NextResponse.json({ error: 'You do not have these cards' }, { status: 400 })
      }

      // Perform the trade
      const tradingPartnerId = isKing ? lowestPeasantId : secondLowestId
      const tradingPartner = state.players.find((p: any) => p.id === tradingPartnerId)

      if (!tradingPartner) {
        return NextResponse.json({ error: 'Trading partner not found' }, { status: 500 })
      }

      // Get best cards from trading partner
      const partnerBestCards = getBestCards(tradingPartner.hand, expectedCount, state.settings.twosHigh)

      // Remove cards from both hands
      myPlayer.hand = myPlayer.hand.filter((c: any) => !cardIds.includes(c.id))
      tradingPartner.hand = tradingPartner.hand.filter((c: any) =>
        !partnerBestCards.some((pb: any) => pb.id === c.id)
      )

      // Add cards to new hands
      myPlayer.hand.push(...partnerBestCards)
      tradingPartner.hand.push(...cards)

      // Re-sort hands
      myPlayer.hand = sortHand(myPlayer.hand, state.settings.twosHigh)
      tradingPartner.hand = sortHand(tradingPartner.hand, state.settings.twosHigh)

      // Mark trade as complete
      if (isKing) {
        state.tradingState.kingTraded = true
      } else {
        state.tradingState.queenTraded = true
      }

      // Check if all trades are complete
      if (state.tradingState.kingTraded && state.tradingState.queenTraded) {
        // Start playing - King goes first, turn order follows previous finish order
        const startingPlayer = state.players.find((p: any) => p.id === kingId) || state.players[0]
        state.status = 'PLAYING'
        state.currentPlayerId = startingPlayer.id
        state.finishOrder = []
        state.turnOrder = prevFinishOrder // Turn order follows previous round's finish order
        state.tradingState = null
      }

      await saveGameState(upperCode, state)
      return NextResponse.json({ success: true, state: maskState(state, session.user.id) })

    } else if (action === 'pass') {
      if (!state.lastPlay) {
        return NextResponse.json({ error: 'Cannot pass when leading' }, { status: 400 })
      }

      state.passCount++
      const activePlayers = state.players.filter((p: any) => !p.isFinished)

      if (state.passCount >= activePlayers.length - 1) {
        // Everyone passed, clear the pile
        state.lastPlay = null
        state.passCount = 0
      }

      state.currentPlayerId = getNextPlayer(state.players, myPlayer.id, state.turnOrder)

    } else if (action === 'chat') {
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return NextResponse.json({ error: 'Message required' }, { status: 400 })
      }

      // Limit message length
      const trimmedMessage = message.trim().slice(0, 200)

      // Initialize messages array if it doesn't exist
      if (!state.messages) {
        state.messages = []
      }

      // Add message
      state.messages.push({
        id: Date.now().toString(),
        playerId: myPlayer.id,
        playerName: myPlayer.name,
        message: trimmedMessage,
        timestamp: Date.now(),
      })

      // Keep only last 50 messages
      if (state.messages.length > 50) {
        state.messages = state.messages.slice(-50)
      }

      await saveGameState(upperCode, state)
      return NextResponse.json({ success: true, state: maskState(state, session.user.id) })
    }

    await saveGameState(upperCode, state)
    return NextResponse.json({ success: true, state: maskState(state, session.user.id) })
  } catch (error) {
    console.error('Game action error:', error)
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 })
  }
}

function getPoints(playerCount: number): number[] {
  switch (playerCount) {
    case 4: return [4, 3, 2, 0]
    case 5: return [5, 4, 3, 2, 0]
    case 6: return [6, 5, 4, 3, 2, 0]
    default: return [4, 3, 2, 0]
  }
}

function getRank(position: number, playerCount: number): string {
  if (position === 0) return 'KING'
  if (position === 1) return 'QUEEN'
  if (position === 2 && playerCount > 4) return 'NOBLE'
  return 'PEASANT'
}

function getNextPlayer(players: any[], currentPlayerId: string, turnOrder: string[]): string {
  // Find current player's position in turn order
  const currentIndex = turnOrder.indexOf(currentPlayerId)
  const playerCount = turnOrder.length
  let nextIndex = (currentIndex + 1) % playerCount
  let attempts = 0

  // Find next player who hasn't finished
  while (attempts < playerCount) {
    const nextPlayerId = turnOrder[nextIndex]
    const nextPlayer = players.find((p: any) => p.id === nextPlayerId)
    if (nextPlayer && !nextPlayer.isFinished) {
      return nextPlayerId
    }
    nextIndex = (nextIndex + 1) % playerCount
    attempts++
  }

  // Fallback (shouldn't happen)
  return turnOrder[0]
}

function maskState(state: any, odlerId: string) {
  return {
    ...state,
    players: state.players.map((p: any) => ({
      ...p,
      hand: p.odlerId === odlerId ? p.hand : p.hand.map(() => ({ hidden: true })),
      handCount: p.hand.length,
    })),
    myHand: state.players.find((p: any) => p.odlerId === odlerId)?.hand || [],
  }
}
