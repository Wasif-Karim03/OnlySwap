import { useToastStore } from '@/components/Toast';

/** What the report sheet needs to tell the user after a report went through. */
export type ReportOutcome = { blocked: boolean };

type ReportThenBlockInput = {
  /** Sends the report. A failure here propagates so the sheet can show it and stay editable. */
  report: () => Promise<unknown>;
  /** The block toggle as the user left it. */
  block: boolean;
  /** Absent when there is no one to block (for example, a deleted account). */
  blockUser?: () => Promise<unknown>;
  /** Shown as an error toast when the report is saved but the block is not. */
  blockFailedMessage: string;
};

/**
 * Sends the report first, then the block. If the block fails after the report
 * has been saved, the report is kept, the user is told, and the outcome says
 * the block did not apply. This stops a retry from resending the report and
 * stops the sheet from saying "You blocked" when nothing was blocked.
 */
export async function reportThenBlock({
  report,
  block,
  blockUser,
  blockFailedMessage,
}: ReportThenBlockInput): Promise<ReportOutcome> {
  await report();
  if (!block || !blockUser) return { blocked: false };
  try {
    await blockUser();
    return { blocked: true };
  } catch {
    useToastStore.getState().show('error', blockFailedMessage);
    return { blocked: false };
  }
}
