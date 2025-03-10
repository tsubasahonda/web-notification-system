// 通知の種類
export interface Notification {
  id: string;
  title: string;
  body: string;
  type?: string;
  timestamp: number;
  read: boolean;
  readIndex?: number; // IndexedDBのインデックス用（0=未読, 1=既読）
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

// IndexedDB関連の定数
const DB_NAME = "NotificationSystem";
const DB_VERSION = 1;
const STORE_NAME = "notifications";

// 共有データベース接続（テスト間で再利用可能）
let sharedDBConnection: IDBDatabase | null = null;

// IndexedDBを開く
export async function openDatabase(): Promise<IDBDatabase> {
  // 既存の接続があれば再利用
  if (
    sharedDBConnection &&
    sharedDBConnection.objectStoreNames.contains(STORE_NAME)
  ) {
    return sharedDBConnection;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("IndexedDBを開けませんでした:", event);
      reject(new Error("データベースを開けませんでした"));
    };

    request.onsuccess = (event) => {
      sharedDBConnection = (event.target as IDBOpenDBRequest).result;
      resolve(sharedDBConnection);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // オブジェクトストアが存在しない場合は作成
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("readIndex", "readIndex", { unique: false }); // 数値インデックス（0=未読, 1=既読）
      }
    };
  });
}

// Service Workerの登録
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if ("serviceWorker" in navigator) {
    try {
      const registration = await navigator.serviceWorker.register(
        "/service-worker.js"
      );
      console.log("Service Worker登録成功:", registration.scope);
      return registration;
    } catch (error) {
      console.error("Service Worker登録失敗:", error);
      return null;
    }
  }
  return null;
}

// プッシュ通知の許可を要求
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    console.error("このブラウザは通知をサポートしていません");
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  return false;
}

// プッシュサブスクリプションを取得してサーバーに送信
export async function subscribeToPushNotifications(
  registration: ServiceWorkerRegistration
) {
  try {
    // サーバーからVAPID公開キーを取得
    const response = await fetch("http://localhost:4000/api/vapid-public-key");
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
      applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
    });

    // サブスクリプション情報をサーバーに送信
    await fetch("http://localhost:4000/api/notifications/subscribe", {
      method: "POST",
      body: JSON.stringify(subscription),
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log("Push通知サブスクリプション成功");
    return subscription;
  } catch (error) {
    console.error("Push通知サブスクリプション失敗:", error);
    return null;
  }
}

// テスト通知を送信
export async function sendTestNotification() {
  try {
    const response = await fetch(
      "http://localhost:4000/api/send-notification",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "テスト通知",
          body: "通知システムのテストです。正常に動作しています。",
          url: "/",
        }),
      }
    );

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("テスト通知の送信に失敗:", error);
    throw error;
  }
}

// 通知履歴をIndexedDBから取得
export async function getNotificationHistory(): Promise<Notification[]> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("timestamp");
      const request = index.openCursor(null, "prev"); // 最新のものから取得

      const notifications: Notification[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;

        if (cursor) {
          notifications.push(cursor.value);
          cursor.continue();
        } else {
          resolve(notifications);
        }
      };

      request.onerror = (event) => {
        console.error("通知履歴の取得に失敗しました:", event);
        reject(new Error("通知履歴の取得に失敗しました"));
      };

      transaction.oncomplete = () => {
        // DB接続はクローズしない（共有接続を使用）
      };
    });
  } catch (error) {
    console.error("通知履歴の取得に失敗しました:", error);
    return [];
  }
}

// 通知をIndexedDBに保存
export async function saveNotificationToHistory(
  notification: Omit<Notification, "read">
): Promise<{ history: Notification[]; unreadCount: number }> {
  try {
    const db = await openDatabase();

    // 新しい通知オブジェクトを作成
    const newNotification: Notification = {
      ...notification,
      id: notification.id || generateId(),
      timestamp: notification.timestamp || Date.now(),
      read: false, // 未読フラグ
      readIndex: 0, // 未読用の数値インデックス
    };

    // 保存処理
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      const addRequest = store.add(newNotification);

      addRequest.onsuccess = () => {
        resolve();
      };

      addRequest.onerror = (event) => {
        console.error("通知の保存に失敗しました:", event);
        reject(new Error("通知の保存に失敗しました"));
      };

      transaction.oncomplete = () => {
        // DB接続はクローズしない（共有接続を使用）
      };
    });

    // 履歴の最大数を超えた場合、古いものを削除
    await trimNotificationHistory();

    // 更新後の履歴を取得
    const history = await getNotificationHistory();
    const unreadCount = await getUnreadCount();

    return { history, unreadCount };
  } catch (error) {
    console.error("通知履歴の保存に失敗しました:", error);
    const history = await getNotificationHistory();
    const unreadCount = await getUnreadCount();
    return { history, unreadCount: unreadCount };
  }
}

// 通知履歴のサイズを制限する
async function trimNotificationHistory(): Promise<void> {
  try {
    const db = await openDatabase();

    const history = await getNotificationHistory();

    if (history.length <= MAX_NOTIFICATION_HISTORY) {
      return;
    }

    // 最大数を超える古い通知を削除
    const notificationsToDelete = history.slice(MAX_NOTIFICATION_HISTORY);

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      let completed = 0;
      let failed = false;

      notificationsToDelete.forEach((notification) => {
        const request = store.delete(notification.id);

        request.onsuccess = () => {
          completed++;
          if (completed === notificationsToDelete.length && !failed) {
            resolve();
          }
        };

        request.onerror = (event) => {
          if (!failed) {
            failed = true;
            console.error("通知の削除に失敗しました:", event);
            reject(new Error("通知の削除に失敗しました"));
          }
        };
      });

      transaction.oncomplete = () => {
        // DB接続はクローズしない（共有接続を使用）
      };
    });
  } catch (error) {
    console.error("通知履歴のトリミングに失敗しました:", error);
  }
}

// 通知を既読にする
export async function markNotificationAsRead(
  notificationId: string
): Promise<{ history: Notification[]; unreadCount: number }> {
  try {
    const db = await openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      const getRequest = store.get(notificationId);

      getRequest.onsuccess = () => {
        const notification = getRequest.result;
        if (notification) {
          notification.read = true;
          notification.readIndex = 1; // 既読用の数値インデックス
          store.put(notification);
          resolve();
        } else {
          reject(new Error("指定された通知が見つかりませんでした"));
        }
      };

      getRequest.onerror = (event) => {
        console.error("通知の取得に失敗しました:", event);
        reject(new Error("通知の取得に失敗しました"));
      };

      transaction.oncomplete = () => {
        // DB接続はクローズしない（共有接続を使用）
      };
    });

    // 更新後の履歴を取得
    const history = await getNotificationHistory();
    const unreadCount = await getUnreadCount();

    return { history, unreadCount };
  } catch (error) {
    console.error("通知の既読処理に失敗しました:", error);
    const history = await getNotificationHistory();
    const unreadCount = await getUnreadCount();
    return { history, unreadCount };
  }
}

// すべての通知を既読にする
export async function markAllNotificationsAsRead(): Promise<{
  history: Notification[];
  unreadCount: number;
}> {
  try {
    const db = await openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("readIndex");
      const range = IDBKeyRange.only(0); // 未読の通知のみを対象（readIndex=0）

      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;

        if (cursor) {
          const notification = cursor.value;
          notification.read = true;
          notification.readIndex = 1; // 既読用の数値インデックス
          cursor.update(notification);
          cursor.continue();
        } else {
          resolve();
        }
      };

      request.onerror = (event) => {
        console.error("通知の取得に失敗しました:", event);
        reject(new Error("通知の取得に失敗しました"));
      };

      transaction.oncomplete = () => {
        // DB接続はクローズしない（共有接続を使用）
      };
    });

    // 更新後の履歴を取得
    const history = await getNotificationHistory();

    return { history, unreadCount: 0 };
  } catch (error) {
    console.error("全通知の既読処理に失敗しました:", error);
    const history = await getNotificationHistory();
    const unreadCount = await getUnreadCount();
    return { history, unreadCount };
  }
}

// 通知を削除する
export async function deleteNotification(
  notificationId: string
): Promise<{ history: Notification[]; unreadCount: number }> {
  try {
    const db = await openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      const deleteRequest = store.delete(notificationId);

      deleteRequest.onsuccess = () => {
        resolve();
      };

      deleteRequest.onerror = (event) => {
        console.error("通知の削除に失敗しました:", event);
        reject(new Error("通知の削除に失敗しました"));
      };

      transaction.oncomplete = () => {
        // DB接続はクローズしない（共有接続を使用）
      };
    });

    // 更新後の履歴を取得
    const history = await getNotificationHistory();
    const unreadCount = await getUnreadCount();

    return { history, unreadCount };
  } catch (error) {
    console.error("通知の削除に失敗しました:", error);
    const history = await getNotificationHistory();
    const unreadCount = await getUnreadCount();
    return { history, unreadCount };
  }
}

// すべての通知を削除する
export async function clearNotificationHistory(): Promise<{
  history: Notification[];
  unreadCount: number;
}> {
  try {
    const db = await openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);

      const clearRequest = store.clear();

      clearRequest.onsuccess = () => {
        resolve();
      };

      clearRequest.onerror = (event) => {
        console.error("通知履歴のクリアに失敗しました:", event);
        reject(new Error("通知履歴のクリアに失敗しました"));
      };

      transaction.oncomplete = () => {
        // DB接続はクローズしない（共有接続を使用）
      };
    });

    return { history: [], unreadCount: 0 };
  } catch (error) {
    console.error("通知履歴のクリアに失敗しました:", error);
    const history = await getNotificationHistory();
    const unreadCount = await getUnreadCount();
    return { history, unreadCount };
  }
}

// 未読の通知数を取得
export async function getUnreadCount(): Promise<number> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index("readIndex");
      const range = IDBKeyRange.only(0); // 未読の通知のみを対象（readIndex=0）

      const countRequest = index.count(range);

      countRequest.onsuccess = () => {
        resolve(countRequest.result);
      };

      countRequest.onerror = (event) => {
        console.error("未読通知数の取得に失敗しました:", event);
        reject(new Error("未読通知数の取得に失敗しました"));
      };

      transaction.oncomplete = () => {
        // DB接続はクローズしない（共有接続を使用）
      };
    });
  } catch (error) {
    console.error("未読通知数の取得に失敗しました:", error);
    return 0;
  }
}

// Base64文字列をUint8Arrayに変換するユーティリティ関数
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

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

// テスト用：データベース接続をクローズする
export function closeDatabase(): void {
  if (sharedDBConnection) {
    sharedDBConnection.close();
    sharedDBConnection = null;
  }
}
