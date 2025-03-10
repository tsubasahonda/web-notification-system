import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  registerServiceWorker,
  subscribeToPushNotifications,
} from "@/utils/notification";
import { get } from "http";

describe("registerServiceWorker", () => {
  // モックの準備
  const mockRegistration = {
    scope: "http://localhost/",
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn().mockResolvedValue({
        endpoint: "https://example.com",
      }),
    },
  };

  // テスト前にコンソールをモック化
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    global.fetch = vi.fn().mockImplementation(async (url) => {
      console.log("fetch called with url:", url);
      if (url === "http://localhost:4000/api/vapid-public-key") {
        return {
          json: async () => ({ publicKey: "test-public-key" }),
        };
      } else if (url === "http://localhost:4000/api/notifications/subscribe") {
        return {
          json: async () => ({
            success: true,
            message: "サブスクリプションが登録されました",
          }),
        };
      }
      return {};
    });

    vi.mock("@/utils/notification", async () => {
      const actual = await vi.importActual("@/utils/notification");
      return {
        ...actual,
        requestNotificationPermission: vi.fn().mockResolvedValue(true),
        // subscribeToPushNotifications: vi
        //   .fn()
        //   .mockResolvedValue({ endpoint: "https://example.com" }),
        sendTestNotification: vi.fn().mockResolvedValue({ success: true }),
        getNotificationHistory: vi.fn().mockReturnValue([]),
        markNotificationAsRead: vi
          .fn()
          .mockReturnValue({ history: [], unreadCount: 0 }),
        markAllNotificationsAsRead: vi
          .fn()
          .mockReturnValue({ history: [], unreadCount: 0 }),
        deleteNotification: vi
          .fn()
          .mockReturnValue({ history: [], unreadCount: 0 }),
        clearNotificationHistory: vi
          .fn()
          .mockReturnValue({ history: [], unreadCount: 0 }),
      };
    });
  });

  // テスト後にモックをリセット
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Service Workerがサポートされている場合、登録に成功すると登録オブジェクトを返す", async () => {
    // navigator.serviceWorkerのモック
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        register: vi.fn().mockResolvedValue(mockRegistration),
      },
      configurable: true,
    });

    const result = await registerServiceWorker();

    // 結果の検証
    expect(result).toEqual(mockRegistration);
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith(
      "/service-worker.js"
    );
    expect(console.log).toHaveBeenCalledWith(
      "Service Worker登録成功:",
      mockRegistration.scope
    );
  });

  it("Service Workerの登録に失敗した場合、nullを返す", async () => {
    // エラーを投げるモック
    const error = new Error("Registration failed");
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        register: vi.fn().mockRejectedValue(error),
      },
      configurable: true,
    });

    const result = await registerServiceWorker();

    // 結果の検証
    expect(result).toBeNull();
    expect(navigator.serviceWorker.register).toHaveBeenCalledWith(
      "/service-worker.js"
    );
    expect(console.error).toHaveBeenCalledWith(
      "Service Worker登録失敗:",
      error
    );
  });

  it("Service Workerがサポートされていない場合、nullを返す", async () => {
    // navigatorからserviceWorkerプロパティを削除
    const originalNavigator = { ...navigator };
    const mockNavigator: Omit<Navigator, "serviceWorker"> & {
      serviceWorker?: ServiceWorkerContainer;
    } = { ...navigator };
    delete mockNavigator.serviceWorker;

    // グローバルのnavigatorをオーバーライド
    Object.defineProperty(global, "navigator", {
      value: mockNavigator,
      configurable: true,
    });

    const result = await registerServiceWorker();

    // 結果の検証
    expect(result).toBeNull();

    // テスト後に元のnavigatorを復元
    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      configurable: true,
    });
  });

  it("プッシュ通知のサブスクリプションが正常に行われること", async () => {
    // navigator.serviceWorkerのモック
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        register: vi.fn().mockResolvedValue(mockRegistration),
      },
      configurable: true,
    });
    // サービスワーカーの登録
    const registration = await registerServiceWorker();

    // プッシュ通知のサブスクリプション
    const subscription = await subscribeToPushNotifications(registration!);

    // サブスクリプションを検証
    expect(subscription).not.toBeNull();
    expect(subscription).toHaveProperty("endpoint", "https://example.com");

    expect(global.fetch).toHaveBeenCalledTimes(2);

    // fetch APIが正しく呼び出されることを検証
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/vapid-public-key"
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/notifications/subscribe",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      })
    );
  });
});
