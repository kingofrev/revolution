'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCredentialsLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError('Invalid email or password')
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  async function handleGuestLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    const name = formData.get('guestName') as string

    const result = await signIn('guest', {
      name,
      redirect: false,
    })

    if (result?.error) {
      setError('Could not create guest account')
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-900 to-slate-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Revolution</CardTitle>
          <CardDescription>Sign in to play</CardDescription>
          <p className="text-xs text-muted-foreground mt-2">
            Tip: For local multiplayer, use different browsers (Chrome, Firefox, Edge) - not just incognito tabs.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="guest" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="guest">Guest</TabsTrigger>
              <TabsTrigger value="account">Account</TabsTrigger>
            </TabsList>

            <TabsContent value="guest">
              <form onSubmit={handleGuestLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="guestName">Display Name</Label>
                  <Input
                    id="guestName"
                    name="guestName"
                    placeholder="Enter your name"
                    required
                    minLength={2}
                    maxLength={20}
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Joining...' : 'Play as Guest'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="account">
              <form onSubmit={handleCredentialsLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                  />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground mt-4">
                Don&apos;t have an account?{' '}
                <Link href="/register" className="text-primary hover:underline">
                  Register
                </Link>
              </p>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
