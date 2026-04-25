import { initTestDb, resetDb } from '../db';
import { getSetting, setSetting, getAllSettings, DEFAULT_SETTINGS } from '../settings';

beforeEach(async () => {
  resetDb();
  await initTestDb();
});

describe('settings repo', () => {
  it('returns default when key missing', async () => {
    expect(await getSetting('temperature')).toBe(DEFAULT_SETTINGS.temperature);
    expect(await getSetting('theme')).toBe(DEFAULT_SETTINGS.theme);
  });

  it('round-trips a number', async () => {
    await setSetting('temperature', 0.4);
    expect(await getSetting('temperature')).toBe(0.4);
  });

  it('round-trips a string', async () => {
    await setSetting('default_system_prompt', 'be concise');
    expect(await getSetting('default_system_prompt')).toBe('be concise');
  });

  it('round-trips null', async () => {
    await setSetting('active_model_id', null);
    expect(await getSetting('active_model_id')).toBeNull();
  });

  it('getAllSettings merges defaults and stored', async () => {
    await setSetting('temperature', 0.2);
    const all = await getAllSettings();
    expect(all.temperature).toBe(0.2);
    expect(all.theme).toBe(DEFAULT_SETTINGS.theme);
  });
});
