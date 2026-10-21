import { act } from "@testing-library/react";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  getNearestEditorFromDOMNode,
} from "lexical";
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}
/** jsdom has no native contenteditable editing; use the editor's public API. */
export function fillEditor(element: HTMLElement, value: string) {
  act(() =>
    getNearestEditorFromDOMNode(element)!.update(
      () => {
        const text = $createTextNode(value);
        $getRoot().clear().append($createParagraphNode().append(text));
        text.selectEnd();
      },
      { discrete: true },
    ),
  );
}
export function selectEditor(element: HTMLElement, start: number, end: number) {
  act(() =>
    getNearestEditorFromDOMNode(element)!.update(
      () => {
        $getRoot().getAllTextNodes()[0].select(start, end);
      },
      { discrete: true },
    ),
  );
}
