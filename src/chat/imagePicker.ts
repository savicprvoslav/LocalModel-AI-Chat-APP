/**
 * Thin wrapper around expo-image-picker so the rest of the app deals with a
 * stable, narrowly-typed result shape and doesn't have to know about the
 * picker's permission flow.
 *
 * Permissions: iOS reads NSCameraUsageDescription / NSPhotoLibraryUsageDescription
 * from Info.plist. Make sure those strings are set (added in app.json) before
 * the first device build, or the OS will reject the request silently.
 */
import * as ImagePicker from 'expo-image-picker';

export type PickedImage = {
  uri: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  source: 'camera' | 'library';
};

const toPicked = (
  asset: ImagePicker.ImagePickerAsset,
  source: 'camera' | 'library'
): PickedImage => ({
  uri: asset.uri,
  mimeType: asset.mimeType ?? 'image/jpeg',
  width: typeof asset.width === 'number' ? asset.width : null,
  height: typeof asset.height === 'number' ? asset.height : null,
  source
});

/** Opens the camera. Returns null if the user cancels or denies permission. */
export const captureFromCamera = async (): Promise<PickedImage | null> => {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.85,
    allowsEditing: false,
    exif: false
  });
  if (result.canceled || result.assets.length === 0) return null;
  return toPicked(result.assets[0]!, 'camera');
};

/** Opens the photo library. Returns null if the user cancels or denies permission. */
export const pickFromLibrary = async (): Promise<PickedImage | null> => {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.85,
    allowsEditing: false,
    exif: false
  });
  if (result.canceled || result.assets.length === 0) return null;
  return toPicked(result.assets[0]!, 'library');
};
