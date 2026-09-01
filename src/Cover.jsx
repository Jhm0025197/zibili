import { useState } from 'react'
import { IconHeadphones } from './icons.jsx'

export default function Cover({ book, format = 'ebook', className = '', showBadge = false }) {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const isAudio = format === 'audiobook'
  const showFallback = failed || !loaded

  return (
    <div className={`cover ${isAudio ? 'cover--audio' : ''} ${className}`}>
      {showFallback && (
        <div className="cover-fallback" style={{ background: book.color || '#194257' }}>
          <span className="cover-fallback-title">{book.title}</span>
          <span className="cover-fallback-author">{book.author}</span>
        </div>
      )}
      {!failed && (
        <img
          src={book.cover}
          alt=""
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={loaded ? undefined : { position: 'absolute', opacity: 0, width: 1, height: 1 }}
        />
      )}
      {showBadge && isAudio && (
        <span className="cover-audio-badge">
          <IconHeadphones />
        </span>
      )}
    </div>
  )
}
