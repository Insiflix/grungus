import axios, { type AxiosInstance, type AxiosRequestConfig } from "axios";

export interface IHttpClient {
  get<T>(path: string, config?: AxiosRequestConfig): Promise<T>;
}

export class ConventionalApiClient implements IHttpClient {
  private readonly axios: AxiosInstance;

  constructor(baseURL: string) {
    this.axios = axios.create({ baseURL, timeout: 15_000 });
  }

  async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.axios.get<T>(path, config);
    return response.data;
  }
}
