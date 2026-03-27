import { describe, expect, it } from "vitest";
import { shellEscape } from "../../src/terminal/shell-escape";

describe("shellEscape", () => {
  it("returns clean paths unchanged", () => {
    expect(shellEscape("/usr/local/bin/node")).toBe("/usr/local/bin/node");
  });

  it("escapes spaces", () => {
    expect(shellEscape("/Users/joe/My Photos/img.png")).toBe("/Users/joe/My\\ Photos/img.png");
  });

  it("escapes parentheses", () => {
    expect(shellEscape("/tmp/image (1).png")).toBe("/tmp/image\\ \\(1\\).png");
  });

  it("escapes single quotes", () => {
    expect(shellEscape("/tmp/it's a file.txt")).toBe("/tmp/it\\'s\\ a\\ file.txt");
  });

  it("escapes dollar signs and backticks", () => {
    expect(shellEscape("/tmp/$HOME/`whoami`")).toBe("/tmp/\\$HOME/\\`whoami\\`");
  });

  it("escapes multiple special characters", () => {
    expect(shellEscape("/tmp/a & b; c | d")).toBe("/tmp/a\\ \\&\\ b\\;\\ c\\ \\|\\ d");
  });

  it("escapes backslashes", () => {
    expect(shellEscape("/tmp/back\\slash")).toBe("/tmp/back\\\\slash");
  });

  it("escapes exclamation marks", () => {
    expect(shellEscape("/tmp/wow!.txt")).toBe("/tmp/wow\\!.txt");
  });

  it("escapes hash, tilde, braces, brackets", () => {
    expect(shellEscape("/tmp/~/#/{a}/[b]")).toBe("/tmp/\\~/\\#/\\{a\\}/\\[b\\]");
  });

  it("escapes double quotes", () => {
    expect(shellEscape('/tmp/"quoted"')).toBe('/tmp/\\"quoted\\"');
  });

  it("escapes angle brackets", () => {
    expect(shellEscape("/tmp/<in>")).toBe("/tmp/\\<in\\>");
  });

  it("escapes asterisks and question marks", () => {
    expect(shellEscape("/tmp/*.txt")).toBe("/tmp/\\*.txt");
    expect(shellEscape("/tmp/file?.txt")).toBe("/tmp/file\\?.txt");
  });
});
