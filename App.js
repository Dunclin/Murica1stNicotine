import React, { useEffect, useState } from 'react';
import { Text, View, Button, Platform, Alert, FlatList, SafeAreaView } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

const SERVER = 'http://YOUR_PUBLIC_SERVER_URL:8080'; // <- change to your server (ngrok, Render, Railway, etc.)

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false })
});

export default function App() {
  const [token, setToken] = useState(null);
  const [log, setLog] = useState([]);

  useEffect(() => {
    registerForPush().then(async (t) => {
      if (!t) return;
      setToken(t);
      try {
        await fetch(`${SERVER}/api/register-device`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: t })
        });
      } catch (e) { console.warn('register-device failed', e); }
    });

    const sub1 = Notifications.addNotificationReceivedListener(n => {
      setLog((l) => [{ id: Date.now().toString(), title: n.request.content.title, body: n.request.content.body }, ...l]);
    });
    const sub2 = Notifications.addNotificationResponseReceivedListener(r => {
      // Optionally handle tap action
    });
    return () => { sub1.remove(); sub2.remove(); };
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: 'bold' }}>Courier App</Text>
        <Text style={{ marginTop: 6 }}>Push Token:</Text>
        <Text selectable style={{ color: '#0369a1' }}>{token || '—'}</Text>
        <View style={{ height: 12 }} />
        <Button title="Test local notif" onPress={async () => {
          await Notifications.scheduleNotificationAsync({ content: { title: 'Test', body: 'Hello from device' }, trigger: null });
        }} />
      </View>

      <View style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
        <Text style={{ fontWeight: 'bold' }}>Incoming Orders</Text>
      </View>
      <FlatList
        data={log}
        keyExtractor={(it) => it.id}
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}>
            <Text style={{ fontWeight: '600' }}>{item.title}</Text>
            <Text style={{ color: '#555' }}>{item.body}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

async function registerForPush() {
  if (!Device.isDevice) { Alert.alert('Use a physical device for push'); return null; }
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') { Alert.alert('Permission required for notifications'); return null; }

  // Read projectId from app.json -> expo.extra.eas.projectId
  const projectId = Constants?.expoConfig?.extra?.eas?.projectId;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data; // ExponentPushToken[...]
  } catch (e) {
    Alert.alert('Token error', (e && e.message) || String(e));
    return null;
  }
}
