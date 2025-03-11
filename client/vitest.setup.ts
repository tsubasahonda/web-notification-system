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
