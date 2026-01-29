import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getBotName } from '@/lib/game/bot'

// Add a bot to the game
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
          include: { user: true },
          orderBy: { seatPosition: 'asc' },
        },
      },
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Only host can add bots
    if (game.hostId !== session.user.id) {
      return NextResponse.json({ error: 'Only host can add bots' }, { status: 403 })
    }

    // Check if game is still in lobby
    if (game.status !== 'LOBBY') {
      return NextResponse.json({ error: 'Game already started' }, { status: 400 })
    }

    // Check if there's room for another player
    if (game.players.length >= game.playerCount) {
      return NextResponse.json({ error: 'Game is full' }, { status: 400 })
    }

    // Count existing bots to generate unique name
    const existingBots = game.players.filter(p => p.user.isBot)
    const botIndex = existingBots.length
    const botName = getBotName(botIndex)

    // Create a bot user
    const botUser = await prisma.user.create({
      data: {
        name: botName,
        isBot: true,
        isGuest: true,
      },
    })

    // Find next available seat
    const usedSeats = game.players.map(p => p.seatPosition)
    let nextSeat = 0
    while (usedSeats.includes(nextSeat)) nextSeat++

    // Add bot to game
    const gamePlayer = await prisma.gamePlayer.create({
      data: {
        gameId: game.id,
        userId: botUser.id,
        seatPosition: nextSeat,
      },
      include: {
        user: { select: { id: true, name: true, isBot: true } },
      },
    })

    return NextResponse.json({
      success: true,
      player: {
        id: gamePlayer.id,
        user: gamePlayer.user,
        seatPosition: gamePlayer.seatPosition,
      },
    })
  } catch (error) {
    console.error('Add bot error:', error)
    return NextResponse.json({ error: 'Failed to add bot' }, { status: 500 })
  }
}

// Remove a bot from the game
export async function DELETE(
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
    const { odlerId } = await req.json()

    const game = await prisma.game.findUnique({
      where: { code: upperCode },
      include: {
        players: {
          include: { user: true },
        },
      },
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Only host can remove bots
    if (game.hostId !== session.user.id) {
      return NextResponse.json({ error: 'Only host can remove bots' }, { status: 403 })
    }

    // Check if game is still in lobby
    if (game.status !== 'LOBBY') {
      return NextResponse.json({ error: 'Game already started' }, { status: 400 })
    }

    // Find the bot player
    const botPlayer = game.players.find(p => p.userId === odlerId && p.user.isBot)
    if (!botPlayer) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 })
    }

    // Remove the game player entry
    await prisma.gamePlayer.delete({
      where: { id: botPlayer.id },
    })

    // Delete the bot user
    await prisma.user.delete({
      where: { id: botPlayer.userId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Remove bot error:', error)
    return NextResponse.json({ error: 'Failed to remove bot' }, { status: 500 })
  }
}
