'use client'

import { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  playerId: string
  playerName: string
  message: string
  timestamp: number
}

interface ChatProps {
  messages: Message[]
  onSendMessage: (message: string) => void
  currentPlayerId: string
  disabled?: boolean
}

export function Chat({ messages, onSendMessage, currentPlayerId, disabled = false }: ChatProps) {
  const [input, setInput] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (isExpanded && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isExpanded])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (input.trim() && !disabled) {
      onSendMessage(input.trim())
      setInput('')
    }
  }

  const unreadCount = isExpanded ? 0 : messages.length

  return (
    <div className="fixed bottom-4 right-4 z-40">
      {isExpanded ? (
        <div className="bg-slate-800 rounded-lg shadow-xl w-80 flex flex-col overflow-hidden border border-slate-700">
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-2 bg-slate-700 cursor-pointer"
            onClick={() => setIsExpanded(false)}
          >
            <span className="font-medium text-white text-sm">Chat</span>
            <button className="text-slate-400 hover:text-white">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="h-64 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">No messages yet</p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    'rounded-lg px-3 py-2 text-sm max-w-[90%]',
                    msg.playerId === currentPlayerId
                      ? 'bg-emerald-600 text-white ml-auto'
                      : 'bg-slate-700 text-white'
                  )}
                >
                  {msg.playerId !== currentPlayerId && (
                    <div className="font-medium text-xs text-emerald-400 mb-1">
                      {msg.playerName}
                    </div>
                  )}
                  <div className="break-words">{msg.message}</div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-2 border-t border-slate-700">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message..."
                disabled={disabled}
                maxLength={200}
                className="flex-1 bg-slate-700 text-white text-sm rounded px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={disabled || !input.trim()}
                className="bg-emerald-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      ) : (
        <button
          onClick={() => setIsExpanded(true)}
          className="bg-slate-800 hover:bg-slate-700 text-white rounded-full p-3 shadow-lg border border-slate-700 relative"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}
    </div>
  )
}
