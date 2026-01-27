import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
    const game = await prisma.game.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        players: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { seatPosition: 'asc' },
        },
        host: { select: { id: true, name: true } },
        rounds: {
          orderBy: { roundNumber: 'desc' },
          take: 1,
        },
      },
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    return NextResponse.json(game)
  } catch (error) {
    console.error('Get game error:', error)
    return NextResponse.json({ error: 'Failed to get game' }, { status: 500 })
  }
}

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
          include: { user: { select: { id: true, name: true } } },
        },
        host: { select: { id: true, name: true } },
      },
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Check if player is already in the game
    const existingPlayer = game.players.find((p) => p.userId === session.user.id)

    // If player is already in the game, allow them to rejoin (return game data)
    if (existingPlayer) {
      return NextResponse.json({ ...game, rejoin: true })
    }

    // If game already started, don't allow new players
    if (game.status !== 'LOBBY') {
      return NextResponse.json({ error: 'Game already started' }, { status: 400 })
    }

    if (game.players.length >= game.playerCount) {
      return NextResponse.json({ error: 'Game is full' }, { status: 400 })
    }

    const nextSeat = game.players.length

    await prisma.gamePlayer.create({
      data: {
        gameId: game.id,
        userId: session.user.id,
        seatPosition: nextSeat,
      },
    })

    const updatedGame = await prisma.game.findUnique({
      where: { id: game.id },
      include: {
        players: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { seatPosition: 'asc' },
        },
        host: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(updatedGame)
  } catch (error) {
    console.error('Join game error:', error)
    return NextResponse.json({ error: 'Failed to join game' }, { status: 500 })
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { code } = await params
    const { playerCount, twosHigh, tradingEnabled, winScore } = await req.json()

    const game = await prisma.game.findUnique({
      where: { code: code.toUpperCase() },
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    if (game.hostId !== session.user.id) {
      return NextResponse.json({ error: 'Only host can update settings' }, { status: 403 })
    }

    if (game.status !== 'LOBBY') {
      return NextResponse.json({ error: 'Cannot update started game' }, { status: 400 })
    }

    const updatedGame = await prisma.game.update({
      where: { id: game.id },
      data: {
        ...(playerCount && [4, 5, 6].includes(playerCount) ? { playerCount } : {}),
        ...(typeof twosHigh === 'boolean' ? { twosHigh } : {}),
        ...(typeof tradingEnabled === 'boolean' ? { tradingEnabled } : {}),
        ...(winScore && [50, 100].includes(winScore) ? { winScore } : {}),
      },
      include: {
        players: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { seatPosition: 'asc' },
        },
        host: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(updatedGame)
  } catch (error) {
    console.error('Update game error:', error)
    return NextResponse.json({ error: 'Failed to update game' }, { status: 500 })
  }
}

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
    const game = await prisma.game.findUnique({
      where: { code: code.toUpperCase() },
      include: { players: true },
    })

    if (!game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    const isHost = game.hostId === session.user.id
    const isPlayer = game.players.some((p) => p.userId === session.user.id)

    if (isHost) {
      await prisma.game.delete({ where: { id: game.id } })
      return NextResponse.json({ message: 'Game deleted' })
    }

    if (isPlayer && game.status === 'LOBBY') {
      await prisma.gamePlayer.deleteMany({
        where: { gameId: game.id, userId: session.user.id },
      })
      return NextResponse.json({ message: 'Left game' })
    }

    return NextResponse.json({ error: 'Cannot leave game' }, { status: 400 })
  } catch (error) {
    console.error('Delete game error:', error)
    return NextResponse.json({ error: 'Failed to delete game' }, { status: 500 })
  }
}
