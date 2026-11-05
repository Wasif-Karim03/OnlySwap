import { useToastStore } from '@/components/Toast';
import { reportThenBlock } from '@/features/safety/reportWithBlock';

const BLOCK_FAILED = "Report sent, but we couldn't block them.";

describe('reportWithBlock reportThenBlock', () => {
  beforeEach(() => {
    useToastStore.setState({ current: undefined });
  });

  it('reports and reports blocked when block succeeds', async () => {
    const report = jest.fn().mockResolvedValue(undefined);
    const blockUser = jest.fn().mockResolvedValue(undefined);

    const outcome = await reportThenBlock({ report, block: true, blockUser, blockFailedMessage: BLOCK_FAILED });

    expect(report).toHaveBeenCalledTimes(1);
    expect(blockUser).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ blocked: true });
  });

  it('keeps the report, reports not blocked, and toasts when block fails', async () => {
    const report = jest.fn().mockResolvedValue(undefined);
    const blockUser = jest.fn().mockRejectedValue(new Error('network'));

    const outcome = await reportThenBlock({ report, block: true, blockUser, blockFailedMessage: BLOCK_FAILED });

    expect(report).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ blocked: false });
    expect(useToastStore.getState().current?.message).toBe(BLOCK_FAILED);
    expect(useToastStore.getState().current?.kind).toBe('error');
  });

  it('does not block when the user left the toggle off', async () => {
    const blockUser = jest.fn().mockResolvedValue(undefined);

    const outcome = await reportThenBlock({
      report: jest.fn().mockResolvedValue(undefined),
      block: false,
      blockUser,
      blockFailedMessage: BLOCK_FAILED,
    });

    expect(blockUser).not.toHaveBeenCalled();
    expect(outcome).toEqual({ blocked: false });
  });

  it('does not block when there is no one to block', async () => {
    const outcome = await reportThenBlock({
      report: jest.fn().mockResolvedValue(undefined),
      block: true,
      blockUser: undefined,
      blockFailedMessage: BLOCK_FAILED,
    });

    expect(outcome).toEqual({ blocked: false });
  });

  it('propagates a failed report and does not block', async () => {
    const blockUser = jest.fn().mockResolvedValue(undefined);

    await expect(
      reportThenBlock({
        report: jest.fn().mockRejectedValue(new Error('server')),
        block: true,
        blockUser,
        blockFailedMessage: BLOCK_FAILED,
      }),
    ).rejects.toThrow('server');
    expect(blockUser).not.toHaveBeenCalled();
  });
});
