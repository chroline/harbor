import { ThinkingIndicator } from "./ui/thinking-indicator";
import "./chat-loading.css";

export function ChatLoadingSkeleton() {
  return (
    <div className="chat-loading">
      <ThinkingIndicator
        label="Loading conversation"
        aria-label="Loading conversation"
      />
    </div>
  );
}
