// 通知の種類
export interface Notification {
  id: string;
  title: string;
  body: string;
  type?: string;
  timestamp: number;
  read: boolean;
  data?: {
    url?: string;
    imageUrl?: string;
    category?: string;
    type?: string;
    [key: string]: any;
  };
}

// 通知履歴の最大保存数
const MAX_NOTIFICATION_HISTORY = 50;

// Service Workerの登録
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('Service Worker登録成功:', registration.scope);
      return registration;
    } catch (error) {
      console.error('Service Worker登録失敗:', error);
      return null;
    }
  }
  return null;
}

// プッシュ通知の許可を要求
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    console.error('このブラウザは通知をサポートしていません');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

// プッシュサブスクリプションを取得してサーバーに送信
export async function subscribeToPushNotifications(registration: ServiceWorkerRegistration) {
  try {
    // サーバーからVAPID公開キーを取得
    const response = await fetch('http://localhost:4000/api/vapid-public-key');
    const data = await response.json();
    const publicVapidKey = data.publicKey;

    // 既存のサブスクリプションを確認
    let subscription = await registration.pushManager.getSubscription();

    // 既存のサブスクリプションがあれば解除
    if (subscription) {
      await subscription.unsubscribe();
    }

    // 新しいサブスクリプションを作成
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
    });

    // サブスクリプション情報をサーバーに送信
    await fetch('http://localhost:4000/api/notifications/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription),
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Push通知サブスクリプション成功');
    return subscription;
  } catch (error) {
    console.error('Push通知サブスクリプション失敗:', error);
    return null;
  }
}

// テスト通知を送信
export async function sendTestNotification() {
  try {
    const response = await fetch('http://localhost:4000/api/send-notification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'テスト通知',
        body: '通知システムのテストです。正常に動作しています。',
        url: '/'
      })
    });
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('テスト通知の送信に失敗:', error);
    throw error;
  }
}

// 通知履歴をLocalStorageから取得
export function getNotificationHistory(): Notification[] {
  try {
    const history = localStorage.getItem('notificationHistory');
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.error('通知履歴の取得に失敗しました:', error);
    return [];
  }
}

// 通知をLocalStorageに保存
export function saveNotificationToHistory(notification: Omit<Notification, 'read'>) {
  try {
    // 現在の通知履歴を取得
    let history = getNotificationHistory();
    
    // 新しい通知を先頭に追加
    history.unshift({
      ...notification,
      id: notification.id || generateId(),
      timestamp: notification.timestamp || Date.now(),
      read: false // 未読フラグ
    });
    
    // 最大保存数を超えた場合、古いものから削除
    if (history.length > MAX_NOTIFICATION_HISTORY) {
      history = history.slice(0, MAX_NOTIFICATION_HISTORY);
    }
    
    // LocalStorageに保存
    localStorage.setItem('notificationHistory', JSON.stringify(history));
    
    // 未読の通知数を計算
    const unreadCount = history.filter(n => !n.read).length;
    
    return { history, unreadCount };
  } catch (error) {
    console.error('通知履歴の保存に失敗しました:', error);
    return { history: getNotificationHistory(), unreadCount: 0 };
  }
}

// 通知を既読にする
export function markNotificationAsRead(notificationId: string) {
  try {
    const history = getNotificationHistory();
    
    // 指定されたIDの通知を既読にする
    const updated = history.map(notification => {
      if (notification.id === notificationId) {
        return { ...notification, read: true };
      }
      return notification;
    });
    
    // 更新された履歴を保存
    localStorage.setItem('notificationHistory', JSON.stringify(updated));
    
    // 未読の通知数を計算
    const unreadCount = updated.filter(n => !n.read).length;
    
    return { history: updated, unreadCount };
  } catch (error) {
    console.error('通知の既読処理に失敗しました:', error);
    return { history: getNotificationHistory(), unreadCount: 0 };
  }
}

// すべての通知を既読にする
export function markAllNotificationsAsRead() {
  try {
    const history = getNotificationHistory();
    
    // すべての通知を既読にする
    const updated = history.map(notification => ({ ...notification, read: true }));
    
    // 更新された履歴を保存
    localStorage.setItem('notificationHistory', JSON.stringify(updated));
    
    return { history: updated, unreadCount: 0 };
  } catch (error) {
    console.error('全通知の既読処理に失敗しました:', error);
    return { history: getNotificationHistory(), unreadCount: 0 };
  }
}

// 通知を削除する
export function deleteNotification(notificationId: string) {
  try {
    let history = getNotificationHistory();
    
    // 指定されたIDの通知を除外
    history = history.filter(notification => notification.id !== notificationId);
    
    // 更新された履歴を保存
    localStorage.setItem('notificationHistory', JSON.stringify(history));
    
    // 未読の通知数を計算
    const unreadCount = history.filter(n => !n.read).length;
    
    return { history, unreadCount };
  } catch (error) {
    console.error('通知の削除に失敗しました:', error);
    return { history: getNotificationHistory(), unreadCount: 0 };
  }
}

// すべての通知を削除する
export function clearNotificationHistory() {
  try {
    localStorage.setItem('notificationHistory', JSON.stringify([]));
    return { history: [], unreadCount: 0 };
  } catch (error) {
    console.error('通知履歴のクリアに失敗しました:', error);
    return { history: getNotificationHistory(), unreadCount: 0 };
  }
}

// 未読の通知数を取得
export function getUnreadCount(): number {
  const history = getNotificationHistory();
  return history.filter(notification => !notification.read).length;
}

// Base64文字列をUint8Arrayに変換するユーティリティ関数
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  
  return outputArray;
}

// 一意のID生成関数
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}