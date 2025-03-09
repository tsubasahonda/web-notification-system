// service-worker.js

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

    // 通知履歴をLocalStorageに保存
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

// LocalStorageを使用するためのヘルパー関数
// ServiceWorkerはLocalStorageに直接アクセスできないため、クライアントを経由する必要がある
async function saveNotificationToHistory(notification) {
  // すべてのクライアントを取得
  const allClients = await clients.matchAll();

  if (allClients.length > 0) {
    // LocalStorageに保存するための処理を一つのクライアントに委託
    allClients[0].postMessage({
      type: "SAVE_NOTIFICATION",
      notification: {
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        timestamp: notification.timestamp || Date.now(),
      },
    });
  } else {
    // アクティブなクライアントがない場合はIndexedDBに保存する
    // （この例ではIndexedDBの実装は省略）
    console.log(
      "アクティブなクライアントがないため、通知履歴を保存できませんでした"
    );
  }
}
