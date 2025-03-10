// service-worker.js

// IndexedDB関連の定数
const DB_NAME = 'NotificationSystem';
const DB_VERSION = 1;
const STORE_NAME = 'notifications';
const MAX_NOTIFICATION_HISTORY = 50;

// Service Workerのインストール
self.addEventListener("install", (event) => {
  console.log("Service Workerをインストールしました");
  // Service Workerを即座にアクティブにする
  self.skipWaiting();
});

// Service Workerのアクティベーション
self.addEventListener("activate", (event) => {
  console.log("Service Workerがアクティブになりました");
  // 制御下にあるクライアントを即座に取得
  event.waitUntil(clients.claim());
});

// プッシュ通知の受信処理
self.addEventListener("push", (event) => {
  console.log("プッシュ通知を受信しました");
  if (!event.data) return;

  try {
    // プッシュデータをJSONとして解析
    const payload = event.data.json();
    console.log("プッシュ通知を受信:", payload);

    // 接続テスト用の処理
    if (payload.data && payload.data.type === "connection_test") {
      console.log("疎通テスト通知を受信:", payload.data);

      // クライアントに通知して応答
      event.waitUntil(
        clients
          .matchAll({ type: "window", includeUncontrolled: true })
          .then((clientList) => {
            // 利用可能なクライアントにメッセージを送信
            if (clientList.length > 0) {
              clientList.forEach((client) => {
                client.postMessage({
                  type: "SERVER_SW_CONNECTION_TEST_RESPONSE",
                  testId: payload.data.testId,
                  timestamp: Date.now(),
                  receivedTimestamp: payload.data.timestamp,
                });
              });
            }
          })
      );

      // 疎通テスト通知は表示されないようにする
      return;
    }

    // 通知履歴にIndexedDBに保存
    event.waitUntil(saveNotificationToHistory(payload));

    // 通知を表示
    event.waitUntil(
      self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon || "/notification-icon.png",
        badge: payload.badge || "/notification-badge.png",
        data: payload.data || {},
        actions: payload.actions || [],
        timestamp: payload.timestamp || Date.now(),
      })
    );

    console.log("プッシュ通知の処理が完了しました");
  } catch (error) {
    console.error("プッシュ通知の処理中にエラーが発生しました:", error);
    // テキストとして処理を試みる
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification("新しい通知", {
        body: text,
        icon: "/notification-icon.png",
        timestamp: Date.now(),
      })
    );
  }
});

// 通知クリック時の処理
self.addEventListener("notificationclick", (event) => {
  console.log("通知がクリックされました:", event.notification);

  // 通知を閉じる
  event.notification.close();

  // カスタムデータがあればそれを使用
  const notificationData = event.notification.data;

  // クリック時に開くURL
  let url = "/";
  if (notificationData && notificationData.url) {
    url = notificationData.url;
  }

  // アクション（ボタン）がクリックされた場合
  if (event.action) {
    console.log("通知アクションがクリックされました:", event.action);
    // アクションに応じた処理
    if (notificationData && notificationData.actions) {
      const action = notificationData.actions.find(
        (a) => a.action === event.action
      );
      if (action && action.url) {
        url = action.url;
      }
    }
  }

  // クライアントウィンドウを開くか、既存のウィンドウにフォーカス
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // すでに開いているウィンドウがあるか確認
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            // 既存のウィンドウにフォーカスし、URLを変更
            return client.navigate(url).then((client) => client.focus());
          }
        }

        // 開いているウィンドウがなければ新しく開く
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
      .then(() => {
        // メインアプリケーションに通知クリックのイベントを送る
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: "NOTIFICATION_CLICKED",
              notification: {
                title: event.notification.title,
                body: event.notification.body,
                data: notificationData,
                action: event.action,
              },
            });
          });
        });
      })
  );
});

// 通知を閉じた時のイベント
self.addEventListener("notificationclose", (event) => {
  console.log("通知が閉じられました:", event.notification);
});

// メッセージの受信処理（メインスクリプトから通知表示リクエストを受け取る）
self.addEventListener("message", (event) => {
  console.log("Service Workerがメッセージを受信しました:", event.data);

  // 疎通確認テスト用のメッセージ
  if (event.data && event.data.type === "CONNECTION_TEST") {
    console.log("疎通確認テストメッセージを受信しました:", event.data.id);

    // クライアントに応答を返す
    event.source.postMessage({
      type: "CONNECTION_TEST_RESPONSE",
      id: event.data.id,
      timestamp: Date.now(),
    });

    return;
  }

  if (event.data && event.data.type === "PUSH_NOTIFICATION") {
    const notification = event.data.notification;

    // 通知履歴に保存
    saveNotificationToHistory(notification);

    // 通知を表示
    self.registration.showNotification(notification.title, {
      body: notification.body,
      icon: notification.icon || "/notification-icon.png",
      badge: notification.badge || "/notification-badge.png",
      data: notification.data || {},
      actions: notification.actions || [],
      timestamp: notification.timestamp || Date.now(),
    });
  }
});

// IndexedDBを開く
async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Service Worker: IndexedDBを開けませんでした:', event);
      reject(new Error('データベースを開けませんでした'));
    };

    request.onsuccess = (event) => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;
      
      // オブジェクトストアが存在しない場合は作成
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('readIndex', 'readIndex', { unique: false }); // 数値インデックス（0=未読, 1=既読）
      }
    };
  });
}

// 通知をIndexedDBに保存
async function saveNotificationToHistory(notification) {
  try {
    // データベースを開く
    const db = await openDatabase();
    
    // 新しい通知オブジェクトを作成
    const newNotification = {
      id: notification.id || generateId(),
      title: notification.title,
      body: notification.body,
      type: notification.type,
      timestamp: notification.timestamp || Date.now(),
      read: false,
      readIndex: 0, // 未読用の数値インデックス
      data: notification.data || {},
    };
    
    // 保存処理
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const addRequest = store.add(newNotification);
      
      addRequest.onsuccess = () => {
        resolve();
      };
      
      addRequest.onerror = (event) => {
        console.error('Service Worker: 通知の保存に失敗しました:', event);
        reject(new Error('通知の保存に失敗しました'));
      };
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
    
    // 履歴の最大数を超えた場合、古いものを削除
    await trimNotificationHistory();
    
    // クライアントに通知が更新されたことを通知
    const allClients = await clients.matchAll();
    if (allClients.length > 0) {
      allClients.forEach(client => {
        client.postMessage({
          type: "NOTIFICATION_UPDATED",
          notification: newNotification
        });
      });
    }
    
    return;
  } catch (error) {
    console.error('Service Worker: 通知履歴の保存に失敗しました:', error);
  }
}

// 通知履歴のサイズを制限する
async function trimNotificationHistory() {
  try {
    const db = await openDatabase();
    
    // 全ての通知を取得
    const notifications = await new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.getAll();
      
      request.onsuccess = () => {
        resolve(request.result);
      };
      
      request.onerror = (event) => {
        console.error('Service Worker: 通知履歴の取得に失敗しました:', event);
        reject(new Error('通知履歴の取得に失敗しました'));
      };
    });
    
    // 最大数を超えていなければ何もしない
    if (notifications.length <= MAX_NOTIFICATION_HISTORY) {
      db.close();
      return;
    }
    
    // タイムスタンプでソートして古いものを特定
    notifications.sort((a, b) => b.timestamp - a.timestamp);
    const notificationsToDelete = notifications.slice(MAX_NOTIFICATION_HISTORY);
    
    // 古い通知を削除
    await new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      let completed = 0;
      let failed = false;
      
      notificationsToDelete.forEach(notification => {
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
            console.error('Service Worker: 通知の削除に失敗しました:', event);
            reject(new Error('通知の削除に失敗しました'));
          }
        };
      });
      
      transaction.oncomplete = () => {
        db.close();
      };
    });
  } catch (error) {
    console.error('Service Worker: 通知履歴のトリミングに失敗しました:', error);
  }
}

// 一意のID生成関数
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}