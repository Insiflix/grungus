import { getHttpUriForMxc, type MatrixClient } from "matrix-js-sdk";

export class MatrixMediaResolver {
  constructor(private readonly client: MatrixClient) {}

  resolve(
    mxcUrl: string | null | undefined,
    width = 96,
    height = 96,
  ): string | null {
    if (!mxcUrl) return null;
    if (mxcUrl.startsWith("http://") || mxcUrl.startsWith("https://")) {
      return mxcUrl;
    }
    return (
      getHttpUriForMxc(this.client.getHomeserverUrl(), mxcUrl, width, height, "scale", false, true, true) || null
    );
  }
}


