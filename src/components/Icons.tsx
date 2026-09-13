export function IconHome() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.5Z" />
    </svg>
  );
}

export function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

export function IconInbox() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 13 6.2 5.8A2 2 0 0 1 8.1 4.5h7.8a2 2 0 0 1 1.9 1.3L20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Z" />
      <path d="M4 13h4.2a2 2 0 0 0 1.7 1h4.2a2 2 0 0 0 1.7-1H20" />
    </svg>
  );
}

export function IconUser() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19.2c1.3-3 3.7-4.4 7-4.4s5.7 1.4 7 4.4" />
    </svg>
  );
}

export function IconHeart({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <path d="M12 20s-7-4.4-9.2-8.4C1 8.6 2.6 5 6.3 5c2 0 3.3 1.1 5.7 3.6C14.4 6.1 15.7 5 17.7 5c3.7 0 5.3 3.6 3.5 6.6C19 15.6 12 20 12 20Z" />
    </svg>
  );
}

export function IconChat() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 18.5 4 21v-7a7 7 0 1 1 7 7H6Z" />
    </svg>
  );
}

export function IconBookmark({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
      <path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.5L6 20V5.5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export function IconShare() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 13V4m0 0 3.5 3.5M12 4 8.5 7.5" />
      <path d="M6 12v7h12v-7" />
    </svg>
  );
}
