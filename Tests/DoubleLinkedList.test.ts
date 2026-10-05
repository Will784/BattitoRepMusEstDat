import { test } from "node:test";
import assert from "node:assert/strict";
import { DoubleLinkedList } from "../Source/Structures/DoubleLinkedList";

function build(values: string[]): DoubleLinkedList<string> {
  const list = new DoubleLinkedList<string>();
  for (const value of values) {
    list.insertLast(value);
  }
  return list;
}

function assertConsistent(list: DoubleLinkedList<string>, expected: string[]): void {
  assert.deepEqual(list.snapshotForward(), expected);
  assert.deepEqual(list.snapshotBackward(), [...expected].reverse());
  assert.equal(list.size, expected.length);
  assert.equal(list.validateIntegrity(), true);
  assert.equal(list.head?.value ?? null, expected[0] ?? null);
  assert.equal(list.tail?.value ?? null, expected[expected.length - 1] ?? null);
  assert.equal(list.head?.previous ?? null, null);
  assert.equal(list.tail?.next ?? null, null);
}

test("InsertFirst keeps head, tail and pointers", () => {
  const list = new DoubleLinkedList<string>();
  list.insertFirst("B");
  assertConsistent(list, ["B"]);
  list.insertFirst("A");
  assertConsistent(list, ["A", "B"]);
  assert.equal(list.head?.next, list.tail);
  assert.equal(list.tail?.previous, list.head);
});

test("InsertLast keeps head, tail and pointers", () => {
  const list = new DoubleLinkedList<string>();
  list.insertLast("A");
  list.insertLast("B");
  list.insertLast("C");
  assertConsistent(list, ["A", "B", "C"]);
});

test("InsertBetween places the node between neighbours", () => {
  const list = build(["A", "C"]);
  const reference = list.tail;
  assert.ok(reference);
  const inserted = list.insertBefore(reference, "B");
  assertConsistent(list, ["A", "B", "C"]);
  assert.equal(inserted.previous?.value, "A");
  assert.equal(inserted.next?.value, "C");
  list.insertAfter(inserted, "B2");
  assertConsistent(list, ["A", "B", "B2", "C"]);
  list.insertAt(0, "Z");
  list.insertAt(list.size, "Y");
  assertConsistent(list, ["Z", "A", "B", "B2", "C", "Y"]);
  list.insertAt(3, "M");
  assertConsistent(list, ["Z", "A", "B", "M", "B2", "C", "Y"]);
});

test("RemoveFirst and RemoveLast update head and tail", () => {
  const list = build(["A", "B", "C"]);
  assert.equal(list.removeFirst()?.value, "A");
  assertConsistent(list, ["B", "C"]);
  assert.equal(list.removeLast()?.value, "C");
  assertConsistent(list, ["B"]);
  assert.equal(list.removeLast()?.value, "B");
  assertConsistent(list, []);
  assert.equal(list.removeFirst(), null);
  assert.equal(list.removeLast(), null);
});

test("RemoveNode works for head, middle and tail", () => {
  const list = build(["A", "B", "C", "D"]);
  const middle = list.find((value) => value === "B");
  assert.ok(middle);
  list.removeNode(middle);
  assertConsistent(list, ["A", "C", "D"]);
  assert.equal(middle.owner, null);
  const head = list.head;
  assert.ok(head);
  list.removeNode(head);
  assertConsistent(list, ["C", "D"]);
  const tail = list.tail;
  assert.ok(tail);
  list.removeNode(tail);
  assertConsistent(list, ["C"]);
  assert.throws(() => list.removeNode(middle));
});

test("GetNext and GetPrevious traverse both directions", () => {
  const list = build(["A", "B", "C"]);
  const first = list.head;
  assert.ok(first);
  const second = list.getNext(first);
  assert.equal(second?.value, "B");
  assert.ok(second);
  assert.equal(list.getPrevious(second)?.value, "A");
  assert.equal(list.getPrevious(first), null);
  const last = list.tail;
  assert.ok(last);
  assert.equal(list.getNext(last), null);
  assert.equal(list.getNextCircular(last)?.value, "A");
  assert.equal(list.getPreviousCircular(first)?.value, "C");
});

test("MoveNode rewires pointers for the drag and drop scenario", () => {
  const list = build(["A", "B", "C", "D"]);
  const a = list.find((value) => value === "A");
  const b = list.find((value) => value === "B");
  const d = list.find((value) => value === "D");
  assert.ok(a && b && d);
  list.moveBefore(d, b);
  assertConsistent(list, ["A", "D", "B", "C"]);
  assert.equal(d.previous, a);
  assert.equal(d.next, b);
  list.moveToLast(a);
  assertConsistent(list, ["D", "B", "C", "A"]);
  assert.equal(list.head, d);
  assert.equal(list.tail, a);
  assert.equal(a.previous?.value, "C");
  assert.equal(a.next, null);
  assert.equal(d.previous, null);
});

test("MoveAfter, MoveToFirst and no-op moves stay consistent", () => {
  const list = build(["A", "B", "C", "D"]);
  const a = list.find((value) => value === "A");
  const c = list.find((value) => value === "C");
  const d = list.find((value) => value === "D");
  assert.ok(a && c && d);
  list.moveAfter(a, c);
  assertConsistent(list, ["B", "C", "A", "D"]);
  list.moveToFirst(d);
  assertConsistent(list, ["D", "B", "C", "A"]);
  list.moveBefore(d, d);
  list.moveAfter(d, d);
  list.moveToFirst(d);
  assertConsistent(list, ["D", "B", "C", "A"]);
  const b = list.find((value) => value === "B");
  assert.ok(b);
  list.moveBefore(d, b);
  assertConsistent(list, ["D", "B", "C", "A"]);
});

test("Nodes from another list are rejected", () => {
  const first = build(["A"]);
  const second = build(["B"]);
  const foreign = second.head;
  const own = first.head;
  assert.ok(foreign && own);
  assert.throws(() => first.moveBefore(own, foreign));
  assert.throws(() => first.insertBefore(foreign, "X"));
  assert.throws(() => first.getNext(foreign));
});

test("Random operations preserve integrity", () => {
  const list = new DoubleLinkedList<number>();
  const model: number[] = [];
  let seed = 12345;
  const random = (limit: number): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % limit;
  };
  for (let step = 0; step < 500; step += 1) {
    const action = random(5);
    if (action === 0 || model.length === 0) {
      const index = random(model.length + 1);
      list.insertAt(index, step);
      model.splice(index, 0, step);
    } else if (action === 1) {
      const index = random(model.length);
      const node = list.nodeAt(index);
      assert.ok(node);
      list.removeNode(node);
      model.splice(index, 1);
    } else if (action === 2) {
      const from = random(model.length);
      const to = random(model.length);
      const node = list.nodeAt(from);
      const reference = list.nodeAt(to);
      assert.ok(node && reference);
      list.moveBefore(node, reference);
      if (from !== to) {
        const [value] = model.splice(from, 1);
        const target = model.indexOf(reference.value);
        model.splice(target, 0, value as number);
      }
    } else if (action === 3) {
      const from = random(model.length);
      const node = list.nodeAt(from);
      assert.ok(node);
      list.moveToLast(node);
      const [value] = model.splice(from, 1);
      model.push(value as number);
    } else {
      list.removeFirst();
      model.shift();
    }
    assert.equal(list.validateIntegrity(), true);
    assert.deepEqual(list.snapshotForward(), model);
  }
});
