import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock window.confirm
vi.spyOn(window, "confirm").mockImplementation(() => true);

// Mock Notification API
class NotificationMock {
  static permission: NotificationPermission = "default";
  static requestPermission = vi.fn().mockResolvedValue("granted");
}
Object.defineProperty(window, "Notification", {
  value: NotificationMock,
  writable: true,
});

// Mock Service Worker
// vi.mock("@/utils/notification", async () => {
//   const actual = await vi.importActual("@/utils/notification");
//   return {
//     ...actual,
//     registerServiceWorker: vi.fn().mockResolvedValue({
//       pushManager: {
//         getSubscription: vi.fn().mockResolvedValue(null),
//         subscribe: vi
//           .fn()
//           .mockResolvedValue({ endpoint: "https://example.com" }),
//       },
//     }),
//     requestNotificationPermission: vi.fn().mockResolvedValue(true),
//     subscribeToPushNotifications: vi
//       .fn()
//       .mockResolvedValue({ endpoint: "https://example.com" }),
//     sendTestNotification: vi.fn().mockResolvedValue({ success: true }),
//     getNotificationHistory: vi.fn().mockReturnValue([]),
//     markNotificationAsRead: vi
//       .fn()
//       .mockReturnValue({ history: [], unreadCount: 0 }),
//     markAllNotificationsAsRead: vi
//       .fn()
//       .mockReturnValue({ history: [], unreadCount: 0 }),
//     deleteNotification: vi
//       .fn()
//       .mockReturnValue({ history: [], unreadCount: 0 }),
//     clearNotificationHistory: vi
//       .fn()
//       .mockReturnValue({ history: [], unreadCount: 0 }),
//   };
// });

// Mock Apollo Client
vi.mock("@apollo/client", async () => {
  const actual = await vi.importActual("@apollo/client");
  return {
    ...actual,
    useQuery: vi.fn().mockReturnValue({
      loading: false,
      error: null,
      data: { getNotifications: [] },
    }),
    gql: vi.fn().mockImplementation((query) => query),
  };
});
