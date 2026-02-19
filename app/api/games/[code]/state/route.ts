import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createDeck, shuffleDeck, dealCards, dealCardsWithExtras, sortHand, getHighestSuitInSet, getRunHighCard, getCardValue, getBombHighRank } from '@/lib/game/deck'
import { validatePlay, getPlayType, getBestCards, getWorstCards } from '@/lib/game/rules'
import { getBotPlay, getBotTradeCards } from '@/lib/game/bot'

// Helper to load game state from database
async function loadGameState(code: string) {
  const game = await prisma.game.findUnique({
    where: { code },
    include: {
      players: {
        include: { user: { select: { id: true, name: true, isBot: true } } },
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

// Execute a bot's turn
async function executeBotTurn(state: any, code: string): Promise<any> {
  const currentPlayer = state.players.find((p: any) => p.id === state.currentPlayerId)
  if (!currentPlayer || !currentPlayer.isBot || currentPlayer.isFinished) {
    return state
  }

  const twosHigh = state.settings.twosHigh
  const isLeading = !state.lastPlay

  // Build bot game state
  const botState = {
    hand: currentPlayer.hand,
    lastPlay: state.lastPlay,
    twosHigh,
    playedCards: [], // TODO: track played cards for card counting
    opponents: state.players
      .filter((p: any) => p.id !== currentPlayer.id)
      .map((p: any) => ({
        id: p.id,
        cardCount: p.hand.length,
        isFinished: p.isFinished,
      })),
    isLeading,
  }

  // Get bot's decision
  const cardsToPlay = getBotPlay(botState)

  if (cardsToPlay === null) {
    // Bot passes
    state.lastAction = {
      type: 'pass',
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      playerRank: currentPlayer.currentRank,
      description: 'passed',
      autoSkipped: [],
    }

    state.passCount++
    const activePlayers = state.players.filter((p: any) => !p.isFinished)

    // If pile owner has finished, ALL remaining active players must pass
    // If pile owner is still active, all OTHER players must pass (activePlayers - 1)
    const lastPlayerId = state.lastPlay.playerId
    const lastPlayer = state.players.find((p: any) => p.id === lastPlayerId)
    const passThreshold = lastPlayer?.isFinished ? activePlayers.length : activePlayers.length - 1

    if (state.passCount >= passThreshold) {
      // Everyone passed, clear the pile
      state.lastPlay = null
      state.passCount = 0

      if (lastPlayer && !lastPlayer.isFinished) {
        state.currentPlayerId = lastPlayerId
      } else {
        state.currentPlayerId = getNextPlayer(state.players, lastPlayerId, state.turnOrder)
      }
    } else {
      state.currentPlayerId = getNextPlayer(state.players, currentPlayer.id, state.turnOrder)
      // If we've looped back to the player who made the last play, everyone else has passed
      // (can happen when some players were auto-skipped due to insufficient card count)
      if (state.currentPlayerId === lastPlayerId && lastPlayer && !lastPlayer.isFinished) {
        state.lastPlay = null
        state.passCount = 0
      }
    }
  } else {
    // Bot plays cards
    const validation = validatePlay(cardsToPlay, state.lastPlay, twosHigh)
    if (!validation.valid) {
      // Bot made invalid play - just pass instead
      console.error('Bot made invalid play:', validation.error)
      state.currentPlayerId = getNextPlayer(state.players, currentPlayer.id, state.turnOrder)
      await saveGameState(code, state)
      return state
    }

    // Remove cards from hand
    const cardIds = cardsToPlay.map((c: any) => c.id)
    currentPlayer.hand = currentPlayer.hand.filter((c: any) => !cardIds.includes(c.id))

    // Update last play
    const playType = validation.playType!
    state.lastPlay = {
      playerId: currentPlayer.id,
      cards: cardsToPlay,
      rank: cardsToPlay[0].rank,
      count: cardsToPlay.length,
      playType,
      highSuit: playType !== 'run' && playType !== 'bomb' ? getHighestSuitInSet(cardsToPlay) : undefined,
      runHighCard: playType === 'run' ? getRunHighCard(cardsToPlay, twosHigh) : undefined,
      bombHighRank: playType === 'bomb' ? getBombHighRank(cardsToPlay, twosHigh) : undefined,
    }
    state.passCount = 0

    // Set last action
    state.lastAction = {
      type: 'play',
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      playerRank: currentPlayer.currentRank,
      description: describePlay(cardsToPlay, playType, twosHigh),
      autoSkipped: [],
    }

    // Check if bot finished
    if (currentPlayer.hand.length === 0) {
      currentPlayer.isFinished = true
      currentPlayer.finishPosition = state.finishOrder.length
      state.finishOrder.push(currentPlayer.id)

      // Check if round is over
      const activePlayers = state.players.filter((p: any) => !p.isFinished)
      if (activePlayers.length <= 1) {
        if (activePlayers.length === 1) {
          const lastPlayer = activePlayers[0]
          lastPlayer.isFinished = true
          lastPlayer.finishPosition = state.finishOrder.length
          state.finishOrder.push(lastPlayer.id)
        }

        // End round
        const points = getPoints(state.settings.playerCount)
        state.players.forEach((p: any) => {
          const pos = state.finishOrder.indexOf(p.id)
          if (pos >= 0) {
            p.totalScore += points[pos]
            p.currentRank = getRank(pos, state.settings.playerCount)
          }
        })

        const winner = state.players.find((p: any) => p.totalScore >= state.settings.winScore)
        state.status = winner ? 'GAME_OVER' : 'ROUND_END'
        state.currentPlayerId = null

        await saveGameState(code, state)
        return state
      }
    }

    // Next player
    const requiredCards = state.lastPlay?.count || 1
    const { nextPlayerId, skipped } = getNextValidPlayer(
      state.players,
      currentPlayer.id,
      state.turnOrder,
      requiredCards
    )
    state.currentPlayerId = nextPlayerId

    if (skipped.length > 0 && state.lastAction) {
      state.lastAction.autoSkipped = skipped.map((p: any) => ({
        playerId: p.id,
        playerName: p.name,
        playerRank: p.currentRank,
      }))
    }
  }

  // If next player is also a bot, set timestamp for their turn (don't play immediately)
  const nextPlayer = state.players.find((p: any) => p.id === state.currentPlayerId)
  if (nextPlayer?.isBot && !nextPlayer.isFinished && state.status === 'PLAYING') {
    state.botTurnStartTime = Date.now()
  }

  await saveGameState(code, state)
  return state
}

// Execute bot trades during trading phase
async function executeBotTrades(state: any, code: string): Promise<any> {
  const { kingId, queenId, lowestPeasantId, secondLowestId, kingTraded, queenTraded } = state.tradingState
  const twosHigh = state.settings.twosHigh

  // Check if King is a bot and hasn't traded
  if (!kingTraded) {
    const king = state.players.find((p: any) => p.id === kingId)
    if (king?.isBot) {
      const cardsToGive = getBotTradeCards(king.hand, 2, twosHigh)
      const lowestPeasant = state.players.find((p: any) => p.id === lowestPeasantId)

      if (lowestPeasant) {
        // Get best cards from peasant
        const peasantBest = getBestCards(lowestPeasant.hand, 2, twosHigh)

        // Perform trade
        king.hand = king.hand.filter((c: any) => !cardsToGive.some((g: any) => g.id === c.id))
        lowestPeasant.hand = lowestPeasant.hand.filter((c: any) => !peasantBest.some((b: any) => b.id === c.id))

        king.hand.push(...peasantBest)
        lowestPeasant.hand.push(...cardsToGive)

        king.hand = sortHand(king.hand, twosHigh)
        lowestPeasant.hand = sortHand(lowestPeasant.hand, twosHigh)

        state.tradingState.kingTraded = true
      }
    }
  }

  // Check if Queen is a bot and hasn't traded
  if (!queenTraded) {
    const queen = state.players.find((p: any) => p.id === queenId)
    if (queen?.isBot) {
      const cardsToGive = getBotTradeCards(queen.hand, 1, twosHigh)
      const secondLowest = state.players.find((p: any) => p.id === secondLowestId)

      if (secondLowest && queenId !== secondLowestId) {
        // Get best card from peasant
        const peasantBest = getBestCards(secondLowest.hand, 1, twosHigh)

        // Perform trade
        queen.hand = queen.hand.filter((c: any) => !cardsToGive.some((g: any) => g.id === c.id))
        secondLowest.hand = secondLowest.hand.filter((c: any) => !peasantBest.some((b: any) => b.id === c.id))

        queen.hand.push(...peasantBest)
        secondLowest.hand.push(...cardsToGive)

        queen.hand = sortHand(queen.hand, twosHigh)
        secondLowest.hand = sortHand(secondLowest.hand, twosHigh)

        state.tradingState.queenTraded = true
      }
    }
  }

  // Check if all trades are complete
  if (state.tradingState.kingTraded && state.tradingState.queenTraded) {
    const { prevFinishOrder } = state.tradingState
    const startingPlayer = state.players.find((p: any) => p.id === kingId) || state.players[0]
    state.status = 'PLAYING'
    state.currentPlayerId = startingPlayer.id
    state.finishOrder = []
    state.turnOrder = prevFinishOrder
    state.tradingState = null

    // If starting player is a bot, set timestamp for delay
    if (startingPlayer?.isBot) {
      state.botTurnStartTime = Date.now()
    }
  }

  await saveGameState(code, state)
  return state
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

    let currentState = state

    if (!currentState) {
      return NextResponse.json({ error: 'Game state not found' }, { status: 404 })
    }

    // Skip bot turns while any human player hasn't acknowledged burned cards yet
    const hasPendingAck = currentState.pendingBurnedCardsAck?.length > 0

    // Bot auto-play: If it's a bot's turn, make them play (after 3 second delay)
    if (!hasPendingAck && currentState.status === 'PLAYING' && currentState.currentPlayerId) {
      const currentPlayer = currentState.players.find((p: any) => p.id === currentState.currentPlayerId)
      if (currentPlayer?.isBot && !currentPlayer.isFinished) {
        // Check if bot turn just started (no timestamp yet)
        if (!currentState.botTurnStartTime) {
          currentState.botTurnStartTime = Date.now()
          await saveGameState(upperCode, currentState)
        } else {
          // Check if 3 seconds have passed
          const elapsed = Date.now() - currentState.botTurnStartTime
          if (elapsed >= 2000) {
            currentState.botTurnStartTime = null
            currentState = await executeBotTurn(currentState, upperCode)
          }
        }
      }
    }

    // Bot auto-trade: If in trading phase and a bot needs to trade (after 3 second delay)
    if (!hasPendingAck && currentState.status === 'TRADING' && currentState.tradingState) {
      // Check if any bot needs to trade
      const { kingId, queenId, kingTraded, queenTraded } = currentState.tradingState
      const king = currentState.players.find((p: any) => p.id === kingId)
      const queen = currentState.players.find((p: any) => p.id === queenId)
      const botNeedsToTrade = (!kingTraded && king?.isBot) || (!queenTraded && queen?.isBot)

      if (botNeedsToTrade) {
        // Check if bot turn just started (no timestamp yet)
        if (!currentState.botTurnStartTime) {
          currentState.botTurnStartTime = Date.now()
          await saveGameState(upperCode, currentState)
        } else {
          // Check if 3 seconds have passed
          const elapsed = Date.now() - currentState.botTurnStartTime
          if (elapsed >= 2000) {
            currentState.botTurnStartTime = null
            currentState = await executeBotTrades(currentState, upperCode)
          }
        }
      }
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

    // Check turn only for play/pass actions, not for next-round, chat, trade, or acknowledge-burned-cards
    if (action !== 'next-round' && action !== 'chat' && action !== 'trade' && action !== 'acknowledge-burned-cards' && myPlayer.id !== state.currentPlayerId) {
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

      // Set last action message
      state.lastAction = {
        type: 'play',
        playerId: myPlayer.id,
        playerName: myPlayer.name,
        playerRank: myPlayer.currentRank,
        description: describePlay(cards, playType, state.settings.twosHigh),
        autoSkipped: [] as { playerId: string; playerName: string; playerRank: string | null }[],
      }

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

          // If game is over, save to history and update user stats
          if (winner) {
            await saveGameHistory(state, upperCode)
          }

          await saveGameState(upperCode, state)
          return NextResponse.json({ success: true, state: maskState(state, session.user.id) })
        }
      }

      // Next player - auto-skip players who don't have enough cards
      const requiredCards = state.lastPlay?.count || 1
      const { nextPlayerId, skipped } = getNextValidPlayer(
        state.players,
        myPlayer.id,
        state.turnOrder,
        requiredCards
      )
      state.currentPlayerId = nextPlayerId

      // Track auto-skipped players
      if (skipped.length > 0 && state.lastAction) {
        state.lastAction.autoSkipped = skipped.map((p: any) => ({
          playerId: p.id,
          playerName: p.name,
          playerRank: p.currentRank,
        }))
      }

      // If everyone was skipped (pile clears), the player who played leads again
      if (skipped.length > 0) {
        const activePlayers = state.players.filter((p: any) => !p.isFinished)
        // Check if we've gone around (all other active players were skipped)
        const nonSkippedActive = activePlayers.filter(
          (p: any) => p.id === myPlayer.id || !skipped.some((s: any) => s.id === p.id)
        )
        if (nonSkippedActive.length === 1 && nonSkippedActive[0].id === myPlayer.id && !myPlayer.isFinished) {
          // Everyone else was skipped, this player leads again
          state.lastPlay = null
          state.passCount = 0
          state.currentPlayerId = myPlayer.id
        }
      }

      // If next player is a bot, set timestamp for delay
      const nextPlayer = state.players.find((p: any) => p.id === state.currentPlayerId)
      if (nextPlayer?.isBot && !nextPlayer.isFinished) {
        state.botTurnStartTime = Date.now()
      }

    } else if (action === 'next-round') {
      // Start next round
      if (state.status !== 'ROUND_END') {
        return NextResponse.json({ error: 'Round is not over' }, { status: 400 })
      }

      // Deal new cards
      const deck = shuffleDeck(createDeck())

      // Store previous finish order for trading
      const prevFinishOrder = [...state.finishOrder]
      const playerCount = state.players.length

      // For rounds after round 1, give extra cards to worst finishers
      // Get player indices of worst finishers (last in finish order)
      const extraCardsCount = 52 % playerCount
      const worstFinisherIds = prevFinishOrder.slice(-extraCardsCount).reverse() // Last place first
      const extraCardRecipients = worstFinisherIds.map((playerId: string) => {
        const playerIndex = state.players.findIndex((p: any) => p.id === playerId)
        return playerIndex
      })

      const { hands } = dealCardsWithExtras(deck, playerCount, extraCardRecipients)

      // Reset player states and deal new hands
      state.players.forEach((p: any, index: number) => {
        p.hand = sortHand(hands[index], state.settings.twosHigh)
        p.isFinished = false
        p.finishPosition = null
      })

      // Clear burned cards for subsequent rounds
      state.burnedCards = []

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

        // If a bot needs to trade, set timestamp for delay
        const king = state.players.find((p: any) => p.id === kingId)
        const queen = state.players.find((p: any) => p.id === queenId)
        if (king?.isBot || (queen?.isBot && queenId !== secondLowestId)) {
          state.botTurnStartTime = Date.now()
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

      // If starting player is a bot, set timestamp for delay
      if (startingPlayer?.isBot) {
        state.botTurnStartTime = Date.now()
      }

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

        // If starting player is a bot, set timestamp for delay
        if (startingPlayer?.isBot) {
          state.botTurnStartTime = Date.now()
        }
      }

      await saveGameState(upperCode, state)
      return NextResponse.json({ success: true, state: maskState(state, session.user.id) })

    } else if (action === 'pass') {
      if (!state.lastPlay) {
        return NextResponse.json({ error: 'Cannot pass when leading' }, { status: 400 })
      }

      // Set last action for pass
      state.lastAction = {
        type: 'pass',
        playerId: myPlayer.id,
        playerName: myPlayer.name,
        playerRank: myPlayer.currentRank,
        description: 'passed',
        autoSkipped: [],
      }

      state.passCount++
      const activePlayers = state.players.filter((p: any) => !p.isFinished)

      // If pile owner has finished, ALL remaining active players must pass
      // If pile owner is still active, all OTHER players must pass (activePlayers - 1)
      const lastPlayerId = state.lastPlay.playerId
      const lastPlayer = state.players.find((p: any) => p.id === lastPlayerId)
      const passThreshold = lastPlayer?.isFinished ? activePlayers.length : activePlayers.length - 1

      if (state.passCount >= passThreshold) {
        // Everyone passed, clear the pile
        state.lastPlay = null
        state.passCount = 0

        // The player who made the last play leads again
        // Unless they've finished, then it goes to the next player
        if (lastPlayer && !lastPlayer.isFinished) {
          state.currentPlayerId = lastPlayerId
        } else {
          state.currentPlayerId = getNextPlayer(state.players, lastPlayerId, state.turnOrder)
        }
      } else {
        state.currentPlayerId = getNextPlayer(state.players, myPlayer.id, state.turnOrder)
        // If we've looped back to the player who made the last play, everyone else has passed
        // (can happen when some players were auto-skipped due to insufficient card count)
        if (state.currentPlayerId === lastPlayerId && lastPlayer && !lastPlayer.isFinished) {
          state.lastPlay = null
          state.passCount = 0
        }
      }

      // If next player is a bot, set timestamp for delay
      const nextPlayer = state.players.find((p: any) => p.id === state.currentPlayerId)
      if (nextPlayer?.isBot && !nextPlayer.isFinished) {
        state.botTurnStartTime = Date.now()
      }

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

    } else if (action === 'acknowledge-burned-cards') {
      // Remove this user from the pending acknowledgement list
      if (state.pendingBurnedCardsAck && Array.isArray(state.pendingBurnedCardsAck)) {
        state.pendingBurnedCardsAck = state.pendingBurnedCardsAck.filter(
          (id: string) => id !== session.user.id
        )
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

// Get next valid player, auto-skipping those with fewer cards than required
function getNextValidPlayer(
  players: any[],
  currentPlayerId: string,
  turnOrder: string[],
  requiredCards: number
): { nextPlayerId: string; skipped: any[] } {
  const currentIndex = turnOrder.indexOf(currentPlayerId)
  const playerCount = turnOrder.length
  let nextIndex = (currentIndex + 1) % playerCount
  let attempts = 0
  const skipped: any[] = []

  while (attempts < playerCount) {
    const nextPlayerId = turnOrder[nextIndex]
    const nextPlayer = players.find((p: any) => p.id === nextPlayerId)

    if (nextPlayer && !nextPlayer.isFinished) {
      // Check if player has enough cards
      if (nextPlayer.hand.length >= requiredCards) {
        return { nextPlayerId, skipped }
      } else {
        // Auto-skip this player
        skipped.push(nextPlayer)
      }
    }

    nextIndex = (nextIndex + 1) % playerCount
    attempts++

    // If we've gone all the way around back to the original player
    if (nextIndex === (currentIndex + 1) % playerCount && attempts > 0) {
      break
    }
  }

  // If everyone was skipped, return the original player (they lead again)
  const currentPlayer = players.find((p: any) => p.id === currentPlayerId)
  if (currentPlayer && !currentPlayer.isFinished) {
    return { nextPlayerId: currentPlayerId, skipped }
  }

  // Fallback - find any active player
  const activePlayers = players.filter((p: any) => !p.isFinished)
  return { nextPlayerId: activePlayers[0]?.id || turnOrder[0], skipped }
}

// Describe a play for the action caption
function describePlay(cards: any[], playType: string, twosHigh: boolean): string {
  const count = cards.length
  const rank = cards[0].rank

  // Get rank name
  const rankNames: Record<string, string> = {
    'A': 'Aces', 'K': 'Kings', 'Q': 'Queens', 'J': 'Jacks',
    '10': 'Tens', '9': 'Nines', '8': 'Eights', '7': 'Sevens',
    '6': 'Sixes', '5': 'Fives', '4': 'Fours', '3': 'Threes', '2': 'Twos'
  }
  const rankName = rankNames[rank] || rank + 's'
  const singleRankName = rankName.slice(0, -1) // Remove 's' for singular

  if (playType === 'bomb') {
    // Get the high rank of the bomb
    const values = cards.map((c: any) => getCardValue(c.rank, twosHigh))
    const highValue = Math.max(...values)
    const highRank = cards.find((c: any) => getCardValue(c.rank, twosHigh) === highValue)?.rank
    const highRankName = highRank ? (rankNames[highRank]?.slice(0, -1) || highRank) : 'unknown'
    return `a Bomb (${highRankName} high)`
  }

  if (playType === 'run') {
    // Get the high card of the run
    const values = cards.map((c: any) => getCardValue(c.rank, twosHigh))
    const highValue = Math.max(...values)
    const highCard = cards.find((c: any) => getCardValue(c.rank, twosHigh) === highValue)
    const highRankName = highCard ? (rankNames[highCard.rank]?.slice(0, -1) || highCard.rank) : 'unknown'
    return `a ${count}-card Run (${highRankName} high)`
  }

  // Singles, pairs, triples, quads
  if (count === 1) {
    return `a ${singleRankName}`
  } else if (count === 2) {
    return `a Pair of ${rankName}`
  } else if (count === 3) {
    return `Triple ${rankName}`
  } else if (count === 4) {
    return `Quad ${rankName}`
  }

  return `${count} ${rankName}`
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

async function saveGameHistory(state: any, code: string) {
  try {
    // Sort players by score to determine final positions
    const sortedPlayers = [...state.players].sort((a: any, b: any) => b.totalScore - a.totalScore)
    const winner = sortedPlayers[0]

    // Create game history record
    const gameHistory = await prisma.gameHistory.create({
      data: {
        code,
        playerCount: state.settings.playerCount,
        twosHigh: state.settings.twosHigh,
        tradingEnabled: state.settings.tradingEnabled,
        winScore: state.settings.winScore,
        totalRounds: state.currentRound,
        winnerId: winner.odlerId,
        winnerName: winner.name,
        winnerScore: winner.totalScore,
        players: {
          create: sortedPlayers.map((p: any, index: number) => ({
            userId: p.odlerId,
            playerName: p.name,
            finalScore: p.totalScore,
            finalPosition: index + 1,
            isWinner: index === 0,
          })),
        },
      },
    })

    // Update user stats
    for (const player of sortedPlayers) {
      await prisma.user.update({
        where: { id: player.odlerId },
        data: {
          gamesPlayed: { increment: 1 },
          ...(player.odlerId === winner.odlerId ? { gamesWon: { increment: 1 } } : {}),
        },
      })
    }

    console.log('Game history saved:', gameHistory.id)
  } catch (error) {
    console.error('Failed to save game history:', error)
    // Don't throw - game should still end even if history fails to save
  }
}
