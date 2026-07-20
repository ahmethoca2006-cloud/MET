import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Shared "stick to bottom on new message, otherwise show a jump-to-end
 * button" behavior for TeamChatThread and DirectThread — previously
 * duplicated near-verbatim in both. Scrolling only happens when the user was
 * already near the bottom (nearBottomRef), so an incoming message never
 * yanks the view away from wherever the user has scrolled to read history.
 */
export function useChatScroll(messageCount: number) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [showJumpToEnd, setShowJumpToEnd] = useState(false);

  useLayoutEffect(() => {
    if (nearBottomRef.current) bottomRef.current?.scrollIntoView({ block: 'end' });
    else setShowJumpToEnd(true);
  }, [messageCount]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    nearBottomRef.current = near;
    if (near) setShowJumpToEnd(false);
  };

  const jumpToEnd = () => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    nearBottomRef.current = true;
    setShowJumpToEnd(false);
  };

  /** Call before an optimistic send so the thread stays pinned to the bottom for the sender's own message. */
  const pinToBottom = () => { nearBottomRef.current = true; };

  return { bottomRef, scrollRef, showJumpToEnd, handleScroll, jumpToEnd, pinToBottom };
}
