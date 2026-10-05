import type { DoubleLinkedList } from "./DoubleLinkedList";

export class ListNode<T> {
  public previous: ListNode<T> | null = null;
  public next: ListNode<T> | null = null;
  public owner: DoubleLinkedList<T> | null = null;

  public constructor(public value: T) {}
}
