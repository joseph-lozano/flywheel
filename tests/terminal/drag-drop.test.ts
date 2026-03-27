import { describe, expect, it } from "vitest";
import { getImagePathsFromDrop } from "../../src/terminal/drag-drop";

/** Build a duck-typed FileList from plain objects. */
function makeFileList(files: Array<{ name: string; path: string }>): FileList {
  const fileObjs = files.map(({ name, path }) => {
    const f = new File([], name) as File & { path: string };
    Object.defineProperty(f, "path", { value: path, writable: false });
    return f;
  });
  const list: Record<string, unknown> = {
    length: fileObjs.length,
    item: (i: number) => fileObjs[i] ?? null,
    [Symbol.iterator]: function* () {
      yield* fileObjs;
    },
  };
  fileObjs.forEach((f, i) => {
    list[i] = f;
  });
  return list as unknown as FileList;
}

describe("getImagePathsFromDrop", () => {
  it("returns paths for all supported image extensions", () => {
    const fileList = makeFileList([
      { name: "photo.png", path: "/Users/me/photo.png" },
      { name: "diagram.svg", path: "/Users/me/diagram.svg" },
      { name: "anim.gif", path: "/Users/me/anim.gif" },
      { name: "shot.jpg", path: "/Users/me/shot.jpg" },
      { name: "render.jpeg", path: "/Users/me/render.jpeg" },
      { name: "hero.webp", path: "/Users/me/hero.webp" },
    ]);
    expect(getImagePathsFromDrop(fileList)).toEqual([
      "/Users/me/photo.png",
      "/Users/me/diagram.svg",
      "/Users/me/anim.gif",
      "/Users/me/shot.jpg",
      "/Users/me/render.jpeg",
      "/Users/me/hero.webp",
    ]);
  });

  it("excludes non-image files", () => {
    const fileList = makeFileList([
      { name: "notes.txt", path: "/Users/me/notes.txt" },
      { name: "script.py", path: "/Users/me/script.py" },
      { name: "archive.zip", path: "/Users/me/archive.zip" },
    ]);
    expect(getImagePathsFromDrop(fileList)).toEqual([]);
  });

  it("handles mixed image and non-image files", () => {
    const fileList = makeFileList([
      { name: "screenshot.jpg", path: "/tmp/screenshot.jpg" },
      { name: "readme.md", path: "/tmp/readme.md" },
      { name: "logo.webp", path: "/tmp/logo.webp" },
    ]);
    expect(getImagePathsFromDrop(fileList)).toEqual(["/tmp/screenshot.jpg", "/tmp/logo.webp"]);
  });

  it("is case-insensitive for file extensions", () => {
    const fileList = makeFileList([
      { name: "IMAGE.PNG", path: "/home/user/IMAGE.PNG" },
      { name: "PHOTO.JPG", path: "/home/user/PHOTO.JPG" },
    ]);
    expect(getImagePathsFromDrop(fileList)).toEqual([
      "/home/user/IMAGE.PNG",
      "/home/user/PHOTO.JPG",
    ]);
  });

  it("returns empty array for empty file list", () => {
    const fileList = makeFileList([]);
    expect(getImagePathsFromDrop(fileList)).toEqual([]);
  });

  it("skips files with no path (non-Electron environments)", () => {
    const fileList = makeFileList([{ name: "ghost.png", path: "" }]);
    expect(getImagePathsFromDrop(fileList)).toEqual([]);
  });

  it("skips files with no extension", () => {
    const fileList = makeFileList([{ name: "Makefile", path: "/home/user/Makefile" }]);
    expect(getImagePathsFromDrop(fileList)).toEqual([]);
  });

  it("preserves drop order for multiple images", () => {
    const fileList = makeFileList([
      { name: "c.png", path: "/tmp/c.png" },
      { name: "a.jpg", path: "/tmp/a.jpg" },
      { name: "b.gif", path: "/tmp/b.gif" },
    ]);
    expect(getImagePathsFromDrop(fileList)).toEqual(["/tmp/c.png", "/tmp/a.jpg", "/tmp/b.gif"]);
  });
});
