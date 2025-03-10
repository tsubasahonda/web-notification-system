import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getNotificationHistory,
  saveNotificationToHistory,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  clearNotificationHistory,
  urlBase64ToUint8Array,
  generateId,
  closeDatabase,
} from "@/utils/notification";

// fake-indexeddb パッケージを使用することで IndexedDB と IDBKeyRange が自動的にテスト環境で使用できるようになります

describe("通知ユーティリティ関数テスト", () => {
  beforeEach(() => {
    // テスト実行前にデータベースをクリア
    closeDatabase();
    indexedDB = new IDBFactory();
  });

  // 通知履歴の取得と保存テスト
  it("通知履歴の取得と保存が正常に動作すること", async () => {
    // 初期状態では空の配列が返されることを確認
    const emptyHistory = await getNotificationHistory();
    expect(emptyHistory).toEqual([]);

    // テスト用の通知データ
    const testNotification = {
      id: "test-id-1",
      title: "テスト通知",
      body: "これはテスト通知です",
      type: "test",
      timestamp: Date.now(),
    };

    // 通知を保存
    const result = await saveNotificationToHistory(testNotification);

    // 結果の検証
    expect(result.history.length).toBe(1);
    expect(result.history[0].id).toBe("test-id-1");
    expect(result.history[0].title).toBe("テスト通知");
    expect(result.history[0].read).toBe(false);
    expect(result.unreadCount).toBe(1);

    // 保存後、正しく取得できることを確認
    const savedHistory = await getNotificationHistory();

    expect(savedHistory.length).toBe(1);
    expect(savedHistory[0].id).toBe("test-id-1");
  });

  // 通知の既読処理テスト
  it("通知の既読処理が正常に動作すること", async () => {
    // テスト用の通知データを準備
    const testNotifications = [
      {
        id: "test-id-1",
        title: "テスト通知1",
        body: "これはテスト通知1です",
        type: "test",
        timestamp: Date.now(),
        read: false,
        readIndex: 0,
      },
      {
        id: "test-id-2",
        title: "テスト通知2",
        body: "これはテスト通知2です",
        type: "test",
        timestamp: Date.now() - 1000,
        read: false,
        readIndex: 0,
      },
    ];

    // モックストアに通知を直接追加
    for (const notification of testNotifications) {
      await saveNotificationToHistory(notification);
    }

    // 特定の通知を既読にする
    const result = await markNotificationAsRead("test-id-1");

    // 結果の検証
    expect(result.unreadCount).toBe(1);
    expect(result.history.find((n) => n.id === "test-id-1")?.read).toBe(true);
    expect(result.history.find((n) => n.id === "test-id-2")?.read).toBe(false);

    // 全ての通知を既読にする
    const allReadResult = await markAllNotificationsAsRead();

    // 結果の検証
    expect(allReadResult.unreadCount).toBe(0);
    expect(allReadResult.history.every((n) => n.read)).toBe(true);
  });

  // 通知の削除処理テスト
  it("通知の削除処理が正常に動作すること", async () => {
    // テスト用の通知データを準備
    const testNotifications = [
      {
        id: "test-id-1",
        title: "テスト通知1",
        body: "これはテスト通知1です",
        type: "test",
        timestamp: Date.now(),
        read: false,
        readIndex: 0,
      },
      {
        id: "test-id-2",
        title: "テスト通知2",
        body: "これはテスト通知2です",
        type: "test",
        timestamp: Date.now() - 1000,
        read: true,
        readIndex: 1,
      },
    ];

    // モックストアに通知を直接追加
    for (const notification of testNotifications) {
      await saveNotificationToHistory(notification);
    }

    // 特定の通知を削除
    const result = await deleteNotification("test-id-1");

    // 結果の検証
    expect(result.history.length).toBe(1);
    expect(result.history[0].id).toBe("test-id-2");

    // 全ての通知を削除
    const clearResult = await clearNotificationHistory();

    // 結果の検証
    expect(clearResult.history.length).toBe(0);
    expect(clearResult.unreadCount).toBe(0);
  });

  // urlBase64ToUint8Arrayのテスト
  it("Base64文字列が正しくUint8Arrayに変換されること", () => {
    // テスト用のBase64文字列
    const testBase64 =
      "BPnNKUMRLVgk51nQz5RmYLOkxGfjKVXwXNUwdLU_GKnZPL-b7VGCHBrqvHVbd_FEwnQBEBQmyPM6EJhHvKyVX5E";

    // 変換
    const result = urlBase64ToUint8Array(testBase64);

    // 結果の検証
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  // IDの生成テスト
  it("一意のIDが生成されること", () => {
    // 複数のIDを生成して重複がないことを確認
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }

    // 生成されたIDの数が元の回数と同じであることを検証（重複がない）
    expect(ids.size).toBe(100);
  });
});
