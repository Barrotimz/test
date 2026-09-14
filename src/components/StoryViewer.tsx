import { useEffect, useMemo, useState } from "react";
import { formatPnl, kindLabel } from "../lib/format";
import { storiesByAuthor, traderById, useStore } from "../store";
import { Avatar } from "./Avatar";

export function StoryViewer({ authorId, onClose }: { authorId: string; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const groups = storiesByAuthor(state);
  const order = useMemo(() => {
    const ids = [...groups.keys()];
    const start = ids.indexOf(authorId);
    return start === -1 ? ids : [...ids.slice(start), ...ids.slice(0, start)];
  }, [authorId, groups]);

  const [groupIndex, setGroupIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const currentAuthor = order[groupIndex];
  const items = currentAuthor ? groups.get(currentAuthor) ?? [] : [];
  const story = items[itemIndex];
  const trader = currentAuthor ? traderById(state, currentAuthor) : null;

  useEffect(() => {
    if (currentAuthor) dispatch({ type: "seeStories", authorId: currentAuthor });
  }, [currentAuthor, dispatch]);

  useEffect(() => {
    const timer = window.setTimeout(() => next(), 5000);
    return () => window.clearTimeout(timer);
  }, [groupIndex, itemIndex]);

  function next() {
    if (itemIndex + 1 < items.length) {
      setItemIndex(itemIndex + 1);
      return;
    }
    if (groupIndex + 1 < order.length) {
      setGroupIndex(groupIndex + 1);
      setItemIndex(0);
      return;
    }
    onClose();
  }

  function prev() {
    if (itemIndex > 0) {
      setItemIndex(itemIndex - 1);
      return;
    }
    if (groupIndex > 0) {
      const prevItems = groups.get(order[groupIndex - 1]) ?? [];
      setGroupIndex(groupIndex - 1);
      setItemIndex(Math.max(0, prevItems.length - 1));
      return;
    }
    onClose();
  }

  if (!story || !trader) return null;

  return (
    <div className="viewer" style={{ ["--h" as string]: String(story.theme) }}>
      <div className="bars">
        {items.map((item, index) => (
          <i key={item.id} className={index < itemIndex ? "done" : index === itemIndex ? "active" : ""}>
            <b />
          </i>
        ))}
      </div>
      <div className="viewer-top">
        <div className="author">
          <Avatar name={trader.name} hue={trader.hue} />
          <strong>@{trader.handle}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close stories">
          ✕
        </button>
      </div>
      <div
        className="viewer-body"
        style={{
          background: `radial-gradient(circle at 50% 30%, hsl(${story.theme} 80% 50% / 0.35), #07070b)`,
        }}
      >
        <div>
          <div className="kind">{kindLabel(story.kind)}</div>
          <h2 className={story.pnl !== undefined && story.pnl < 0 ? "down" : "up"}>
            {formatPnl(story.pnl) ?? (story.token ? `$${story.token}` : "STORY")}
          </h2>
          {story.token && <p>${story.token}</p>}
          <p>{story.caption}</p>
        </div>
      </div>
      <div className="hit">
        <button type="button" aria-label="Previous story" onClick={prev} />
        <button type="button" aria-label="Next story" onClick={next} />
      </div>
    </div>
  );
}
