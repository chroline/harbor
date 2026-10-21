import { ArrowLeft, ArrowRight, Ellipsis } from "@/lib/icons";
import { rem } from "@/lib/units";
import { IconButton } from "./shared";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownTrigger, DropdownContent } from "./ui/dropdown";
import { MenuItem } from "./ui/menu-item";

export function TopbarHistory({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
}) {
  return (
    <div className="topbar-history">
      <div className="topbar-history-buttons">
        <IconButton
          label="Back · ⌘ ["
          size="icon-compact"
          disabled={!canGoBack}
          onClick={onBack}
        >
          <ArrowLeft size={rem(18)} />
        </IconButton>
        <IconButton
          label="Forward · ⌘ ]"
          size="icon-compact"
          disabled={!canGoForward}
          onClick={onForward}
        >
          <ArrowRight size={rem(18)} />
        </IconButton>
      </div>
      <div className="topbar-history-overflow">
        <DropdownMenu size="compact">
          <DropdownTrigger
            render={
              <Button
                variant="ghost"
                size="icon-compact"
                className="icon-button"
                aria-label="Navigation history"
              >
                <Ellipsis />
              </Button>
            }
          />
          <DropdownContent align="end" className="w-32">
            <MenuItem
              index={0}
              icon={ArrowLeft}
              label="Back"
              disabled={!canGoBack}
              onSelect={onBack}
            />
            <MenuItem
              index={1}
              icon={ArrowRight}
              label="Forward"
              disabled={!canGoForward}
              onSelect={onForward}
            />
          </DropdownContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
