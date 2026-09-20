export interface RevealPosition {
  line: number;
  column: number;
}

export function positionForResult(line: number, column: number): RevealPosition {
  return { line: Math.max(1, line), column: Math.max(1, column) };
}
