import type { Grade } from "@/types";

/** One line of a list as it really is. No model: something the list holds that a quote does not cover. */
export type Truth = { model?: string; storage?: string; ram?: string; cpu?: string; grade?: Grade; qty: number };

export type StressList = {
  name: string;
  family: string;
  /** Pasted or text-file content. */
  text?: string;
  /** A text file in another encoding. */
  bytes?: ArrayBuffer;
  /** An Excel sheet, cells as read-excel-file gives them. */
  matrix?: (string | number)[][];
  truth: Truth[];
};
