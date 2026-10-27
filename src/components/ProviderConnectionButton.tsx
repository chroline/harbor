import { useState } from "react";
import { useStore } from "../lib/store";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { ProviderEditor } from "./ProviderEditor";

export function ProviderConnectionButton({
  providerId,
  disabled,
}: {
  providerId: string;
  disabled?: boolean;
}) {
  const { data, refresh } = useStore();
  const [open, setOpen] = useState(false);
  const provider = data.providers.find((p) => p.id === providerId);
  if (!provider) return null;
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Configure executable
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          size="xl"
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>{provider.name} connection</DialogTitle>
            <DialogDescription>
              Choose the installed executable Harbor should use for this agent.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <ProviderEditor
              key={providerId}
              provider={provider}
              onSaved={refresh}
              onDone={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
