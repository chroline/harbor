import "./chat-loading.css";

export function ChatLoadingSkeleton() {
  return (
    <div
      className="chat-loading"
      role="status"
      aria-label="Loading conversation"
    >
      <div
        className="conversation-content chat-loading-messages"
        aria-hidden="true"
      >
        {[0, 1].map((turn) => (
          <div className="chat-loading-turn" key={turn}>
            <div className="chat-loading-prompt chat-loading-shape" />
            <div className="chat-loading-reply">
              <div className="chat-loading-line chat-loading-shape" />
              <div className="chat-loading-line chat-loading-shape" />
              <div className="chat-loading-line chat-loading-shape" />
            </div>
          </div>
        ))}
      </div>
      <div
        className="conversation-content chat-loading-composer"
        aria-hidden="true"
      >
        <div className="chat-loading-input chat-loading-shape" />
      </div>
    </div>
  );
}
