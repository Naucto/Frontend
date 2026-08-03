import { authControllerRefresh } from "@api";
import { LocalStorageManager } from "@utils/LocalStorageManager";

import { refreshAccessToken } from "./authRefresh";

jest.mock("@api", () => ({
  authControllerRefresh: jest.fn(),
}));

jest.mock("@utils/LocalStorageManager", () => ({
  LocalStorageManager: { setToken: jest.fn() },
}));

const mockRefresh = authControllerRefresh as jest.MockedFunction<typeof authControllerRefresh>;
const mockSetToken = LocalStorageManager.setToken as jest.MockedFunction<typeof LocalStorageManager.setToken>;

describe("refreshAccessToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("de-duplicates concurrent refreshes into a single underlying call", async () => {
    type RefreshResult = Awaited<ReturnType<typeof authControllerRefresh>>;
    let resolveRefresh: ((value: RefreshResult) => void) | undefined;
    mockRefresh.mockReturnValue(
      new Promise<RefreshResult>((resolve) => { resolveRefresh = resolve; }) as ReturnType<typeof authControllerRefresh>,
    );

    const first = refreshAccessToken();
    const second = refreshAccessToken();

    resolveRefresh?.({ data: { access_token: "tok-123" } } as RefreshResult);
    const [firstToken, secondToken] = await Promise.all([first, second]);

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(firstToken).toBe("tok-123");
    expect(secondToken).toBe("tok-123");
    expect(mockSetToken).toHaveBeenCalledWith("tok-123");
  });

  it("clears the in-flight promise so a later call refreshes again", async () => {
    mockRefresh.mockResolvedValue({ data: { access_token: "first" } } as Awaited<ReturnType<typeof authControllerRefresh>>);
    await refreshAccessToken();

    mockRefresh.mockResolvedValue({ data: { access_token: "second" } } as Awaited<ReturnType<typeof authControllerRefresh>>);
    const token = await refreshAccessToken();

    expect(mockRefresh).toHaveBeenCalledTimes(2);
    expect(token).toBe("second");
  });

  it("resolves to null and clears the in-flight promise when refresh fails", async () => {
    mockRefresh.mockRejectedValueOnce(new Error("network"));

    const token = await refreshAccessToken();

    expect(token).toBeNull();
    expect(mockSetToken).not.toHaveBeenCalled();

    // The failed refresh must not stick around: a subsequent call retries.
    mockRefresh.mockResolvedValue({ data: { access_token: "recovered" } } as Awaited<ReturnType<typeof authControllerRefresh>>);
    const retry = await refreshAccessToken();

    expect(mockRefresh).toHaveBeenCalledTimes(2);
    expect(retry).toBe("recovered");
  });
});
