import {
  array,
  record,
  str,
  type Interaction,
  type RecordedInteraction,
  sameWorker,
  type TimelineEntry,
} from "./protocol";

import { readPlan } from "../adapters";
import type { SupportedProviderId } from "./bindings/SupportedProviderId";
export type { PlanChoice } from "../adapters/contract";
export function planReview(
  request: Interaction,
  provider?: SupportedProviderId,
) {
  return readPlan(request, provider);
}

/** Rebuild cards from saved request/answer events, independent of pending controls. */
export function planReviewEntries(
  entries: TimelineEntry[],
  history: RecordedInteraction[],
  childId?: string | null,
  provider?: SupportedProviderId,
): TimelineEntry[] {
  const result = [...entries];
  const removed = new Set<TimelineEntry>();
  const consumed = new Set<TimelineEntry>();
  for (const interaction of history) {
    if (
      childId
        ? !sameWorker(interaction.childId, childId)
        : !!interaction.childId
    )
      continue;
    const review = planReview(interaction, provider);
    if (!review) continue;
    const users = entries.filter(
      (entry) => entry.type === "message" && entry.message.role === "user",
    );
    let user = users.find(
      (entry) =>
        entry.type === "message" && entry.message.id === interaction.prompt?.id,
    );
    const originalUser = !!user;
    // Native load/history_reset gives messages new stream IDs. Match the saved
    // user occurrence in that same conversation, never another worker's text.
    if (!user && interaction.prompt)
      user = users.filter(
        (entry) =>
          entry.type === "message" &&
          entry.message.text === interaction.prompt!.text,
      )[interaction.prompt.occurrence - 1];
    if (interaction.prompt && !user) continue; // Outside the bounded history window.
    const start = user ? entries.indexOf(user) + 1 : 0;
    let end = entries.findIndex(
      (entry, index) =>
        index >= start &&
        entry.type === "message" &&
        entry.message.role === "user",
    );
    if (end < 0) end = entries.length;
    const turn = entries.slice(start, end);
    const planText = review.text.trim();
    const prose = turn.find(
      (entry) =>
        entry.type === "message" &&
        entry.message.role === "assistant" &&
        entry.message.childId === interaction.childId &&
        !entry.message.attachments?.length &&
        !consumed.has(entry) &&
        !!planText &&
        (entry.message.text.trim() === planText ||
          entry.message.text.trimStart().startsWith(planText + "\n")),
    );
    const toolId = str(record(interaction.params.toolCall).toolCallId);
    const tool = toolId
      ? turn.find(
          (entry) =>
            entry.type === "tool" &&
            (entry.tool.id === toolId || entry.tool.id.endsWith(":" + toolId)),
        )
      : undefined;
    if (tool) removed.add(tool);
    const sequence =
      prose?.sequence ??
      tool?.sequence ??
      (originalUser || !interaction.prompt
        ? interaction.sequence
        : (turn.at(-1)?.sequence ?? user!.sequence) + 0.5);
    if (prose) {
      consumed.add(prose);
      removed.add(prose);
      // Older logs may have continued the same prose stream after approval.
      if (prose.type === "message") {
        const remainder = prose.message.text
          .trimStart()
          .slice(planText.length)
          .trimStart();
        if (remainder)
          result.push({
            ...prose,
            sequence: sequence + 0.1,
            message: {
              ...prose.message,
              id: prose.message.id + ":after-plan",
              text: remainder,
              sequence: sequence + 0.1,
            },
          });
      }
    }
    result.push({
      type: "message",
      sequence,
      message: {
        id: `plan-review:${interaction.sequence}`,
        streamId: `plan-review:${interaction.sequence}`,
        sequence,
        timestamp: interaction.timestamp,
        role: "assistant",
        text: review.text,
        childId: interaction.childId,
        planReview: interaction,
      },
    });
  }
  return result
    .filter((entry) => !removed.has(entry))
    .sort((a, b) => a.sequence - b.sequence);
}

export function planReviewStatus(interaction: RecordedInteraction): string {
  if (interaction.status === "interrupted") return "Plan review interrupted";
  if (interaction.status === "pending") return "Ready for review";
  const outcome = record(record(interaction.result).outcome);
  if (outcome.outcome === "cancelled") return "Plan review cancelled";
  const id = str(outcome.optionId);
  const review = planReview(interaction);
  const choice =
    review &&
    [review.implement, review.revise, ...review.extra].find(
      (choice) => choice.id === id,
    );
  if (choice?.kind.startsWith("allow")) return "Approved for implementation";
  if (id === "abandoned") return "Plan not executed";
  if (choice && review?.revise.id === id) return "Kept planning";
  // Older saved answer events only recorded the ID, not the selected outcome.
  return "Response recorded";
}
