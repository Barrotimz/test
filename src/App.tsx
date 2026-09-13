import { useEffect, useState } from "react";
import { Comments } from "./components/Comments";
import { Create } from "./components/Create";
import { Explore } from "./components/Explore";
import { Feed } from "./components/Feed";
import { IconHome, IconInbox, IconSearch, IconUser } from "./components/Icons";
import { Inbox } from "./components/Inbox";
import { Onboarding } from "./components/Onboarding";
import { Profile } from "./components/Profile";
import { StoryViewer } from "./components/StoryViewer";
import { useStore } from "./store";
import type { HomeLane, Post, Tab } from "./types";

export default function App() {
  const { state } = useStore();
  const [tab, setTab] = useState<Tab>("home");
  const [lane, setLane] = useState<HomeLane>("foryou");
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [profileId, setProfileId] = useState("you");
  const [tokenFilter, setTokenFilter] = useState<string | null>(null);
  const [storyAuthor, setStoryAuthor] = useState<string | null>(null);
  const [focusPosts, setFocusPosts] = useState<Post[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const unread = state.notices.filter((notice) => !notice.read).length;
  const latestNotice = state.notices[0];

  useEffect(() => {
    if (!latestNotice?.text.includes("Link copied")) return;
    setToast(latestNotice.id);
    const timer = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(timer);
  }, [latestNotice?.id, latestNotice?.text]);

  function goHome() {
    setTab("home");
    setLane("foryou");
    setTokenFilter(null);
    setFocusPosts(null);
  }

  function openProfile(id: string) {
    setProfileId(id);
    setTab("profile");
  }

  function openToken(token: string) {
    setTokenFilter(token);
    setFocusPosts(null);
    setLane("foryou");
    setTab("home");
  }

  if (!state.onboarded) {
    return (
      <div className="app-shell">
        <div className="phone">
          <Onboarding />
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="phone">
        <div className="screen">
          {tab === "home" && (
            <Feed
              lane={lane}
              onLane={(next) => {
                setLane(next);
                setTokenFilter(null);
                setFocusPosts(null);
              }}
              onClearToken={() => setTokenFilter(null)}
              tokenFilter={tokenFilter}
              posts={focusPosts ?? undefined}
              onOpenComments={setCommentsFor}
              onOpenProfile={openProfile}
              onOpenToken={openToken}
              onOpenStory={(id) => setStoryAuthor(id)}
            />
          )}
          {tab === "explore" && <Explore onOpenToken={openToken} onOpenProfile={openProfile} />}
          {tab === "create" && <Create onDone={goHome} />}
          {tab === "inbox" && <Inbox />}
          {tab === "profile" && (
            <Profile
              traderId={profileId}
              onOpenPost={(posts, startId) => {
                const ordered = [...posts.filter((post) => post.id === startId), ...posts.filter((post) => post.id !== startId)];
                setFocusPosts(ordered);
                setTokenFilter(null);
                setLane("foryou");
                setTab("home");
              }}
            />
          )}

          <nav className="nav">
            <button type="button" className={tab === "home" ? "active" : ""} onClick={goHome}>
              <IconHome />
              Home
            </button>
            <button type="button" className={tab === "explore" ? "active" : ""} onClick={() => setTab("explore")}>
              <IconSearch />
              Explore
            </button>
            <button type="button" onClick={() => setTab("create")} aria-label="Create">
              <span className="create-btn">+</span>
            </button>
            <button type="button" className={tab === "inbox" ? "active" : ""} onClick={() => setTab("inbox")}>
              <IconInbox />
              {unread > 0 ? `Inbox ${unread}` : "Inbox"}
            </button>
            <button
              type="button"
              className={tab === "profile" ? "active" : ""}
              onClick={() => {
                setProfileId("you");
                setTab("profile");
              }}
            >
              <IconUser />
              Profile
            </button>
          </nav>

          {commentsFor && <Comments postId={commentsFor} onClose={() => setCommentsFor(null)} />}
          {storyAuthor && <StoryViewer authorId={storyAuthor} onClose={() => setStoryAuthor(null)} />}
          {toast && <div className="toast">Copied to clipboard</div>}
        </div>
      </div>
    </div>
  );
}
