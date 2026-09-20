export function splitLines(content: string) {
  return content.split(/\r\n|\r|\n/);
}

export function lineCount(content: string) {
  return splitLines(content).length;
}
