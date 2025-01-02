export const isValidFileName = (name: string): boolean => {
  // Check if the name is empty or only whitespace
  if (!name || name.trim().length === 0) {
    return false;
  }

  // Check for invalid characters across all platforms
  const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
  if (invalidChars.test(name)) {
    return false;
  }

  // Check for reserved names in Windows
  const windowsReservedNames = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
  if (windowsReservedNames.test(name)) {
    return false;
  }

  // Check for names ending with space or period (problematic on Windows)
  if (name.endsWith(' ') || name.endsWith('.')) {
    return false;
  }

  // Check maximum length (255 is generally safe across platforms)
  if (name.length > 255) {
    return false;
  }

  // If all checks pass, the filename is valid
  return true;
};

export const encodeIsoDateToFilename = (date: Date): string => {
  return date.toISOString().replace(/[-:]/g, '');
};

export const decodeIsoDateFromFilename = (str: string): Date => {
  return new Date(str.replace(/[-:]/g, ''));
};
