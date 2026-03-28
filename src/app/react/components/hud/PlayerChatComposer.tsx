import { useEffect, useMemo, useRef, useState } from 'react';
import { HeroState, PlayerChatMessageEvent } from '../../../../game/types';

export interface PlayerChatSendPayload {
  event: PlayerChatMessageEvent;
  displayText: string;
  recipientNames: string[];
}

interface PlayerChatComposerProps {
  heroes: HeroState[];
  activeHeroId: string | null;
  onActiveHeroChange: (heroId: string) => void;
  onSend: (payload: PlayerChatSendPayload) => void;
  disabled?: boolean;
  title?: string;
  helperText?: string;
  placeholder?: string;
  sendLabel?: string;
  footerText?: string;
  disabledNote?: string;
  layout?: 'fill' | 'compact';
  rows?: number;
}

export function PlayerChatComposer({
  heroes,
  activeHeroId,
  onActiveHeroChange,
  onSend,
  disabled = false,
  title = 'Command Hero',
  helperText = 'Type @ to choose a hero target',
  placeholder = 'Type @Commander then your order...',
  sendLabel = 'Send',
  footerText = 'Enter sends. Shift+Enter makes a new line.',
  disabledNote = 'Unavailable right now.',
  layout = 'fill',
  rows = 2,
}: PlayerChatComposerProps) {
  const [input, setInput] = useState('');
  const [caretIndex, setCaretIndex] = useState(0);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const mentionContext = useMemo(() => getMentionContext(input, caretIndex), [input, caretIndex]);
  const suggestions = useMemo(() => {
    if (disabled || !mentionContext) {
      return [];
    }

    const query = normalizeToken(mentionContext.query);
    return heroes.filter((hero) => {
      if (!query) {
        return true;
      }

      return normalizeToken(hero.name).includes(query);
    });
  }, [heroes, mentionContext]);

  const parsedRecipients = useMemo(() => parseMentionedHeroes(input, heroes), [input, heroes]);
  const visibleRecipients =
    parsedRecipients.length > 0
      ? parsedRecipients
      : heroes.filter((hero) => hero.id === activeHeroId).slice(0, 1);

  useEffect(() => {
    setHighlightIndex(0);
  }, [mentionContext?.query]);

  useEffect(() => {
    if (!activeHeroId && heroes[0]) {
      onActiveHeroChange(heroes[0].id);
    }
  }, [activeHeroId, heroes, onActiveHeroChange]);

  const insertMention = (hero: HeroState) => {
    if (disabled || !mentionContext) {
      return;
    }

    const before = input.slice(0, mentionContext.start);
    const after = input.slice(caretIndex);
    const nextValue = `${before}@${hero.name} ${after}`;
    const nextCaret = before.length + hero.name.length + 2;

    setInput(nextValue);
    setCaretIndex(nextCaret);
    onActiveHeroChange(hero.id);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleSend = () => {
    if (disabled) {
      return;
    }

    const displayText = input.trim();
    if (!displayText) {
      return;
    }

    const recipients = parsedRecipients.length > 0
      ? parsedRecipients
      : heroes.filter((hero) => hero.id === activeHeroId).slice(0, 1);
    const cleanedText = stripMentions(displayText).trim();
    if (!cleanedText || recipients.length === 0) {
      return;
    }

    const event: PlayerChatMessageEvent = {
      text: cleanedText,
      targetHeroIds: recipients.map((hero) => hero.id),
    };

    onSend({
      event,
      displayText,
      recipientNames: recipients.map((hero) => hero.name),
    });
    setInput('');
    setCaretIndex(0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();

    if (disabled) {
      return;
    }

    if (suggestions.length > 0 && mentionContext) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlightIndex((current) => (current + 1) % suggestions.length);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlightIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
        return;
      }

      if (event.key === 'Tab' || event.key === 'Enter') {
        event.preventDefault();
        insertMention(suggestions[highlightIndex]);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        height: layout === 'fill' ? '100%' : 'auto',
        boxSizing: 'border-box',
        border: '1px solid #4b3a1d',
        borderRadius: '8px',
        backgroundColor: disabled ? '#0f0b07e8' : '#120e08ee',
        boxShadow: '0 10px 26px rgba(0,0,0,0.35)',
        padding: '10px 12px',
        fontFamily: '"NeoDunggeunmoPro", monospace',
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        opacity: disabled ? 0.78 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', gap: '10px' }}>
        <div style={{ color: '#ffd700', fontSize: '12px' }}>{title}</div>
        <div style={{ color: '#8b7a63', fontSize: '10px' }}>{helperText}</div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px', minHeight: '24px' }}>
        {visibleRecipients.map((hero) => (
          <button
            key={hero.id}
            onClick={() => onActiveHeroChange(hero.id)}
            disabled={disabled}
            style={{
              padding: '3px 8px',
              borderRadius: '999px',
              border: hero.id === activeHeroId ? '1px solid #ffd700' : '1px solid #5c4a28',
              backgroundColor: hero.id === activeHeroId ? '#2a2110' : '#17120b',
              color: hero.id === activeHeroId ? '#ffd700' : '#d4c4a1',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontFamily: '"NeoDunggeunmoPro", monospace',
              fontSize: '10px',
              opacity: disabled ? 0.7 : 1,
            }}
          >
            @{hero.name}
          </button>
        ))}
        {visibleRecipients.length === 0 && <div style={{ color: '#6f6759', fontSize: '10px' }}>No active hero selected</div>}
      </div>

      <div style={{ position: 'relative' }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            setCaretIndex(event.target.selectionStart ?? event.target.value.length);
          }}
          onSelect={(event) => setCaretIndex(event.currentTarget.selectionStart ?? 0)}
          onKeyDown={handleKeyDown}
          onKeyUp={(event) => event.stopPropagation()}
          onFocus={(event) => setCaretIndex(event.currentTarget.selectionStart ?? 0)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          style={{
            width: '100%',
            minHeight: rows >= 3 ? '86px' : '62px',
            resize: 'none',
            borderRadius: '6px',
            border: '1px solid #3e311b',
            backgroundColor: disabled ? '#090705' : '#0b0907',
            color: disabled ? '#8f8778' : '#f4efe0',
            padding: '10px 12px',
            boxSizing: 'border-box',
            fontFamily: '"NeoDunggeunmoPro", monospace',
            fontSize: '12px',
            lineHeight: 1.35,
            outline: 'none',
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        />

        {suggestions.length > 0 && mentionContext && (
          <div
            style={{
              position: 'absolute',
              left: '0',
              bottom: 'calc(100% + 8px)',
              width: '260px',
              border: '1px solid #4b3a1d',
              borderRadius: '6px',
              backgroundColor: '#14100bcc',
              backdropFilter: 'blur(6px)',
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            }}
          >
            {suggestions.map((hero, index) => (
              <button
                key={hero.id}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertMention(hero);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  backgroundColor: index === highlightIndex ? '#2a2110' : 'transparent',
                  color: index === highlightIndex ? '#ffd700' : '#e8d9b6',
                  border: 'none',
                  borderBottom: index === suggestions.length - 1 ? 'none' : '1px solid #2a2110',
                  cursor: 'pointer',
                  fontFamily: '"NeoDunggeunmoPro", monospace',
                  fontSize: '11px',
                }}
              >
                @{hero.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', gap: '8px' }}>
        <div style={{ color: '#7b7467', fontSize: '10px' }}>{disabled ? disabledNote : footerText}</div>
        <button
          onClick={handleSend}
          disabled={disabled}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #7d5a1b',
            backgroundColor: disabled ? '#635739' : '#ffd700',
            color: disabled ? '#1e1a14' : '#111',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontFamily: '"NeoDunggeunmoPro", monospace',
            fontSize: '11px',
            opacity: disabled ? 0.7 : 1,
          }}
        >
          {sendLabel}
        </button>
      </div>
    </div>
  );
}

function getMentionContext(value: string, caretIndex: number): { start: number; query: string } | null {
  const searchStart = Math.max(0, caretIndex - 32);
  const prefix = value.slice(searchStart, caretIndex);
  const atIndex = prefix.lastIndexOf('@');
  if (atIndex === -1) {
    return null;
  }

  const absoluteIndex = searchStart + atIndex;
  const token = value.slice(absoluteIndex + 1, caretIndex);
  if (/\s/.test(token)) {
    return null;
  }

  return {
    start: absoluteIndex,
    query: token,
  };
}

function parseMentionedHeroes(value: string, heroes: HeroState[]): HeroState[] {
  const matches = value.match(/@([^\s@]+)/g) ?? [];
  const unique = new Map<string, HeroState>();

  for (const match of matches) {
    const token = normalizeToken(match.slice(1));
    const hero = heroes.find((candidate) => normalizeToken(candidate.name) === token);
    if (hero) {
      unique.set(hero.id, hero);
    }
  }

  return [...unique.values()];
}

function stripMentions(value: string): string {
  return value.replace(/(^|\s)@([^\s@]+)/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}
