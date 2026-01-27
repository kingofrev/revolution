import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get user stats
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        gamesPlayed: true,
        gamesWon: true,
        createdAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get recent game history
    const recentGames = await prisma.gameHistoryPlayer.findMany({
      where: { userId: session.user.id },
      include: {
        gameHistory: {
          select: {
            id: true,
            code: true,
            playerCount: true,
            totalRounds: true,
            winnerName: true,
            winnerScore: true,
            completedAt: true,
          },
        },
      },
      orderBy: {
        gameHistory: {
          completedAt: 'desc',
        },
      },
      take: 10,
    })

    // Calculate additional stats
    const allGames = await prisma.gameHistoryPlayer.findMany({
      where: { userId: session.user.id },
      select: {
        finalPosition: true,
        finalScore: true,
        isWinner: true,
      },
    })

    const totalPoints = allGames.reduce((sum, g) => sum + g.finalScore, 0)
    const avgPosition = allGames.length > 0
      ? allGames.reduce((sum, g) => sum + g.finalPosition, 0) / allGames.length
      : 0

    // Count finishes by position
    const positionCounts: Record<number, number> = {}
    for (const game of allGames) {
      positionCounts[game.finalPosition] = (positionCounts[game.finalPosition] || 0) + 1
    }

    return NextResponse.json({
      stats: {
        gamesPlayed: user.gamesPlayed,
        gamesWon: user.gamesWon,
        winRate: user.gamesPlayed > 0 ? ((user.gamesWon / user.gamesPlayed) * 100).toFixed(1) : '0',
        totalPoints,
        avgPosition: avgPosition.toFixed(1),
        positionCounts,
        memberSince: user.createdAt,
      },
      recentGames: recentGames.map((g) => ({
        id: g.gameHistory.id,
        code: g.gameHistory.code,
        playerCount: g.gameHistory.playerCount,
        totalRounds: g.gameHistory.totalRounds,
        winnerName: g.gameHistory.winnerName,
        myPosition: g.finalPosition,
        myScore: g.finalScore,
        isWinner: g.isWinner,
        completedAt: g.gameHistory.completedAt,
      })),
    })
  } catch (error) {
    console.error('Get stats error:', error)
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 })
  }
}
