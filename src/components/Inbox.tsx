import { formatTime } from "../lib/format";
import { useStore } from "../store";
import { useEffect } from "react";

export function Inbox() {
  const { state, dispatch } = useStore();

  useEffect(() => {
    dispatch({ type: "readNotices" });
  }, [dispatch]);

  return (
    <div className="page">
      <h1>Inbox</h1>
      <p className="lede">Live calls, copied cards, and slips landing on the tape.</p>
      <div className="token-row">
        {state.notices.length === 0 && <p className="muted">Quiet tape. Open a call and this lights up.</p>}
        {state.notices.map((notice) => (
          <div className="notice" key={notice.id}>
            <b>{notice.text}</b>
            <div className="muted">{formatTime(notice.createdAt)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
