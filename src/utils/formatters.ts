/**
 * Formats a Date object for display.
 * @param date The date to format
 * @param precise If true, shows exact date/time for file decision contexts
 * @returns Human-readable time string
 */
export function formatTime(date: Date, precise = false): string {
  // For precise mode (file decisions), show exact timestamp
  if (precise) {
    return date.toLocaleString();
  }

  // For general display, use relative times
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // Handle future dates
  if (diffMs < 0) {
    return "recently";
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) {
    return "recently";
  } else if (diffHours === 1) {
    return "1 hour ago";
  } else if (diffHours < 24) {
    return `${diffHours} hours ago`;
  } else if (diffDays === 1) {
    return "1 day ago";
  } else {
    return `${diffDays} days ago`;
  }
}
