export type AppEvents = {
  "bill.created": { billId: string; name: string };
  "bill.updated": { billId: string };
  "bill.archived": { billId: string };
  "occurrence.due": { occurrenceId: string; billId: string; dueDate: string };
  "occurrence.skipped": { occurrenceId: string; billId: string };
  "payment.recorded": { paymentId: string; billId: string; amount: string };
  "payment.undone": { paymentId: string; billId: string };
  "card.created": { cardId: string; nickname: string };
};

type Handler<K extends keyof AppEvents> = (payload: AppEvents[K]) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<keyof AppEvents>>>();

  on<K extends keyof AppEvents>(event: K, handler: Handler<K>): () => void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler as Handler<keyof AppEvents>);
    this.handlers.set(event, set);
    return () => set.delete(handler as Handler<keyof AppEvents>);
  }

  emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      handler(payload);
    }
  }
}

export const events = new EventBus();
