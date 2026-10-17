import * as FileSystem from 'expo-file-system/legacy';
import {createPreferencesStore} from './preferences';
const mode = process.env.EXPO_PUBLIC_APP_MODE === 'staff' ? 'staff' : 'guest';
function file() {
  if (!FileSystem.documentDirectory) throw new Error('Preferences storage unavailable');
  return `${FileSystem.documentDirectory}views-${mode}-preferences-v1.json`;
}
export const preferencesStore = createPreferencesStore({
  async read() {
    const uri = file();
    if (!(await FileSystem.getInfoAsync(uri)).exists) return null;
    return FileSystem.readAsStringAsync(uri);
  },
  async write(value) {
    const uri = file();
    await FileSystem.writeAsStringAsync(`${uri}.tmp`, value);
    await FileSystem.moveAsync({from: `${uri}.tmp`, to: uri});
  },
});
