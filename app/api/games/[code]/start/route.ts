import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
        players: true,
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

    const updatedGame = await prisma.game.update({
      where: { id: game.id },
      data: {
        status: 'PLAYING',
        currentRound: 1,
      },
      include: {
        players: {
          include: { user: { select: { id: true, name: true } } },
          orderBy: { seatPosition: 'asc' },
        },
      },
    })

    return NextResponse.json(updatedGame)
  } catch (error) {
    console.error('Start game error:', error)
    return NextResponse.json({ error: 'Failed to start game' }, { status: 500 })
  }
}
