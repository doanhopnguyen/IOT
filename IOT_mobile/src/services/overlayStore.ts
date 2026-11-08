export interface OverlayEntry<T> { id: string; priority: number; order: number; value: T; }

// One native modal hosts all app dialogs. Updating a dialog must not promote it
// above an alert or reset the state of the dialog underneath.
export class OverlayStore<T> {
  private entries: readonly OverlayEntry<T>[] = [];
  private sequence = 0;
  private listeners = new Set<() => void>();
  getSnapshot = () => this.entries;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  set(id: string, priority: number, value: T) {
    const previous = this.entries.find(entry => entry.id === id);
    if (previous?.priority === priority && previous.value === value) return;
    const entry = { id, priority, order: previous?.order ?? ++this.sequence, value };
    this.entries = [...this.entries.filter(item => item.id !== id), entry]
      .sort((a, b) => a.priority - b.priority || a.order - b.order);
    this.listeners.forEach(listener => listener());
  }
  remove(id: string) {
    if (!this.entries.some(entry => entry.id === id)) return;
    this.entries = this.entries.filter(entry => entry.id !== id);
    this.listeners.forEach(listener => listener());
  }
}
