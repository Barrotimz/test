import { useState } from "react";
import { formatTime } from "../lib/format";
import { commentsFor, traderById, useStore } from "../store";
import { Avatar } from "./Avatar";

export function Comments({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [text, setText] = useState("");
  const comments = commentsFor(state, postId);
  const post = state.posts.find((item) => item.id === postId);

  function send() {
    dispatch({ type: "comment", postId, text });
    setText("");
  }

  return (
    <div className="sheet" onClick={onClose} role="presentation">
      <div className="sheet-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Comments">
        <div className="grab" />
        <h3>{post?.comments ?? 0} comments on ${post?.token}</h3>
        <div className="comment-list">
          {comments.length === 0 && <p className="muted">No comments yet. Drop the first bag take.</p>}
          {comments.map((comment) => {
            const author = traderById(state, comment.authorId);
            return (
              <div className="comment" key={comment.id}>
                <Avatar name={author.name} hue={author.hue} />
                <div>
                  <strong>@{author.handle}</strong> <small>{formatTime(comment.createdAt)}</small>
                  <p>{comment.text}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="composer-row">
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Say something degen..."
            onKeyDown={(event) => {
              if (event.key === "Enter") send();
            }}
          />
          <button type="button" onClick={send} disabled={!text.trim()}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
