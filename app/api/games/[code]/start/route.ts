import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createDeck, shuffleDeck, dealCardsWithExtras, sortHand, getFullCardValue } from '@/lib/game/deck'

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
    const game = await prisma.game.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        players: {
          include: { user: { select: { id: true, name: true, isBot: true } } },
          orderBy: { seatPosition: 'asc' },
        },
      },
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    if (game.hostId !== session.user.id) {
      return NextResponse.json({ error: 'Only host can start the game' }, { status: 403 })
    }

    if (game.status !== 'LOBBY') {
      return NextResponse.json({ error: 'Game already started' }, { status: 400 })
    }

    if (game.players.length < game.playerCount) {
      return NextResponse.json({ error: 'Not enough players' }, { status: 400 })
    }

    // Deal cards now so burned cards are known before anyone enters the play page
    const deck = shuffleDeck(createDeck())
    const { hands, burnedCards } = dealCardsWithExtras(deck, game.players.length, [])

    const players = game.players.map((p, index) => ({
      id: p.id,
      odlerId: p.userId,
      name: p.user.name,
      isBot: p.user.isBot || false,
      seatPosition: p.seatPosition,
      hand: sortHand(hands[index], game.twosHigh),
      totalScore: p.totalScore,
      currentRank: p.currentRank,
      isFinished: false,
      finishPosition: null,
    }))

    // Find player with the lowest card (by rank then suit) to lead the first round
    let lowestCardValue = Infinity
    let startingPlayer = players[0]
    for (const player of players) {
      for (const card of player.hand) {
        const value = getFullCardValue(card, game.twosHigh)
        if (value < lowestCardValue) {
          lowestCardValue = value
          startingPlayer = player
        }
      }
    }

    const turnOrder = players.map(p => p.id)

    // Human players must acknowledge burned cards before the game begins
    // Bots are auto-acknowledged
    const humanPlayerIds = players
      .filter(p => !p.isBot)
      .map(p => p.odlerId)

    const initialState = {
      gameId: game.id,
      code: code.toUpperCase(),
      status: 'PLAYING',
      settings: {
        playerCount: game.playerCount,
        twosHigh: game.twosHigh,
        tradingEnabled: game.tradingEnabled,
        winScore: game.winScore,
      },
      currentRound: 1,
      players,
      currentPlayerId: startingPlayer.id,
      lastPlay: null,
      passCount: 0,
      finishOrder: [],
      turnOrder,
      tradingState: null,
      messages: [],
      burnedCards,
      // Track which human players still need to acknowledge burned cards
      pendingBurnedCardsAck: burnedCards.length > 0 ? humanPlayerIds : [],
    }

    await prisma.game.update({
      where: { id: game.id },
      data: {
        status: 'PLAYING',
        currentRound: 1,
        gameState: initialState as any,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Start game error:', error)
    return NextResponse.json({ error: 'Failed to start game' }, { status: 500 })
  }
}
