/**
 * Utility helper functions
 */

/**
 * Format a date string for commit messages
 */
export function formatDate(date: Date = new Date()): string {
  return date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
}

/**
 * Generate a commit message with template
 */
export function generateCommitMessage(template: string): string {
  const now = new Date();

  return template
    .replace(/\{\{date\}\}/g, formatDate(now))
    .replace(/\{\{datetime\}\}/g, formatDate(now))
    .replace(/\{\{timestamp\}\}/g, now.getTime().toString())
    .replace(/\{\{isoDate\}\}/g, now.toISOString())
    .replace(/\{\{time\}\}/g, now.toTimeString().split(' ')[0]);
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Pluralize a word
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural || singular + 's');
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if a path should be excluded based on patterns
 */
export function shouldExclude(path: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    // Simple glob-like matching
    const regex = new RegExp(
      '^' + pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '.') + '$'
    );
    if (regex.test(path)) {
      return true;
    }
  }
  return false;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, char => map[char]);
}