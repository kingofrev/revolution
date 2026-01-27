import { prisma } from '@/lib/prisma'

const GAME_TIMEOUT_HOURS = 24

/**
 * Clean up abandoned games that haven't been updated in 24 hours
 * Returns the number of games deleted
 */
export async function cleanupAbandonedGames(): Promise<number> {
  const cutoffTime = new Date(Date.now() - GAME_TIMEOUT_HOURS * 60 * 60 * 1000)

  try {
    // Delete games that:
    // 1. Haven't been updated in 24 hours
    // 2. Are not in GAME_OVER status (completed games are kept for history)
    const result = await prisma.game.deleteMany({
      where: {
        updatedAt: {
          lt: cutoffTime,
        },
        status: {
          not: 'GAME_OVER',
        },
      },
    })

    if (result.count > 0) {
      console.log(`Cleaned up ${result.count} abandoned games`)
    }

    return result.count
  } catch (error) {
    console.error('Failed to cleanup abandoned games:', error)
    return 0
  }
}

/**
 * Abandon a game - handles both host and non-host leaving mid-game
 * Returns: { success: boolean, message: string, gameDeleted: boolean }
 */
export async function abandonGame(
  gameCode: string,
  userId: string
): Promise<{ success: boolean; message: string; gameDeleted: boolean }> {
  try {
    const game = await prisma.game.findUnique({
      where: { code: gameCode.toUpperCase() },
      include: { players: true },
    })

    if (!game) {
      return { success: false, message: 'Game not found', gameDeleted: false }
    }

    const isHost = game.hostId === userId
    const isPlayer = game.players.some((p) => p.userId === userId)

    if (!isPlayer && !isHost) {
      return { success: false, message: 'Not in this game', gameDeleted: false }
    }

    // If host leaves or game is in lobby, delete the whole game
    if (isHost || game.status === 'LOBBY') {
      await prisma.game.delete({ where: { id: game.id } })
      return {
        success: true,
        message: isHost ? 'Game deleted (host left)' : 'Left game',
        gameDeleted: true,
      }
    }

    // Non-host leaving mid-game
    // Remove the player from the game
    await prisma.gamePlayer.deleteMany({
      where: { gameId: game.id, userId },
    })

    // Check if enough players remain to continue
    const remainingPlayers = game.players.filter((p) => p.userId !== userId)

    if (remainingPlayers.length < 2) {
      // Not enough players to continue, delete the game
      await prisma.game.delete({ where: { id: game.id } })
      return {
        success: true,
        message: 'Game ended (not enough players)',
        gameDeleted: true,
      }
    }

    // Update game state to remove the player
    if (game.gameState) {
      const state = game.gameState as any

      // Remove player from state
      state.players = state.players.filter((p: any) => p.odlerId !== userId)

      // Update turn order
      const leavingPlayer = (game.gameState as any).players?.find((p: any) => p.odlerId === userId)
      if (leavingPlayer && state.turnOrder) {
        state.turnOrder = state.turnOrder.filter((id: string) => id !== leavingPlayer.id)
      }

      // If it was this player's turn, move to next player
      if (leavingPlayer && state.currentPlayerId === leavingPlayer.id) {
        const remainingActive = state.players.filter((p: any) => !p.isFinished)
        if (remainingActive.length > 0) {
          state.currentPlayerId = remainingActive[0].id
        }
      }

      // Update settings to reflect fewer players
      state.settings.playerCount = remainingPlayers.length

      await prisma.game.update({
        where: { id: game.id },
        data: {
          gameState: state,
          playerCount: remainingPlayers.length,
        },
      })
    }

    return {
      success: true,
      message: 'Left game',
      gameDeleted: false,
    }
  } catch (error) {
    console.error('Failed to abandon game:', error)
    return { success: false, message: 'Failed to leave game', gameDeleted: false }
  }
}
