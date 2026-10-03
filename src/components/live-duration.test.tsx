// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { LiveDuration } from "./live-duration";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it("renders the same initial clock on server and client, then updates elapsed time", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-03T12:10:00Z"));
  const since = "2026-10-03T12:05:00Z";
  expect(renderToString(<LiveDuration since={since} />)).toBe("<span>--:--:--</span>");
  const view = render(<LiveDuration since={since} />);
  expect(view.container.textContent).toBe("--:--:--");
  act(() => vi.advanceTimersByTime(1000));
  expect(view.container.textContent).toBe("00:05:01");
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
