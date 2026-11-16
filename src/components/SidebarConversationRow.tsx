import type { ComponentProps, ReactNode } from "react";
import { Archive, Pin, PinOff } from "@/lib/icons";
import type { IconComponent } from "../lib/icon-context";
import { summarizeSessionMarks } from "../lib/protocol";
import { SidebarRowMenu } from "./SidebarRowMenu";
import { SidebarMenuItem, SidebarMenuSubItem, SidebarMenuButton, SidebarMenuSubButton } from "./ui/sidebar";

/** The same conversation row and interaction surface for chats and native workers. */
export function SidebarConversationRow({
  title, icon, status, unseen = false, active, topLevel = false, pinned,
  onOpen, onTogglePin, onArchive, reorder, children,
}: {
  title: string; icon: IconComponent; status: string; unseen?: boolean; active: boolean;
  topLevel?: boolean; pinned: boolean; onOpen: () => void; onTogglePin: () => void;
  onArchive: () => void; reorder?: ComponentProps<typeof SidebarRowMenu>["reorder"]; children?: ReactNode;
}) {
  const Row = topLevel ? SidebarMenuItem : SidebarMenuSubItem;
  const RowButton = topLevel ? SidebarMenuButton : SidebarMenuSubButton;
  const mark = summarizeSessionMarks([status], unseen ? 1 : 0);
  return <Row>
    <SidebarRowMenu label={title} reorder={reorder} actions={[
      {label: pinned ? "Unpin conversation" : "Pin conversation", icon: pinned ? PinOff : Pin, onSelect: onTogglePin},
      {label: "Archive conversation…", icon: Archive, onSelect: onArchive, destructive: true},
    ]}>
      <RowButton asChild icon={icon} isActive={active} loading={mark.loading} attention={mark.attention} attentionTone={mark.attentionTone} unseen={mark.unseen} title={mark.loading ?? mark.attention ?? mark.unseen}>
        <button onClick={onOpen}>{title}</button>
      </RowButton>
    </SidebarRowMenu>
    {children}
  </Row>;
}
