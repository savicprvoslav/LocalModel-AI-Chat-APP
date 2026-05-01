import type { Tool } from './types';

export const currentTimeTool: Tool = {
  id: 'current_time',
  name: 'Current time',
  description:
    'Return the current local date and time. Use when the user asks about today, now, or anything time-relative.',
  params: [
    {
      name: 'timezone',
      type: 'string',
      required: false,
      description:
        'Optional IANA timezone name (e.g. "Europe/London"). Defaults to the device timezone.'
    }
  ],
  network: false,
  run: async (args) => {
    const tz = typeof args.timezone === 'string' && args.timezone.trim() ? args.timezone : undefined;
    const now = new Date();
    let formatted: string;
    try {
      const fmt = new Intl.DateTimeFormat('en-CA', {
        ...(tz ? { timeZone: tz } : {}),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZoneName: 'short'
      });
      formatted = fmt.format(now);
    } catch (e) {
      throw new Error(`invalid timezone: ${e instanceof Error ? e.message : String(e)}`);
    }
    return formatted;
  }
};
