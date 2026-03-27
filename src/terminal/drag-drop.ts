const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);

// Electron extends File with an absolute filesystem path.
export interface ElectronFile extends File {
  path: string;
}

/**
 * Given the FileList from a drop event, returns the absolute paths of any
 * files whose extension is a supported image format.
 *
 * Multiple paths are returned in drop order so the caller can join them
 * (e.g. space-separated) for terminal input.
 */
export function getImagePathsFromDrop(files: FileList): string[] {
  const paths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i] as ElectronFile;
    if (!file.path) continue;
    const dotIndex = file.name.lastIndexOf(".");
    if (dotIndex === -1) continue;
    const ext = file.name.slice(dotIndex).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) {
      paths.push(file.path);
    }
  }
  return paths;
}
