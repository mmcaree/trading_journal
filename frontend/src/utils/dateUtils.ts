/**
 * Date utility functions for consistent date/time handling
 */

/**
 * Format a Date object for use with HTML datetime-local input
 * Returns date in user's local timezone in YYYY-MM-DDTHH:MM format
 */
export function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Get current local date/time formatted for datetime-local input
 */
export function getCurrentLocalDateTime(): string {
  return formatDateTimeLocal(new Date());
}

/**
 * Parse datetime-local input value to ISO string for API
 * Takes local datetime and converts to UTC ISO string
 */
export function parseLocalDateTimeToISO(localDateTime: string): string {
  if (!localDateTime) return new Date().toISOString();
  
  // Create date from local datetime string
  const localDate = new Date(localDateTime);
  return localDate.toISOString();
}