import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { nanoid } from 'nanoid'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { playerCount, twosHigh, tradingEnabled, winScore } = await req.json()

    if (![4, 5, 6].includes(playerCount)) {
      return NextResponse.json({ error: 'Invalid player count' }, { status: 400 })
    }

    if (![50, 100].includes(winScore)) {
      return NextResponse.json({ error: 'Invalid win score' }, { status: 400 })
    }

    const code = nanoid(6).toUpperCase()

    const game = await prisma.game.create({
      data: {
        code,
        hostId: session.user.id,
        playerCount,
        twosHigh: !!twosHigh,
        tradingEnabled: tradingEnabled !== false,
        winScore,
        players: {
          create: {
            userId: session.user.id,
            seatPosition: 0,
          },
        },
      },
      include: {
        players: {
          include: { user: { select: { id: true, name: true } } },
        },
        host: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(game)
  } catch (error) {
    console.error('Create game error:', error)
    return NextResponse.json({ error: 'Failed to create game' }, { status: 500 })
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const games = await prisma.game.findMany({
      where: {
        players: {
          some: { userId: session.user.id },
        },
        status: { not: 'GAME_OVER' },
      },
      include: {
        players: {
          include: { user: { select: { id: true, name: true } } },
        },
        host: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    })

    return NextResponse.json(games)
  } catch (error) {
    console.error('Get games error:', error)
    return NextResponse.json({ error: 'Failed to get games' }, { status: 500 })
  }
}
