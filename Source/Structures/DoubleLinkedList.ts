import { ListNode } from "./ListNode";

export class DoubleLinkedList<T> {
  private headNode: ListNode<T> | null = null;
  private tailNode: ListNode<T> | null = null;
  private count = 0;

  public get head(): ListNode<T> | null {
    return this.headNode;
  }

  public get tail(): ListNode<T> | null {
    return this.tailNode;
  }

  public get size(): number {
    return this.count;
  }

  public get isEmpty(): boolean {
    return this.count === 0;
  }

  public contains(node: ListNode<T> | null): boolean {
    return node !== null && node.owner === this;
  }

  public insertFirst(value: T): ListNode<T> {
    const node = new ListNode(value);
    this.linkFirst(node);
    return node;
  }

  public insertLast(value: T): ListNode<T> {
    const node = new ListNode(value);
    this.linkLast(node);
    return node;
  }

  public insertBefore(reference: ListNode<T>, value: T): ListNode<T> {
    this.assertOwned(reference);
    const node = new ListNode(value);
    this.linkBefore(node, reference);
    return node;
  }

  public insertAfter(reference: ListNode<T>, value: T): ListNode<T> {
    this.assertOwned(reference);
    const node = new ListNode(value);
    this.linkAfter(node, reference);
    return node;
  }

  public insertAt(index: number, value: T): ListNode<T> {
    if (!Number.isInteger(index) || index < 0 || index > this.count) {
      throw new RangeError("Index out of range");
    }
    if (index === this.count) {
      return this.insertLast(value);
    }
    const reference = this.nodeAt(index);
    if (reference === null) {
      return this.insertLast(value);
    }
    return this.insertBefore(reference, value);
  }

  public removeFirst(): ListNode<T> | null {
    const node = this.headNode;
    if (node === null) {
      return null;
    }
    this.unlink(node);
    return node;
  }

  public removeLast(): ListNode<T> | null {
    const node = this.tailNode;
    if (node === null) {
      return null;
    }
    this.unlink(node);
    return node;
  }

  public removeNode(node: ListNode<T>): ListNode<T> {
    this.assertOwned(node);
    this.unlink(node);
    return node;
  }

  public moveBefore(node: ListNode<T>, reference: ListNode<T>): void {
    this.assertOwned(node);
    this.assertOwned(reference);
    if (node === reference || reference.previous === node) {
      return;
    }
    this.unlink(node);
    this.linkBefore(node, reference);
  }

  public moveAfter(node: ListNode<T>, reference: ListNode<T>): void {
    this.assertOwned(node);
    this.assertOwned(reference);
    if (node === reference || reference.next === node) {
      return;
    }
    this.unlink(node);
    this.linkAfter(node, reference);
  }

  public moveToFirst(node: ListNode<T>): void {
    this.assertOwned(node);
    if (this.headNode === node) {
      return;
    }
    this.unlink(node);
    this.linkFirst(node);
  }

  public moveToLast(node: ListNode<T>): void {
    this.assertOwned(node);
    if (this.tailNode === node) {
      return;
    }
    this.unlink(node);
    this.linkLast(node);
  }

  public getNext(node: ListNode<T>): ListNode<T> | null {
    this.assertOwned(node);
    return node.next;
  }

  public getPrevious(node: ListNode<T>): ListNode<T> | null {
    this.assertOwned(node);
    return node.previous;
  }

  public getNextCircular(node: ListNode<T>): ListNode<T> | null {
    this.assertOwned(node);
    return node.next ?? this.headNode;
  }

  public getPreviousCircular(node: ListNode<T>): ListNode<T> | null {
    this.assertOwned(node);
    return node.previous ?? this.tailNode;
  }

  public nodeAt(index: number): ListNode<T> | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) {
      return null;
    }
    if (index < this.count / 2) {
      let cursor = this.headNode;
      for (let step = 0; step < index && cursor !== null; step += 1) {
        cursor = cursor.next;
      }
      return cursor;
    }
    let cursor = this.tailNode;
    for (let step = this.count - 1; step > index && cursor !== null; step -= 1) {
      cursor = cursor.previous;
    }
    return cursor;
  }

  public indexOf(node: ListNode<T>): number {
    if (!this.contains(node)) {
      return -1;
    }
    let index = 0;
    for (let cursor = this.headNode; cursor !== null; cursor = cursor.next) {
      if (cursor === node) {
        return index;
      }
      index += 1;
    }
    return -1;
  }

  public find(predicate: (value: T) => boolean): ListNode<T> | null {
    for (let cursor = this.headNode; cursor !== null; cursor = cursor.next) {
      if (predicate(cursor.value)) {
        return cursor;
      }
    }
    return null;
  }

  public clear(): void {
    let cursor = this.headNode;
    while (cursor !== null) {
      const following: ListNode<T> | null = cursor.next;
      cursor.previous = null;
      cursor.next = null;
      cursor.owner = null;
      cursor = following;
    }
    this.headNode = null;
    this.tailNode = null;
    this.count = 0;
  }

  public forEachForward(visit: (value: T, node: ListNode<T>) => void): void {
    for (let cursor = this.headNode; cursor !== null; cursor = cursor.next) {
      visit(cursor.value, cursor);
    }
  }

  public forEachBackward(visit: (value: T, node: ListNode<T>) => void): void {
    for (let cursor = this.tailNode; cursor !== null; cursor = cursor.previous) {
      visit(cursor.value, cursor);
    }
  }

  public *nodes(): IterableIterator<ListNode<T>> {
    for (let cursor = this.headNode; cursor !== null; cursor = cursor.next) {
      yield cursor;
    }
  }

  public *nodesBackward(): IterableIterator<ListNode<T>> {
    for (let cursor = this.tailNode; cursor !== null; cursor = cursor.previous) {
      yield cursor;
    }
  }

  public *[Symbol.iterator](): IterableIterator<T> {
    for (let cursor = this.headNode; cursor !== null; cursor = cursor.next) {
      yield cursor.value;
    }
  }

  public snapshotForward(): T[] {
    return Array.from(this);
  }

  public snapshotBackward(): T[] {
    const values: T[] = [];
    this.forEachBackward((value) => values.push(value));
    return values;
  }

  public validateIntegrity(): boolean {
    let forwardCount = 0;
    let previous: ListNode<T> | null = null;
    for (let cursor = this.headNode; cursor !== null; cursor = cursor.next) {
      if (cursor.previous !== previous || cursor.owner !== this) {
        return false;
      }
      previous = cursor;
      forwardCount += 1;
      if (forwardCount > this.count) {
        return false;
      }
    }
    if (previous !== this.tailNode || forwardCount !== this.count) {
      return false;
    }
    let backwardCount = 0;
    let following: ListNode<T> | null = null;
    for (let cursor = this.tailNode; cursor !== null; cursor = cursor.previous) {
      if (cursor.next !== following) {
        return false;
      }
      following = cursor;
      backwardCount += 1;
      if (backwardCount > this.count) {
        return false;
      }
    }
    return following === this.headNode && backwardCount === this.count;
  }

  private assertOwned(node: ListNode<T>): void {
    if (node.owner !== this) {
      throw new Error("The node does not belong to this list");
    }
  }

  private linkFirst(node: ListNode<T>): void {
    node.previous = null;
    node.next = this.headNode;
    node.owner = this;
    if (this.headNode !== null) {
      this.headNode.previous = node;
    } else {
      this.tailNode = node;
    }
    this.headNode = node;
    this.count += 1;
  }

  private linkLast(node: ListNode<T>): void {
    node.next = null;
    node.previous = this.tailNode;
    node.owner = this;
    if (this.tailNode !== null) {
      this.tailNode.next = node;
    } else {
      this.headNode = node;
    }
    this.tailNode = node;
    this.count += 1;
  }

  private linkBefore(node: ListNode<T>, reference: ListNode<T>): void {
    const before = reference.previous;
    node.previous = before;
    node.next = reference;
    node.owner = this;
    reference.previous = node;
    if (before !== null) {
      before.next = node;
    } else {
      this.headNode = node;
    }
    this.count += 1;
  }

  private linkAfter(node: ListNode<T>, reference: ListNode<T>): void {
    const after = reference.next;
    node.next = after;
    node.previous = reference;
    node.owner = this;
    reference.next = node;
    if (after !== null) {
      after.previous = node;
    } else {
      this.tailNode = node;
    }
    this.count += 1;
  }

  private unlink(node: ListNode<T>): void {
    const before = node.previous;
    const after = node.next;
    if (before !== null) {
      before.next = after;
    } else {
      this.headNode = after;
    }
    if (after !== null) {
      after.previous = before;
    } else {
      this.tailNode = before;
    }
    node.previous = null;
    node.next = null;
    node.owner = null;
    this.count -= 1;
  }
}
