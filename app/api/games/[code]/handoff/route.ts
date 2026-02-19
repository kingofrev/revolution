import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBotName, BOT_NAMES } from '@/lib/game/bot'

// Replace the requesting human player with a bot that continues the game
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

    const game = await prisma.game.findUnique({
      where: { code: upperCode },
      include: {
        players: {
          include: { user: { select: { id: true, name: true, isBot: true } } },
        },
      },
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    if (game.status !== 'PLAYING') {
      return NextResponse.json({ error: 'Game is not in progress' }, { status: 400 })
    }

    // Find the requesting player's GamePlayer record
    const gamePlayer = game.players.find(p => p.userId === session.user.id)
    if (!gamePlayer) {
      return NextResponse.json({ error: 'You are not in this game' }, { status: 403 })
    }

    if (gamePlayer.user.isBot) {
      return NextResponse.json({ error: 'Already a bot' }, { status: 400 })
    }

    // Pick a bot name not already in use
    const existingBotNames = new Set(
      game.players.filter(p => p.user.isBot).map(p => p.user.name)
    )
    const botName = BOT_NAMES.find(n => !existingBotNames.has(n)) ?? getBotName(game.players.length)

    // Create a new bot user
    const botUser = await prisma.user.create({
      data: {
        name: botName,
        isBot: true,
        isGuest: true,
      },
    })

    // Update the GamePlayer record to point to the bot user
    await prisma.gamePlayer.update({
      where: { id: gamePlayer.id },
      data: { userId: botUser.id },
    })

    // Update the gameState JSON: swap out the human player for the bot
    const state = game.gameState as any
    if (state && state.players) {
      for (const player of state.players) {
        if (player.odlerId === session.user.id) {
          player.isBot = true
          player.name = botName
          player.odlerId = botUser.id
          break
        }
      }

      await prisma.game.update({
        where: { id: game.id },
        data: { gameState: state as any },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Handoff error:', error)
    return NextResponse.json({ error: 'Failed to hand off to bot' }, { status: 500 })
  }
}
