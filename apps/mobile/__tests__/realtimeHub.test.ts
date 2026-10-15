// T-UNIT-RT-01 (E-09, DEC 108): one join per topic, leave in the background, rejoin and catch up on resume.
import { createRealtimeHub } from '../src/lib/realtime';

function setup() {
  const joins: string[] = [];
  const leaves: string[] = [];
  const emit = new Map<string, (event: string, payload: unknown) => void>();
  const hub = createRealtimeHub((topic, onBroadcast) => {
    joins.push(topic);
    emit.set(topic, onBroadcast);
    return () => {
      leaves.push(topic);
      emit.delete(topic);
    };
  });
  return { hub, joins, leaves, emit };
}

describe('T-UNIT-RT-01 realtime hub', () => {
  it('joins a topic once for many listeners and routes events by name', () => {
    const { hub, joins, leaves, emit } = setup();
    const inbox = jest.fn();
    const chat = jest.fn();
    const stopA = hub.subscribe('user:me', 'inbox', inbox);
    const stopB = hub.subscribe('user:me', 'inbox', chat);
    const other = jest.fn();
    const stopC = hub.subscribe('user:me', 'other', other);
    expect(joins).toEqual(['user:me']);
    emit.get('user:me')?.('inbox', { chat_id: 'c1' });
    expect(inbox).toHaveBeenCalledWith({ chat_id: 'c1' });
    expect(chat).toHaveBeenCalledWith({ chat_id: 'c1' });
    expect(other).not.toHaveBeenCalled();
    stopA();
    stopB();
    stopB();
    expect(leaves).toEqual([]);
    stopC();
    expect(leaves).toEqual(['user:me']);
  });

  it('leaves every channel in the background and rejoins with a catch-up on resume', () => {
    const { hub, joins, leaves } = setup();
    const caughtUp = jest.fn();
    hub.subscribe('user:me', 'inbox', () => {}, caughtUp);
    hub.setActive(false);
    expect(leaves).toEqual(['user:me']);
    // Subscribing while in the background waits for the resume.
    const stop = hub.subscribe('user:other', 'inbox', () => {});
    expect(joins).toEqual(['user:me']);
    hub.setActive(true);
    expect(joins).toEqual(['user:me', 'user:me', 'user:other']);
    expect(caughtUp).toHaveBeenCalledTimes(1);
    stop();
    expect(leaves).toEqual(['user:me', 'user:other']);
  });

  it('a stale unsubscribe does not close a newer subscription to the same topic', () => {
    const { hub, joins, leaves } = setup();
    const stopOld = hub.subscribe('user:me', 'inbox', () => {});
    stopOld();
    hub.subscribe('user:me', 'inbox', () => {});
    stopOld();
    expect(joins).toEqual(['user:me', 'user:me']);
    expect(leaves).toEqual(['user:me']);
  });
});
