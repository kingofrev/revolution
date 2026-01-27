import { NextResponse } from 'next/server'
import { cleanupAbandonedGames } from '@/lib/game/cleanup'

// Run cleanup - can be called periodically or on page load
export async function POST() {
  try {
    const deletedCount = await cleanupAbandonedGames()
    return NextResponse.json({ success: true, deletedCount })
  } catch (error) {
    console.error('Cleanup error:', error)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}
