import DeviceInfo from 'react-native-device-info';

/**
 * Returns the device's total RAM in GB. Falls back to a conservative 6 GB
 * if the native module isn't available (e.g., Expo Go without a dev build).
 */
export const getDeviceRamGB = async (): Promise<number> => {
  try {
    const bytes = await DeviceInfo.getTotalMemory();
    if (typeof bytes === 'number' && bytes > 0) {
      // Round to nearest 0.5 GB for display.
      return Math.round((bytes / 1_073_741_824) * 2) / 2;
    }
  } catch {
    // module unavailable
  }
  return 6;
};
