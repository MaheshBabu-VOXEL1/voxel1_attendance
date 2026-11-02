import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { supabase } from './supabase';

let token: string | undefined;
let currentUser: string | undefined;
let generation = 0;
let pendingSave: Promise<void> = Promise.resolve();

export async function startNativePush(userId: string): Promise<() => void> {
  if (!Capacitor.isNativePlatform()) return () => {};
  const run = ++generation;
  currentUser = userId;
  const handles: Array<{ remove: () => Promise<void> }> = [];
  const save = (value: string) => {
    token = value;
    pendingSave = pendingSave.then(async () => {
      if (run !== generation || currentUser !== userId) return;
      const { error } = await supabase.rpc('register_mobile_push', { p_token: value });
      if (error) console.warn('[Push] Could not register device:', error.message);
    });
  };
  try {
    handles.push(await PushNotifications.addListener('registration', result => save(result.value)));
    handles.push(await PushNotifications.addListener('registrationError', () => console.warn('[Push] Device registration failed')));
    handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', result => {
      if (currentUser === result.notification.data?.user_id) window.location.hash = '#/dashboard';
    }));
    let permission = await PushNotifications.checkPermissions();
    if (permission.receive === 'prompt') permission = await PushNotifications.requestPermissions();
    if (permission.receive === 'granted' && run === generation) {
      await PushNotifications.createChannel({ id: 'voxel1_activity', name: 'Tasks, leave and attendance', importance: 4, visibility: 0 });
      await PushNotifications.register();
    }
  } catch (error) {
    console.warn('[Push] Setup unavailable:', error);
  }
  return () => {
    if (run === generation) { generation++; currentUser = undefined; }
    handles.forEach(handle => void handle.remove());
  };
}

export async function unregisterNativePush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  generation++;
  currentUser = undefined;
  await pendingSave;
  if (token) {
    const { error } = await supabase.rpc('unregister_mobile_push', { p_token: token });
    if (error) throw new Error('Unable to disconnect phone notifications. Please retry sign out.');
    token = undefined;
  }
  await PushNotifications.removeAllDeliveredNotifications();
}
