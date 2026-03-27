/** Backslash-escape shell metacharacters in a file path. */
export function shellEscape(path: string): string {
  return path.replace(/([\\"'$`*?|();& <>#~{}\[\]!\t\n\r ])/g, "\\$1");
}
