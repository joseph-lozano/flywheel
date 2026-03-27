/** Backslash-escape shell metacharacters in a file path. */
export function shellEscape(path: string): string {
  return path.replace(/([\\"'$`*?|();& <>#~{}\[\]! ])/g, "\\$1");
}
